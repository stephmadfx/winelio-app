import assert from "node:assert/strict";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { SavePaymentMethodDialog } from "../../src/components/save-payment-method-dialog";

const html = renderToStaticMarkup(
  <SavePaymentMethodDialog
    open
    onClose={() => undefined}
    onSaved={() => undefined}
  />,
);

assert.match(html, /Autorisation de débits futurs/);
assert.match(html, /sans nouvelle validation de ma part/);
assert.match(html, /J&#x27;autorise ces débits automatiques/);
assert.match(html, /Conditions Professionnels \/ CGV/);
assert.match(html, /type="checkbox"/);
assert.match(html, /Continuer vers la saisie de la carte/);
assert.match(html, /disabled=""/);
assert.doesNotMatch(html, /En aucun cas Winelio ne prélèvera automatiquement/);

console.log("payment-consent-render: OK");
