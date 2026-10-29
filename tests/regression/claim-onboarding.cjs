const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');
const { randomUUID } = require('node:crypto');
const rid = randomUUID(), companyId = randomUUID();
function load(file, imports = {}, extra = {}) {
  const exports = {};
  vm.runInNewContext(ts.transpileModule(fs.readFileSync(file, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
  }).outputText, { exports, require: name => imports[name] ?? require(name),
    process: { env: { CLAIM_LINK_SECRET: 'fictional-unit-test-key' } }, Buffer, Date, console, URL, ...extra });
  return exports;
}
const access = load('src/lib/claim-access.ts');
const path = load('src/lib/claim-path.ts');

test('claim proof binds the lead, expires and rejects alteration', () => {
  const now = Date.now(), proof = access.createClaimProof(rid, now);
  assert.equal(access.validClaimProof(rid, proof, now), true);
  assert.equal(access.validClaimProof(randomUUID(), proof, now), false);
  assert.equal(access.validClaimProof(rid, proof, now + 31 * 86400000), false);
  assert.equal(access.validClaimProof(rid, proof + 'a', now), false);
  assert.equal(access.validClaimProof(rid, null), false);
});
test('legacy link requires verified recipient email; continuation cannot leave the app', () => {
  assert.equal(access.hasClaimEmail({ email: 'Pro@example.test', email_confirmed_at: 'verified' }, ['pro@example.test']), true);
  assert.equal(access.hasClaimEmail({ email: 'pro@example.test' }, ['pro@example.test']), false);
  assert.equal(access.hasClaimEmail({ email: 'attacker@example.test', email_confirmed_at: 'verified' }, ['pro@example.test']), false);
  assert.equal(path.claimPath(`/claim/${rid}`), `/claim/${rid}`);
  for (const target of ['//evil.test', '/claim/anything', `/claim/${rid}?next=//evil.test`, '/profile', null]) assert.equal(path.claimPath(target), null);
});

function route({ user = { id: 'new-owner', email: 'pro@example.test', email_confirmed_at: 'verified' }, proof, result = { success: true }, professionalId = 'imported-owner' } = {}) {
  const rpcCalls = [];
  const db = {
    from(table) {
      return { select() { return this; }, eq() { return this; }, async maybeSingle() {
        return { data: table === 'recommendations' ? { id: rid, professional_id: professionalId }
          : { email: 'placeholder@winelio-scraped.local', companies: [{ id: 'source-company', source: 'scraped', owner_id: professionalId, email: 'pro@example.test' }] } };
      } };
    },
    async rpc(name, args) { rpcCalls.push({ name, args }); return { data: result }; },
  };
  const { POST } = load('src/app/api/claim/finalize/route.ts', {
    'next/server': { NextResponse: { json: (body, opts) => ({ body, status: opts?.status ?? 200 }) } },
    'next/headers': { cookies: async () => ({ get: () => proof ? { value: proof } : undefined }) },
    '@/lib/supabase/get-user': { getUser: async () => user },
    '@/lib/supabase/admin': { supabaseAdmin: { schema: () => db } },
    '@/lib/claim-access': access,
  });
  return { rpcCalls, post: (body = { recommendationId: rid, companyId }) => POST({ json: async () => body }) };
}
test('claim rejects anonymous and arbitrary authenticated users before any write', async () => {
  const anonymous = route({ user: null });
  assert.equal((await anonymous.post()).status, 401);
  const stranger = route({ user: { id: 'stranger', email: 'other@example.test', email_confirmed_at: 'verified' } });
  assert.equal((await stranger.post()).status, 403);
  assert.equal(stranger.rpcCalls.length, 0);
});
test('verified recipient can recover only through atomic onboarding checks', async () => {
  const pending = route({ result: { error: 'onboarding_required' } });
  assert.equal((await pending.post()).status, 409);
  const complete = route();
  assert.equal((await complete.post()).status, 200);
  assert.equal(complete.rpcCalls[0].name, 'finalize_professional_claim');
  assert.equal(complete.rpcCalls[0].args.p_user_id, 'new-owner');
  assert.equal(complete.rpcCalls[0].args.p_destination_company_id, companyId);
});
test('signed email link supports a separate personal email without exposing claim to anyone', async () => {
  const signed = route({ user: { id: 'new-owner', email: 'personal@example.test', email_confirmed_at: 'verified' }, proof: access.createClaimProof(rid) });
  assert.equal((await signed.post()).status, 200);
  assert.equal(signed.rpcCalls.length, 1);
});
test('repeated own claim is idempotent; malformed destination and mismatched company fail', async () => {
  const own = route({ professionalId: 'new-owner' });
  assert.equal((await own.post()).body.alreadyClaimed, true);
  assert.equal(own.rpcCalls.length, 0);
  assert.equal((await route().post({ recommendationId: rid, companyId: 'forged' })).status, 400);
  assert.equal((await route({ result: { error: 'company_mismatch' } }).post()).status, 409);
});

