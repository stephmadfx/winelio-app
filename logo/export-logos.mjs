/**
 * Winelio — Export logos SVG / PNG / JPEG
 * Utilise Puppeteer + Chrome pour un rendu pixel-perfect avec Poppins (Google Fonts)
 * Usage : node logo/export-logos.mjs
 */

import puppeteer from 'puppeteer';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SVG_DIR  = path.join(__dirname, 'svg');
const PNG_DIR  = path.join(__dirname, 'png');
const JPEG_DIR = path.join(__dirname, 'jpeg');

// ── Chemin W cursif (extrait du logo source) ────────────────────────────────
const W_PATH = `M 210.328125 3.039062 C 214.550781 54.800781 213.878906 96.941406 208.328125 128.289062 C 203.441406 155.898438 194.621094 175.808594 182.03125 187.359375 C 171.609375 196.929688 158.71875 200.75 144.769531 198.398438 C 133.75 196.550781 124.238281 187.738281 117 173.019531 C 114.128906 176.539062 111 180 107.640625 183.21875 C 96.308594 194.078125 85.121094 199.511719 74.359375 199.191406 C 74.308594 199.191406 74.25 199.191406 74.199219 199.191406 L 74.21875 199.210938 L 73.011719 199.210938 C 62.589844 199.210938 53.710938 194.96875 47.269531 186.878906 C 41.460938 179.578125 37.628906 169 35.738281 155.289062 C 33.851562 141.570312 33.910156 124.671875 35.910156 104.710938 C 36.871094 95.148438 38.210938 85.5 39.75 76.25 C 23.390625 72.488281 9.339844 62.910156 2.011719 54.03125 L 1.691406 53.640625 L 2.078125 53.320312 L 15.738281 42.070312 L 16.128906 41.75 L 16.449219 42.140625 C 20.78125 47.390625 30.738281 54.871094 43.148438 57.871094 C 45.5 46.308594 47.960938 36.128906 50.058594 28.578125 L 50.25 27.929688 C 54.289062 14.289062 64.710938 4.691406 77.621094 2.890625 C 88.589844 1.359375 99.160156 6 104.539062 14.78125 C 106.558594 18.078125 108.679688 23.308594 108.359375 30.460938 C 108.050781 37.601562 105.300781 46.621094 97.667969 57.511719 L 97.320312 58.011719 L 97.300781 58.039062 L 97.28125 58.070312 L 96.859375 58.519531 C 86.140625 70.019531 72.96875 76.601562 58.488281 77.730469 C 56.917969 86.949219 55.511719 96.769531 54.53125 106.578125 C 52.820312 123.640625 52.628906 138.269531 53.898438 149.910156 C 55.160156 161.578125 57.878906 170.179688 61.917969 175.25 C 63.46875 177.199219 65.167969 178.570312 67.121094 179.421875 C 69.070312 180.269531 71.300781 180.628906 73.949219 180.5 L 74.339844 180.480469 L 74.378906 180.480469 L 74.769531 180.5 C 74.929688 180.5 75.078125 180.511719 75.230469 180.511719 C 79.699219 180.511719 85.261719 177.800781 91.238281 172.808594 C 97.160156 167.859375 103.429688 160.71875 109.390625 151.949219 C 106.710938 141.449219 105.300781 130.320312 105.488281 120.199219 C 105.789062 103.609375 110.019531 93.808594 115.109375 88.03125 C 120.199219 82.25 126.109375 80.570312 129.660156 80.109375 C 136.429688 79.230469 142.371094 81.679688 145.910156 86.890625 C 148.808594 91.160156 149.660156 96.769531 149.289062 102.820312 C 148.921875 108.878906 147.320312 115.449219 145.238281 121.71875 C 141.609375 132.679688 136.5 142.761719 133.890625 147.601562 L 132.929688 149.339844 C 131.96875 151.050781 130.910156 152.898438 129.730469 154.839844 C 130.390625 156.78125 131.101562 158.679688 131.871094 160.511719 C 134.210938 166.109375 136.941406 170.78125 139.738281 174.140625 C 142.550781 177.519531 145.378906 179.53125 147.898438 179.960938 C 156.191406 181.359375 163.210938 179.269531 169.410156 173.578125 L 169.839844 173.179688 C 178.910156 164.539062 185.878906 147.949219 189.941406 125.019531 C 195.210938 95.289062 195.808594 54.761719 191.710938 4.550781 L 191.671875 4.050781 L 192.171875 4.011719 L 209.808594 2.570312 L 210.308594 2.53125 L 210.351562 3.03125 Z M 130.648438 99.128906 C 128.988281 100.078125 127.480469 102.320312 126.339844 105.730469 C 125.058594 109.519531 124.28125 114.609375 124.167969 120.539062 C 124.148438 121.878906 124.160156 123.238281 124.199219 124.621094 C 125.488281 121.550781 126.621094 118.539062 127.558594 115.648438 L 127.839844 114.78125 C 130.378906 106.738281 130.800781 101.699219 130.660156 99.128906 Z M 81.789062 21.289062 C 81.269531 21.289062 80.738281 21.328125 80.199219 21.398438 C 74.550781 22.191406 69.988281 26.699219 68.070312 33.609375 C 66.519531 39.171875 64.371094 47.859375 62.167969 58.328125 C 69.75 56.660156 76.628906 52.621094 82.730469 46.230469 C 87.46875 39.328125 89.160156 34.28125 89.558594 30.769531 C 89.949219 27.269531 89.058594 25.289062 88.589844 24.53125 C 87.390625 22.558594 84.941406 21.339844 82.019531 21.28125 L 81.800781 21.28125 Z`;

