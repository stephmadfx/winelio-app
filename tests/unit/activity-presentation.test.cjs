const assert = require('node:assert/strict');
const {test} = require('node:test');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');
function load(file, mocks={}) {
 const module={exports:{}};
 const code=ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}}).outputText;
 vm.runInThisContext(`(function(require,module,exports){${code}\n})`,{filename:file})(name => name in mocks ? mocks[name] : require(name), module,module.exports);
 return module.exports;
}
const utils=load('src/lib/feed-utils.ts');
const view=load('src/lib/activity-presentation.ts',{'@/lib/feed-utils':utils});
const event=(id,kind,timestamp)=>({id,kind,timestamp,user:'Julie M.'});
test('activity: dates follow Paris midnight and yesterday across DST changes',()=>{
 assert.equal(view.activityDayKey('2026-10-29T23:30:00Z'),'2026-10-30');
 assert.equal(view.activityDayLabel('2026-10-30','2026-10-29T23:30:00Z'),'Aujourd’hui');
 assert.equal(view.activityDayLabel('2026-10-25','2026-10-26T00:15:00Z'),'Hier');
 assert.equal(view.activityDayLabel('2026-03-28','2026-03-28T23:15:00Z'),'Hier');
 assert.match(view.activityDayLabel('2025-10-25','2026-10-30T12:00:00Z'),/2025/);
});
test('activity: grouping sorts real dates, keeps distinct events and never mutates input',()=>{
 const events=[event('old','member_joined','2026-10-19T12:00:00Z'),event('b','member_sponsored','2026-10-29T23:30:00Z'),event('a','recommendation_created','2026-10-29T23:30:00Z')];
 const groups=view.groupActivityEvents(events,'all');
 assert.deepEqual(groups.map(g=>[g.day,g.items.map(e=>e.id)]),[['2026-10-30',['a','b']],['2026-10-19',['old']]]);
 assert.equal(events[0].id,'old');
 assert.deepEqual(view.groupActivityEvents(events,'members').flatMap(g=>g.items.map(e=>e.id)),['old']);
 assert.deepEqual(view.groupActivityEvents(events,'sponsorships').flatMap(g=>g.items.map(e=>e.id)),['b']);
 assert.deepEqual(view.groupActivityEvents(events,'recommendations').flatMap(g=>g.items.map(e=>e.id)),['a']);
 assert.deepEqual(view.groupActivityEvents([],'all'),[]);
});
test('activity: abbreviated identity is preserved and credited cents survive presentation',()=>{
 assert.deepEqual(view.activityCopy(event('1','member_joined','2026-10-30T12:00:00Z')),{name:'Julie M.',action:'a rejoint Winelio',initials:'JM'});
 const gain={...event('2','gain_credited','2026-10-30T12:00:00Z'),amount:300.25};
 assert.match(view.activityCopy(gain).action,/300,25/);
 assert.equal(view.activityCategory(gain.kind),'recommendations');
 assert.equal(view.activityCopy({...gain,user:'Un membre'}).initials,'');
 assert.equal(view.parseActivityFilter('unexpected'),'all');
 assert.equal(view.parseActivityFilter(null),'all');
});
test('activity: home remains selected on activity, unrelated navigation is not selected',()=>{
 const nav=load('src/lib/member-navigation.ts');
 assert.equal(nav.isMemberNavActive('/activity','/dashboard'),true);
 assert.equal(nav.isMemberNavActive('/activity','/network'),false);
 assert.equal(nav.isMemberNavActive('/recommendations/new','/recommendations'),true);
 assert.equal(nav.isActivityPath('/activity-other'),false);
});
