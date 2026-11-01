import fs from 'node:fs';
import os from 'node:os';
const pw = await import('/Users/mac/.npm-global/lib/node_modules/playwright/index.js');
const chromium = pw.chromium || (pw.default && pw.default.chromium);

const tokenFile = `${os.homedir()}/Library/Application Support/DeepWhale Desktop/dsh-token-url.txt`;
const url = fs.readFileSync(tokenFile, 'utf8').trim();
const errors = [];
const consoleErrors = [];

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 960 } });
page.on('pageerror', (e) => errors.push(String(e && e.message || e)));
page.on('console', (m) => { if (m.type() === 'error') consoleErrors.push(m.text().slice(0, 300)); });

await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });
await page.waitForTimeout(6000); // 等宿主 boot + 插件加载

async function bodyText() {
  return (await page.locator('body').innerText()).replace(/\n{2,}/g, '\n');
}
async function tryClick(label) {
  const loc = page.getByText(label, { exact: false }).first();
  try {
    await loc.waitFor({ state: 'visible', timeout: 4000 });
    await loc.click({ timeout: 4000 });
    return true;
  } catch { return false; }
}

const opened = await tryClick('深鲸记忆');
await page.waitForTimeout(2500);
let text = await bodyText();
const hasTabs = ['概览', '工作项', '运行时记忆', '记忆包', '归档', '设置'].filter((t) => text.includes(t));
const worksClicked = await tryClick('工作项');
await page.waitForTimeout(1500);
text = await bodyText();
await page.screenshot({ path: '/tmp/panel-check.png', fullPage: false });

const panelSnippet = text.split('\n').filter((l) => /工作项|执行者|认领|概览|体检|新建/.test(l)).slice(0, 40);
console.log(JSON.stringify({
  打开了面板: opened,
  点到了工作项页签: worksClicked,
  可见页签: hasTabs,
  页面报错: errors,
  控制台错误: consoleErrors.slice(0, 5),
  面板文字片段: panelSnippet,
  截图: '/tmp/panel-check.png',
}, null, 2));
await browser.close();
