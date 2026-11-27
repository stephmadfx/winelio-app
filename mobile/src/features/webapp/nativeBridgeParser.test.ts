import assert from "node:assert/strict";
import test from "node:test";
import { parseNativeBridgeMessage } from "./nativeBridgeParser.ts";

test("accepte assistantPermissions et openAppSettings dans le pont natif", () => {
  const perm = parseNativeBridgeMessage(
    JSON.stringify({
      type: "assistantPermissions",
      requestId: "perm-1",
      payload: { includeContacts: true, promptSettings: true },
    }),
  );
  assert.ok(perm);
  assert.equal(perm.type, "assistantPermissions");
  assert.equal(perm.requestId, "perm-1");
  assert.equal(perm.payload?.promptSettings, true);

  const settings = parseNativeBridgeMessage(JSON.stringify({ type: "openAppSettings" }));
  assert.ok(settings);
  assert.equal(settings.type, "openAppSettings");
});

test("accepte pickContact et searchContacts valides et rejette les types inconnus", () => {
  assert.equal(
    parseNativeBridgeMessage(JSON.stringify({ type: "pickContact", requestId: "c-1" }))?.type,
    "pickContact",
  );
  assert.equal(
    parseNativeBridgeMessage(
      JSON.stringify({ type: "searchContacts", requestId: "s-1", payload: { query: "Thierry" } }),
    )?.type,
    "searchContacts",
  );
  assert.equal(parseNativeBridgeMessage(JSON.stringify({ type: "unknownType" })), null);
  assert.equal(parseNativeBridgeMessage(JSON.stringify({ type: "assistantPermissions" })), null);
});
