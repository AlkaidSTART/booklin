import puppeteer from 'puppeteer-core';
const browser = await puppeteer.launch({ executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless:true, args:['--hide-scrollbars'] });
const page = await browser.newPage();
await page.setViewport({width:1440,height:900});
await page.goto('http://localhost:4321/', {waitUntil:'networkidle2'});
await new Promise(r=>setTimeout(r,2500));
console.log(await page.evaluate(() => {
  const at = document.elementFromPoint(100, 100);
  const stack = document.elementsFromPoint(100, 100).map(el => el.tagName + '.' + (el.className||''));
  const p = getComputedStyle(document.documentElement).getPropertyValue('--page-progress');
  const sp = document.querySelector('.scroll-progress span');
  return { at: at?.tagName+'.'+at?.className, stack, pageProgress:p, scrollY:window.scrollY, progressRect: sp?.getBoundingClientRect(), progressTransform: sp ? getComputedStyle(sp).transform : null };
}));
await browser.close();
