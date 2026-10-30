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
const preferencesFile='src/app/api/feed/preferences/route.ts';
function fixture(user={id:'own-user'}) {
 const state={saved:[],error:null};
 const client={auth:{getUser:async()=>({data:{user}})},rpc:async(name,args)=>{state.saved.push([name,args]);return {error:state.error};}};
 const routes=load(preferencesFile,{'@/lib/supabase/server':{createClient:async()=>client}});
 return {state,client,...routes};
}
const request=body=>new Request('https://winelio.app/api/feed/preferences',{method:'PUT',body:JSON.stringify(body)});
test('preferences: anonymous requests are rejected before access',async()=>{
 const f=fixture(null);
 assert.equal((await f.GET()).status,401);
 assert.equal((await f.PUT(request({}))).status,401);
 assert.equal(f.state.saved.length,0);
});
test('preferences: reject malformed consent and frequency',async()=>{
 const f=fixture();
 for(const body of [null,{}, {share_activity:false,share_gains:true,daily_digest_frequency:1},
 {share_activity:'true',share_gains:false,daily_digest_frequency:1},
 ...[-1,3,1.5,'1',null].map(daily_digest_frequency=>({share_activity:true,share_gains:false,daily_digest_frequency}))]){
   assert.equal((await f.PUT(request(body))).status,400);
 }
 assert.equal(f.state.saved.length,0);
});
test('preferences: identity is determined by authenticated RPC, never supplied user_id',async()=>{
 const f=fixture();
 assert.equal((await f.PUT(request({user_id:'victim',share_activity:true,share_gains:true,daily_digest_frequency:2}))).status,200);
 assert.deepEqual(f.state.saved,[['set_feed_preferences',{p_share_activity:true,p_share_gains:true,p_frequency:2}]]);
});
test('preferences: DB failure cannot be announced as saved',async()=>{
 const f=fixture(); f.state.error={message:'private database detail'};
 const res=await f.PUT(request({share_activity:false,share_gains:false,daily_digest_frequency:0}));
 assert.equal(res.status,503); assert.doesNotMatch(await res.text(),/private database/);
});
test('feed: browser only receives sanitized projection fields and preserves cents',async()=>{
 const {getNationalFeed}=load('src/lib/national-feed.ts');
 const events=await getNationalFeed({rpc:async()=>({data:[{id:'public',kind:'gain_credited',display_name:'Julie M.',amount:'300.25',occurred_at:'2026-10-30T09:00:00Z',source_id:'private dossier',actor_id:'private user',phone:'private'}]})});
 assert.deepEqual(events,[{id:'public',kind:'gain_credited',user:'Julie M.',amount:300.25,timestamp:'2026-10-30T09:00:00Z'}]);
 const utils=load('src/lib/feed-utils.ts');
 assert.match(utils.feedEventLabel(events[0]),/300,25/);
 assert.match(utils.feedEventLabel({...events[0],kind:'member_joined'}),/rejoint Winelio/);
});
test('digest: authenticated access and dismiss errors handled without false success',async()=>{
 let user=null; const calls=[];
 const state={error:null};
 const client={auth:{getUser:async()=>({data:{user}})},rpc:async(name,args)=>{calls.push([name,args]);return {data:[],error:state.error};}};
 const route=load('src/app/api/feed/digest/route.ts',{'@/lib/supabase/server':{createClient:async()=>client}});
 assert.equal((await route.GET()).status,401);
 assert.equal((await route.DELETE(request({id:'bad'}))).status,401);
 user={id:'own'};
 assert.equal((await route.DELETE(request({id:'bad'}))).status,400);
 const id='40000000-0000-0000-0000-000000000001';
 assert.equal((await route.DELETE(request({id}))).status,200);
 assert.deepEqual(calls,[['dismiss_network_digest',{p_id:id}]]);
 state.error={message:'private detail'};
 const response=await route.DELETE(request({id}));
 assert.equal(response.status,503); assert.doesNotMatch(await response.text(),/private detail/);
 assert.equal((await route.GET()).status,503);
});
test('history: collective label is rendered without a member identity or amount',async()=>{
 const {getNationalFeed}=load('src/lib/national-feed.ts');
 const label='Du 30/09 au 29/10/2026 : 11 nouveaux membres confirmés ont rejoint Winelio.';
 const events=await getNationalFeed({rpc:async()=>({data:[{id:'summary',kind:'network_summary',display_name:label,amount:null,occurred_at:'2026-10-29T22:59:59Z',source_id:'private'}]})});
 assert.deepEqual(events,[{id:'summary',kind:'network_summary',label,timestamp:'2026-10-29T22:59:59Z'}]);
 assert.equal(load('src/lib/feed-utils.ts').feedEventLabel(events[0]),label);
});
