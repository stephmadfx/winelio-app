import assert from "node:assert/strict";
import test from "node:test";

import {
  isHttpDocumentUrl,
  shouldArmLoadTimeout,
  shouldCoverWithLoadingOverlay,
  shouldFailOnHealthBlank,
  shouldFailOnHttpError,
  shouldFailOnTimeout,
  shouldUnmountWebViewOnFailure,
} from "./webAppLoadPolicy.ts";

test("ne recouvre plus le WebView après le premier paint", () => {
  assert.equal(shouldCoverWithLoadingOverlay(false), true);
  assert.equal(shouldCoverWithLoadingOverlay(true), false);
});

test("le timeout de 20s ne s'arme plus une fois la page affichée", () => {
  assert.equal(shouldArmLoadTimeout(false), true);
  assert.equal(shouldArmLoadTimeout(true), false);
  assert.equal(shouldFailOnTimeout(false), true);
  assert.equal(shouldFailOnTimeout(true), false);
});

test("un health check pageBlank ne déclenche jamais l'écran d'erreur", () => {
  assert.equal(shouldFailOnHealthBlank(false), false);
  assert.equal(shouldFailOnHealthBlank(true), false);
  assert.equal(shouldUnmountWebViewOnFailure(false, "blank"), false);
  assert.equal(shouldUnmountWebViewOnFailure(true, "blank"), false);
});

test("une erreur HTTP 4xx ne démonte pas le WebView, surtout après affichage", () => {
  assert.equal(shouldFailOnHttpError(404, false), false);
  assert.equal(shouldFailOnHttpError(401, true), false);
  assert.equal(shouldFailOnHttpError(500, false), true);
  assert.equal(shouldFailOnHttpError(500, true), false);
  assert.equal(shouldUnmountWebViewOnFailure(true, "http"), false);
});

test("un vrai crash ou une erreur réseau peut démonter le WebView", () => {
  assert.equal(shouldUnmountWebViewOnFailure(false, "net"), true);
  assert.equal(shouldUnmountWebViewOnFailure(true, "crash"), true);
  assert.equal(shouldUnmountWebViewOnFailure(true, "timeout"), false);
});

test("about:blank ne compte pas comme premier écran utile", () => {
  assert.equal(isHttpDocumentUrl("about:blank"), false);
  assert.equal(isHttpDocumentUrl("https://winelio.app/auth/login"), true);
  assert.equal(isHttpDocumentUrl(""), false);
});
