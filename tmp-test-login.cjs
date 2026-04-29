const puppeteer = require('puppeteer');

const EMAIL = 'test-fille-winelio@yopmail.com';
const PASSWORD = 'Test1234!';
const LOGIN_URL = 'https://winelio.app/auth/login';

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

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
  await page.screenshot({ path: '/tmp/login-1-page.png' });
  
  // Click "Mot de passe" tab (login mode)
  console.log('🔘 Switching to password mode...');
  await page.evaluate(() => {
    const buttons = document.querySelectorAll('button');
    for (const btn of buttons) {
      if (btn.textContent.includes('Mot de passe')) {
        btn.click();
        return true;
      }
    }
    return false;
  });
  await sleep(1000);
  
  // Fill email and password
  console.log('✏️ Filling email & password...');
  await page.type('#email-pw', EMAIL, { delay: 20 });
  await page.type('#password', PASSWORD, { delay: 20 });
  await sleep(500);
  await page.screenshot({ path: '/tmp/login-2-filled.png' });
  
  // Click submit
  console.log('🔘 Clicking submit...');
  await page.click('button[type="submit"]');
  
  console.log('⏳ Waiting for redirect...');
  await sleep(8000);
  
  const finalUrl = page.url();
  console.log('📍 Final URL:', finalUrl);
  await page.screenshot({ path: '/tmp/login-3-result.png' });
  
  if (finalUrl.includes('/dashboard')) {
    console.log('🎉✅ SUCCESS! Redirected to dashboard!');
    const dashText = await page.evaluate(() => document.body.innerText);
    console.log('📝 Dashboard content (first 1500):', dashText.substring(0, 1500));
    await page.screenshot({ path: '/tmp/login-4-dashboard.png', fullPage: true });
    
    const userInfo = await page.evaluate(() => {
      const els = document.querySelectorAll('[class*="name"], [class*="Name"], [class*="user"], [class*="User"], h1, h2, [class*="title"]');
      return Array.from(els).slice(0, 10).map(e => e.textContent?.trim()).filter(Boolean);
    });
    console.log('👤 User info:', userInfo);
  } else {
    console.log('❌ Not redirected to dashboard');
    const errors = await page.evaluate(() => {
      const errs = document.querySelectorAll('[class*="error"], [class*="Error"], .text-red-500, [class*="alert"]');
      return Array.from(errs).map(e => e.textContent);
    });
    console.log('Errors:', errors);
    const pageText = await page.evaluate(() => document.body.innerText);
    console.log('📝 Page text:', pageText.substring(0, 1000));
  }

  console.log('\n⏳ Keeping browser open 2min...');
  await sleep(120000);
  await browser.close();
  console.log('🏁 Done');
}

run().catch(e => {
  console.error('❌ Error:', e);
  process.exit(1);
});
