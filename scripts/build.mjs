#!/usr/bin/env node
import { cp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import AdmZip from 'adm-zip';
import { build, context } from 'esbuild';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const srcDir = join(root, 'src');
const distDir = join(root, 'dist');
const releaseDir = join(root, 'release');
const srcIconsDir = join(srcDir, 'icons');
const distIconsDir = join(distDir, 'icons');

const flags = new Set(process.argv.slice(2));
const shouldZip = flags.has('--zip');
const shouldWatch = flags.has('--watch');

/**
 * esbuild entry points. The content script's stylesheet emits as `content.css` alongside
 * `content.js`; `src/manifest.json` must reference the same emitted basename.
 */
const entryPoints = [
  { in: join(srcDir, 'content', 'index.ts'), out: 'content' },
  { in: join(srcDir, 'content', 'content.css'), out: 'content' },
  { in: join(srcDir, 'background', 'index.ts'), out: 'background' },
];

/**
 * Files that ride in the zip beside the built extension (D-011): the install steps a user is met
 * with when they unzip the release, and the licence the copy is required to carry. Read with
 * `readFile` on purpose — a missing source must fail the build rather than write a zip without it.
 */
const zipExtraFiles = [
  { from: join(root, 'packaging', 'README.md'), to: 'README.md' },
  { from: join(root, 'LICENSE'), to: 'LICENSE' },
];

const { version } = JSON.parse(await readFile(join(root, 'package.json'), 'utf8'));

if (shouldWatch) {
  await prepareDist();
  await startWatch();
} else {
  await prepareDist();
  await bundle();
  if (shouldZip) await zipRelease();
}

async function prepareDist() {
  await rm(distDir, { recursive: true, force: true });
  await mkdir(distDir, { recursive: true });
  await writeStampedManifest();
  await copyIcons();
}

/** The manifest's `icons` paths are relative to `dist/`, so the set lands beside `manifest.json`. */
async function copyIcons() {
  await cp(srcIconsDir, distIconsDir, { recursive: true });
  console.log(`wrote ${toPosix(distIconsDir)}/ (icons)`);
}

async function writeStampedManifest() {
  const source = JSON.parse(await readFile(join(srcDir, 'manifest.json'), 'utf8'));
  const target = join(distDir, 'manifest.json');
  await writeFile(target, `${JSON.stringify({ ...source, version }, null, 2)}\n`);
  console.log(`wrote ${toPosix(target)} (version ${version})`);
}

function esbuildOptions() {
  return {
    entryPoints,
    outdir: distDir,
    bundle: true,
    format: 'iife',
    platform: 'browser',
    target: 'chrome120',
    sourcemap: false,
    legalComments: 'none',
    logLevel: 'info',
  };
}

async function bundle() {
  await build(esbuildOptions());
  for (const entry of entryPoints) {
    const extension = entry.in.endsWith('.css') ? '.css' : '.js';
    console.log(`wrote ${toPosix(join(distDir, `${entry.out}${extension}`))}`);
  }
}

async function startWatch() {
  const ctx = await context(esbuildOptions());
  await ctx.watch();
  console.log('watching src/ for changes - reload the extension in chrome://extensions to test');
}

async function zipRelease() {
  await mkdir(releaseDir, { recursive: true });
  const zip = new AdmZip();
  zip.addLocalFolder(distDir);
  for (const extra of zipExtraFiles) {
    zip.addFile(extra.to, await readFile(extra.from));
  }
  const zipPath = join(releaseDir, `1337x-auto-links-${version}.zip`);
  zip.writeZip(zipPath);
  console.log(
    `wrote ${toPosix(zipPath)} (with ${zipExtraFiles.map((f) => f.to).join(' and ')} at its root)`,
  );
}

function toPosix(path) {
  return relative(root, path).split('\\').join('/');
}
