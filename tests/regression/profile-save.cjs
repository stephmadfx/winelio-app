const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');

function setup() {
  const hooks = [], effects = [], calls = [];
  let cursor = 0, outcome = {}, refreshes = 0;
  const jsx = (type, props) => ({ type, props });
  const action = async data => {
    calls.push(data);
    if (outcome instanceof Error) throw outcome;
    return outcome;
  };
  const imports = {
    react: {
      useState(initial) {
        const i = cursor++;
        if (!(i in hooks)) hooks[i] = typeof initial === 'function' ? initial() : initial;
        return [hooks[i], value => { hooks[i] = typeof value === 'function' ? value(hooks[i]) : value; }];
      },
      useRef(initial) { const i = cursor++; return hooks[i] ??= { current: initial }; },
      useEffect(effect) { effects.push(effect); },
    },
    'react/jsx-runtime': { jsx, jsxs: jsx },
    'next/navigation': { useRouter: () => ({ refresh() { refreshes++; } }) },
    '@/app/(protected)/profile/actions': { updateProfile: action, assignSponsor: action, updateCompanyEmail: action },
    '@/lib/age': { isAtLeastAge: () => true, maxBirthDate: () => '2000-01-01' },
  };
  const module = { exports: {} };
  const source = process.env.PROFILE_FORM_SOURCE || 'src/components/profile-form.tsx';
  vm.runInNewContext(ts.transpileModule(fs.readFileSync(source, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX },
  }).outputText, {
    module, exports: module.exports, require: name => imports[name] ?? {}, setTimeout() {},
  });
  const props = {
    profile: {
      id: 'test-only', first_name: 'Test', last_name: 'Profil', phone: '+33600000000',
      address: '1 rue de Test', city: 'Paris', postal_code: '75001', birth_date: '1990-01-01',
      terms_accepted: true, avatar: null, avatar_visible_to_network: true,
      is_professional: true, sponsor_code: 'TESTCODE', sponsor_id: 'sponsor',
    },
    userEmail: 'profile@winelio-e2e.local', companyEmail: 'pro@winelio-e2e.local', companyId: 'test-company',
  };
  return {
    calls,
    set outcome(value) { outcome = value; },
    get refreshes() { return refreshes; },
    render() {
      cursor = 0;
      const tree = module.exports.ProfileForm(props);
      effects.splice(0).forEach(effect => effect());
      return tree;
    },
  };
}

function nodes(node, match) {
  if (!node || typeof node !== 'object') return [];
  if (Array.isArray(node)) return node.flatMap(child => nodes(child, match));
  return [...(match(node) ? [node] : []), ...nodes(node.props?.children, match)];
}
const find = (tree, match) => nodes(tree, match)[0];
const field = (tree, name) => find(tree, node => node.props?.name === name);
const button = (tree, label) => find(tree, node => node.type === 'button' && node.props.children === label);
const alert = tree => find(tree, node => node.props?.role === 'alert')?.props.children;
const flush = () => new Promise(resolve => setImmediate(resolve));

test('autosave handles a 504 rejection, retains edits and can be retried', async () => {
  const s = setup();
  field(s.render(), 'last_name').props.onChange({ target: { name: 'last_name', value: 'Conservé', type: 'text' } });
  s.outcome = new Error('An unexpected response was received from the server.');
  field(s.render(), 'last_name').props.onBlur();
  await flush();
  let tree = s.render();
  assert.match(alert(tree), /sauvegarde n'a pas pu être confirmée/);
  assert.equal(field(tree, 'last_name').props.value, 'Conservé');
  assert.equal(s.refreshes, 0);
  assert.ok(nodes(tree, node => node.props?.children === '⚠ Erreur de sauvegarde, réessayez').length);
  s.outcome = {};
  field(tree, 'last_name').props.onBlur();
  await flush();
  tree = s.render();
  assert.equal(alert(tree), undefined);
  assert.equal(s.calls.at(-1).last_name, 'Conservé');
  assert.equal(s.refreshes, 1);
});

test('manual save is enabled again after a rejected server action', async () => {
  const s = setup(); s.outcome = new TypeError('Failed to fetch');
  await button(s.render(), 'Sauvegarder').props.onClick();
  const tree = s.render();
  assert.match(alert(tree), /saisies sont conservées/);
  assert.equal(button(tree, 'Sauvegarder').props.disabled, false);
});

test('photo visibility prevents double submission and rolls back after rejection', async () => {
  const s = setup(); s.outcome = new Error('504');
  const promise = find(s.render(), node => node.props?.role === 'switch').props.onClick();
  assert.equal(find(s.render(), node => node.props?.role === 'switch').props.disabled, true);
  await promise;
  const tree = s.render();
  const toggle = find(tree, node => node.props?.role === 'switch');
  assert.equal(toggle.props['aria-checked'], true);
  assert.equal(toggle.props.disabled, false);
  assert.match(alert(tree), /réessayez/);
  assert.equal(s.refreshes, 0);
});

test('professional email distinguishes transport failure from validation errors and recovers', async () => {
  const s = setup(); s.outcome = new Error('504');
  await button(s.render(), 'Enregistrer').props.onClick();
  let tree = s.render();
  assert.match(alert(tree), /connexion/);
  assert.equal(button(tree, 'Enregistrer').props.disabled, false);
  assert.equal(find(tree, node => node.props?.placeholder === 'contact@monentreprise.fr').props.value, 'pro@winelio-e2e.local');
  s.outcome = { error: 'Un e-mail professionnel valide est obligatoire.' };
  await button(tree, 'Enregistrer').props.onClick();
  assert.equal(alert(s.render()), 'Un e-mail professionnel valide est obligatoire.');
  s.outcome = {};
  await button(s.render(), 'Enregistrer').props.onClick();
  tree = s.render();
  assert.equal(alert(tree), undefined);
  assert.ok(nodes(tree, node => node.props?.children === '✓ Email professionnel sauvegardé').length);
});

test('date-of-birth and terms autosaves also handle rejected actions', async () => {
  for (const change of ['birth', 'terms']) {
    const s = setup(); s.outcome = new Error('504');
    const tree = s.render();
    if (change === 'birth') find(tree, node => node.props?.handleBirthPart).props.handleBirthPart('m', '02');
    else field(tree, 'terms_accepted').props.onChange({ target: { checked: true } });
    await flush();
    assert.match(alert(s.render()), /sauvegarde n'a pas pu être confirmée/);
  }
});
