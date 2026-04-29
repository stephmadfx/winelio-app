const puppeteer = require('puppeteer');
async function run() {
  const browser = await puppeteer.launch({
    headless: false,
    executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });
  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 900 });
  await page.goto('https://winelio.app/auth/login', { waitUntil: 'networkidle2' });
  await new Promise(r => setTimeout(r, 2000));

  // Select all input elements and their attributes
  const inputs = await page.evaluate(() => {
    const all = document.querySelectorAll('input');
    return Array.from(all).map(el => ({
      id: el.id,
      name: el.name,
      type: el.type,
      placeholder: el.placeholder,
      className: el.className,
      parentHTML: el.parentElement?.innerHTML?.substring(0, 100)
    }));
  });
  console.log('=== INPUTS ===');
  console.log(JSON.stringify(inputs, null, 2));

  // Check if there are different login modes
  const buttons = await page.evaluate(() => {
    return Array.from(document.querySelectorAll('button')).map(b => ({
      text: b.textContent?.trim(),
      type: b.type,
      className: b.className?.substring(0, 80)
    }));
  });
  console.log('\n=== BUTTONS ===');
  console.log(JSON.stringify(buttons, null, 2));

  // Also check for tabs/segments
  const tabs = await page.evaluate(() => {
    const roles = document.querySelectorAll('[role="tab"], [role="tabpanel"]');
    return Array.from(roles).map(r => ({
      role: r.getAttribute('role'),
      text: r.textContent?.trim()?.substring(0, 50),
      selected: r.getAttribute('aria-selected')
    }));
  });
  console.log('\n=== TABS ===');
  console.log(JSON.stringify(tabs, null, 2));

  await browser.close();
  console.log('\nDone');
}
run().catch(e => { console.error('Error:', e); process.exit(1); });
