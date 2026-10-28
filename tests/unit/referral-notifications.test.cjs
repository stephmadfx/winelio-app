const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const path = require("node:path");
const { test } = require("node:test");
const ts = require("typescript");

// Charge le code de production avec une DB en mémoire : aucun compte ni email réel.
function load(relative, mocks = {}) {
  const filename = path.resolve(relative);
  const module = { exports: {} };
  const code = ts.transpileModule(fs.readFileSync(filename, "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
  }).outputText;
  vm.runInThisContext(`(function(require,module,exports){${code}\n})`, { filename })(
    (name) => name in mocks ? mocks[name] : name.startsWith("@/")
      ? load(`src/${name.slice(2)}.ts`, mocks) : require(name), module, module.exports,
  );
  return module.exports;
}

function fixture() {
  const member = {
    id: "member", first_name: "Marie", last_name: "Dupont", phone: "0600000000",
    address: "1 rue Exemple", city: "Paris", postal_code: "75001", birth_date: "1990-01-01",
    terms_accepted: true, onboarding_status: "active", is_demo: false,
    created_at: "2026-10-28T10:00:00Z", sponsor_id: "parent",
  };
  const profiles = [member,
    { id: "parent", first_name: "Paul", last_name: "Martin", sponsor_id: "grandparent" },
    { id: "grandparent", first_name: "Anne", last_name: "Durand", sponsor_id: null },
  ];
  const users = Object.fromEntries(profiles.map(p => [p.id, {
    id: p.id, email: `${p.id}@example.com`, email_confirmed_at: "2026-10-28T10:01:00Z", user_metadata: {},
  }]));
  const queue = [];
  const state = { member, profiles, users, queue, failInsert: false, failRead: false };
  const db = {
    schema() { return this; },
    auth: { admin: { async getUserById(id) { return { data: { user: users[id] }, error: null }; } } },
    from(table) {
      const filters = [];
      let insert;
      let limit = Infinity;
      const builder = {
        select() { return this; },
        eq(key, value) { filters.push(row => row[key] === value); return this; },
        gte(key, value) { filters.push(row => row[key] >= value); return this; },
        in(key, values) { filters.push(row => values.includes(row[key])); return this; },
        like(key, value) { filters.push(row => (row[key] ?? "").includes(value.slice(1, -1))); return this; },
        limit(value) { limit = value; return this; },
        insert(value) { insert = value; return this; },
        single() { return this.result(true); },
        maybeSingle() { return this.result(true); },
        then(resolve, reject) { return this.result(false).then(resolve, reject); },
        async result(single) {
          if (state.failRead && !insert) return { data: null, error: new Error("read failed") };
          if (insert) {
            if (state.failInsert) return { data: null, error: new Error("queue unavailable") };
            if (queue.some(row => row.dedupe_key && row.dedupe_key === insert.dedupe_key)) {
              return { data: null, error: { code: "23505" } };
            }
            const row = { id: String(queue.length + 1), created_at: new Date().toISOString(), ...insert };
            queue.push(row);
            return { data: { id: row.id }, error: null };
          }
          const rows = (table === "profiles" ? profiles : queue).filter(row => filters.every(f => f(row))).slice(0, limit);
          return { data: single ? rows[0] ?? null : rows, error: null };
        },
      };
      return builder;
    },
  };
  state.notify = load("src/lib/notify-new-referral.ts", {
    "@/lib/supabase/admin": { supabaseAdmin: db },
  }).notifyNewReferral;
  return state;
}

test("profil déjà complet : une notification par niveau et lien Winelio", async () => {
  const s = fixture();
  assert.equal(await s.notify("member"), 2);
  assert.equal(s.queue[0].subject, "Marie Dupont a rejoint votre réseau Winelio");
  assert.match(s.queue[1].text_body, /Marie D\. vient de rejoindre/);
  assert.match(s.queue[0].html, /https:\/\/winelio.app\/network/);
  assert.equal(await s.notify("member"), 0);
  assert.equal(s.queue.length, 2);
});

test("appels concurrents : la contrainte unique empêche les doublons", async () => {
  const s = fixture();
  const results = await Promise.all([s.notify("member"), s.notify("member")]);
  assert.equal(results.reduce((a, b) => a + b), 2);
  assert.equal(s.queue.length, 2);
});

test("comptes non admissibles : aucun email", async () => {
  for (const mutate of [
    s => { s.users.member.email_confirmed_at = null; },
    s => { s.users.member.user_metadata.requires_password_setup = true; },
    s => { s.member.onboarding_status = "pending_confirmation"; },
    s => { s.member.phone = " "; },
    s => { s.member.is_demo = true; },
  ]) {
    const s = fixture(); mutate(s);
    assert.equal(await s.notify("member"), 0);
    assert.equal(s.queue.length, 0);
  }
});

test("ancien email sans clé préservé, autre membre niveau 2 non confondu", async () => {
  const s = fixture();
  s.queue.push({ id: "old", to_email: "parent@example.com", created_at: "2026-10-28T10:02:00Z",
    subject: "Marie Dupont a rejoint votre réseau Winelio", text_body: "Marie Dupont a rejoint votre réseau Winelio." });
  s.queue.push({ id: "other", to_email: "grandparent@example.com", created_at: "2026-10-28T10:02:00Z",
    subject: "Nouveau membre niveau 2 dans votre réseau Winelio", text_body: "Jean D. vient de rejoindre Winelio" });
  assert.equal(await s.notify("member"), 1);
  assert.equal(s.queue.length, 3);
});

test("panne DB remontée et reprise sans doublon", async () => {
  const s = fixture();
  s.failInsert = true;
  await assert.rejects(s.notify("member"), /queue unavailable/);
  s.failInsert = false;
  assert.equal(await s.notify("member"), 2);
  s.failRead = true;
  await assert.rejects(s.notify("member"), /read failed/);
});

test("cycle de parrainage : arrêt avant de notifier le membre lui-même", async () => {
  const s = fixture(); s.profiles[2].sponsor_id = "member";
  assert.equal(await s.notify("member"), 2);
});

test("confirmation : session vérifiée, parrain rattaché puis notification attendue", async () => {
  const calls = [];
  const user = { id: "member", user_metadata: { sponsor_code: "PARENT" } };
  const auth = {
    async signOut() {},
    async verifyOtp() { return { data: { session: {}, user }, error: null }; },
    async setSession() { return { data: { user }, error: null }; },
  };
  const route = load("src/app/api/auth/confirm-referral/route.ts", {
    "@/lib/supabase/server": { createClient: async () => ({ auth }) },
    "@/lib/assign-sponsor": { assignSponsorIfNeeded: async (...args) => calls.push(["assign", ...args]) },
    "@/lib/notify-new-referral": { notifyNewReferral: async id => calls.push(["notify", id]) },
  });
  const request = () => new Request("https://winelio.app/api/auth/confirm-referral", {
    method: "POST", body: JSON.stringify({ tokenHash: "fake-test-token", type: "signup" }),
  });
  assert.equal((await route.POST(request())).status, 200);
  assert.deepEqual(calls, [["assign", "member", "PARENT"], ["notify", "member"]]);
  calls.length = 0;
  auth.verifyOtp = async () => ({ data: {}, error: { message: "expired" } });
  assert.equal((await route.POST(request())).status, 400);
  assert.equal(calls.length, 0);
});
