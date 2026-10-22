// Isolated browser checks: no account, email or database writes. Run from the repo root.
const path=require('path'),fs=require('fs');
const root=process.cwd();
fs.mkdirSync('/tmp/winelio-city-harness',{recursive:true});
fs.writeFileSync('/tmp/winelio-city-harness/loader.cjs',"const ts = require(process.cwd() + '/node_modules/typescript');\nmodule.exports = source => ts.transpileModule(source,{compilerOptions:{jsx:ts.JsxEmit.ReactJSX,module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2020}}).outputText;\n");
fs.writeFileSync('/tmp/winelio-city-harness/entry.tsx',`import React from '${root}/node_modules/react'; import {createRoot} from '${root}/node_modules/react-dom/client'; import {StepProfessional} from '${root}/src/app/(protected)/recommendations/new/StepProfessional'; createRoot(document.getElementById('root')!).render(<StepProfessional userId={null} selectedProId={null} onSelect={()=>{}}/>);`);
require(root+'/node_modules/webpack')({mode:'development',plugins:[new (require(root+'/node_modules/webpack').DefinePlugin)({'process.env':JSON.stringify({NODE_ENV:'development'})})],entry:'/tmp/winelio-city-harness/entry.tsx',output:{path:'/tmp/winelio-city-harness',filename:'bundle.js'},resolve:{extensions:['.tsx','.ts','.js'],alias:{'@':path.join(root,'src')},modules:[path.join(root,'node_modules'),'node_modules']},module:{rules:[{test:/\.tsx?$/,exclude:/node_modules/,use:'/tmp/winelio-city-harness/loader.cjs'}]}},(err,stats)=>{if(err||stats.hasErrors()){console.error(err||stats.toString({all:false,errors:true}));process.exitCode=1}else runChecks()});

const {chromium,webkit,devices}=require(process.cwd()+'/node_modules/@playwright/test');
const assert=require('node:assert/strict');
async function runChecks(){
for(const [name,engine,device] of [['web',chromium,{}],['Android',chromium,devices['Pixel 7']],['iPhone',webkit,devices['iPhone 13']]]){
let browser;
try{browser=await engine.launch({headless:true})}catch(e){console.log(name+' unavailable: '+e.message.split('\n')[0]);continue}
const context=await browser.newContext({...device,permissions:['geolocation'],geolocation:{latitude:48.86,longitude:2.35}});const page=await context.newPage();let searches=[]; page.on('pageerror',e=>console.log('PAGE ERROR',e.message)); page.setDefaultTimeout(5000);
await page.route('https://city-check.test/**',r=>r.fulfill({contentType:'text/html',body:'<div id="root"></div><script>'+fs.readFileSync('/tmp/winelio-city-harness/bundle.js','utf8')+'</script>'}));
await page.route('**/api/recommendations/options',r=>r.fulfill({json:{categories:[],profile:{}}}));
await page.route('**/api/professionals/search',r=>{searches.push(r.request().postDataJSON());return r.fulfill({json:{professionals:[]}})});
let fail=false;
await page.route('https://geo.api.gouv.fr/**',r=>fail?r.fulfill({status:503}):r.fulfill({json:[{code:'69123',nom:'Lyon',codesPostaux:['69001','69003'],departement:{code:'69',nom:'Rhône'},centre:{coordinates:[4.8357,45.764]}}]}));
await page.goto('https://city-check.test/');const input=page.getByLabel('Ville ou code postal',{exact:true});
await input.fill('Ly');await page.getByRole('button').filter({has:page.getByText('Lyon',{exact:true})}).click();await page.waitForTimeout(450);assert.equal(searches.at(-1).latitude,45.764);assert.equal(searches.at(-1).commune,'Lyon');
await page.getByRole('button',{name:'Trouver les pros autour de moi'}).click();await page.waitForTimeout(450);assert.equal(searches.at(-1).commune,null);assert.equal(searches.at(-1).latitude,48.86);
await input.fill('69003');await page.getByRole('button').filter({has:page.getByText('Lyon',{exact:true})}).click();await page.waitForTimeout(450);assert.equal(searches.at(-1).longitude,4.8357);
await page.getByRole('button',{name:'Effacer la localisation'}).click();assert.equal(await input.inputValue(),'');
fail=true;await input.fill('Paris');await page.getByText('Recherche de villes indisponible.',{exact:false}).waitFor();
await page.screenshot({path:'/tmp/winelio-city-harness/'+name+'.png'});console.log(name+': city/postcode selection, GPS switch, clear, network error PASS');await browser.close();
}
}
process.on('unhandledRejection', e=>{console.error(e);process.exit(1)});
