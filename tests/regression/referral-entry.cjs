const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');

function load(file, imports) {
  const output = { exports: {} };
  const code = ts.transpileModule(fs.readFileSync(file, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  vm.runInNewContext(code, { module: output, exports: output.exports, require: imports, URL, URLSearchParams, console });
  return output.exports;
}
const contract = load('src/lib/referral-install.ts');
const settle = () => new Promise((resolve) => setImmediate(resolve));

function start({ platform = 'android', initial = null, referrer = null, pending = null, moduleMissing = false } = {}) {
  const states = [];
  const storage = new Map(pending ? [['pending', pending]] : []);
  const alerts = [];
  const effects = [];
  let listener;
  let clipboard = null;
  let reads = 0;
  let stateIndex = 0;
  const native = {
    getItem: (key) => storage.get(key) || null,
    setItem: (key, value) => value === null ? storage.delete(key) : storage.set(key, value),
    getInstallReferrer: async () => { if (referrer instanceof Error) throw referrer; return referrer; },
    hasClipboardLink: async () => true,
    readClipboardLink: async () => { reads++; return clipboard; },
  };
  const { useReferralEntry } = load('mobile/src/features/webapp/useReferralEntry.ts', (name) => {
    if (name === 'expo') return { requireOptionalNativeModule: () => moduleMissing ? null : native };
    if (name === 'expo-linking') return {
      getInitialURL: async () => initial,
      addEventListener: (_, fn) => { listener = fn; return { remove() {} }; },
    };
    if (name === 'react') return {
      useState: (initialValue) => { const index = stateIndex++; states[index] = initialValue; return [initialValue, (value) => { states[index] = value; }]; },
      useRef: (current) => ({ current }),
      useEffect: (effect) => effects.push(effect),
    };
    if (name === 'react-native') return { Platform: { OS: platform }, AppState: { currentState: 'active' }, Alert: { alert: (...args) => alerts.push(args) } };
    if (name.endsWith('referral-install')) return contract;
    if (name === './webAppNavigation') return { webAppEntryUrl: 'https://winelio.app/auth/login', webAppOrigin: 'https://winelio.app' };
    throw new Error('Unexpected import: ' + name);
  });
  const hook = useReferralEntry();
  const cleanup = effects[0]();
  return { hook, states, storage, alerts, cleanup, send: (url) => listener({ url }), setClipboard: (value) => { clipboard = value; }, reads: () => reads };
}

test('Android récupère, mémorise puis consomme une invitation sans attribution directe', async () => {
  const app = start({ referrer: 'ref=ABC12345&type=pro&video=1&winelio_invite=1' });
  await settle();
  assert.match(app.states[0], /ref=ABC12345&type=pro&video=1&mode=register/);
  assert.match(app.storage.get('pending'), /video=1/);
  assert.equal(app.storage.get('checked'), '1');
  assert.ok(app.storage.get('pending'));
  app.hook.onNavigation('https://winelio.app/dashboard');
  assert.equal(app.storage.has('pending'), false);
  app.cleanup();
});

test('une panne Play reste réessayable et ne bloque pas la connexion', async () => {
  const app = start({ referrer: new Error('offline') });
  await settle();
  assert.equal(app.states[0], 'https://winelio.app/auth/login');
  assert.equal(app.storage.has('checked'), false);
  app.cleanup();
});

test('iPhone ne lit jamais le presse-papiers avant le geste de collage', async () => {
  const app = start({ platform: 'ios' });
  await settle();
  assert.equal(app.reads(), 0);
  assert.equal(app.alerts[0][0], 'Retrouver votre parrain');
  app.setClipboard('https://winelio.app/?ref=ABC12345&video=1');
  await app.hook.pasteInvitation();
  assert.equal(app.reads(), 1);
  assert.match(app.states[0], /ref=ABC12345&video=1&mode=register/);
  app.cleanup();
});

test('un collage refusé ou sans invitation préserve la connexion et permet de réessayer', async () => {
  const app = start({ platform: 'ios' });
  await settle();
  await app.hook.pasteInvitation();
  assert.equal(app.states[0], 'https://winelio.app/auth/login');
  assert.equal(app.storage.has('pending'), false);
  assert.equal(app.alerts.at(-1)[0], 'Invitation introuvable');
  app.cleanup();
});

test('la dernière invitation explicite gagne sur une recherche Play tardive', async () => {
  let resolve;
  const referrer = new Promise((done) => { resolve = done; });
  const app = start({ referrer });
  await settle();
  app.send('winelio://invite?ref=NEW12345');
  resolve('ref=OLD12345&winelio_invite=1');
  await settle();
  assert.match(app.states[0], /ref=NEW12345/);
  assert.match(app.storage.get('pending'), /NEW12345/);
  app.cleanup();
});

test('une relance restaure une invitation récente, les données périmées sont ignorées', async () => {
  for (const [age, expected] of [[1000, true], [8 * 86400000, false]]) {
    const app = start({ pending: JSON.stringify({ link: 'https://winelio.app/?ref=ABC12345', savedAt: Date.now() - age }) });
    await settle();
    assert.equal(app.states[0].includes('ref=ABC12345'), expected);
    app.cleanup();
  }
});

test('une ancienne version native ou Expo Go peut toujours ouvrir Winelio', async () => {
  const app = start({ moduleMissing: true });
  await settle();
  assert.equal(app.states[0], 'https://winelio.app/auth/login');
  assert.equal(app.hook.canPaste, false);
  app.cleanup();
});
