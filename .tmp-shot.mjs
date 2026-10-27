import puppeteer from 'puppeteer-core';

const browser = await puppeteer.launch({
  executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  headless: true,
  args: ['--hide-scrollbars', '--force-color-profile=srgb', '--use-gl=angle', '--enable-webgl'],
});

const open = async (width, height, mobile = false) => {
  const page = await browser.newPage();
  await page.setViewport({ width, height, deviceScaleFactor: 1, isMobile: mobile, hasTouch: mobile });
  await page.goto('http://localhost:4321/', { waitUntil: 'networkidle2', timeout: 90000 });
  await page.evaluate(() => document.fonts.ready);
  await new Promise((r) => setTimeout(r, 5000));
  return page;
};

const go = async (page, id, ratio = 0.5) => {
  await page.evaluate(
    ({ id, ratio }) => {
      const el = document.getElementById(id);
      if (!el) return;
      const extra = Math.max(0, el.offsetHeight - window.innerHeight) * ratio;
      window.scrollTo(0, el.offsetTop + extra);
    },
    { id, ratio },
  );
  await new Promise((r) => setTimeout(r, 1800));
};

const shots = [
  ['arrival', 0],
  ['shelf', 0.55],
  ['carry', 0.55],
  ['structure', 0.25],
  ['structure', 0.75],
  ['interaction', 0.55],
  ['binding', 0.55],
  ['loop', 0.55],
  ['return', 0.55],
  ['benchmark', 0.4],
  ['deployment', 0.55],
  ['chain', 0.5],
];

const desktop = await open(1440, 900);
for (const [id, ratio] of shots) {
  await go(desktop, id, ratio);
  await desktop.screenshot({ path: `/tmp/sx-${id}-${String(ratio).replace('.', '')}.png` });
}
console.log('desktop', await desktop.evaluate(() => ({
  height: document.documentElement.scrollHeight,
  sections: document.querySelectorAll('[data-chapter]').length,
  width: document.documentElement.scrollWidth,
})));
await desktop.close();

const mobile = await open(390, 844, true);
for (const [id, ratio] of [['arrival', 0], ['shelf', 0.2], ['structure', 0.5], ['loop', 0.5], ['benchmark', 0.3], ['deployment', 0.5]]) {
  await go(mobile, id, ratio);
  await mobile.screenshot({ path: `/tmp/sx-m-${id}.png` });
}
await mobile.close();

await browser.close();
