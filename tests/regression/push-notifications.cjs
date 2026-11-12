const { test } = require("node:test");
const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const vm = require("node:vm");
const ts = require("typescript");

function loadTs(file, imports = {}) {
  const module = { exports: {} };
  const compiled = ts.transpileModule(fs.readFileSync(file, "utf8"), {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
      esModuleInterop: true,
    },
  }).outputText;

  vm.runInNewContext(compiled, {
    module,
    exports: module.exports,
    require: (name) => (name in imports ? imports[name] : require(name)),
    process: { env: {} },
    console,
    Buffer,
    Uint8Array,
    URL,
    URLSearchParams,
    Date,
    Set,
    Map,
    Math,
    Promise,
    setTimeout,
    clearTimeout,
    fetch: async () => ({ status: 201, ok: true, text: async () => "" }),
  });
  return module.exports;
}

test("default notification preferences are 100% enabled for first-time users", () => {
  const push = loadTs("src/lib/push-notifications.ts", {
    "@/lib/supabase/admin": { supabaseAdmin: {} },
  });

  const defaults = JSON.parse(JSON.stringify(push.normalizeNotificationPreferences(null)));
  assert.deepEqual(defaults, {
    in_app_badges: true,
    email_major_announcements: true,
    notify_official_announcements: true,
    notify_community_messages: true,
    notify_message_replies: true,
    notify_new_referral: true,
  });

  const partialOptOut = push.normalizeNotificationPreferences({
    notify_community_messages: false,
  });
  assert.equal(partialOptOut.notify_community_messages, false);
  assert.equal(partialOptOut.notify_official_announcements, true);
  assert.equal(partialOptOut.notify_new_referral, true);
});

