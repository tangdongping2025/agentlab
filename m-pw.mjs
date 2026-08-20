import { chromium } from 'playwright';
const browser = await chromium.launch();
const ctx = await browser.newContext({ isMobile: true, hasTouch: true });
const page = await ctx.newPage();
await page.goto('http://localhost:5175', { waitUntil: 'networkidle' });
await page.waitForTimeout(2000);
for (const w of [320, 360, 375, 390, 414]) {
  await page.setViewportSize({ width: w, height: 812 });
  await page.waitForTimeout(400);
  const d = await page.evaluate(() => {
    const btns = [...document.querySelectorAll('button')];
    const s = btns.find(b => b.textContent.includes('发送'));
    const ib = s?.parentElement;
    const input = document.querySelector('input[placeholder*="输入消息"]');
    return {
      bodyW: document.body.clientWidth,
      bodyScrollW: document.body.scrollWidth,
      inputBarW: ib ? Math.round(ib.getBoundingClientRect().width) : null,
      inputW: input ? Math.round(input.getBoundingClientRect().width) : null,
      sendLeft: s ? Math.round(s.getBoundingClientRect().left) : null,
      sendRight: s ? Math.round(s.getBoundingClientRect().right) : null,
      sendW: s ? Math.round(s.getBoundingClientRect().width) : null,
    };
  });
  console.log(`w=${w}:`, JSON.stringify(d));
}
await browser.close();
