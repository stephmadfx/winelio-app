const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');
const { NextRequest, NextResponse } = require('next/server');
const recipient = '00000000-0000-4000-8000-000000000001';
const token = 'a'.repeat(48);
const apple = 'https://apps.apple.com/fr/app/winelio/id6792769653';
const google = 'https://play.google.com/store/apps/details?id=app.winelio.mobile&hl=fr&gl=FR';

function load(filename, imports, extra = {}) {
  const code = ts.transpileModule(fs.readFileSync(filename, 'utf8'), { compilerOptions: {
    module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022,
  }}).outputText;
  const module = { exports: {} };
  vm.runInNewContext(code, { module, exports: module.exports, Buffer, URL, Headers,
    process: { env: {} }, console: { error() {} }, setInterval: () => ({ unref() {} }),
    require: name => name in imports ? imports[name] : require(name), ...extra }, { filename });
  return module.exports;
}
const { isPublicNewsletterPath } = load('src/lib/newsletter-public-routes.ts', {});
function middleware() {
  let authCalls = 0;
  const mod = load('src/middleware.ts', {
    'next/server': { NextResponse },
    '@supabase/ssr': { createServerClient: () => ({ auth: { getUser: async () => { authCalls++; return { data: { user: null } }; } } }) },
    './lib/supabase/config': { SUPABASE_URL: 'https://example.invalid', SUPABASE_ANON_KEY: 'test-placeholder' },
    './lib/newsletter-public-routes': { isPublicNewsletterPath },
    './lib/profile-completion': { requiresCompleteProfile: () => false },
  });
  return { run: path => mod.middleware(new NextRequest(`https://winelio.app${path}`)), calls: () => authCalls };
}
const { addCampaignTracking } = load('src/lib/newsletter-campaign.ts', {
  '@/lib/html-escape': {}, '@/lib/newsletter-email-service': {}, '@/lib/newsletter-audience': {},
  '@/lib/newsletter-variables': {}, '@/lib/supabase/admin': {},
});
const html = addCampaignTracking(`<body><a href="${apple}">Apple</a><a href="${google.replaceAll('&', '&amp;')}">Google</a><a href="https://winelio.app/newsletter/unsubscribe?email=test%40example.invalid">Désinscription</a></body>`, recipient, token);
const embedded = [...html.matchAll(/(?:href|src)="(https:[^"]+)"/g)].map(match => match[1]);

test('every URL generated for delivered email passes middleware with no session or Auth request', async () => {
  const app = middleware(); assert.equal(embedded.length, 4);
  for (const url of embedded) {
    const path = new URL(url).pathname;
    assert.ok(isPublicNewsletterPath(path), path);
    assert.equal((await app.run(new URL(url).pathname + new URL(url).search)).status, 200);
  }
  assert.equal(app.calls(), 0);
});
test('mail image proxy sharing an IP does not exhaust the authenticated API rate bucket', async () => {
  const app = middleware();
  for (let i = 0; i < 70; i++) assert.equal((await app.run(`/api/newsletter/track/open/${recipient}`)).status, 200);
  assert.equal(app.calls(), 0);
});
test('send, upload, report and lookalike routes stay authenticated', async () => {
  const app = middleware();
  for (const path of ['/api/newsletters', '/api/newsletters/test-email', '/api/newsletters/upload-image',
    `/api/newsletters/${recipient}/send`, `/api/admin/newsletters/${recipient}/stats`,
    `/api/newsletter/track/open/${recipient}/admin`]) {
    assert.equal(isPublicNewsletterPath(path), false);
    assert.equal((await app.run(path)).status, 401, path);
  }
});
test('Apple and Google tracked links redirect correctly even when telemetry fails', async () => {
  for (const fail of [false, true]) {
    const route = load('src/app/api/newsletter/track/click/[recipientId]/route.ts', {
      'next/server': { NextResponse }, '@/lib/newsletter': { recordNewsletterEvent: async () => { if (fail) throw Error('offline'); } },
    });
    for (const url of embedded.filter(url => url.includes('/track/click/'))) {
      const result = await route.GET(new Request(url), { params: Promise.resolve({ recipientId: recipient }) });
      assert.equal(result.status, 307);
      const target = new URL(result.headers.get('location'));
      assert.ok([apple, google].includes(target.toString()));
      if (target.hostname === 'play.google.com') { assert.equal(target.searchParams.get('hl'), 'fr'); assert.equal(target.searchParams.get('gl'), 'FR'); }
    }
  }
});
test('tracking pixel is an uncached GIF without relying on authentication', async () => {
  const route = load('src/app/api/newsletter/track/open/[recipientId]/route.ts', {
    'next/server': { NextResponse }, '@/lib/newsletter': { recordNewsletterEvent: async () => { throw Error('offline'); } },
  });
  const result = await route.GET(new Request(`https://winelio.app/api/newsletter/track/open/${recipient}`), { params: Promise.resolve({ recipientId: recipient }) });
  assert.equal(result.status, 200); assert.equal(result.headers.get('content-type'), 'image/gif');
  assert.match(result.headers.get('cache-control'), /no-store/);
  assert.equal(Buffer.from(await result.arrayBuffer()).subarray(0, 6).toString(), 'GIF89a');
});
test('invalid click protocols cannot be redirected', async () => {
  const route = load('src/app/api/newsletter/track/click/[recipientId]/route.ts', {
    'next/server': { NextResponse }, '@/lib/newsletter': { recordNewsletterEvent: async () => {} },
  });
  const result = await route.GET(new Request(`https://winelio.app/api/newsletter/track/click/${recipient}?u=javascript%3Aalert(1)`), { params: Promise.resolve({ recipientId: recipient }) });
  assert.equal(result.headers.get('location'), 'https://winelio.app/');
});
