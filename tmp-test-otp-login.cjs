const puppeteer = require('puppeteer');
const EMAIL = 'test-fille-winelio@yopmail.com';
const LOGIN_URL = 'https://winelio.app/auth/login';
const OTP = '123456';
function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }
async function run() {
  console.log('Launching browser...');
  const browser = await puppeteer.launch({
    headless: false,
    executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });
  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 900 });
  console.log('Loading login page...');
  await page.goto(LOGIN_URL, { waitUntil: 'networkidle2' });
  await sleep(2000);
  console.log('URL:', page.url());
  await page.screenshot({ path: '/tmp/otp-1.png' });
  console.log('Filling email...');
  await page.type('#email', EMAIL, { delay: 20 });
  await sleep(500);
  console.log('Clicking submit...');
  await page.click('button[type="submit"]');
  await sleep(4000);
  console.log('URL after email:', page.url());
  await page.screenshot({ path: '/tmp/otp-2.png' });
  console.log('Entering OTP: ' + OTP + '...');
  const codeField = await page.$('#code');
  if (codeField) {
    await codeField.type(OTP, { delay: 50 });
    console.log('OTP entered');
  }
  await sleep(500);
  await page.screenshot({ path: '/tmp/otp-3.png' });
  console.log('Clicking submit...');
  await page.click('button[type="submit"]');
  console.log('Waiting for redirect...');
  await sleep(10000);
  const finalUrl = page.url();
  console.log('Final URL:', finalUrl);
  await page.screenshot({ path: '/tmp/otp-4.png' });
  if (finalUrl.includes('/dashboard')) {
    console.log('SUCCESS! Redirected to dashboard!');
    await page.screenshot({ path: '/tmp/otp-5-dashboard.png', fullPage: true });
    const dashText = await page.evaluate(() => document.body.innerText);
    console.log('Dashboard:', dashText.substring(0, 2000));
  } else {
    console.log('Not on dashboard');
    const errors = await page.evaluate(() => {
      const errs = document.querySelectorAll('[class*="error"], .text-red-500, [class*="alert"]');
      return Array.from(errs).map(e => e.textContent);
    });
    console.log('Errors:', errors);
    const pt = await page.evaluate(() => document.body.innerText);
    console.log('Page:', pt.substring(0, 1000));
  }
  console.log('Keeping browser open 2min...');
  await sleep(120000);
  await browser.close();
  console.log('Done');
}
run().catch(e => { console.error('Error:', e); process.exit(1); });
