const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');
function load(file, imports) {
  const module = { exports: {} };
  vm.runInNewContext(ts.transpileModule(fs.readFileSync(file, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS },
  }).outputText, { module, exports: module.exports, require: name => imports[name] ?? require(name),
    process: { env: {} }, console, Request, URL, Date });
  return module.exports;
}
const server = { createClient: async () => ({ auth: { getUser: async () => ({ data: { user: { id: 'sponsor', email: 'sponsor@example.test' } } }) } }) };
const next = { NextResponse: { json: (body, options) => ({ body, status: options?.status ?? 200 }) } };
test('legacy pro pre-registration creates only an individual and retains the sponsor', async () => {
  let metadata, profile, emails = 0;
  const admin = { auth: { admin: { generateLink: async input => {
    metadata = input.options.data;
    return { data: { user: { id: 'fixture' }, properties: { hashed_token: 'fixture-only' } } };
  }, deleteUser: async () => assert.fail('unexpected rollback') } },
    schema: () => ({ from: () => ({ upsert: async () => ({}) }) }),
    from(table) {
      assert.equal(table, 'profiles', 'invitation must not create a company');
      return { select() { return this; }, update(data) { profile = data; return this; },
        eq() { return this; }, single: async () => ({ data: { sponsor_code: 'SPONSOR1', first_name: 'Parrain' } }),
        maybeSingle: async () => ({ data: null }), then(resolve) { resolve({}); } };
    } };
  const { POST } = load('src/app/api/network/pre-register-referral/route.ts', {
    'next/server': next, '@/lib/supabase/server': server, '@/lib/supabase/admin': { supabaseAdmin: admin },
    '@/lib/email-sender': { sendEmail: async () => { emails++; return { ok: true }; } },
    '@/lib/age': { isAtLeastAge: () => true }, '@/lib/pending-referral': { PENDING_REFERRAL_STATUS: 'pending' },
    '@/lib/referral-confirmation-email': { buildReferralConfirmationEmail: () => 'fixture' },
    '@/lib/phone': { normalizePhoneNumber: () => '+33600000000' },
  });
  const result = await POST(new Request('https://winelio.app/api/network/pre-register-referral', { method: 'POST', body: JSON.stringify({
    firstName: 'Membre', lastName: 'Test', email: 'member@example.test', phone: '0600000000',
    address: 'Adresse test', city: 'Paris', postalCode: '75001', birthDate: '1990-01-01', isPro: true,
  }) }));
  assert.equal(result.status, 200);
  assert.equal(profile.is_professional, false);
  assert.equal(metadata.sponsor_id, 'sponsor');
  assert.equal(metadata.sponsor_code, 'SPONSOR1');
  assert.equal(metadata.siret, undefined);
  assert.equal(emails, 1); // Mock only; no account or email is created.
});
test('legacy pro email request keeps the sponsor and sends an individual invitation', async () => {
  let queued;
  const { POST } = load('src/app/api/network/send-invite/route.ts', {
    'next/server': next, '@/lib/supabase/server': { createClient: async () => ({
      auth: { getUser: async () => ({ data: { user: { id: 'sponsor' } } }) },
      from: () => ({ select() { return this; }, eq() { return this; }, single: async () => ({ data: { sponsor_code: 'SPONSOR1' } }) }),
    }) }, '@/lib/utils': { formatDisplayName: () => 'Parrain' }, '@/lib/html-escape': { he: String },
    '@/lib/email-logo': { LOGO_IMG_HTML: '' }, '@/lib/email-queue': { queueEmail: async data => { queued = data; } },
  });
  const result = await POST(new Request('https://winelio.app/api/network/send-invite', { method: 'POST', body: JSON.stringify({ to: 'member@example.test', isProRegistration: true }) }));
  assert.equal(result.status, 200);
  assert.match(queued.html, /ref=SPONSOR1/);
  assert.doesNotMatch(queued.html + queued.text, /type=pro|en tant que Pro|isPro/);
  assert.match(queued.text, /https:\/\/winelio.app\/auth\/login/);
});

test('creating a professional listing later preserves the original sponsor', async () => {
  const profile = { sponsor_id: 'original-sponsor', is_professional: false };
  const client = { auth: { getUser: async () => ({ data: { user: { id: 'member' } } }) },
    from(table) { return { select() { return this; }, eq() { return this; },
      single: async () => ({ data: { ...profile } }), maybeSingle: async () => ({ data: null }),
      insert: async values => { assert.equal(table, 'companies'); assert.equal(values.owner_id, 'member'); return {}; },
      update(values) { assert.equal(table, 'profiles'); assert.equal(values.sponsor_id, undefined); Object.assign(profile, values); return this; },
      then(resolve) { resolve({}); },
    }; } };
  const { createCompany } = load('src/lib/company-actions.ts', {
    '@/lib/supabase/server': { createClient: async () => client }, 'next/cache': { revalidatePath() {} },
    '@/lib/geocode': {}, '@/lib/siren': {}, '@/lib/naf-rules': {}, '@/lib/utils': {},
    '@/lib/company-name-validator': { validateCompanyName: () => ({ ok: true }), validateCompanyDescription: () => ({ ok: true }) },
    '@/lib/notify-new-pro-in-network': { notifyNewProInNetwork: async () => {} },
  });
  const result = await createCompany({ name: 'Entreprise test', email: 'pro@example.test', phone: '0600000000', insurance_number: 'fixture', is_verified: false, category_id: 'category' });
  assert.equal(result.success, true);
  assert.equal(profile.is_professional, true);
  assert.equal(profile.sponsor_id, 'original-sponsor');
});
