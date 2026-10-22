const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');

function load(file, imports = {}) {
  const module = { exports: {} };
  vm.runInNewContext(ts.transpileModule(fs.readFileSync(file, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS },
  }).outputText, { module, exports: module.exports, require: name => imports[name] ?? require(name), console });
  return module.exports;
}
const constants = load('src/lib/constants.ts');
const rate = load('src/lib/commission-rate.ts');
const plan = { id: 'plan', commission_rate: 10, referrer_percentage: 60,
  level_1_percentage: 3, level_2_percentage: 3, level_3_percentage: 3,
  level_4_percentage: 3, level_5_percentage: 3, platform_percentage: 24,
  affiliation_percentage: 1, cashback_wins_percentage: 0 };

function commissions(sponsor = 'affiliate') {
  const rows = [];
  const api = load('src/lib/commission.ts', {
    '@/lib/constants': constants, '@/lib/commission-rate': rate,
    '@/lib/supabase/admin': { supabaseAdmin: { from(table) {
      let id;
      return { select() { return this; }, eq(key, value) { id = value; return this; },
        async single() { return { data: table === 'recommendations' ? { is_demo: true }
          : { sponsor_id: id === 'pro' ? sponsor : null } }; },
        async insert(values) { rows.push(...values); return { error: null }; },
        then(resolve) { return Promise.resolve({ count: rows.length }).then(resolve); },
      };
    } } },
  });
  return { ...api, rows };
}

test('plans actuels et anciens instantanés : 100 % distribués, aucun cashback, affiliation à 1 %', () => {
  const api = commissions();
  for (const snapshot of [plan, { ...plan, platform_percentage: 23, cashback_wins_percentage: 1 }]) {
    api.assertValidCompensationPlan(snapshot);
    const result = api.calculateCommissions(1000, snapshot);
    assert.equal(result.referrer_commission, 60);
    assert.equal(result.affiliation_commission, 1);
    assert.equal(result.platform_commission, 24);
    assert.equal(result.cashback_wins, undefined);
    assert.equal(result.referrer_commission + result.affiliation_commission + result.platform_commission
      + result.level_commissions.reduce((sum, level) => sum + level.amount, 0), 100);
  }
  assert.throws(() => api.assertValidCompensationPlan({ ...plan, platform_percentage: 23 }), /invalide/);
});

test('le parrain du professionnel touche 1 % sur plusieurs affaires recommandées par un autre membre, sans doublon', async () => {
  const api = commissions();
  await api.createCommissions('first', 'referrer', 'pro', 1000, plan.id, plan);
  assert.equal(api.rows.find(row => row.type === 'affiliation_bonus').user_id, 'affiliate');
  assert.equal(api.rows.find(row => row.type === 'affiliation_bonus').amount, 1);
  assert.ok(api.rows.every(row => row.type !== 'professional_cashback' && row.status === 'PENDING'));
  assert.equal(api.rows.reduce((sum, row) => sum + row.amount, 0), 100);
  const count = api.rows.length;
  await api.createCommissions('first', 'referrer', 'pro', 1000, plan.id, plan);
  assert.equal(api.rows.length, count);
  const second = commissions();
  await second.createCommissions('second', 'other-referrer', 'pro', 2000, plan.id, plan);
  assert.equal(second.rows.find(row => row.type === 'affiliation_bonus').user_id, 'affiliate');
  assert.equal(second.rows.find(row => row.type === 'affiliation_bonus').amount, 2);
});

test('sans parrain du professionnel, le bonus reste dans la cagnotte Winelio', async () => {
  const api = commissions(null);
  await api.createCommissions('orphan', 'referrer', 'pro', 1000, plan.id, plan);
  assert.equal(api.rows.some(row => row.type === 'affiliation_bonus'), false);
  assert.equal(api.rows.find(row => row.type === 'platform_winelio').amount, 40);
  assert.equal(api.rows.reduce((sum, row) => sum + row.amount, 0), 100);
});
