import puppeteer from 'puppeteer';
import path from 'path';
import fs from 'fs';

async function exportTagline() {
  const browser = await puppeteer.launch({
    executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
    headless: true,
  });

  const page = await browser.newPage();

  // Version pour fond sombre (texte blanc + orange)
  const htmlWhite = `
  <!DOCTYPE html>
  <html>
  <head>
    <meta charset="utf-8">
    <link href="https://fonts.googleapis.com/css2?family=Poppins:wght@400;700&display=swap" rel="stylesheet">
    <style>
      * { margin: 0; padding: 0; box-sizing: border-box; }
      body {
        margin: 0; padding: 10px; background: transparent;
        font-family: 'Poppins', 'Helvetica Neue', Arial, sans-serif;
        display: inline-block;
      }
      p {
        font-size: 32px; font-weight: 400; letter-spacing: 0.04em;
        color: #ffffff; margin: 0; white-space: nowrap;
        -webkit-font-smoothing: antialiased;
      }
      strong { color: #FF6B35; font-weight: 700; }
    </style>
  </head>
  <body>
    <p id="tagline">Recommandez. Connectez. <strong>Développez.</strong></p>
  </body>
  </html>`;

  // Version pour fond clair (texte gris + orange)
  const htmlDark = `
  <!DOCTYPE html>
  <html>
  <head>
    <meta charset="utf-8">
    <link href="https://fonts.googleapis.com/css2?family=Poppins:wght@400;700&display=swap" rel="stylesheet">
    <style>
      * { margin: 0; padding: 0; box-sizing: border-box; }
      body {
        margin: 0; padding: 10px; background: transparent;
        font-family: 'Poppins', 'Helvetica Neue', Arial, sans-serif;
        display: inline-block;
      }
      p {
        font-size: 32px; font-weight: 400; letter-spacing: 0.04em;
        color: #636E72; margin: 0; white-space: nowrap;
        -webkit-font-smoothing: antialiased;
      }
      strong { color: #FF6B35; font-weight: 700; }
    </style>
  </head>
  <body>
    <p id="tagline">Recommandez. Connectez. <strong>Développez.</strong></p>
  </body>
  </html>`;

  const outputPath = '/Users/steph/Desktop/Logos_Winelio';
  if (!fs.existsSync(outputPath)) {
    fs.mkdirSync(outputPath, { recursive: true });
  }

  // Rendu de la version blanche (pour fond sombre)
  try {
    await page.setContent(htmlWhite, { waitUntil: 'load', timeout: 5000 });
  } catch (err) {
    console.warn('SetContent white warning (timeout ignored):', err.message);
  }
  await new Promise(r => setTimeout(r, 1000)); // laisser charger Google Font
  let el = await page.$('#tagline');
  await el.screenshot({
    path: path.join(outputPath, 'winelio-tagline-only-white.png'),
    omitBackground: true,
  });

  // Rendu de la version sombre (pour fond clair)
  try {
    await page.setContent(htmlDark, { waitUntil: 'load', timeout: 5000 });
  } catch (err) {
    console.warn('SetContent dark warning (timeout ignored):', err.message);
  }
  await new Promise(r => setTimeout(r, 1000));
  el = await page.$('#tagline');
  await el.screenshot({
    path: path.join(outputPath, 'winelio-tagline-only-dark.png'),
    omitBackground: true,
  });

  await browser.close();
  console.log('Taglines exported successfully to Desktop!');
}

exportTagline().catch(console.error);