test('legacy pro signup stays individual and the confirmation preserves only a safe claim destination', async () => {
  for (const returnTo of [`/claim/${rid}`, '//other.test']) {
    let metadata, email;
    const admin = {
      from(table) {
        assert.equal(table, 'profiles', 'signup must never write a company');
        let sponsor = false;
        return { select() { return this; }, eq(key) { if (key === 'sponsor_code') sponsor = true; return this; }, async maybeSingle() { return { data: sponsor ? { id: 'sponsor' } : null }; } };
      },
      schema() { return this; },
      auth: { admin: { async generateLink(input) { metadata = input.options.data; return { data: { user: { id: 'fixture' }, properties: { hashed_token: 'fictional-test-token' } } }; } } },
    };
    const { POST } = load('src/app/api/auth/register/route.ts', {
      '@/lib/claim-path': path,
      '@/lib/supabase/admin': { supabaseAdmin: admin },
      '@/lib/email-sender': { sendEmail: async input => { email = input; return { ok: true }; } },
      '@/lib/phone': { normalizePhoneNumber: value => value },
      'next/server': { NextResponse: { json: (body, opts) => ({ body, status: opts?.status ?? 200 }) } },
    });
    const response = await POST({ url: 'https://winelio.app/api/auth/register', json: async () => ({
      email: 'fixture@example.invalid', password: 'fictional-test-password', firstName: 'Fixture', lastName: 'Claim', phone: '+33600000000',
      address: 'Test', city: 'Lyon', postalCode: '69001', birthDate: '1990-01-01', termsAccepted: true, sponsorCode: 'SPONSOR1',
      isPro: true, siret: 'forged', nafCode: 'forged', companyName: 'forged', returnTo,
    }) });
    assert.equal(response.status, 200);
    assert.equal(metadata.siret, undefined);
    assert.equal(metadata.naf_code, undefined);
    assert.equal(metadata.sponsor_id, 'sponsor');
    assert.equal(email.html.includes('next=' + encodeURIComponent(`/claim/${rid}`)), returnTo.startsWith('/claim/'));
    assert(!email.html.includes('other.test'));
  }
});

test('signed email click stores its proof in an HttpOnly cookie and redirects without the proof', async () => {
  const writes = [];
  const chain = { select() { return this; }, update() { return this; }, eq() { return this; }, is() { return this; },
    async single() { return { data: { id: rid, professional_id: 'imported', email_clicked_at: 'already-tracked' } }; },
    async maybeSingle() { return { data: { companies: [{ source: 'scraped' }] } }; } };
  const { GET } = load('src/app/api/email-track/click/route.ts', {
    '@/lib/claim-access': access,
    '@/lib/supabase/admin': { supabaseAdmin: { schema() { return this; }, from: () => chain } },
    '@/lib/supabase/get-user': { getUser: async () => null },
    'next/server': { NextResponse: { redirect: destination => ({ destination, cookies: { set: (...args) => writes.push(args) } }) } },
  });
  const response = await GET({ url: `https://winelio.app/api/email-track/click?rid=${rid}&claim=${access.createClaimProof(rid)}` });
  assert.equal(response.destination, `https://winelio.app/claim/${rid}`);
  assert.equal(writes[0][0], access.claimCookieName(rid));
  assert.equal(writes[0][2].httpOnly, true);
  assert.equal(writes[0][2].secure, true);
});

