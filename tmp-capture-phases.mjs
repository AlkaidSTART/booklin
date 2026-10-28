import path from 'node:path';
import puppeteer from 'puppeteer-core';

const out = process.argv[2] || './shots';
const phases = (process.argv[3] || '6.9,7.2,7.4,7.55,7.65,7.72,7.8,7.9,8').split(',').map(Number);

const browser = await puppeteer.launch({
  executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  headless: true,
  args: ['--hide-scrollbars', '--force-color-profile=srgb', '--use-gl=angle', '--enable-unsafe-swiftshader'],
});
const page = await browser.newPage();
await page.setViewport({ width: 1440, height: 1000, deviceScaleFactor: 1 });
await page.goto('http://localhost:4321/', { waitUntil: 'networkidle0', timeout: 120000 });
await page.evaluate(() => document.fonts.ready);
await new Promise((r) => setTimeout(r, 2500));

const info = await page.evaluate(() => {
  const sections = Array.from(document.querySelectorAll('[data-chapter]:not([data-no-phase])'));
  const starts = sections.map((s) => s.getBoundingClientRect().top + window.scrollY);
  return { starts, ids: sections.map((s) => s.id), height: document.documentElement.scrollHeight };
});
console.log(JSON.stringify(info));

for (const phase of phases) {
  const y = await page.evaluate(
    ({ phase, starts }) => {
      const i = Math.min(starts.length - 2, Math.floor(phase));
      const local = phase - i;
      return starts[i] + local * (starts[i + 1] - starts[i]);
    },
    { phase, starts: info.starts },
  );
  await page.evaluate((y) => window.scrollTo(0, y), y);
  await new Promise((r) => setTimeout(r, 1400));
  const actual = await page.evaluate(() => ({
    y: window.scrollY,
    progress: getComputedStyle(document.documentElement).getPropertyValue('--page-progress'),
  }));
  console.log('phase', phase, 'scrollY', actual.y, 'progress', actual.progress);
  await page.screenshot({ path: path.join(out, `phase-${phase}.png`) });
}

await browser.close();
