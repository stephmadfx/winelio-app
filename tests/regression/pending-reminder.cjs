const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');

process.env.FOLLOWUP_ACTION_SECRET = 'x'.repeat(40);
const src = fs.readFileSync(path.join(__dirname, '../../src/lib/pending-reminder.ts'), 'utf8');
const js = ts.transpileModule(src, { compilerOptions: { module: ts.ModuleKind.CommonJS, esModuleInterop: true, target: ts.ScriptTarget.ES2020 } }).outputText;
const m = { exports: {} };
vm.runInNewContext(js, { module: m, exports: m.exports, require, process, Buffer });
const { isReminderEligible, signReminderToken, verifyReminderToken } = m.exports;

const base = {
  status: 'PENDING', pending_reminder_sent_at: null, email_opened_at: null,
  referrerEmail: 'a@b.fr', proEmail: 'pro@x.fr', proOptedOut: false,
  company: { source: 'owner', email: null, deleted_at: null },
};

test('pro inscrit en PENDING : éligible', () => assert.equal(isReminderEligible(base), true));
test('scrapé qui a ouvert le mail : éligible', () =>
  assert.equal(isReminderEligible({ ...base, email_opened_at: 'x', company: { source: 'scraped', email: 'c@x.fr', deleted_at: null } }), true));
test('scrapé jamais ouvert : laissé à cron-scraped-reminder', () =>
  assert.equal(isReminderEligible({ ...base, company: { source: 'scraped', email: 'c@x.fr', deleted_at: null } }), false));
test('statut changé, déjà relancé, désinscrit, démo, sans email : exclus', () => {
  assert.equal(isReminderEligible({ ...base, status: 'ACCEPTED' }), false);
  assert.equal(isReminderEligible({ ...base, pending_reminder_sent_at: 'x' }), false);
  assert.equal(isReminderEligible({ ...base, proOptedOut: true }), false);
  assert.equal(isReminderEligible({ ...base, referrerEmail: 'd@demo-winelio.fr' }), false);
  assert.equal(isReminderEligible({ ...base, proEmail: 'p@kiparlo-pro.fr' }), false);
});
test('token : aller-retour OK, falsifié refusé', () => {
  const rid = '123e4567-e89b-12d3-a456-426614174000';
  const t = signReminderToken(rid);
  const v = verifyReminderToken(t);
  assert.equal(v.ok, true);
  assert.equal(v.rid, rid);
  assert.equal(verifyReminderToken(t.slice(0, -2) + 'AA').ok, false);
  assert.equal(verifyReminderToken('abc').ok, false);
});
