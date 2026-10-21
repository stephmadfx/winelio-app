const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');

function load(file, imports, globals = {}) {
  const module = { exports: {} };
  vm.runInNewContext(ts.transpileModule(fs.readFileSync(file, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX },
  }).outputText, { module, exports: module.exports, require: name => imports[name] ?? require(name), ...globals });
  return module.exports;
}

function setup({ clipboardFails = false, fallbackWorks = true, shareError } = {}) {
  const states = [], copied = [], shared = [];
  let cursor = 0, removed = 0;
  const jsx = (type, props) => ({ type, props });
  const components = load('src/components/referral-buttons.tsx', {
    react: { useState(value) { const i = cursor++; if (!(i in states)) states[i] = value; return [states[i], next => { states[i] = next; }]; } },
    'react/jsx-runtime': { jsx, jsxs: jsx },
    'qrcode.react': { QRCodeSVG: 'qr' },
    '@/components/ui/dialog': Object.fromEntries(['Dialog', 'DialogContent', 'DialogHeader', 'DialogTitle', 'DialogDescription'].map(name => [name, name])),
  }, {
    window: { location: { origin: 'https://winelio.app' } },
    navigator: {
      clipboard: { async writeText(text) { if (clipboardFails) throw Error('denied'); copied.push(text); } },
      async share(data) { shared.push(data); if (shareError) throw shareError; },
    },
    document: {
      body: { appendChild() {} },
      createElement: () => ({ style: {}, select() { copied.push(this.value); }, remove() { removed++; } }),
      execCommand: () => fallbackWorks,
    },
    Error, setTimeout() {},
  });
  return { copied, shared, states, get removed() { return removed; }, render(name, props) { cursor = 0; return components[name](props); } };
}

function nodes(node, match) {
  if (!node || typeof node !== 'object') return [];
  if (Array.isArray(node)) return node.flatMap(child => nodes(child, match));
  return [...(match(node) ? [node] : []), ...nodes(node.props?.children, match)];
}
const buttons = tree => nodes(tree, node => node.type === 'button');

test('copy uses the complete invitation URL for members and professionals', async () => {
  for (const isPro of [false, true]) {
    const s = setup();
    await s.render('CopyButton', { code: 'ABC12345', isPro }).props.onClick();
    assert.equal(s.copied[0], `https://winelio.app/auth/login?mode=register&ref=ABC12345${isPro ? '&type=pro' : ''}`);
    assert.equal(s.states[0], 'copied');
  }
});

test('share preview, copied message and native share contain the same link and sponsor code', async () => {
  for (const isPro of [false, true]) {
    const s = setup();
    const tree = s.render('ShareButton', { code: 'ABC12345', isPro });
    const message = nodes(tree, node => node.type === 'textarea')[0].props.value;
    assert.match(message, /Mon code parrain : ABC12345/);
    assert.ok(message.includes(`https://winelio.app/auth/login?mode=register&ref=ABC12345${isPro ? '&type=pro' : ''}`));
    await buttons(tree).find(node => node.props.children === 'Copier le message').props.onClick();
    assert.equal(s.copied[0], message);
    assert.equal(s.states[1], 'message');
    await buttons(tree).at(-1).props.onClick();
    assert.equal(s.shared[0].text, message);
  }
});

test('clipboard fallback reports failure honestly and removes its temporary element', async () => {
  for (const fallbackWorks of [true, false]) {
    for (const component of ['CopyButton', 'ShareButton']) {
      const s = setup({ clipboardFails: true, fallbackWorks });
      const tree = s.render(component, { code: 'ABC12345' });
      await (component === 'CopyButton' ? tree : buttons(tree).find(node => node.props.children === 'Copier le message')).props.onClick();
      assert.equal(s.states[component === 'CopyButton' ? 0 : 1], fallbackWorks ? component === 'CopyButton' ? 'copied' : 'message' : 'error');
      assert.equal(s.removed, 1);
    }
  }
});

test('native share cancellation does nothing; an actual failure copies the complete message', async () => {
  for (const name of ['AbortError', 'NotAllowedError']) {
    const error = new Error('share failed'); error.name = name;
    const s = setup({ shareError: error });
    const tree = s.render('ShareButton', { code: 'ABC12345' });
    await buttons(tree).at(-1).props.onClick();
    assert.equal(s.copied.length, name === 'AbortError' ? 0 : 1);
    if (s.copied.length) assert.equal(s.copied[0], s.shared[0].text);
  }
});

test('the first registration render preserves URL referral and professional type through the intro gate', () => {
  for (const isPro of [false, true]) {
    const effects = [], redirects = [], storage = new Map();
    const jsx = (type, props) => ({ type, props });
    const { default: LoginPage } = load('src/app/auth/login/page.tsx', {
      react: { useState: value => [value, () => {}], useEffect: effect => effects.push(effect), Suspense: 'suspense' },
      'react/jsx-runtime': { jsx, jsxs: jsx },
      'next/navigation': { useRouter: () => ({ replace: url => redirects.push(url) }), useSearchParams: () => new URLSearchParams(`mode=register&ref=ABC12345${isPro ? '&type=pro' : ''}`) },
      '@/components/winelio-logo': {}, '@/components/AppBackground': {},
      '@/components/PromoVideo': { PROMO_WATCHED_KEY: 'watched' },
      '@/lib/safe-fetch': {}, '@/lib/utils': {}, '@/lib/phone': {},
    }, {
      URLSearchParams,
      window: { location: { search: '' }, localStorage: { getItem: key => storage.get(key) || null } },
      localStorage: { getItem: key => storage.get(key) || null, setItem: (key, value) => storage.set(key, value) },
      sessionStorage: { getItem: () => null },
    });
    nodes(LoginPage(), node => node.type?.name === 'LoginForm')[0].type();
    effects.forEach(effect => effect());
    assert.equal(storage.get('winelio_ref'), 'ABC12345');
    assert.equal(redirects.at(-1), `/?ref=ABC12345${isPro ? '&type=pro' : ''}`);
  }
});

test('registration passes the invitation code and resolved sponsor to account creation', async () => {
  let metadata;
  const { POST } = load('src/app/api/auth/register/route.ts', {
    '@/lib/supabase/admin': { supabaseAdmin: {
      schema() { return this; },
      from() { return { select() { return this; }, eq() { return this; }, maybeSingle: async () => ({ data: null, error: null }) }; },
      auth: { admin: { async generateLink(options) { metadata = options.options.data; return { error: { message: 'Stop before account creation or email delivery' } }; } } },
    } },
    '@/lib/email-sender': { sendEmail() { assert.fail('No email should be sent'); } },
    '@/lib/phone': { normalizePhoneNumber: phone => phone },
  }, { process: { env: {} }, console, Request, URL });
  await POST(new Request('https://winelio.app/api/auth/register', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'invitation@example.invalid', password: 'fictional-test-value', firstName: 'Test', lastName: 'Invitation', phone: '+33600000000', address: '1 rue du Test', city: 'Paris', postalCode: '75001', birthDate: '1990-01-01', termsAccepted: true, sponsorCode: 'ABC12345', sponsorId: '00000000-0000-4000-8000-000000000001' }),
  }));
  assert.equal(metadata.sponsor_code, 'ABC12345');
  assert.equal(metadata.sponsor_id, '00000000-0000-4000-8000-000000000001');
});
