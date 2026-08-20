import { chromium } from 'playwright';
const browser = await chromium.launch();
const page = await browser.newPage();
const errors = [];
page.on('console', m => { if (m.type()==='error') errors.push('CONSOLE: '+m.text().slice(0,400)); });
page.on('pageerror', e => errors.push('PAGEERR: '+e.message.slice(0,400)));
page.on('requestfailed', r => errors.push('REQFAIL: '+r.url().slice(-80)+' '+(r.failure()?.errorText||'')));
try {
  await page.goto('http://47.97.66.45', { waitUntil: 'networkidle', timeout: 30000 });
} catch(e) { console.log('GOTO_ERR:', e.message.slice(0,200)); }
await page.waitForTimeout(3000);
const data = await page.evaluate(() => {
  const root = document.getElementById('root');
  return {
    url: location.href,
    rootChildCount: root?.childElementCount,
    rootHTMLlen: root?.innerHTML.length,
    bodyCls: document.body.className,
    bodyClientW: document.body.clientWidth,
    hasAppContent: !!document.body.innerText.match(/龙虾|发送|输入消息|AGENT|context/),
    textSample: document.body.innerText.slice(0, 300),
  };
});
console.log('DATA:', JSON.stringify(data, null, 2));
console.log('ERRORS:', errors.length ? '\n'+errors.join('\n') : 'none');
await browser.close();
