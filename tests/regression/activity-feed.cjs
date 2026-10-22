const assert = require('node:assert/strict');
const fs = require('node:fs');
const puppeteer = require('puppeteer');

// Run against the local dev server; the fixture contains no account or database data.
const fixture = 'src/app/auth/activity-feed-check';
(async () => {
  let browser;
  try {
    fs.mkdirSync(fixture, { recursive: true });
    fs.writeFileSync(`${fixture}/page.tsx`, `import { ActivityFeed } from '@/components/activity-feed'
export default function Check() {
 const events = Array.from({length: 20}, (_, i) => ({id: 'check-'+i, kind: 'new_referral' as const, user: 'Membre '+i, city: null, level: 1, timestamp: new Date().toISOString()}))
 return <ActivityFeed initialEvents={events} demoMode />
}`);
    browser = await puppeteer.launch({ headless: true, channel: "chrome" });
    const page = await browser.newPage();
    for (const width of [1280, 390]) {
      await page.setViewport({ width, height: 800 });
      await page.goto('http://localhost:3001/auth/activity-feed-check', { waitUntil: 'networkidle0' });
      await page.waitForSelector('button[data-slot="dialog-trigger"]');
      await page.click('button[data-slot="dialog-trigger"]');
      await page.waitForSelector('[role="dialog"]');
      assert.ok(page.url().endsWith('/auth/activity-feed-check'));
      assert.equal(await page.$$eval('[role="dialog"] .feed-item-row', rows => rows.length), 20);
      assert.ok(await page.$eval('[role="dialog"]', el => el.getBoundingClientRect().width <= innerWidth));
      await page.keyboard.press('Escape');
      await page.waitForSelector('[role="dialog"]', { hidden: true });
    }
    console.log('PASS: desktop/mobile open full recent feed without navigation; Escape closes.');
  } finally {
    await browser?.close();
    fs.rmSync(fixture, { recursive: true, force: true });
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
