const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');

function load(file, imports, globals = {}) {
  const module = { exports: {} };
  vm.runInNewContext(ts.transpileModule(fs.readFileSync(file, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS },
  }).outputText, { module, exports: module.exports, require: name => imports[name] ?? (name === "@/lib/claim-path" ? load("src/lib/claim-path.ts", {}) : require(name)), console, process: { env: {} }, ...globals });
  return module.exports;
}

const registration = {
  email: 'sponsor-test@example.invalid', password: 'fictional-test-value', firstName: 'Test', lastName: 'Parrain',
  phone: '+33600000000', address: '1 rue du Test', city: 'Paris', postalCode: '75001', birthDate: '1990-01-01', termsAccepted: true,
};

function registerRoute(sponsor = { id: 'server-resolved-sponsor' }, lookupError = null) {
  const lookups = [], created = [];
  const { POST } = load('src/app/api/auth/register/route.ts', {
    '@/lib/supabase/admin': { supabaseAdmin: {
      schema() { return this; },
      from(table) {
        const filters = {};
        return { select() { return this; }, eq(key, value) { filters[key] = value; return this; }, async maybeSingle() {
          lookups.push({ table, filters });
          return filters.sponsor_code ? { data: sponsor, error: lookupError } : { data: null, error: null };
        } };
      },
      auth: { admin: { async generateLink(options) { created.push(options); return { error: { message: 'Controlled stop before creation and email' } }; } } },
    } },
    '@/lib/email-sender': { sendEmail() { assert.fail('No email may be sent'); } },
    '@/lib/phone': { normalizePhoneNumber: value => value },
  }, { URL });
  return { lookups, created, async post(extra) {
    const response = await POST(new Request('https://winelio.app/api/auth/register', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...registration, ...extra }),
    }));
    return { status: response.status, body: await response.json() };
  } };
}

test('registration rejects omitted, empty, whitespace and malformed codes, including with a forged sponsor ID', async () => {
  for (const sponsorCode of [undefined, null, '', '   ', 42, {}, []]) {
    for (const isPro of [false, true]) {
      const route = registerRoute();
      const result = await route.post({ sponsorCode, sponsorId: 'forged-id', isPro });
      assert.equal(result.status, 400);
      assert.match(result.body.error, /parrainage.*obligatoire/);
      assert.equal(route.lookups.length, 0);
      assert.equal(route.created.length, 0);
    }
  }
});

test('unknown, deleted and inactive sponsor codes are refused before account creation', async () => {
  const route = registerRoute(null);
  assert.equal((await route.post({ sponsorCode: 'UNKNOWN1' })).status, 400);
  assert.equal(route.lookups[0].filters.is_active, true);
  assert.equal(route.created.length, 0);
});

test('a database failure closes registration instead of assigning a founder', async () => {
  const route = registerRoute(null, { code: 'unavailable' });
  assert.equal((await route.post({ sponsorCode: 'VALID123' })).status, 503);
  assert.equal(route.created.length, 0);
});

test('the server normalizes the code and derives the sponsor ID itself', async () => {
  const route = registerRoute();
  await route.post({ sponsorCode: '  valid123  ', sponsorId: 'forged-id' });
  assert.equal(route.created.length, 1);
  assert.equal(route.created[0].options.data.sponsor_code, 'VALID123');
  assert.equal(route.created[0].options.data.sponsor_id, 'server-resolved-sponsor');
});

test('automatic assignment is disabled, including the legacy endpoint', async () => {
  const { assignSponsorIfNeeded } = load('src/lib/assign-sponsor.ts', {
    '@/lib/notify-new-referral': { notifyNewReferral: async () => {} },
    '@/lib/supabase/admin': { supabaseAdmin: { from() { assert.fail('No automatic sponsor lookup'); } } },
  });
  for (const code of [undefined, null, '', '   ', 42]) assert.equal(await assignSponsorIfNeeded('member', code), false);
  const { POST } = load('src/app/api/network/assign-open-registration-sponsor/route.ts', {});
  assert.equal((await POST()).status, 410);
});

test('an old OTP cannot recreate a deleted account, on web or native mobile', async () => {
  for (const mobile of [false, true]) {
    const queries = [];
    const chain = { select() { return this; }, eq() { return this; }, update() { return this; }, delete() { return this; },
      single: async () => ({ data: { code: '123456', expires_at: '2999-01-01', attempts: 0 } }) };
    const { POST } = load('src/app/api/auth/verify-code/route.ts', {
      '@/lib/supabase/admin': { supabaseAdmin: { from: () => chain } },
      '@/lib/supabase/config': {}, '@/lib/assign-sponsor': {},
      '@/lib/normalize-email': { normalizeEmail: value => value },
      'pg': { Pool: class { async query(sql) { queries.push(sql); return { rows: [] }; } async end() {} } },
    }, { process: { env: { SUPABASE_DB_URL: 'unused-test-connection' } } });
    const response = await POST(new Request('https://winelio.app/api/auth/verify-code', {
      method: 'POST', headers: { 'Content-Type': 'application/json', ...(mobile ? { 'x-winelio-client': 'mobile' } : {}) },
      body: JSON.stringify({ email: 'deleted@example.invalid', code: '123456' }),
    }));
    assert.equal(response.status, 404);
    assert.ok(queries.some(sql => sql.includes('JOIN winelio.profiles')));
    assert.equal(queries.at(-1), 'ROLLBACK');
    assert.ok(queries.every(sql => !/INSERT|UPDATE|COMMIT/.test(sql.replace('FOR UPDATE OF u', ''))));
  }
});