test('onboarding requires explicit consent and the activity-specific signature before writing', async () => {
  for (const accepted of [false, true]) {
    const admin = { from(table) { return { select() { return this; }, eq() { return this; }, limit() { return this; }, async maybeSingle() {
      return { data: table === 'categories' ? { is_hoguet: true } : table === 'legal_documents' ? { id: 'agents-cgu' } : null };
    } }; } };
    const imports = new Proxy({
      '@/lib/supabase/get-user': { getUser: async () => ({ id: 'fixture' }) },
      '@/lib/supabase/admin': { supabaseAdmin: admin },
      '@/lib/supabase/server': { createClient: () => assert.fail('No writes before consent/signature') },
    }, { get: (target, name) => target[name] ?? {} });
    const { completeProOnboarding } = load('src/app/(protected)/profile/actions.ts', imports);
    const result = await completeProOnboarding({ engagement_accepted: accepted, category_id: companyId });
    assert.match(result.error, accepted ? /Signez/ : /explicitement/);
  }
});

test('a failed company save never activates the professional profile', async () => {
  let activated = false;
  const client = { from(table) { return { select() { return this; }, eq() { return this; }, is() { return this; }, order() { return this; }, limit() { return this; },
    async single() { return { data: { is_professional: false, first_name: 'Fixture' } }; }, async maybeSingle() { return { data: null }; },
    async insert() { assert.equal(table, 'companies'); return { error: { code: 'controlled-error' } }; },
    update() { activated = true; assert.fail('Profile must not activate before company save'); },
  }; } };
  const registry = { actif: true, siret: '11111111100011', siren: '111111111', naf: '62.02A', nom: 'Fixture' };
  const imports = new Proxy({
    '@/lib/supabase/get-user': { getUser: async () => ({ id: 'fixture' }) },
    '@/lib/supabase/admin': { supabaseAdmin: { from: () => ({ select() { return this; }, eq() { return this; }, maybeSingle: async () => ({ data: { is_hoguet: false } }) }) } },
    '@/lib/supabase/server': { createClient: async () => client },
    '@/lib/audit': { getAuditContext: async () => ({}) },
    '@/lib/siren': { verifySiren: async () => registry },
    '@/lib/naf-rules': { checkNafCode: () => ({ allowed: true, code: '62.02A' }) },
    '@/lib/utils': { formatDisplayName: () => 'Fixture' },
    '@/lib/generate-alias': { generateUniqueAlias: async () => '#TEST01' },
  }, { get: (target, name) => target[name] ?? {} });
  const { completeProOnboarding } = load('src/app/(protected)/profile/actions.ts', imports);
  const result = await completeProOnboarding({ engagement_accepted: true, work_mode: 'onsite', category_id: companyId, siret: registry.siret, email: 'fixture@example.invalid', insurance_number: 'fictional-insurance' });
  assert.match(result.error, /création de l'entreprise/);
  assert.equal(activated, false);
});

test('signing activity-specific terms records proof but never activates a professional profile alone', async () => {
  const events = [];
  const admin = { storage: { from: () => ({ upload: async () => ({}), createSignedUrl: async () => ({ data: { signedUrl: 'https://example.invalid/fixture' } }) }) },
    from: () => ({ select() { return this; }, eq() { return this; }, single: async () => ({ data: { first_name: 'Fixture' } }), update: () => assert.fail('Signature alone must not activate') }) };
  const { signAgentCGU } = load('src/app/(protected)/profile/pro-onboarding/sign-action.ts', {
    '@/lib/supabase/server': { createClient: async () => ({ auth: { getUser: async () => ({ data: { user: { id: 'fixture' } } }) } }) },
    '@/lib/supabase/admin': { supabaseAdmin: admin },
    '@/lib/audit': { getAuditContext: async () => ({}), getDocumentHash: async () => ({ hash: 'fictional', version: '1.0' }), logOnboardingEvent: async e => events.push(e) },
    '@/lib/generate-signed-pdf': { generateSignedPDF: async () => Buffer.from('fixture-only') },
    '@/lib/notify-signature-cgu': { sendSignatureConfirmationEmail: () => assert.fail('No real email') },
    '@/lib/storage-public-url': { toPublicStorageUrl: value => value },
  });
  assert.equal((await signAgentCGU({ signatureBase64: 'data:image/png;base64,Zml4dHVyZQ==', cguDocumentId: 'fixture-document' })).success, true);
  assert.equal(events[0].eventType, 'signature_completed');
});
