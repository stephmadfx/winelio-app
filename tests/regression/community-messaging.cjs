const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const ts = require("typescript");

function loadTs(file, imports = {}) {
  const module = { exports: {} };
  const compiled = ts.transpileModule(fs.readFileSync(file, "utf8"), {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
    },
  }).outputText;

  vm.runInNewContext(compiled, {
    module,
    exports: module.exports,
    require: (name) => (name in imports ? imports[name] : require(name)),
    process: { env: {} },
    console,
    Buffer,
    Request,
    Response,
    URL,
    Date,
    Map,
    Set,
    Math,
    Promise,
  });
  return module.exports;
}

const nextMock = {
  NextResponse: {
    json: (body, options) => ({ body, status: options?.status ?? 200 }),
  },
};

test("RGPD display name, avatar privacy and image magic-bytes validation", () => {
  const messaging = loadTs("src/lib/messaging.ts", {
    "@/lib/supabase/server": { createClient: async () => ({}) },
    "@/lib/supabase/admin": { supabaseAdmin: {} },
  });

  assert.equal(messaging.formatMemberDisplayName("Stéphane", "Martin"), "Stéphane M.");
  assert.equal(messaging.formatMemberDisplayName("Marie", ""), "Marie");
  assert.equal(
    messaging.sanitizeAuthorAvatar("users/abc/avatar.webp", false),
    null,
    "avatar must stay hidden when avatar_visible_to_network is false",
  );
  assert.equal(
    messaging.sanitizeAuthorAvatar("users/abc/avatar.webp", true),
    "users/abc/avatar.webp",
  );

  const webpBuf = Buffer.from("524946462400000057454250", "hex");
  const detected = messaging.detectSafeImageMime(webpBuf);
  assert.equal(detected?.mime, "image/webp");
  assert.equal(detected?.ext, "webp");

  const svgPayload = Buffer.from("<svg onload=alert(1)></svg>", "utf8");
  assert.equal(messaging.detectSafeImageMime(svgPayload), null);

  assert.equal(messaging.MESSAGING_GROUPS_ENABLED, false);
  assert.ok(messaging.REPORT_REASONS.includes("non_compliant"));
});

test("standby mode blocks lineage/team while national space grants member post + admin announcement", async () => {
  let queriedKind = "team";
  const messaging = loadTs("src/lib/messaging.ts", {
    "@/lib/supabase/server": { createClient: async () => ({}) },
    "@/lib/supabase/admin": {
      supabaseAdmin: {
        from(table) {
          return {
            select() {
              return this;
            },
            eq() {
              return this;
            },
            gt() {
              return this;
            },
            order: async () => ({ data: [] }),
            maybeSingle: async () => {
              if (table === "messaging_channels") {
                return {
                  data: {
                    id: "11111111-1111-4111-8111-111111111111",
                    kind: queriedKind,
                    slug: "national-announcements",
                    name: "Communauté Winelio",
                    description: null,
                    owner_id: null,
                    allow_member_photos: true,
                    is_archived: false,
                  },
                };
              }
              if (table === "messaging_memberships") {
                return { data: { role: "member", muted_until: null, last_read_at: null } };
              }
              return { data: null };
            },
          };
        },
      },
    },
  });

  const memberActor = { userId: "u-member", isSuperAdmin: false, eligible: true };
  assert.equal(
    await messaging.getChannelAccess(memberActor, "11111111-1111-4111-8111-111111111111"),
    null,
  );

  queriedKind = "announcements";
  const memberAccess = await messaging.getChannelAccess(
    memberActor,
    "11111111-1111-4111-8111-111111111111",
  );
  assert.equal(memberAccess?.canPostTopLevel, true);
  assert.equal(memberAccess?.canPostOfficialAnnouncement, false);

  const adminAccess = await messaging.getChannelAccess(
    { userId: "u-admin", isSuperAdmin: true, eligible: true },
    "11111111-1111-4111-8111-111111111111",
  );
  assert.equal(adminAccess?.canPostTopLevel, true);
  assert.equal(adminAccess?.canPostOfficialAnnouncement, true);
});

