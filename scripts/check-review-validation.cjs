const assert = require("node:assert/strict");
const fs = require("node:fs");
const Module = require("node:module");
const ts = require("typescript");
function load(file) {
  const m = new Module(file, module);
  m._compile(ts.transpileModule(fs.readFileSync(file, "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText, file);
  return m.exports;
}
const { validateRecommendationReview, validateReviewComment } = load("src/lib/review-validation.ts");
const { recommendationStepRole } = load("src/lib/recommendation-workflow.ts");
for (const rating of [1, 2, 3, 4, 5]) assert.equal(validateRecommendationReview(rating, "").ok, true);
for (const rating of [0, 6, 2.5, null, "5", true, NaN]) assert.equal(validateRecommendationReview(rating, "").ok, false);
assert.equal(validateReviewComment("é".repeat(5000)).ok, true);
assert.equal(validateReviewComment("é".repeat(5001)).ok, false);
assert.equal(validateReviewComment("Très bon suivi. Merci !").ok, true);
for (const comment of ["https://example.com", "www.exemple.fr", "exemple.fr/avis", "[Lien](//example.com)", "https:\u200b//example.com", "１２７.０.０.１", "mailto:avis@example.fr"]) {
  assert.equal(validateReviewComment(comment).ok, false, comment);
}
assert.deepEqual([1,2,3,4,5,6,7,8].map(recommendationStepRole), ["PROFESSIONAL","PROFESSIONAL","REFERRER","REFERRER","PROFESSIONAL","REFERRER","PROFESSIONAL","REFERRER"]);
console.log("Validation des avis : notes 1–5, texte facultatif, limite 5 000, liens refusés et rôles vérifiés.");
