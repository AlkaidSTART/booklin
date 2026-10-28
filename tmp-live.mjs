import puppeteer from 'puppeteer-core';

const browser = await puppeteer.launch({
  executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  headless: true,
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
  defaultViewport: { width: 1440, height: 900, deviceScaleFactor: 2 },
});
const page = await browser.newPage();
await page.setRequestInterception(true);
page.on('request', (r) => (/\/(models|textures)\//.test(r.url()) ? undefined : r.continue()));
await page.goto('http://localhost:4321/', { waitUntil: 'domcontentloaded' });
await page.waitForSelector('.page-loader__book', { timeout: 20000 });
await new Promise((r) => setTimeout(r, 200));

const clip = await page.$eval('.page-loader__book', (el) => {
  const r = el.getBoundingClientRect();
  return { x: r.x - 90, y: r.y - 90, width: r.width + 180, height: r.height + 180 };
});

for (let i = 0; i < 10; i += 1) {
  await page.screenshot({ path: `${process.argv[2]}/live-${i}.png`, clip });
  await new Promise((r) => setTimeout(r, 110));
}
await browser.close();
