const puppeteer = require('puppeteer');
const EMAIL = 'test-fille-winelio@yopmail.com';
const LOGIN_URL = 'https://winelio.app/auth/login';
const OTP = '123456';
function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }
async function run() {
  console.log('🚀 Launching browser...');
  const browser = await puppeteer.launch({
    headless: false,
    executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });
  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 900 });
  
  console.log('📄 Loading login page...');
  await page.goto(LOGIN_URL, { waitUntil: 'networkidle2' });
  await sleep(2000);
  console.log('📍 URL:', page.url());
  await page.screenshot({ path: '/tmp/otp-1.png' });
  
  // Switch to "Code par email" mode
  console.log('🔘 Clicking "Code par email" tab...');
  const clicked = await page.evaluate(() => {
    const buttons = document.querySelectorAll('button');
    for (const btn of buttons) {
      if (btn.textContent.trim() === 'Code par email') { btn.click(); return true; }
    }
    return false;
  });
  console.log('Tab clicked:', clicked);
  await sleep(1000);
  
  // Now fill email (the OTP mode input is #email)
  console.log('✏️ Filling email...');
  await page.type('#email', EMAIL, { delay: 20 });
  await sleep(500);
  await page.screenshot({ path: '/tmp/otp-2-email.png' });
  
  // Submit email
  console.log('🔘 Clicking submit...');
  await page.click('button[type="submit"]');
  await sleep(4000);
  
  console.log('📍 URL after email:', page.url());
  await page.screenshot({ path: '/tmp/otp-3-after-email.png' });
  
  // Enter OTP
  console.log('🔑 Entering OTP:', OTP);
  const codeField = await page.$('#code');
  if (codeField) {
    await codeField.type(OTP, { delay: 50 });
    console.log('✅ OTP entered');
  } else {
    console.log('❌ #code field not found');
    const html = await page.content();
    console.log('Page HTML snippet:', html.substring(html.length - 1000));
  }
  await sleep(500);
  await page.screenshot({ path: '/tmp/otp-4-code.png' });
  
  // Submit OTP
  console.log('🔘 Clicking submit OTP...');
  await page.click('button[type="submit"]');
  console.log('⏳ Waiting for redirect...');
  await sleep(10000);
  
  const finalUrl = page.url();
  console.log('📍 Final URL:', finalUrl);
  await page.screenshot({ path: '/tmp/otp-5-final.png' });
  
  if (finalUrl.includes('/dashboard')) {
    console.log('🎉✅ SUCCESS! Redirected to dashboard!');
    await page.screenshot({ path: '/tmp/otp-6-dashboard.png', fullPage: true });
    const dashText = await page.evaluate(() => document.body.innerText);
    console.log('📝 Dashboard (first 2000):', dashText.substring(0, 2000));
    const userInfo = await page.evaluate(() => {
      const els = document.querySelectorAll('[class*="name"], [class*="Name"], [class*="user"], [class*="User"], h1, h2, h3');
      return Array.from(els).slice(0, 10).map(e => e.textContent?.trim()).filter(Boolean);
    });
    console.log('👤 User info:', userInfo);
  } else {
    console.log('❌ Not on dashboard');
    const errors = await page.evaluate(() => {
      const errs = document.querySelectorAll('[class*="error"], .text-red-500, [class*="alert"]');
      return Array.from(errs).map(e => e.textContent);
    });
    console.log('Errors:', errors);
    const pt = await page.evaluate(() => document.body.innerText);
    console.log('📝 Page:', pt.substring(0, 1000));
  }

  console.log('\n⏳ Keeping browser open 2min...');
  await sleep(120000);
  await browser.close();
  console.log('🏁 Done');
}
run().catch(e => { console.error('❌ Error:', e); process.exit(1); });