test("community message vs official announcement anti-spoofing, charter check and R2 isolation", async () => {
  const CHANNEL_ID = "11111111-1111-4111-8111-111111111111";
  const PARENT_ID = "22222222-2222-4222-8222-222222222222";
  let currentActor = null;
  let currentAccess = null;
  let charterAccepted = true;
  let insertedPayload = null;

  const adminMock = {
    from(table) {
      return {
        select() {
          return this;
        },
        eq() {
          return this;
        },
        is() {
          return this;
        },
        maybeSingle: async () => {
          if (table === "messaging_preferences") {
            return {
              data: charterAccepted ? { charter_accepted_at: "2026-11-12T10:00:00Z" } : null,
            };
          }
          if (table === "messaging_messages") {
            return {
              data: {
                id: PARENT_ID,
                parent_message_id: null,
                comments_enabled: true,
                deleted_at: null,
                moderation_state: "active",
              },
            };
          }
          return { data: null };
        },
        insert(payload) {
          insertedPayload = payload;
          return {
            select: () => ({
              single: async () => ({
                data: {
                  id: "33333333-3333-4333-8333-333333333333",
                  channel_id: CHANNEL_ID,
                  author_id: currentActor.userId,
                  author_badge: payload.author_badge,
                  message_type: payload.message_type,
                  parent_message_id: payload.parent_message_id,
                  title: payload.title,
                  content: payload.content,
                  attachments: payload.attachments,
                  comments_enabled: payload.comments_enabled,
                  reply_count: 0,
                  edited_at: null,
                  deleted_at: null,
                  moderation_state: "active",
                  created_at: "2026-11-12T12:00:00.000Z",
                },
                error: null,
              }),
            }),
          };
        },
        update() {
          return { eq: async () => ({}) };
        },
        upsert: async () => ({}),
        in() {
          return {
            eq: async () => ({ data: [] }),
            then(resolve) {
              resolve({ data: [] });
            },
          };
        },
        then(resolve) {
          resolve({ count: 1, data: [] });
        },
      };
    },
  };

  const messagingLibMock = {
    ALLOWED_EMOJIS: ["👍", "❤️", "😂", "😮", "👏", "🔥", "🎉", "💡"],
    MAX_MESSAGE_LENGTH: 2000,
    MAX_TITLE_LENGTH: 140,
    checkWriteFlood: () => true,
    formatMemberDisplayName: () => "Membre T.",
    sanitizeAuthorAvatar: () => null,
    resolveAuthorBadge: ({ isSuperAdmin }) => (isSuperAdmin ? "admin" : "member"),
    broadcastChannelUpdate: async () => {},
    getMessagingActor: async () => currentActor,
    getChannelAccess: async () => currentAccess,
  };

  const { POST } = loadTs("src/app/api/messaging/channels/[channelId]/messages/route.ts", {
    "next/server": nextMock,
    "@/lib/supabase/admin": { supabaseAdmin: adminMock },
    "@/lib/messaging": messagingLibMock,
    "@/lib/push-notifications": { dispatchCommunityMessagePush: async () => ({ sent: 0 }) },
  });

  // 1. Un membre standard peut écrire un message communautaire mais ne peut jamais usurper une annonce officielle
  currentActor = { userId: "member-1", isSuperAdmin: false, isFounder: false, isProfessional: false };
  currentAccess = {
    channel: { id: CHANNEL_ID, kind: "announcements" },
    role: "member",
    canPostTopLevel: true,
    canPostOfficialAnnouncement: false,
    canModerate: false,
    canPin: false,
    canUploadPhoto: true,
    activeRestriction: null,
  };
  let res = await POST(
    new Request(`https://winelio.app/api/messaging/channels/${CHANNEL_ID}/messages`, {
      method: "POST",
      body: JSON.stringify({
        content: "Bonjour toute la communauté Winelio !",
        isOfficialAnnouncement: true,
        title: "Tentative titre officiel",
      }),
    }),
    { params: Promise.resolve({ channelId: CHANNEL_ID }) },
  );
  assert.equal(res.status, 201);
  assert.equal(insertedPayload.message_type, "post");
  assert.equal(insertedPayload.title, null);

  // 2. Un Super Admin publie une annonce officielle avec titre
  currentActor = { userId: "admin-1", isSuperAdmin: true, isFounder: true, isProfessional: true };
  currentAccess = {
    ...currentAccess,
    canPostOfficialAnnouncement: true,
    canModerate: true,
    canPin: true,
  };
  res = await POST(
    new Request(`https://winelio.app/api/messaging/channels/${CHANNEL_ID}/messages`, {
      method: "POST",
      body: JSON.stringify({
        content: "Nouvelle formation nationale ce soir !",
        isOfficialAnnouncement: true,
        title: "Formation Réseau",
      }),
    }),
    { params: Promise.resolve({ channelId: CHANNEL_ID }) },
  );
  assert.equal(res.status, 201);
  assert.equal(insertedPayload.message_type, "announcement");
  assert.equal(insertedPayload.title, "Formation Réseau");

  // 3. Rejet d'une pièce jointe d'un autre salon
  res = await POST(
    new Request(`https://winelio.app/api/messaging/channels/${CHANNEL_ID}/messages`, {
      method: "POST",
      body: JSON.stringify({
        content: "Photo",
        attachments: [{ key: "messaging/99999999-9999-4999-8999-999999999999/leak.webp" }],
      }),
    }),
    { params: Promise.resolve({ channelId: CHANNEL_ID }) },
  );
  assert.equal(res.status, 400);

  // 4. Blocage si la charte n'a pas encore été acceptée par un membre
  currentActor = { userId: "member-2", isSuperAdmin: false, isFounder: false, isProfessional: false };
  charterAccepted = false;
  res = await POST(
    new Request(`https://winelio.app/api/messaging/channels/${CHANNEL_ID}/messages`, {
      method: "POST",
      body: JSON.stringify({ content: "Bonjour" }),
    }),
    { params: Promise.resolve({ channelId: CHANNEL_ID }) },
  );
  assert.equal(res.status, 403);
});

