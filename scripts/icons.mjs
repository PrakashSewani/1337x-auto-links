#!/usr/bin/env node
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { deflateSync } from 'node:zlib';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const outDir = join(root, 'src', 'icons');

const SIZES = [16, 32, 48, 128];

/** Draw at 4× and average back down: 16 coverage levels per output pixel, clean edges. */
const SUPERSAMPLE = 4;

/** Saturated indigo/violet badge field, and the glyph painted on it. */
const BRAND = [0x4f, 0x46, 0xe5];
const GLYPH = [0xff, 0xff, 0xff];

/**
 * The badge is a rounded square; the glyph is a horseshoe magnet echoed from `src/core/icons.ts`
 * (`M5 4v7a7 7 0 0 0 14 0V4M5 8h4M15 8h4`), expressed in unit coordinates so it scales cleanly.
 * The stroke is deliberately fat and the padding around it generous, for legibility at 16 px.
 */
const BADGE_INSET = 0.07;
const BADGE_RADIUS = 0.2;
const MAGNET_RADIUS = 0.2;
const HALF_STROKE = 0.058;
const TICK_LEN = (4 / 7) * MAGNET_RADIUS;
const TICK_Y = 0.5 - MAGNET_RADIUS + (4 / 7) * MAGNET_RADIUS;

const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

function insideBadge(x, y) {
  const x0 = BADGE_INSET;
  const y0 = BADGE_INSET;
  const x1 = 1 - BADGE_INSET;
  const y1 = 1 - BADGE_INSET;
  const cx = (x0 + x1) / 2;
  const cy = (y0 + y1) / 2;
  const qx = Math.abs(x - cx) - ((x1 - x0) / 2 - BADGE_RADIUS);
  const qy = Math.abs(y - cy) - ((y1 - y0) / 2 - BADGE_RADIUS);
  const outside = Math.hypot(Math.max(qx, 0), Math.max(qy, 0));
  return outside + Math.min(Math.max(qx, qy), 0) - BADGE_RADIUS <= 0;
}

function insideGlyph(x, y) {
  const left = 0.5 - MAGNET_RADIUS;
  const right = 0.5 + MAGNET_RADIUS;
  const top = 0.5 - MAGNET_RADIUS;

  const legs = Math.min(
    distanceToSegment(x, y, left, top, left, 0.5),
    distanceToSegment(x, y, right, top, right, 0.5),
  );
  if (legs <= HALF_STROKE) return true;
  if (distanceToBottomArc(x, y, 0.5, 0.5, MAGNET_RADIUS) <= HALF_STROKE) return true;

  return (
    distanceToSegment(x, y, left, TICK_Y, left + TICK_LEN, TICK_Y) <= HALF_STROKE ||
    distanceToSegment(x, y, right, TICK_Y, right - TICK_LEN, TICK_Y) <= HALF_STROKE
  );
}

/** The horseshoe's lower bend: the half of the circle below its centre, joined by straight legs. */
function distanceToBottomArc(x, y, cx, cy, r) {
  const dx = x - cx;
  const dy = y - cy;
  const angle = Math.atan2(dy, dx);
  if (angle >= 0 && angle <= Math.PI) return Math.abs(Math.hypot(dx, dy) - r);

  return Math.min(Math.hypot(x - (cx - r), y - cy), Math.hypot(x - (cx + r), y - cy));
}

function distanceToSegment(x, y, ax, ay, bx, by) {
  const dx = bx - ax;
  const dy = by - ay;
  const lengthSquared = dx * dx + dy * dy;
  let t = lengthSquared > 0 ? ((x - ax) * dx + (y - ay) * dy) / lengthSquared : 0;
  t = Math.min(1, Math.max(0, t));
  return Math.hypot(x - (ax + t * dx), y - (ay + t * dy));
}

function renderIcon(size) {
  const scale = size * SUPERSAMPLE;
  const samples = new Float64Array(scale * scale * 4);

  for (let py = 0; py < scale; py++) {
    for (let px = 0; px < scale; px++) {
      const x = (px + 0.5) / scale;
      const y = (py + 0.5) / scale;

      let r = 0;
      let g = 0;
      let b = 0;
      let a = 0;
      if (insideBadge(x, y)) {
        r = BRAND[0];
        g = BRAND[1];
        b = BRAND[2];
        a = 1;
        if (insideGlyph(x, y)) {
          r = GLYPH[0];
          g = GLYPH[1];
          b = GLYPH[2];
        }
      }

      // Premultiplied, so averaging samples at the edges cannot bleed dark fringes into the alpha.
      const at = (py * scale + px) * 4;
      samples[at] = (r / 255) * a;
      samples[at + 1] = (g / 255) * a;
      samples[at + 2] = (b / 255) * a;
      samples[at + 3] = a;
    }
  }

  const pixels = Buffer.alloc(size * size * 4);
  const perPixel = SUPERSAMPLE * SUPERSAMPLE;
  for (let oy = 0; oy < size; oy++) {
    for (let ox = 0; ox < size; ox++) {
      let sr = 0;
      let sg = 0;
      let sb = 0;
      let sa = 0;
      for (let dy = 0; dy < SUPERSAMPLE; dy++) {
        for (let dx = 0; dx < SUPERSAMPLE; dx++) {
          const at = ((oy * SUPERSAMPLE + dy) * scale + (ox * SUPERSAMPLE + dx)) * 4;
          sr += samples[at];
          sg += samples[at + 1];
          sb += samples[at + 2];
          sa += samples[at + 3];
        }
      }
      sr /= perPixel;
      sg /= perPixel;
      sb /= perPixel;
      sa /= perPixel;

      const at = (oy * size + ox) * 4;
      if (sa > 0) {
        pixels[at] = Math.round((sr / sa) * 255);
        pixels[at + 1] = Math.round((sg / sa) * 255);
        pixels[at + 2] = Math.round((sb / sa) * 255);
      }
      pixels[at + 3] = Math.round(sa * 255);
    }
  }

  return pixels;
}

function encodePng(width, height, rgba) {
  const stride = width * 4;
  const raw = Buffer.alloc((stride + 1) * height);
  for (let y = 0; y < height; y++) {
    // Filter type 0 (none) per scanline; the supersampled art compresses well without filtering.
    raw[y * (stride + 1)] = 0;
    rgba.copy(raw, y * (stride + 1) + 1, y * stride, (y + 1) * stride);
  }

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // colour type: truecolour with alpha
  ihdr[10] = 0; // deflate
  ihdr[11] = 0; // adaptive filtering
  ihdr[12] = 0; // non-interlaced

  return Buffer.concat([
    PNG_SIGNATURE,
    pngChunk('IHDR', ihdr),
    pngChunk('IDAT', deflateSync(raw, { level: 9 })),
    pngChunk('IEND', Buffer.alloc(0)),
  ]);
}

function pngChunk(type, data) {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length, 0);
  const typeBytes = Buffer.from(type, 'ascii');

  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([typeBytes, data])), 0);

  return Buffer.concat([length, typeBytes, data, crc]);
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

function crc32(buffer) {
  let c = 0xffffffff;
  for (const byte of buffer) c = CRC_TABLE[(c ^ byte) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function toPosix(path) {
  return relative(root, path).split('\\').join('/');
}

await mkdir(outDir, { recursive: true });
for (const size of SIZES) {
  const png = encodePng(size, size, renderIcon(size));
  const target = join(outDir, `icon-${size}.png`);
  await writeFile(target, png);
  console.log(`wrote ${toPosix(target)} (${size}x${size}, ${png.length} bytes)`);
}
