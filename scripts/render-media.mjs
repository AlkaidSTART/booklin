#!/usr/bin/env node
/**
 * Render the static raster derivatives from the SVG / HTML sources.
 *
 * Run: node scripts/render-media.mjs
 * Requires Google Chrome and ffmpeg.
 */
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import puppeteer from 'puppeteer-core';

const root = path.resolve(import.meta.dirname, '..');
const chromePath = process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const cacheDir = path.join(root, 'scripts', '.cache');
const brandDir = path.join(root, 'public', 'brand');
const qrDir = path.join(root, 'public', 'qr');
const designDir = path.join(root, 'public', 'design');
const docsDesignDir = path.join(root, 'docs', 'design');
const fallbackDir = path.join(root, 'public', 'fallback');

for (const dir of [cacheDir, brandDir, qrDir, designDir, docsDesignDir, fallbackDir]) {
  fs.mkdirSync(dir, { recursive: true });
}

const browser = await puppeteer.launch({
  executablePath: chromePath,
  headless: true,
  args: [
    '--allow-file-access-from-files',
    '--hide-scrollbars',
    '--force-color-profile=srgb',
    '--disable-dev-shm-usage',
  ],
});

async function waitForPage(page) {
  await page.evaluate(async () => {
    await document.fonts.ready;
    await Promise.all(
      [...document.images].map((image) =>
        image.complete
          ? Promise.resolve()
          : new Promise((resolve) => {
              image.addEventListener('load', resolve, { once: true });
              image.addEventListener('error', resolve, { once: true });
            }),
      ),
    );
  });
}

async function renderSvg(svgPath, outPath, width, height, { transparent = false, background = 'transparent' } = {}) {
  const page = await browser.newPage();
  await page.setViewport({ width, height, deviceScaleFactor: 1 });
  const harness = path.join(cacheDir, `render-${Date.now()}-${Math.random().toString(16).slice(2)}.html`);
  const html = `<!doctype html><html><head><meta charset="utf-8"><style>
    html,body{margin:0;width:100%;height:100%;background:${background};overflow:hidden}
    body{display:grid;place-items:center}
    img{display:block;width:100%;height:100%;object-fit:contain}
  </style></head><body><img src="${pathToFileURL(svgPath).href}" alt=""></body></html>`;
  fs.writeFileSync(harness, html, 'utf8');
  try {
    await page.goto(pathToFileURL(harness).href, { waitUntil: 'networkidle0' });
    await waitForPage(page);
    await page.screenshot({ path: outPath, omitBackground: transparent, type: 'png' });
  } finally {
    fs.rmSync(harness, { force: true });
    await page.close();
  }
  console.log('render', path.relative(root, outPath), `${width}x${height}`);
}

async function renderHtml(htmlPath, outPath, width, height) {
  const page = await browser.newPage();
  await page.setViewport({ width, height, deviceScaleFactor: 1 });
  await page.goto(pathToFileURL(htmlPath).href, { waitUntil: 'networkidle0' });
  await waitForPage(page);
  await page.screenshot({ path: outPath, type: 'png' });
  await page.close();
  console.log('render', path.relative(root, outPath), `${width}x${height}`);
}

function toWebp(inputPath, outputPath, quality = 84) {
  execFileSync('cwebp', [
    '-quiet',
    '-q', String(quality),
    inputPath,
    '-o', outputPath,
  ]);
  console.log('webp', path.relative(root, outputPath));
}

try {
  const mark = path.join(brandDir, 'bookln-mark.svg');
  const markBackground = '#11100E';
  await renderSvg(mark, path.join(brandDir, 'bookln-mark-1024.png'), 1024, 1024, { background: markBackground });
  await renderSvg(mark, path.join(brandDir, 'bookln-mark-512.png'), 512, 512, { background: markBackground });
  await renderSvg(mark, path.join(brandDir, 'bookln-mark-192.png'), 192, 192, { background: markBackground });
  await renderSvg(mark, path.join(brandDir, 'favicon-48.png'), 48, 48, { background: markBackground });
  await renderSvg(mark, path.join(brandDir, 'favicon-32.png'), 32, 32, { background: markBackground });
  await renderSvg(mark, path.join(root, 'public', 'apple-touch-icon.png'), 180, 180, { background: markBackground });

  execFileSync('ffmpeg', [
    '-y',
    '-loglevel', 'error',
    '-i', path.join(brandDir, 'favicon-48.png'),
    '-vf', 'scale=48:48',
    path.join(root, 'public', 'favicon.ico'),
  ]);
  console.log('ico public/favicon.ico');

  await renderSvg(path.join(qrDir, 'one-code-entry-card.svg'), path.join(qrDir, 'one-code-entry-card.png'), 960, 1280);
  toWebp(path.join(qrDir, 'one-code-entry-card.png'), path.join(qrDir, 'one-code-entry-card.webp'), 88);

  await renderSvg(path.join(designDir, 'knowledge-graph.svg'), path.join(designDir, 'knowledge-graph.png'), 1600, 1152);
  toWebp(path.join(designDir, 'knowledge-graph.png'), path.join(designDir, 'knowledge-graph.webp'), 88);

  await renderHtml(path.join(docsDesignDir, 'fallback-poster.html'), path.join(docsDesignDir, 'fallback-desktop.png'), 1440, 1000);
  await renderHtml(path.join(docsDesignDir, 'fallback-poster.html'), path.join(docsDesignDir, 'fallback-mobile.png'), 390, 844);
  toWebp(path.join(docsDesignDir, 'fallback-desktop.png'), path.join(fallbackDir, 'fallback-desktop.webp'), 84);
  toWebp(path.join(docsDesignDir, 'fallback-mobile.png'), path.join(fallbackDir, 'fallback-mobile.webp'), 84);
} finally {
  await browser.close();
}
