import assert from "node:assert/strict";
import test from "node:test";
import { shouldLoadInWebView, webAppOrigin } from "./webAppNavigation.ts";

test("la fiche recommandation reste dans Winelio", () => {
  assert.equal(shouldLoadInWebView(`${webAppOrigin}/recommendations/example`, true), true);
});

test("les cadres techniques Stripe restent intégrés sur iOS et Android", () => {
  for (const topFrame of [true, false, undefined]) {
    for (const url of [
      "https://js.stripe.com/v3/m-outer.html",
      "https://hooks.stripe.com/three_d_secure/authenticate",
      "https://m.stripe.network/inner.html",
      "about:blank",
    ]) assert.equal(shouldLoadInWebView(url, topFrame), true, url);
  }
});

test("une vérification bancaire embarquée reste intégrée mais les vrais liens externes sortent", () => {
  assert.equal(shouldLoadInWebView("https://bank.example/3ds", false), true);
  assert.equal(shouldLoadInWebView("https://external.example", true), false);
  assert.equal(shouldLoadInWebView("https://stripe.com.external.example", true), false);
  assert.equal(shouldLoadInWebView("https://notstripe.com", true), false);
});
