const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const React = require('react');
const { renderToStaticMarkup } = require('react-dom/server');

// Render the real component, without a database account or outbound email.
function load(filename) {
  const source = fs.readFileSync(filename, 'utf8');
  const code = ts.transpileModule(source, { compilerOptions: {
    module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX,
  } }).outputText;
  const module = { exports: {} };
  vm.runInNewContext(code, { module, exports: module.exports, require: name =>
    name.startsWith('.') ? load(path.resolve(path.dirname(filename), `${name}.ts`)) : require(name)
  }, { filename });
  return module.exports;
}
const { StepContact } = load(path.resolve('src/app/(protected)/recommendations/new/StepContact.tsx'));
const noop = () => {};
function render(contacts, email = 'owner@example.com', selectedContactId = null) {
  return renderToStaticMarkup(React.createElement(StepContact, {
    contacts, selfProfile: { first_name: 'Owner', last_name: 'Test', email, phone: '' },
    selectedContactId, createContact: false, contactErrors: {}, thirdPartyConsent: false,
    contactForm: {}, setSelectedContactId: noop, setCreateContact: noop,
    setContactForm: noop, setContactErrors: noop, setThirdPartyConsent: noop,
  }));
}
const contact = (id, email) => ({ id, first_name: id, last_name: 'Test', email, phone: null });

test('legacy contact with null email renders and retains the consent requirement', () => {
  const html = render([contact('Legacy', null), contact('Normal', 'other@example.com')], undefined, 'Legacy');
  assert.match(html, /Legacy Test/);
  assert.match(html, /Normal Test/);
  assert.match(html, /consentement explicite/);
  assert.match(html, /type="checkbox"[^>]*required/);
});
test('self contact remains excluded after trimming and case normalization', () => {
  const html = render([contact('Self', ' OWNER@EXAMPLE.COM '), contact('Other', 'other@example.com')]);
  assert.doesNotMatch(html, /Self Test/);
  assert.match(html, /Other Test/);
});
test('empty list and missing account email still allow adding a contact', () => {
  assert.match(render([]), /Ajouter un recommandé/);
  assert.match(render([contact('Legacy', null)], ''), /Legacy Test/);
});
