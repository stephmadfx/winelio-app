const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const React = require('react');
const { renderToStaticMarkup } = require('react-dom/server');

async function render(profile, sponsor = null) {
  const calls = [];
  const supabase = {
    auth: { getUser: async () => ({ data: { user: { id: 'member' } } }) },
    from(table) {
      let selectedId;
      const query = {
        select(value) { calls.push(value); return query; },
        eq(key, value) { if (key === 'id') selectedId = value; return query; },
        in: () => query, not: () => query,
        single: async () => ({ data: profile }),
        maybeSingle: async () => {
          assert.equal(selectedId, profile.sponsor_id);
          return { data: sponsor };
        },
        then(resolve) { resolve({ data: [], count: 0 }); },
      };
      assert.ok(['profiles', 'commission_transactions'].includes(table));
      return query;
    },
  };
  const wrapper = ({ children, ...props }) => React.createElement('div', props, children);
  const share = ({ code }) => React.createElement('button', { 'data-invitation-code': code }, 'Partager');
  const module = { exports: {} };
  const filename = path.resolve('src/app/(protected)/network/page.tsx');
  const code = ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX },
  }).outputText;
  vm.runInNewContext(code, { module, exports: module.exports, require(name) {
    if (name === '@/lib/supabase/server') return { createClient: async () => supabase };
    if (name === 'next/navigation') return { redirect: () => { throw new Error('Unexpected redirect'); } };
    if (name === 'next/link') return { default: ({ children, ...props }) => React.createElement('a', props, children) };
    if (name === '@/lib/utils') return { formatDisplayName: (first, last) => [first, last].filter(Boolean).join(' ') || 'Utilisateur' };
    if (name === '@/components/ui/card') return { Card: wrapper, CardContent: wrapper };
    if (name === '@/components/referral-buttons') return { CopyButton: share, ShareButton: share, EmailInviteButton: share };
    if (name.startsWith('@/components/')) return new Proxy({}, { get: () => () => null });
    return require(name);
  } }, { filename });
  return { html: renderToStaticMarkup(await module.exports.default()), calls };
}

const member = { sponsor_code: 'OWN12345', sponsor_id: 'sponsor', is_founder: false };
const sponsor = { first_name: 'Camille', last_name: 'Martin', sponsor_code: 'SPON1234' };

test('network distinguishes the invitation code from the stored sponsor and preserves sharing', async () => {
  const { html, calls } = await render(member, sponsor);
  assert.match(calls[0], /sponsor_id/);
  assert.equal(calls[1], 'first_name, last_name, sponsor_code');
  assert.match(html, /Mon code d’invitation/);
  assert.doesNotMatch(html, /Mon code parrain/);
  assert.match(html, /Votre parrain/);
  assert.match(html, /Camille Martin/);
  assert.match(html, /Son code d’invitation.*SPON1234/);
  assert.equal((html.match(/data-invitation-code="OWN12345"/g) || []).length, 6);
  assert.doesNotMatch(html, /data-invitation-code="SPON1234"/);
});

test('founders have an explicit explanation instead of a missing sponsor error', async () => {
  const { html } = await render({ ...member, sponsor_id: null, is_founder: true });
  assert.match(html, /à la tête de votre lignée, sans parrain/);
  assert.doesNotMatch(html, /Aucun parrain/);
});

test('missing and unavailable sponsors have distinct explanations', async () => {
  assert.match((await render({ ...member, sponsor_id: null })).html, /Aucun parrain n’est actuellement rattaché/);
  assert.match((await render(member)).html, /momentanément indisponibles/);
});