test("Web Push SSRF allowlist, VAPID ES256 signature and RFC 8291 aes128gcm roundtrip", () => {
  const push = loadTs("src/lib/push-notifications.ts", {
    "@/lib/supabase/admin": { supabaseAdmin: {} },
  });

  assert.equal(push.isAllowedWebPushEndpoint("https://fcm.googleapis.com/fcm/send/abc"), true);
  assert.equal(push.isAllowedWebPushEndpoint("https://web.push.apple.com/Qabc123"), true);
  assert.equal(push.isAllowedWebPushEndpoint("http://supabase-kong:8000/internal"), false);
  assert.equal(push.isAllowedWebPushEndpoint("https://127.0.0.1/push"), false);
  assert.equal(push.isAllowedWebPushEndpoint("https://169.254.169.254/latest"), false);

  // 1. Vérification cryptographique VAPID ES256
  const vapid = push.generateVapidKeyPair();
  const authHeader = push.buildVapidAuthHeader(
    "https://web.push.apple.com/Qabc123",
    vapid.publicKey,
    vapid.privateKeyPem,
  );
  const match = /^vapid t=([^.]+\.[^.]+)\.([^,]+), k=(.+)$/.exec(authHeader);
  assert.ok(match, "VAPID Authorization header format");
  assert.equal(match[3], vapid.publicKey);

  const pubRaw = Buffer.from(vapid.publicKey, "base64url");
  assert.equal(pubRaw.length, 65);
  const pubKeyObj = crypto.createPublicKey({
    key: {
      kty: "EC",
      crv: "P-256",
      x: pubRaw.subarray(1, 33).toString("base64url"),
      y: pubRaw.subarray(33, 65).toString("base64url"),
    },
    format: "jwk",
  });
  const sigValid = crypto.verify(
    "sha256",
    Buffer.from(match[1], "ascii"),
    { key: pubKeyObj, dsaEncoding: "ieee-p1363" },
    Buffer.from(match[2], "base64url"),
  );
  assert.equal(sigValid, true, "VAPID ES256 signature must verify");

  // 2. Déchiffrement côté navigateur simulé (RFC 8291 + RFC 8188)
  const uaEcdh = crypto.createECDH("prime256v1");
  uaEcdh.generateKeys();
  const uaPublic = uaEcdh.getPublicKey();
  const authSecret = crypto.randomBytes(16);

  const validSub = push.parseWebPushSubscription({
    endpoint: "https://fcm.googleapis.com/fcm/send/token-1",
    keys: {
      p256dh: uaPublic.toString("base64url"),
      auth: authSecret.toString("base64url"),
    },
  });
  assert.ok(validSub);

  const originalJson = JSON.stringify({
    title: "🌱 Nouveau filleul dans votre réseau",
    body: "Claire D. vient de rejoindre Winelio.",
    url: "/network",
  });

  const packet = push.encryptWebPushPayload(originalJson, validSub.keys);
  const salt = packet.subarray(0, 16);
  const rs = packet.readUInt32BE(16);
  const idlen = packet.readUInt8(20);
  const asPublic = packet.subarray(21, 21 + idlen);
  const ciphertextWithTag = packet.subarray(21 + idlen);

  assert.equal(rs, 4096);
  assert.equal(idlen, 65);

  const sharedSecret = uaEcdh.computeSecret(asPublic);
  const keyInfo = Buffer.concat([Buffer.from("WebPush: info\0", "ascii"), uaPublic, asPublic]);
  const ikm = Buffer.from(crypto.hkdfSync("sha256", sharedSecret, authSecret, keyInfo, 32));
  const cek = Buffer.from(
    crypto.hkdfSync(
      "sha256",
      ikm,
      salt,
      Buffer.from("Content-Encoding: aes128gcm\0", "ascii"),
      16,
    ),
  );
  const nonce = Buffer.from(
    crypto.hkdfSync(
      "sha256",
      ikm,
      salt,
      Buffer.from("Content-Encoding: nonce\0", "ascii"),
      12,
    ),
  );

  const tag = ciphertextWithTag.subarray(ciphertextWithTag.length - 16);
  const enc = ciphertextWithTag.subarray(0, ciphertextWithTag.length - 16);
  const decipher = crypto.createDecipheriv("aes-128-gcm", cek, nonce);
  decipher.setAuthTag(tag);
  const decryptedRecord = Buffer.concat([decipher.update(enc), decipher.final()]);
  assert.equal(decryptedRecord[decryptedRecord.length - 1], 0x02);
  const decryptedJson = decryptedRecord.subarray(0, decryptedRecord.length - 1).toString("utf8");
  assert.equal(decryptedJson, originalJson);
});

