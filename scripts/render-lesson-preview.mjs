#!/usr/bin/env node
/**
 * Render and encode the 15 s lesson-preview concept film.
 *
 * Run: node scripts/render-lesson-preview.mjs
 * Requires Google Chrome and ffmpeg (libx264).
 */
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import puppeteer from 'puppeteer-core';

const root = path.resolve(import.meta.dirname, '..');
const chromePath = process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const htmlPath = path.join(root, 'docs', 'design', 'lesson-preview.html');
const cacheDir = path.join(root, 'scripts', '.cache');
const framesDir = path.join(cacheDir, 'lesson-frames');
const videoDir = path.join(root, 'public', 'video');
const docsDesignDir = path.join(root, 'docs', 'design');

fs.rmSync(framesDir, { recursive: true, force: true });
fs.mkdirSync(framesDir, { recursive: true });
fs.mkdirSync(videoDir, { recursive: true });

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

try {
  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 720, deviceScaleFactor: 1 });
  await page.goto(pathToFileURL(htmlPath).href, { waitUntil: 'networkidle0' });
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

  const timeline = await page.evaluate(() => window.__TIMELINE);
  const fps = timeline.fps;
  const duration = timeline.duration;
  const frameCount = Math.round(fps * duration);
  console.log('timeline', timeline, 'frames', frameCount);

  for (let frame = 0; frame < frameCount; frame += 1) {
    const time = frame / fps;
    await page.evaluate((t) => window.renderFrame(t), time);
    await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    const file = path.join(framesDir, `frame-${String(frame).padStart(4, '0')}.png`);
    await page.screenshot({ path: file, type: 'png' });
    if (frame % 60 === 0) console.log('frame', frame, '/', frameCount);
  }

  await page.evaluate(() => window.renderFrame(2.4));
  await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  const posterPng = path.join(docsDesignDir, 'lesson-preview-poster.png');
  await page.screenshot({ path: posterPng, type: 'png' });
  console.log('poster', path.relative(root, posterPng));

  await page.close();
} finally {
  await browser.close();
}

const framesPattern = path.join(framesDir, 'frame-%04d.png');
const videoPath = path.join(videoDir, 'lesson-preview.mp4');
execFileSync('ffmpeg', [
  '-y',
  '-loglevel', 'error',
  '-framerate', '24',
  '-i', framesPattern,
  '-c:v', 'libx264',
  '-preset', 'slow',
  '-crf', '18',
  '-pix_fmt', 'yuv420p',
  '-movflags', '+faststart',
  '-an',
  videoPath,
]);
console.log('video', path.relative(root, videoPath), `${fs.statSync(videoPath).size} bytes`);

execFileSync('cwebp', [
  '-quiet',
  '-q', '86',
  path.join(docsDesignDir, 'lesson-preview-poster.png'),
  '-o', path.join(videoDir, 'lesson-preview-poster.webp'),
]);
console.log('poster webp public/video/lesson-preview-poster.webp');

fs.rmSync(framesDir, { recursive: true, force: true });
