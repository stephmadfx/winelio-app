const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const test = require('node:test');
const ts = require('typescript');

function moduleFor(file, platform = 'android') {
  const exports = {};
  vm.runInNewContext(ts.transpileModule(fs.readFileSync(file, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
  }).outputText, { exports, require: () => ({ Platform: { OS: platform } }) });
  return exports;
}
const path = 'mobile/src/features/webapp/';
const bridge = moduleFor(path + 'nativeBridge.ts');
const native = moduleFor(path + 'nativeShare.ts');

function page(platform = 'android', existingShare, beforeDocument = false) {
  const messages = [];
  const navigator = { share: existingShare };
  const window = {
    ReactNativeWebView: { postMessage: value => messages.push(JSON.parse(value)) },
    addEventListener() {}, dispatchEvent() {},
  };
  const document = {
    documentElement: { setAttribute() {}, appendChild() {} },
    createElement: () => ({ setAttribute() {}, appendChild() {} }), createTextNode() {},
  };
  if (beforeDocument) document.documentElement = null;
  vm.runInNewContext(moduleFor(path + 'nativeBridge.ts', platform).nativeBridgeScript,
    { window, document, navigator, DOMException, CustomEvent: class {}, console: { error() {} } });
  return { messages, navigator, window };
}

test('Android opens bridge with the complete message and resolves on native acknowledgement', async () => {
  const p = page();
  const promise = p.navigator.share({ title: 'Winelio', text: 'Code ABC123', url: 'https://winelio.app/?ref=ABC123' });
  assert.equal(p.messages.length, 1);
  const request = bridge.parseNativeBridgeMessage(JSON.stringify(p.messages[0]));
  assert.equal(request.payload.text, 'Code ABC123');
  const content = native.nativeShareContent(request.payload);
  assert.equal(content.message, 'Code ABC123\nhttps://winelio.app/?ref=ABC123');
  let completed = false;
  promise.then(() => { completed = true; });
  p.window.__WINELIO_NATIVE_SHARE_RESULT__('wrong-id', 'shared');
  await Promise.resolve();
  assert.equal(completed, false);
  p.window.__WINELIO_NATIVE_SHARE_RESULT__(request.requestId, 'shared');
  await promise;
});

test('cancel rejects as AbortError, error remains distinct, subsequent share is allowed', async () => {
  const p = page();
  for (const [status, name] of [['dismissed', 'AbortError'], ['error', 'NotAllowedError']]) {
    const promise = p.navigator.share({ url: 'https://winelio.app/video' });
    const assertion = assert.rejects(promise, { name });
    p.window.__WINELIO_NATIVE_SHARE_RESULT__(p.messages.at(-1).requestId, status);
    await assertion;
  }
});

test('duplicate tap does not open a second sheet; unsupported files fail explicitly', async () => {
  const p = page();
  const first = p.navigator.share({ text: 'Invitation' });
  await assert.rejects(p.navigator.share({ text: 'Invitation' }), { name: 'InvalidStateError' });
  assert.equal(p.messages.length, 1);
  p.window.__WINELIO_NATIVE_SHARE_RESULT__(p.messages[0].requestId, 'shared');
  await first;
  await assert.rejects(p.navigator.share({ files: [{}], text: 'file' }), { name: 'TypeError' });
  assert.equal(p.navigator.canShare({ files: [{}] }), false);
});

test('keeps iOS Web Share and preserves invitation links without duplication', () => {
  const existing = () => {};
  assert.equal(page('ios', existing).navigator.share, existing);
  assert.equal(native.nativeShareContent({ text: 'Mon code ABC\nhttps://winelio.app/?ref=ABC', url: 'https://winelio.app/?ref=ABC' }).message,
    'Mon code ABC\nhttps://winelio.app/?ref=ABC');
  assert.equal(native.nativeShareContent({ url: 'https://winelio.app/video' }).message, 'https://winelio.app/video');
});

test('bridge rejects malformed payloads and serializes callback arguments safely', () => {
  for (const input of ['null', '{}', '{"type":"share"}', JSON.stringify({ type: 'share', requestId: '1', payload: { text: {} } }),
    JSON.stringify({ type: 'share', requestId: '1', payload: { url: 'javascript:alert(1)' } })]) {
    assert.equal(bridge.parseNativeBridgeMessage(input), null);
  }
  const p = page();
  vm.runInNewContext(native.nativeShareResultScript('";throw new Error(); //', 'error'), { window: p.window });
});


test('bridge post failure rejects without leaving a pending request', async () => {
  const p = page();
  p.window.ReactNativeWebView.postMessage = () => { throw new Error('Bridge unavailable'); };
  await assert.rejects(p.navigator.share({ text: 'Invitation' }), { name: 'NotAllowedError' });
  await assert.rejects(p.navigator.share({ text: 'Invitation' }), { name: 'NotAllowedError' });
});


test('Samsung early injection works before the HTML root exists', async () => {
  const p = page('android', undefined, true);
  assert.equal(typeof p.navigator.share, 'function');
  const promise = p.navigator.share({ url: 'https://winelio.app/video' });
  p.window.__WINELIO_NATIVE_SHARE_RESULT__(p.messages[0].requestId, 'shared');
  await promise;
});
