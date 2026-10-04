const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');
const id = 'b322932f-e394-40a4-9642-b4e3e0601a0f';

function load({ auth = {}, campaign = { data: { id, sent_count: 51 }, error: null }, fail = false } = {}) {
  const queries = [];
  const client = { from(table) {
    const operations = [];
    const query = { then(resolve, reject) {
      const head = operations.some(([method, , opts]) => method === 'select' && opts?.head);
      return Promise.resolve(table === 'newsletters' ? campaign : {
        data: head ? null : [], count: head ? 3 : 51, error: fail ? { message: 'database unavailable' } : null,
      }).then(resolve, reject);
    }};
    for (const method of ['select', 'eq', 'maybeSingle', 'ilike', 'not', 'order', 'range', 'limit']) {
      query[method] = (...args) => { operations.push([method, ...args]); return query; };
    }
    queries.push({ table, operations });
    return query;
  }};
  const filename = 'src/app/api/admin/newsletters/[id]/stats/route.ts';
  const code = ts.transpileModule(fs.readFileSync(filename, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const module = { exports: {} };
  vm.runInNewContext(code, { module, exports: module.exports, URL, require: name => {
    if (name === '@/lib/newsletter') return { assertSuperAdmin: async () => auth };
    if (name === '@/lib/supabase/admin') return { supabaseAdmin: client };
    if (name === 'next/server') return { NextResponse: { json: (body, init = {}) => ({ body, status: init.status || 200 }) } };
    throw new Error(name);
  }});
  return { get: (query = '', campaignId = id) => module.exports.GET({ url: `https://winelio.app/stats?${query}` }, { params: Promise.resolve({ id: campaignId }) }), queries };
}
test('anonymous access returns before any privileged database query', async () => {
  const api = load({ auth: { response: { status: 401 } } });
  assert.equal((await api.get()).status, 401); assert.equal(api.queries.length, 0);
});
test('second recipient page and click filter preserve whole campaign totals', async () => {
  const api = load(); const response = await api.get('page=2&filter=clicked&search=a%25_b');
  assert.equal(response.status, 200); assert.equal(response.body.unsubscribedCount, 3);
  assert.equal(response.body.newsletter.sent_count, 51); assert.equal(response.body.total, 51);
  const query = api.queries.find(q => q.operations.some(op => op[0] === 'range'));
  assert.ok(query.operations.some(op => op[0] === 'range' && op[1] === 50 && op[2] === 99));
  assert.ok(query.operations.some(op => op[0] === 'not' && op[1] === 'clicked_at'));
  assert.ok(query.operations.some(op => op[0] === 'ilike' && op[2] === '%a\\%\\_b%'));
});
test('unknown or prototype filter cannot select an unintended database column', async () => {
  const api = load(); const response = await api.get('page=NaN&filter=__proto__');
  assert.equal(response.body.page, 1);
  const query = api.queries.find(q => q.operations.some(op => op[0] === 'range'));
  assert.ok(!query.operations.some(op => op[0] === 'not'));
});
test('database error cannot be shown as zero statistics', async () => {
  assert.equal((await load({ fail: true }).get()).status, 500);
});
test('missing campaign and invalid campaign id return 404', async () => {
  assert.equal((await load({ campaign: { data: null, error: null } }).get()).status, 404);
  const api = load(); assert.equal((await api.get('', 'invalid')).status, 404); assert.equal(api.queries.length, 0);
});
