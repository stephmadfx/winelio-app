import assert from "node:assert/strict";
import { addCampaignTracking, isAppDeepLink } from "../../src/lib/newsletter-campaign";

assert.ok(isAppDeepLink("https://winelio.app/dashboard"));
assert.ok(isAppDeepLink("https://winelio.app/network/stats"));
assert.ok(!isAppDeepLink("https://winelio.app"));
assert.ok(!isAppDeepLink("https://winelio.app/dashboards"));
assert.ok(!isAppDeepLink("https://winelio.app/documents-legaux/conditions-professionnels"));

const html = addCampaignTracking(
  '<body><a href="https://winelio.app/dashboard">App</a><a href="https://winelio.app/documents-legaux/x">Web</a></body>',
  "rid", "tok",
);
assert.match(html, /href="https:\/\/winelio\.app\/dashboard"/);
assert.match(html, /track\/click\/rid\?u=https%3A%2F%2Fwinelio\.app%2Fdocuments-legaux%2Fx/);

console.log("newsletter-deep-links: OK");