test("Messenger single-reaction replacement, mask/delete traces and non-compliant report", async () => {
  const CHANNEL_ID = "11111111-1111-4111-8111-111111111111";
  const MSG_ID = "44444444-4444-4444-8444-444444444444";
  let currentActor = { userId: "viewer-1", isSuperAdmin: false };
  let activeReactionEmoji = null;
  let lastUpdatePayload = null;
  let upsertedReport = null;
  const deletedKeys = [];

  const adminMock = {
    from(table) {
      return {
        select() {
          return this;
        },
        eq() {
          return this;
        },
        is() {
          return this;
        },
        maybeSingle: async () => {
          if (table === "messaging_messages") {
            return {
              data: {
                id: MSG_ID,
                channel_id: CHANNEL_ID,
                author_id: "author-1",
                parent_message_id: null,
                message_type: "post",
                title: null,
                content: "Contenu original à modérer",
                archived_content: null,
                attachments: [{ key: `messaging/${CHANNEL_ID}/photo-1.webp` }],
                comments_enabled: true,
                deleted_at: null,
                moderation_state: "active",
                created_at: new Date().toISOString(),
              },
            };
          }
          if (table === "messaging_reactions") {
            return {
              data: activeReactionEmoji ? { emoji: activeReactionEmoji } : null,
            };
          }
          return { data: null };
        },
        upsert: async (payload) => {
          if (table === "messaging_reactions") {
            activeReactionEmoji = payload.emoji;
          }
          if (table === "messaging_reports") {
            upsertedReport = payload;
          }
          return { error: null };
        },
        update(payload) {
          lastUpdatePayload = payload;
          return { eq: async () => ({}) };
        },
        delete() {
          if (table === "messaging_reactions") {
            activeReactionEmoji = null;
          }
          return { eq: () => ({ eq: async () => ({}) }) };
        },
        insert: async () => ({}),
        then(resolve) {
          resolve({ count: 0 });
        },
      };
    },
  };

  const { PATCH, DELETE } = loadTs("src/app/api/messaging/messages/[messageId]/route.ts", {
    "next/server": nextMock,
    "@/lib/supabase/admin": { supabaseAdmin: adminMock },
    "@/lib/r2-avatars": {
      deleteAvatar: async (key) => {
        deletedKeys.push(key);
      },
    },
    "@/lib/messaging": {
      ALLOWED_EMOJIS: ["👍", "❤️", "😂", "😮", "👏", "🔥", "🎉", "💡"],
      REPORT_REASONS: [
        "non_compliant",
        "spam",
        "inappropriate",
        "personal_data",
        "misleading",
        "other",
      ],
      EDIT_WINDOW_MS: 15 * 60 * 1000,
      MAX_MESSAGE_LENGTH: 2000,
      MAX_PINS_PER_CHANNEL: 3,
      MAX_TITLE_LENGTH: 140,
      broadcastChannelUpdate: async () => {},
      logMessagingAudit: async () => {},
      getMessagingActor: async () => currentActor,
      getChannelAccess: async () => ({
        channel: { id: CHANNEL_ID, kind: "announcements" },
        role: currentActor.isSuperAdmin ? "owner" : "member",
        canModerate: currentActor.isSuperAdmin,
        canPin: currentActor.isSuperAdmin,
        activeRestriction: null,
      }),
    },
  });

  // 1. Réaction style Messenger : 👍 -> remplacé par ❤️ -> retiré au second clic ❤️
  let res = await PATCH(
    new Request(`https://winelio.app/api/messaging/messages/${MSG_ID}`, {
      method: "PATCH",
      body: JSON.stringify({ action: "toggle_reaction", emoji: "👍" }),
    }),
    { params: Promise.resolve({ messageId: MSG_ID }) },
  );
  assert.equal(res.body.myReaction, "👍");
  assert.equal(activeReactionEmoji, "👍");

  res = await PATCH(
    new Request(`https://winelio.app/api/messaging/messages/${MSG_ID}`, {
      method: "PATCH",
      body: JSON.stringify({ action: "toggle_reaction", emoji: "❤️" }),
    }),
    { params: Promise.resolve({ messageId: MSG_ID }) },
  );
  assert.equal(res.body.myReaction, "❤️");
  assert.equal(activeReactionEmoji, "❤️");

  res = await PATCH(
    new Request(`https://winelio.app/api/messaging/messages/${MSG_ID}`, {
      method: "PATCH",
      body: JSON.stringify({ action: "toggle_reaction", emoji: "❤️" }),
    }),
    { params: Promise.resolve({ messageId: MSG_ID }) },
  );
  assert.equal(res.body.myReaction, null);
  assert.equal(activeReactionEmoji, null);

  // 2. Signalement d'un message non conforme transmis aux 3 Super Admins
  res = await PATCH(
    new Request(`https://winelio.app/api/messaging/messages/${MSG_ID}`, {
      method: "PATCH",
      body: JSON.stringify({
        action: "report",
        reason: "non_compliant",
        details: "Message hors charte",
      }),
    }),
    { params: Promise.resolve({ messageId: MSG_ID }) },
  );
  assert.equal(res.status, 200);
  assert.equal(upsertedReport?.reason, "non_compliant");
  assert.equal(upsertedReport?.status, "pending");

  // 3. Masquage par Super Admin : laisse la trace masked_admin + conserve archived_content
  currentActor = { userId: "super-admin-1", isSuperAdmin: true };
  res = await PATCH(
    new Request(`https://winelio.app/api/messaging/messages/${MSG_ID}`, {
      method: "PATCH",
      body: JSON.stringify({ action: "mask", reason: "Non conforme" }),
    }),
    { params: Promise.resolve({ messageId: MSG_ID }) },
  );
  assert.equal(res.status, 200);
  assert.equal(lastUpdatePayload?.moderation_state, "masked_admin");
  assert.equal(lastUpdatePayload?.archived_content, "Contenu original à modérer");

  // 4. Suppression par l'auteur : laisse la trace deleted_author + purge R2
  currentActor = { userId: "author-1", isSuperAdmin: false };
  res = await DELETE(
    new Request(`https://winelio.app/api/messaging/messages/${MSG_ID}`, { method: "DELETE" }),
    { params: Promise.resolve({ messageId: MSG_ID }) },
  );
  assert.equal(res.status, 200);
  assert.equal(lastUpdatePayload?.moderation_state, "deleted_author");
  assert.equal(lastUpdatePayload?.content, "");
  assert.equal(deletedKeys[0], `messaging/${CHANNEL_ID}/photo-1.webp`);
});
