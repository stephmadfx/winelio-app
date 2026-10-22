const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');
const compiled = ts.transpileModule(fs.readFileSync('src/lib/referral-install.ts', 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;
const exportsObject = {};
vm.runInNewContext(compiled, { exports: exportsObject, URL, URLSearchParams });
const { parseReferralLink, parseInstallReferrer, referralClipboardLink, referralAppLink, referralPlayStoreLink, referralRegistrationPath } = exportsObject;

test('Android et iPhone conservent le code, le type pro et le visionnage', () => {
  for (const professional of [false, true]) {
    const invite = { code: 'ABC12345', professional, videoWatched: true };
    for (const link of [referralClipboardLink(invite), referralAppLink(invite)]) {
      assert.equal(JSON.stringify(parseReferralLink(link)), JSON.stringify(invite));
    }
    const store = new URL(referralPlayStoreLink(invite));
    assert.equal(store.origin, 'https://play.google.com');
    assert.equal(store.searchParams.get('id'), 'app.winelio.mobile');
    assert.equal(JSON.stringify(parseInstallReferrer(store.searchParams.get('referrer'))), JSON.stringify(invite));
    const registration = new URL(referralRegistrationPath(invite), 'https://winelio.app');
    assert.equal(registration.pathname, '/auth/login');
    assert.equal(registration.searchParams.get('mode'), 'register');
    assert.equal(registration.searchParams.get('ref'), invite.code);
    assert.equal(registration.searchParams.get('video'), '1');
  }
});

test('les invitations historiques et les minuscules restent utilisables', () => {
  assert.equal(parseReferralLink('https://winelio.app/auth/login?mode=register&ref=abc123').code, 'ABC123');
  assert.equal(parseReferralLink('https://winelio.app/?ref=abc12345').code, 'ABC12345');
  assert.equal(parseReferralLink('https://winelio.app/?ref=abc12345').videoWatched, false);
});

test('aucune URL tierce, destination arbitraire ou invitation ambiguë ne passe', () => {
  for (const link of [
    'https://winelio.app.evil.example/?ref=ABC12345',
    'https://winelio.app@evil.example/?ref=ABC12345',
    'http://winelio.app/?ref=ABC12345',
    'https://evil:password@winelio.app/?ref=ABC12345',
    'https://winelio.app:444/?ref=ABC12345',
    'https://winelio.app/wallet?ref=ABC12345',
    'https://winelio.app/?ref=ABC12345#ref=DEF12345',
    'https://winelio.app/?ref=ABC12345&ref=DEF12345',
    'https://winelio.app/?ref=ABC12345&type=pro&type=pro',
    'https://winelio.app/?ref=ABC12345&video=1&video=0',
    'https://winelio.app/?ref=ABC12345&type=admin',
    'https://winelio.app/?ref=ABC%3Cscript%3E',
    'winelio://wallet?ref=ABC12345',
    'winelio://invite/arbitrary?ref=ABC12345',
    'ABC12345', '', 'x'.repeat(3000),
  ]) assert.equal(parseReferralLink(link), null, link.slice(0, 100));
});

test('les campagnes Play ordinaires ne deviennent pas des parrainages', () => {
  for (const value of ['utm_source=google', 'ref=ABC12345', 'winelio_invite=1&ref=ABC12345&ref=DEF12345', 'winelio_invite=1&winelio_invite=1&ref=ABC12345']) {
    assert.equal(parseInstallReferrer(value), null);
  }
});
