// @vitest-environment node
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const SIZES = [16, 32, 48, 128];

const iconsDir = join(dirname(fileURLToPath(import.meta.url)), '..', 'src', 'icons');

/** Reads one committed icon; a file that is missing fails the suite rather than being skipped. */
function readIcon(size: number): Buffer {
  return readFileSync(join(iconsDir, `icon-${size}.png`));
}

interface PngChunk {
  type: string;
  data: Buffer;
}

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(buffer: Buffer): number {
  let c = 0xffffffff;
  for (const byte of buffer) c = (CRC_TABLE[(c ^ byte) & 0xff] ?? 0) ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

/**
 * Walks the whole file and validates every chunk, not just the header: each length is
 * bounds-checked, each CRC-verified, the stream must start with IHDR, carry at least one IDAT and
 * end with IEND, and the walk must consume the file exactly. A truncated or corrupted icon throws
 * here rather than passing the suite and then failing to load in the browser.
 */
function parsePng(buffer: Buffer): PngChunk[] {
  if (buffer.length < 8 || !buffer.subarray(0, 8).equals(PNG_SIGNATURE)) {
    throw new Error('not a PNG: bad signature');
  }

  const chunks: PngChunk[] = [];
  let offset = 8;
  while (offset < buffer.length) {
    if (buffer.length - offset < 8) throw new Error('truncated chunk header');

    const length = buffer.readUInt32BE(offset);
    const type = buffer.toString('ascii', offset + 4, offset + 8);
    const dataStart = offset + 8;
    const crcStart = dataStart + length;
    if (crcStart + 4 > buffer.length) throw new Error(`chunk ${type} overruns the file`);

    const expected = crc32(buffer.subarray(offset + 4, crcStart));
    const actual = buffer.readUInt32BE(crcStart);
    if (actual !== expected) throw new Error(`bad CRC for chunk ${type}`);

    chunks.push({ type, data: buffer.subarray(dataStart, crcStart) });
    offset = crcStart + 4;
  }

  if (offset !== buffer.length) throw new Error('trailing bytes after the last chunk');
  if (chunks[0]?.type !== 'IHDR') throw new Error('first chunk is not IHDR');
  if (!chunks.some((chunk) => chunk.type === 'IDAT')) throw new Error('no IDAT chunk');
  if (chunks[chunks.length - 1]?.type !== 'IEND') throw new Error('last chunk is not IEND');

  return chunks;
}

interface Ihdr {
  width: number;
  height: number;
  bitDepth: number;
  colorType: number;
  interlace: number;
}

/** Reads the IHDR fields out of a file that `parsePng` has already validated end to end. */
function parseIhdr(buffer: Buffer): Ihdr {
  const ihdr = parsePng(buffer)[0];
  if (ihdr === undefined || ihdr.data.length < 13) throw new Error('missing or short IHDR chunk');
  const data = ihdr.data;

  return {
    width: data.readUInt32BE(0),
    height: data.readUInt32BE(4),
    bitDepth: data[8] ?? -1,
    colorType: data[9] ?? -1,
    interlace: data[12] ?? -1,
  };
}

describe('extension icons', () => {
  it.each(SIZES)('icon-%i.png starts with the 8-byte PNG signature', (size) => {
    expect(readIcon(size).subarray(0, 8)).toEqual(PNG_SIGNATURE);
  });

  it.each(SIZES)('icon-%i.png reports a %ix%i non-interlaced RGBA image in its IHDR', (size) => {
    const header = parseIhdr(readIcon(size));

    expect(header.width).toBe(size);
    expect(header.height).toBe(size);
    // Truecolour with alpha, 8-bit, non-interlaced: what the generator writes and Chrome loads.
    expect(header.bitDepth).toBe(8);
    expect(header.colorType).toBe(6);
    expect(header.interlace).toBe(0);
  });

  it.each(SIZES)('icon-%i.png is a structurally valid PNG end to end', (size) => {
    // Reaching here means every chunk's length and CRC checked out, at least one IDAT is present,
    // the file ends with IEND and the walk consumed it exactly.
    const chunks = parsePng(readIcon(size));

    expect(chunks.filter((chunk) => chunk.type === 'IDAT').length).toBeGreaterThan(0);
    expect(chunks[chunks.length - 1]?.type).toBe('IEND');
  });

  it('ships a non-empty file for all four sizes', () => {
    const lengths = SIZES.map((size) => readIcon(size).length);

    expect(lengths).toHaveLength(4);
    for (const length of lengths) expect(length).toBeGreaterThan(8);
  });

  it('rejects a copy truncated after the header', () => {
    // The signature plus the whole 25-byte IHDR chunk: exactly the 33 bytes a header-only reader
    // trusts. There is no IDAT and no IEND, so the file must be rejected.
    const truncated = readIcon(128).subarray(0, 33);

    expect(() => parsePng(truncated)).toThrow();
  });

  it('rejects a copy truncated in the middle of the file', () => {
    const full = readIcon(128);
    const truncated = full.subarray(0, Math.floor(full.length / 2));

    expect(() => parsePng(truncated)).toThrow();
  });

  it('rejects a copy whose chunk no longer matches its CRC', () => {
    const corrupted = Buffer.from(readIcon(128));
    // Flip a byte inside the IHDR data, leaving the stored CRC stale.
    corrupted[16] = (corrupted[16] ?? 0) ^ 0xff;

    expect(() => parsePng(corrupted)).toThrow(/CRC/);
  });
});
