import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import puppeteer from 'puppeteer-core';

const root = path.resolve(import.meta.dirname, '..');
const html = path.join(root, 'docs', 'design', 'visual-spec.html');
const browser = await puppeteer.launch({
  executablePath: process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  headless: true,
  args: ['--allow-file-access-from-files', '--hide-scrollbars', '--force-color-profile=srgb'],
});
const page = await browser.newPage();
const captures = [
  { name: 'visual-spec-desktop', width: 1440, height: 1000 },
  { name: 'visual-spec-mobile', width: 390, height: 844 },
];
for (const c of captures) {
  await page.setViewport({ width: c.width, height: c.height, deviceScaleFactor: 1 });
  await page.goto(pathToFileURL(html).href, { waitUntil: 'networkidle0' });
  await page.evaluate(() => document.fonts.ready);
  await page.evaluate(() => window.scrollTo(0, 0));
  await new Promise((r) => setTimeout(r, 250));
  const metrics = await page.evaluate(() => ({
    width: document.documentElement.scrollWidth,
    height: document.documentElement.scrollHeight,
  }));
  const png = path.join(root, 'docs', 'design', `${c.name}.png`);
  const webp = path.join(root, 'docs', 'design', `${c.name}.webp`);
  await page.screenshot({ path: png, fullPage: true });
  execFileSync('cwebp', ['-quiet', '-q', '88', png, '-o', webp]);
  console.log(c.name, metrics);
}
await browser.close();