test("push dispatchers respect preferences, channel mute, welcome skip and referral deduplication", async () => {
  const uaEcdh = crypto.createECDH("prime256v1");
  uaEcdh.generateKeys();
  const webToken = JSON.stringify({
    endpoint: "https://fcm.googleapis.com/fcm/send/sub-ok",
    keys: {
      p256dh: uaEcdh.getPublicKey().toString("base64url"),
      auth: crypto.randomBytes(16).toString("base64url"),
    },
  });

  const vapidPair = (() => {
    const { publicKey, privateKey } = crypto.generateKeyPairSync("ec", {
      namedCurve: "prime256v1",
    });
    const jwk = publicKey.export({ format: "jwk" });
    return {
      public_key: Buffer.concat([
        Buffer.from([0x04]),
        Buffer.from(jwk.x, "base64url"),
        Buffer.from(jwk.y, "base64url"),
      ]).toString("base64url"),
      private_key_pem: privateKey.export({ type: "pkcs8", format: "pem" }).toString(),
    };
  })();

  const seenDedupe = new Set();
  const prefsByUser = new Map([
    ["user-all-on", {}],
    ["user-no-community", { notify_community_messages: false, notify_official_announcements: true }],
    ["user-muted", {}],
  ]);

  const adminMock = {
    from(table) {
      let filterUserIds = null;
      let singleUserId = null;
      let dedupeKey = null;
      return {
        select() {
          return this;
        },
        eq(col, val) {
          if (col === "user_id") singleUserId = val;
          if (col === "dedupe_key") dedupeKey = val;
          return this;
        },
        neq() {
          return this;
        },
        gt() {
          return this;
        },
        in(col, vals) {
          if (col === "user_id" || col === "id") filterUserIds = vals;
          return this;
        },
        maybeSingle: async () => {
          if (table === "push_vapid_keys") return { data: vapidPair };
          if (table === "push_notification_log") {
            return { data: seenDedupe.has(dedupeKey) ? { dedupe_key: dedupeKey } : null };
          }
          if (table === "messaging_preferences") {
            return { data: prefsByUser.get(singleUserId) || null };
          }
          if (table === "messaging_memberships") {
            return {
              data: singleUserId === "user-muted" ? { muted_until: "9999-12-31T23:59:59.000Z" } : null,
            };
          }
          return { data: null };
        },
        insert: async (row) => {
          if (table === "push_notification_log") {
            seenDedupe.add(row.dedupe_key);
          }
          return { error: null };
        },
        then(resolve) {
          if (table === "devices") {
            const allDevs = [
              { id: "d1", user_id: "user-all-on", token: webToken, platform: "web" },
              { id: "d2", user_id: "user-no-community", token: webToken, platform: "web" },
              { id: "d3", user_id: "user-muted", token: webToken, platform: "web" },
            ];
            const filtered = filterUserIds
              ? allDevs.filter((d) => filterUserIds.includes(d.user_id))
              : allDevs;
            resolve({ data: filtered });
            return;
          }
          if (table === "profiles") {
            resolve({
              data: [{ id: "user-all-on" }, { id: "user-no-community" }, { id: "user-muted" }],
            });
            return;
          }
          if (table === "messaging_preferences") {
            resolve({
              data: [
                {
                  user_id: "user-no-community",
                  notify_community_messages: false,
                  notify_official_announcements: true,
                },
              ],
            });
            return;
          }
          if (table === "messaging_memberships") {
            resolve({
              data: [{ user_id: "user-muted", muted_until: "9999-12-31T23:59:59.000Z" }],
            });
            return;
          }
          resolve({ data: [] });
        },
      };
    },
  };

  const push = loadTs("src/lib/push-notifications.ts", {
    "@/lib/supabase/admin": { supabaseAdmin: adminMock },
  });

  // 1. Les messages automatiques de bienvenue n'envoient jamais de push
  const welcomeRes = await push.dispatchCommunityMessagePush({
    channelId: "c1",
    messageId: "m-welcome",
    authorId: "system",
    authorDisplayName: "Winelio",
    messageType: "welcome",
    content: "Bienvenue !",
  });
  assert.equal(welcomeRes.sent, 0);

  // 2. Un message membre n'envoie qu'à user-all-on (exclut user-no-community et user-muted)
  const postRes = await push.dispatchCommunityMessagePush({
    channelId: "c1",
    messageId: "m-post",
    authorId: "author-x",
    authorDisplayName: "Marc L.",
    messageType: "post",
    content: "Bonjour la communauté !",
  });
  assert.equal(postRes.sent, 1);

  // 3. Une annonce officielle envoie à user-all-on ET user-no-community (2 appareils), mais pas user-muted
  const annRes = await push.dispatchCommunityMessagePush({
    channelId: "c1",
    messageId: "m-ann",
    authorId: "admin-1",
    authorDisplayName: "Équipe Winelio",
    messageType: "announcement",
    title: "Formation nationale",
    content: "Rendez-vous ce soir à 19h.",
  });
  assert.equal(annRes.sent, 2);

  // 4. Arrivée d'un nouveau filleul : envoyé 1 fois puis dédupliqué au second appel
  const firstRef = await push.dispatchNewReferralPush({
    newUserId: "new-member-1",
    sponsorId: "user-all-on",
    level: 1,
    memberName: "Julie Martin",
  });
  assert.equal(firstRef, true);

  const duplicateRef = await push.dispatchNewReferralPush({
    newUserId: "new-member-1",
    sponsorId: "user-all-on",
    level: 1,
    memberName: "Julie Martin",
  });
  assert.equal(duplicateRef, false);
});
