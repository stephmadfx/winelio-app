const assert=require('node:assert/strict');
const {test}=require('node:test');
const fs=require('node:fs'),vm=require('node:vm'),ts=require('typescript');
function load(file,mocks={}){const m={exports:{}};const code=ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}}).outputText;vm.runInThisContext(`(function(require,module,exports){${code}\n})`,{filename:file})(n=>n in mocks?mocks[n]:require(n),m,m.exports);return m.exports;}
const visibility=load('src/lib/network-visibility.ts');
const profiles=[
 {id:'real',is_demo:false,sponsor_id:null},
 {id:'apple',is_demo:true,sponsor_id:'real',demo_owner_id:null},
 {id:'member',is_demo:null,sponsor_id:'real'},
 {id:'member2',is_demo:false,sponsor_id:'member'},
 {id:'demo',is_demo:true,sponsor_id:'apple',demo_owner_id:'apple'},
 {id:'demo2',is_demo:true,sponsor_id:'demo',demo_owner_id:'apple'},
 {id:'other-demo',is_demo:true,sponsor_id:'apple',demo_owner_id:'other'},
 {id:'under-real-demo',is_demo:true,sponsor_id:'member',demo_owner_id:'member'},
].map(p=>({...p,first_name:'Fixture',last_name:'F',companies:[],onboarding_status:'active'}));
function fixture(id,role){
 const calls=[];const user=id?{id,app_metadata:{role}}:null;
 class Query{
  constructor(table){this.rows=[...(table==='profiles'?profiles:[])];this.n=Infinity;}
  select(){return this;} eq(k,v){this.rows=this.rows.filter(r=>r[k]===v);return this;}
  in(k,v){this.rows=this.rows.filter(r=>v.includes(r[k]));return this;}
  not(k,op,v){assert.equal(op,'is');this.rows=this.rows.filter(r=>r[k]!==v);return this;}
  limit(n){this.n=n;return this;} order(){return this;}
  maybeSingle(){return Promise.resolve({data:this.rows[0]??null,error:null});}
  then(resolve,reject){return Promise.resolve({data:this.rows.slice(0,this.n),count:this.rows.length,error:null}).then(resolve,reject);}
 }
 const client={auth:{getUser:async()=>({data:{user}})},from:t=>new Query(t),rpc:async(name,args)=>{calls.push(name);assert.equal(name,'get_display_network_ids');return {data:(args.p_user_id==='apple'?['demo','demo2']:['member','member2']).map(member_id=>({member_id})),error:null};}};
 const route=name=>load(`src/app/api/network/${name}/route.ts`,{'@/lib/supabase/server':{createClient:async()=>client},'@/lib/supabase/admin':{supabaseAdmin:client},'@/lib/network-visibility':visibility});
 return {client,calls,route};
}
const req=url=>new Request('https://winelio.app/api/network/'+url);
test('real network: tree removes review/demo branches, includes legacy null flags',async()=>{
 const f=fixture('real');const r=await f.route('tree').GET(req('tree'));assert.equal(r.status,200);
 const data=await r.json();assert.deepEqual(data.children.map(c=>c.id),['member']);assert.equal(data.children[0].childCount,1);assert.deepEqual(data.children[0].children.map(c=>c.id),['member2']);
});
test('demo network: Apple retains only its sandbox and nested children',async()=>{
 const f=fixture('apple');const data=await (await f.route('tree').GET(req('tree'))).json();assert.deepEqual(data.children.map(c=>c.id),['demo']);assert.equal(data.children[0].children[0].id,'demo2');
});
test('children endpoint and counters share the viewer scope',async()=>{
 for(const [actor,expected,count] of [['real','member',1],['apple','demo',1]]){
  const f=fixture(actor);const data=await (await f.route('children').GET(req('children?parentId='+actor))).json();assert.deepEqual(data.children.map(c=>c.id),[expected]);assert.equal(data.children[0].childCount,count);
 }
});
test('hidden review cannot be reopened through a direct URL or child endpoint',async()=>{
 const f=fixture('real');
 for(const [name,url] of [['tree','tree?userId=apple'],['children','children?parentId=apple'],['direct-referral-details','direct-referral-details?referralId=apple']])assert.equal((await f.route(name).GET(req(url))).status,403,name);
 assert(f.calls.every(name=>name==='get_display_network_ids'));
});
test('anonymous and non-admin real-scope overrides are rejected',async()=>{
 const f=fixture(null);for(const name of ['tree','children','direct-referral-details'])assert.equal((await f.route(name).GET(req(name))).status,401);
 assert.equal((await fixture('apple').route('tree').GET(req('tree?scope=real'))).status,403);
});
test('missing or failed viewer profile never falls back to a broader network',async()=>{
 await assert.rejects(visibility.getNetworkScope({from:()=>({select(){return this},eq(){return this},maybeSingle:async()=>({data:null,error:null})})},'missing'));
 const f=fixture('apple');assert.deepEqual(await visibility.getNetworkScope(f.client,'apple',true),{demoOwnerId:null});
 assert.deepEqual(await visibility.getNetworkScope(f.client,'demo'),{demoOwnerId:'apple'});
});