// ── Définitions SVG standalone ───────────────────────────────────────────────

function svgDefs(extraDefs = '') {
  return `
  <defs>
    <style>
      @import url('https://fonts.googleapis.com/css2?family=Poppins:wght@400;700&amp;display=swap');
    </style>
    <linearGradient id="wGrad" x1="0%" y1="0%" x2="100%" y2="0%">
      <stop offset="0%"   stop-color="#FF6B35"/>
      <stop offset="100%" stop-color="#F7931E"/>
    </linearGradient>
    ${extraDefs}
  </defs>`;
}

const W_SCALE = 0.6436; // échelle pour 130px de hauteur dans un contexte 96px font

// ── Templates HTML pour le rendu Puppeteer ──────────────────────────────────

function htmlWrapper(body, bg = 'transparent', w = 800, h = 300) {
  return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Poppins:wght@400;700&display=swap" rel="stylesheet">
<style>
  * { margin:0; padding:0; box-sizing:border-box; }
  body {
    width:${w}px; height:${h}px;
    background:${bg};
    display:flex; align-items:center; justify-content:center;
    font-family:'Poppins',sans-serif;
    -webkit-font-smoothing:antialiased;
  }
</style>
</head>
<body>${body}</body>
</html>`;
}

// Lockup W + inelio
function lockupHTML(wFill, textColor, fontSize = 96) {
  const svgH = Math.round(fontSize * 1.52);
  return `
<div style="display:inline-flex;align-items:flex-end;line-height:1;letter-spacing:-0.04em;font-size:${fontSize}px;font-weight:700;">
  <div style="display:flex;align-items:flex-end;margin-right:${Math.round(fontSize*0.04)}px;margin-bottom:${Math.round(fontSize*-0.08)}px;">
    <svg viewBox="0 0 216 202" width="auto" height="${svgH}" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id="wGrad" x1="0%" y1="0%" x2="100%" y2="0%">
          <stop offset="0%" stop-color="#FF6B35"/>
          <stop offset="100%" stop-color="#F7931E"/>
        </linearGradient>
      </defs>
      <path d="${W_PATH}" fill="${wFill}"/>
    </svg>
  </div>
  <span style="font-family:'Poppins',sans-serif;font-weight:700;color:${textColor};">inelio</span>
</div>`;
}

// Lockup + tagline
function lockupTaglineHTML(wFill, textColor, tagColor, tagAccent, fontSize = 80, bg = 'transparent') {
  const svgH = Math.round(fontSize * 1.52);
  const pad = bg !== 'transparent' ? 'padding:60px 80px;border-radius:24px;' : '';
  return `
<div style="display:flex;flex-direction:column;align-items:center;gap:24px;${pad}background:${bg};">
  <div style="display:inline-flex;align-items:flex-end;line-height:1;letter-spacing:-0.04em;font-size:${fontSize}px;font-weight:700;">
    <div style="display:flex;align-items:flex-end;margin-right:${Math.round(fontSize*0.04)}px;margin-bottom:${Math.round(fontSize*-0.08)}px;">
      <svg viewBox="0 0 216 202" width="auto" height="${svgH}" xmlns="http://www.w3.org/2000/svg">
        <defs>
          <linearGradient id="wGrad" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stop-color="#FF6B35"/>
            <stop offset="100%" stop-color="#F7931E"/>
          </linearGradient>
        </defs>
        <path d="${W_PATH}" fill="${wFill}"/>
      </svg>
    </div>
    <span style="font-family:'Poppins',sans-serif;font-weight:700;color:${textColor};">inelio</span>
  </div>
  <div style="width:48px;height:2px;background:linear-gradient(90deg,#FF6B35,#F7931E);border-radius:2px;margin-left:16px;"></div>
  <p style="font-size:${Math.round(fontSize*0.19)}px;font-weight:400;letter-spacing:0.04em;color:${tagColor};text-align:center;margin-left:16px;">
    Recommandez. Connectez. <strong style="color:${tagAccent};font-weight:700;">Gagnez.</strong>
  </p>
</div>`;
}

// App icon W seul dans carré arrondi
function iconHTML(size) {
  const radius = Math.round(size * 0.22);
  const svgSize = Math.round(size * 0.58);
  return `
<div style="width:${size}px;height:${size}px;border-radius:${radius}px;
            background:linear-gradient(145deg,#FF6B35,#F7931E);
            display:flex;align-items:center;justify-content:center;">
  <svg viewBox="0 0 216 202" width="${svgSize}" height="${svgSize}" xmlns="http://www.w3.org/2000/svg">
    <path d="${W_PATH}" fill="#fff"/>
  </svg>
</div>`;
}

// Carré social 1:1 — lockup horizontal centré + tagline
function squareHTML(size, bg, wFill, textColor, tagColor, tagAccent) {
  const radius   = Math.round(size * 0.07);
  const fontSize = Math.round(size * 0.115);
  const svgH     = Math.round(fontSize * 1.52);
  const tagSize  = Math.round(fontSize * 0.18);
  return `
<div style="width:${size}px;height:${size}px;border-radius:${radius}px;
            background:${bg};
            display:flex;flex-direction:column;align-items:center;justify-content:center;
            gap:${Math.round(size*0.04)}px;">
  <div style="display:inline-flex;align-items:flex-end;line-height:1;letter-spacing:-0.04em;
              font-size:${fontSize}px;font-weight:700;">
    <div style="display:flex;align-items:flex-end;
                margin-right:${Math.round(fontSize*0.04)}px;
                margin-bottom:${Math.round(fontSize*-0.08)}px;">
      <svg viewBox="0 0 216 202" width="auto" height="${svgH}" xmlns="http://www.w3.org/2000/svg">
        <defs>
          <linearGradient id="wGrad" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stop-color="#FF6B35"/>
            <stop offset="100%" stop-color="#F7931E"/>
          </linearGradient>
        </defs>
        <path d="${W_PATH}" fill="${wFill}"/>
      </svg>
    </div>
    <span style="font-family:'Poppins',sans-serif;font-weight:700;color:${textColor};">inelio</span>
  </div>
  <p style="font-size:${tagSize}px;font-weight:400;letter-spacing:0.04em;
             color:${tagColor};text-align:center;margin:0;
             font-family:'Poppins',sans-serif;">
    Recommandez. Connectez. <strong style="color:${tagAccent};font-weight:700;">Gagnez.</strong>
  </p>
</div>`;
}

// ── Configurations d'export ──────────────────────────────────────────────────

const EXPORTS = [
  // LOCKUP HORIZONTAL
  {
    name: 'winelio-logo-color',
    desc: 'Logo couleur — fond transparent',
    w: 800, h: 220,
    html: (w,h) => htmlWrapper(lockupHTML('url(#wGrad)', '#3D4A52', 96), 'transparent', w, h),
  },
  {
    name: 'winelio-logo-white',
    desc: 'Logo blanc — pour fonds sombres',
    w: 800, h: 220,
    bg: '#2D3436',
    html: (w,h) => htmlWrapper(lockupHTML('#fff', '#fff', 96), '#2D3436', w, h),
  },
  {
    name: 'winelio-logo-dark',
    desc: 'Logo sombre — pour fonds clairs',
    w: 800, h: 220,
    html: (w,h) => htmlWrapper(lockupHTML('url(#wGrad)', '#2D3436', 96), 'transparent', w, h),
  },
  {
    name: 'winelio-logo-on-dark',
    desc: 'Logo gradient + inelio blanc — fond transparent (pour fonds sombres)',
    w: 800, h: 220,
    html: (w,h) => htmlWrapper(lockupHTML('url(#wGrad)', '#ffffff', 96), 'transparent', w, h),
  },

  // LOCKUP + TAGLINE
  {
    name: 'winelio-logo-tagline-white',
    desc: 'Logo + tagline — fond blanc',
    w: 900, h: 380,
    bg: '#ffffff',
    html: (w,h) => htmlWrapper(
      lockupTaglineHTML('url(#wGrad)', '#3D4A52', '#636E72', '#FF6B35', 80, '#ffffff'),
      '#ffffff', w, h
    ),
  },
  {
    name: 'winelio-logo-tagline-dark',
    desc: 'Logo + tagline — fond sombre',
    w: 900, h: 380,
    bg: '#2D3436',
    html: (w,h) => htmlWrapper(
      lockupTaglineHTML('url(#wGrad)', '#ffffff', 'rgba(255,255,255,0.55)', '#FF6B35', 80, '#2D3436'),
      '#2D3436', w, h
    ),
  },
  {
    name: 'winelio-logo-tagline-transparent',
    desc: 'Logo + tagline — fond transparent',
    w: 900, h: 320,
    html: (w,h) => htmlWrapper(
      lockupTaglineHTML('url(#wGrad)', '#3D4A52', '#636E72', '#FF6B35', 80, 'transparent'),
      'transparent', w, h
    ),
  },

  // CARRÉS SOCIAUX 1:1 (1080×1080)
  {
    name: 'winelio-square-gradient',
    desc: 'Carré social — fond gradient orange',
    w: 1080, h: 1080,
    bg: '#FF6B35',
    html: (w,h) => htmlWrapper(
      squareHTML(1080, 'linear-gradient(145deg,#FF6B35,#F7931E)', '#fff', '#fff', 'rgba(255,255,255,0.8)', '#fff'),
      'transparent', w, h
    ),
  },
  {
    name: 'winelio-square-dark',
    desc: 'Carré social — fond sombre',
    w: 1080, h: 1080,
    bg: '#2D3436',
    html: (w,h) => htmlWrapper(
      squareHTML(1080, '#2D3436', 'url(#wGrad)', '#fff', 'rgba(255,255,255,0.5)', '#FF6B35'),
      '#2D3436', w, h
    ),
  },
  {
    name: 'winelio-square-white',
    desc: 'Carré social — fond blanc',
    w: 1080, h: 1080,
    bg: '#ffffff',
    html: (w,h) => htmlWrapper(
      squareHTML(1080, '#ffffff', 'url(#wGrad)', '#3D4A52', '#aaaaaa', '#FF6B35'),
      '#ffffff', w, h
    ),
  },

  // OG IMAGE / SOCIAL COVER (1200×628)
  {
    name: 'winelio-og-image',
    desc: 'OG Image / Social Cover — 1200×628',
    w: 1200, h: 628,
    bg: '#2D3436',
    html: (w,h) => htmlWrapper(
      lockupTaglineHTML('url(#wGrad)', '#ffffff', 'rgba(255,255,255,0.6)', '#FF6B35', 80, '#2D3436'),
      '#2D3436', w, h
    ),
  },

  // APP ICONS
  { name: 'winelio-icon-1024', desc: 'App icon 1024×1024', w: 1024, h: 1024, icon: 1024 },
  { name: 'winelio-icon-512',  desc: 'App icon 512×512',   w: 512,  h: 512,  icon: 512  },
  { name: 'winelio-icon-192',  desc: 'App icon 192×192',   w: 192,  h: 192,  icon: 192  },
  { name: 'winelio-icon-48',   desc: 'Favicon 48×48',      w: 48,   h: 48,   icon: 48   },
];

// ── Génération des SVG standalone ───────────────────────────────────────────

function makeSVG(name, svgContent, w, h) {
  const content = `<?xml version="1.0" encoding="UTF-8"?>
<!-- Winelio — ${name} -->
<!-- Poppins 700 requis (Google Fonts). Ce fichier s'affiche correctement dans un navigateur ou Figma. -->
<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink"
     viewBox="0 0 ${w} ${h}" width="${w}" height="${h}">
  <defs>
    <style>
      @import url('https://fonts.googleapis.com/css2?family=Poppins:wght@400;700&amp;display=swap');
      .wordmark { font-family: 'Poppins', 'Helvetica Neue', Arial, sans-serif; font-weight: 700; }
      .tagline  { font-family: 'Poppins', 'Helvetica Neue', Arial, sans-serif; font-weight: 400; }
      .tagline-bold { font-family: 'Poppins', 'Helvetica Neue', Arial, sans-serif; font-weight: 700; }
    </style>
    <linearGradient id="wGrad" x1="0%" y1="0%" x2="100%" y2="0%">
      <stop offset="0%"   stop-color="#FF6B35"/>
      <stop offset="100%" stop-color="#F7931E"/>
    </linearGradient>
  </defs>
${svgContent}
</svg>`;
  fs.writeFileSync(path.join(SVG_DIR, `${name}.svg`), content, 'utf8');
}

// ── SVG via foreignObject (rendu CSS pixel-perfect, centrage garanti) ───────
// Fonctionne dans : Chrome, Firefox, Safari, Figma
// Note : Illustrator ignore foreignObject → utiliser les PNG pour Illustrator

function svgFO(w, h, bg, bodyStyle, htmlBody) {
  const bgRect = bg ? `<rect width="${w}" height="${h}" fill="${bg}"/>` : '';
  return `${bgRect}
  <foreignObject x="0" y="0" width="${w}" height="${h}">
    <html xmlns="http://www.w3.org/1999/xhtml" style="height:100%;margin:0;padding:0;">
      <body style="margin:0;padding:0;height:100%;width:100%;
        display:flex;flex-direction:column;align-items:center;justify-content:center;
        font-family:'Poppins','Helvetica Neue',Arial,sans-serif;
        -webkit-font-smoothing:antialiased;${bodyStyle}">
        ${htmlBody}
      </body>
    </html>
  </foreignObject>`;
}

function lockupFO(wFill, textColor, fontSize = 96) {
  const svgH = Math.round(fontSize * 1.52);
  const mr   = Math.round(fontSize * 0.04);
  const mb   = Math.round(fontSize * -0.08);
  const wGradDef = wFill === 'gradient' ? `<defs><linearGradient id="g" x1="0%" y1="0%" x2="100%" y2="0%"><stop offset="0%" stop-color="#FF6B35"/><stop offset="100%" stop-color="#F7931E"/></linearGradient></defs>` : '';
  const fill = wFill === 'gradient' ? 'url(#g)' : wFill;
  return `
    <div style="display:inline-flex;align-items:flex-end;line-height:1;letter-spacing:-0.04em;font-size:${fontSize}px;font-weight:700;">
      <div style="display:flex;align-items:flex-end;margin-right:${mr}px;margin-bottom:${mb}px;">
        <svg viewBox="0 0 216 202" width="auto" height="${svgH}" xmlns="http://www.w3.org/2000/svg">
          ${wGradDef}
          <path d="${W_PATH}" fill="${fill}"/>
        </svg>
      </div>
      <span style="font-family:'Poppins',sans-serif;font-weight:700;color:${textColor};"
      >inelio</span>
    </div>`;
}

function taglineFO(tagColor, accentColor, fontSize = 18) {
  return `
    <div style="width:48px;height:2px;background:linear-gradient(90deg,#FF6B35,#F7931E);border-radius:2px;margin-left:16px;margin-top:4px;"></div>
    <p style="font-size:${fontSize}px;font-weight:400;letter-spacing:0.04em;color:${tagColor};
               text-align:center;margin:8px 0 0;margin-left:16px;font-family:'Poppins',sans-serif;">
      Recommandez. Connectez. <strong style="color:${accentColor};font-weight:700;">Gagnez.</strong>
    </p>`;
}

function generateSVGs() {
  console.log('\n📐 Génération des SVG (foreignObject — centrage CSS)...');

  // 1. Logo couleur — fond transparent
  makeSVG('winelio-logo-color',
    svgFO(720, 200, null, '',
      lockupFO('gradient', '#3D4A52', 96)),
    720, 200);
  console.log('  ✓ winelio-logo-color.svg');

  // 2. Logo blanc — fond sombre
  makeSVG('winelio-logo-white',
    svgFO(720, 200, '#2D3436', '',
      lockupFO('#ffffff', '#ffffff', 96)),
    720, 200);
  console.log('  ✓ winelio-logo-white.svg');

  // 3. Logo sombre — fond transparent
  makeSVG('winelio-logo-dark',
    svgFO(720, 200, null, '',
      lockupFO('gradient', '#2D3436', 96)),
    720, 200);
  console.log('  ✓ winelio-logo-dark.svg');

  // 4a. Logo + tagline — fond transparent
  makeSVG('winelio-logo-tagline',
    svgFO(800, 300, null, 'gap:20px;',
      lockupFO('gradient', '#3D4A52', 80) + taglineFO('#636E72', '#FF6B35')),
    800, 300);
  console.log('  ✓ winelio-logo-tagline.svg');

  // 4b. Logo + tagline — fond blanc
  makeSVG('winelio-logo-tagline-white',
    svgFO(800, 300, '#ffffff', 'gap:20px;',
      lockupFO('gradient', '#3D4A52', 80) + taglineFO('#636E72', '#FF6B35')),
    800, 300);
  console.log('  ✓ winelio-logo-tagline-white.svg');

  // 4c. Logo + tagline — fond sombre
  makeSVG('winelio-logo-tagline-dark',
    svgFO(800, 300, '#2D3436', 'gap:20px;',
      lockupFO('gradient', '#ffffff', 80) + taglineFO('rgba(255,255,255,0.55)', '#FF6B35')),
    800, 300);
  console.log('  ✓ winelio-logo-tagline-dark.svg');

  // 5. W seul (icône)
  makeSVG('winelio-icon', `
  <rect width="216" height="216" rx="48" fill="url(#wGrad)"/>
  <g transform="translate(3, 7)">
    <path fill="#ffffff" d="${W_PATH}"/>
  </g>`, 216, 216);
  console.log('  ✓ winelio-icon.svg');

  console.log('  → 5 SVG créés dans logo/svg/');
}

// ── Export PNG + JPEG via Puppeteer ─────────────────────────────────────────

async function exportImages() {
  console.log('\n🖼  Export PNG + JPEG via Chrome headless...');

  const browser = await puppeteer.launch({
    executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
    headless: true,
  });

  for (const exp of EXPORTS) {
    const page = await browser.newPage();

    let htmlContent;
    if (exp.icon) {
      htmlContent = htmlWrapper(iconHTML(exp.icon), 'transparent', exp.w, exp.h);
    } else {
      htmlContent = exp.html(exp.w, exp.h);
    }

    await page.setViewport({ width: exp.w, height: exp.h, deviceScaleFactor: 2 });
    await page.setContent(htmlContent, { waitUntil: 'networkidle0' });
    // Attendre le chargement de la font
    await new Promise(r => setTimeout(r, 800));

    // PNG
    const pngPath = path.join(PNG_DIR, `${exp.name}.png`);
    const bgTransparent = !exp.bg;

    await page.screenshot({
      path: pngPath,
      type: 'png',
      omitBackground: bgTransparent,
      clip: { x: 0, y: 0, width: exp.w, height: exp.h },
    });
    console.log(`  ✓ ${exp.name}.png`);

    // JPEG (fond blanc pour les versions transparentes)
    if (!exp.icon || exp.icon >= 192) {
      const jpegPath = path.join(JPEG_DIR, `${exp.name}.jpg`);
      // Pour JPEG : fond blanc si transparent
      if (bgTransparent) {
        await page.evaluate(() => {
          document.body.style.background = '#ffffff';
        });
      }
      await page.screenshot({
        path: jpegPath,
        type: 'jpeg',
        quality: 95,
        clip: { x: 0, y: 0, width: exp.w, height: exp.h },
      });
      console.log(`  ✓ ${exp.name}.jpg`);
      if (bgTransparent) {
        await page.evaluate(() => {
          document.body.style.background = 'transparent';
        });
      }
    }

    await page.close();
  }

  await browser.close();
  console.log('\n✅ Export terminé !');
  console.log(`   PNG  → logo/png/  (${EXPORTS.length} fichiers)`);
  console.log(`   JPEG → logo/jpeg/ (${EXPORTS.filter(e => !e.icon || e.icon >= 192).length} fichiers)`);
}

// ── Main ─────────────────────────────────────────────────────────────────────

console.log('🎨 Winelio — Export des logos');
console.log('================================');
generateSVGs();
await exportImages();
