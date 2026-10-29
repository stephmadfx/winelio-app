// Run locally: node --env-file=.env.local tests/regression/claim-onboarding-ui.cjs
// The local app must run with EMAIL_SENDING_ENABLED=false. No email is sent.
const { chromium, expect } = require('@playwright/test');
const { createClient } = require('@supabase/supabase-js');
const { randomBytes, randomUUID } = require('node:crypto');
const fs = require('node:fs');
const assert = require('node:assert/strict');
const base = process.env.CLAIM_TEST_BASE_URL || 'http://127.0.0.1:3012';
const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {db:{schema:'winelio'},auth:{persistSession:false,autoRefreshToken:false}});
const users = [], recs = [], report = [];
const tag = randomBytes(4).toString('hex');
const output = 'output/claim-onboarding-20261029'; fs.mkdirSync(output,{recursive:true});
function check(result,label) { if(result.error) throw new Error(label+': '+result.error.code); return result.data; }
async function fixture(label,sponsor) {
 const email=`claim-${label}-${tag}@winelio-e2e.local`, password=randomBytes(24).toString('hex');
 const data=check(await db.auth.admin.createUser({email,password,email_confirm:true,user_metadata:{app:'winelio',sponsor_code:sponsor.sponsor_code,first_name:'E2E',last_name:'Claim '+label,phone:'+336'+String(Math.floor(Math.random()*1e8)).padStart(8,'0'),address:'1 rue du Test',city:'Lyon',postal_code:'69001',birth_date:'1990-01-01',terms_accepted:true}}),'create fixture');
 const u={id:data.user.id,email,password}; users.push(u);
 check(await db.from('profiles').update({is_demo:true,terms_accepted:true,terms_accepted_at:new Date().toISOString()}).eq('id',u.id),'fixture profile');
 Object.assign(u,check(await db.from('profiles').select('sponsor_code,sponsor_id').eq('id',u.id).single(),'read fixture'));
 return u;
}
let browser,stage='initialization',pageForFailure;
(async()=>{
 try {
  const root=check(await db.from('profiles').select('id,sponsor_code').eq('is_founder',true).eq('is_active',true).limit(1).single(),'sponsor');
  const parent=await fixture('sponsor',root), imported=await fixture('imported',parent), owner=await fixture('owner',parent), stranger=await fixture('stranger',parent);
  const category=check(await db.from('categories').select('id').eq('is_hoguet',false).limit(1).single(),'category');
  const lookup=await fetch('https://recherche-entreprises.api.gouv.fr/search?q=443061841&page=1&per_page=1');
  const registered=(await lookup.json()).results?.[0]; assert(registered?.siege?.siret && registered.etat_administratif==='A','public registry verification required');
  const siret=registered.siege.siret;
  const source=check(await db.from('companies').insert({owner_id:imported.id,name:'E2E Claim Imported',alias:'#'+tag.slice(0,6),email:owner.email,source:'scraped',siret,category_id:category.id}).select('id').single(),'source company');
  const contact=check(await db.from('contacts').insert({user_id:parent.id,first_name:'Prospect',last_name:'Fixture',city:'Lyon'}).select('id').single(),'contact');
  for(let i=0;i<2;i++) recs.push(check(await db.from('recommendations').insert({referrer_id:parent.id,professional_id:imported.id,contact_id:contact.id,project_description:'E2E Claim fixture '+tag}).select('id').single(),'lead').id);
  const rid=recs[0];
  browser=await chromium.launch({headless:true});
  const ctx=await browser.newContext({viewport:{width:390,height:844}});
  await ctx.addInitScript(()=>localStorage.setItem('winelio_promo_watched_v2','1'));
  const page=await ctx.newPage();pageForFailure=page;
  stage='anonymous claim';await page.goto(base+'/claim/'+rid);
  await expect(page.getByRole('link',{name:'Créer mon compte particulier →'})).toBeVisible();
  stage='individual registration CTA';await page.getByRole('region',{name:'Gestion des cookies'}).getByRole('button',{name:'Continuer sans accepter'}).click();await page.getByRole('link',{name:'Créer mon compte particulier →'}).click();
  await expect(page.locator('#sponsor-code')).toHaveValue(parent.sponsor_code);
  assert(!await page.locator('#siret').count());
  assert(page.url().includes('returnTo='));
  report.push('Anonymous claim leads to individual signup with the correct sponsor and continuation');
  stage='login';await page.goto(base+'/auth/login?returnTo='+encodeURIComponent('/claim/'+rid));
  await page.locator('#email-pw').fill(owner.email);
  await page.locator('#password').fill(owner.password);
  await page.locator('form').filter({has:page.locator('#password')}).locator('button[type=submit]').click();
  await page.waitForURL(base+'/claim/'+rid,{timeout:30000});
  const before=check(await db.from('profiles').select('is_professional,pro_engagement_accepted,sponsor_id').eq('id',owner.id).single(),'before');
  assert.equal(before.is_professional,false); assert.equal(before.sponsor_id,parent.id);
  const denied=await page.request.post(base+'/api/claim/finalize',{data:{recommendationId:rid,companyId:randomUUID()}}); assert.equal(denied.status(),409);
  report.push('A personal account cannot recover the lead before its professional onboarding');
  stage='onboarding CTA';await page.getByRole('link',{name:'Créer ou compléter ma fiche professionnelle →'}).click();
  stage='work mode';await page.getByRole('button',{name:/Présentiel/}).click();
  await page.getByRole('button',{name:'Suivant →'}).click();
  await page.locator('select').selectOption(category.id);
  await page.getByPlaceholder('123 456 789 00012').fill(siret);
  await page.getByPlaceholder('contact@monentreprise.fr').fill(owner.email);
  await page.getByPlaceholder('N° contrat RC pro').fill('E2E-CLAIM-'+tag);
  await expect(page.getByRole('button',{name:'Suivant →'})).toBeEnabled({timeout:45000});
  await page.getByRole('button',{name:'Suivant →'}).click();
  const stillIndividual=check(await db.from('profiles').select('is_professional').eq('id',owner.id).single(),'before consent'); assert.equal(stillIndividual.is_professional,false);
  stage='consent';await page.locator('label').filter({hasText:/j.*accepte cet engagement/i}).click();
  await page.screenshot({path:output+'/professional-consent.png',fullPage:true});
  await page.getByRole('button',{name:/Devenir Pro/}).click();
  await page.waitForURL(base+'/claim/'+rid,{timeout:45000});
  await expect(page.getByRole('button',{name:'Récupérer ma recommandation →'})).toBeVisible();
  const completed=check(await db.from('profiles').select('is_professional,pro_engagement_accepted,sponsor_id').eq('id',owner.id).single(),'completed');
  assert.equal(completed.is_professional,true);assert.equal(completed.pro_engagement_accepted,true);assert.equal(completed.sponsor_id,parent.id);
  const ownCompany=check(await db.from('companies').select('id').eq('owner_id',owner.id).is('deleted_at',null).single(),'own company');
  await page.screenshot({path:output+'/claim-ready.png',fullPage:true});
  const outsiderCtx=await browser.newContext();const outsider=await outsiderCtx.newPage();
  assert.equal((await outsider.request.post(base+'/api/auth/login-password',{data:{email:stranger.email,password:stranger.password}})).status(),200);
  const unauthorized=await outsider.request.post(base+'/api/claim/finalize',{data:{recommendationId:rid,companyId:ownCompany.id}});assert.equal(unauthorized.status(),403);
  const alienCompany=await page.request.post(base+'/api/claim/finalize',{data:{recommendationId:rid,companyId:source.id}});assert.equal(alienCompany.status(),409);
  report.push('Explicit professional onboarding creates the company, preserves the sponsor and returns to the original claim; foreign accounts/companies cannot claim');
  await page.getByRole('button',{name:'Récupérer ma recommandation →'}).click();
  await page.waitForURL(base+'/recommendations/'+rid,{timeout:30000});
  await page.reload();
  assert.equal(check(await db.from('recommendations').select('professional_id').eq('id',rid).single(),'assigned lead').professional_id,owner.id);
  assert.equal(check(await db.from('recommendations').select('professional_id').eq('id',recs[1]).single(),'second lead').professional_id,owner.id);
  assert(check(await db.from('companies').select('deleted_at').eq('id',source.id).single(),'merged source').deleted_at);
  const retry=await page.request.post(base+'/api/claim/finalize',{data:{recommendationId:rid,companyId:ownCompany.id}});assert.equal((await retry.json()).alreadyClaimed,true);
  assert.equal(check(await db.from('profiles').select('sponsor_id').eq('id',owner.id).single(),'sponsor after claim').sponsor_id,parent.id);
  report.push('Atomic recovery persists after refresh, keeps every lead of the imported company and is idempotent; sponsor unchanged');
  const direct=createClient(process.env.NEXT_PUBLIC_SUPABASE_URL,process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,{db:{schema:'winelio'},auth:{persistSession:false}});
  await direct.auth.signInWithPassword({email:owner.email,password:owner.password});
  const forbidden=await direct.rpc('finalize_professional_claim',{p_recommendation_id:rid,p_user_id:owner.id,p_expected_professional_id:imported.id,p_source_company_id:source.id,p_destination_company_id:ownCompany.id});assert(forbidden.error,'authenticated RPC must be forbidden');
  report.push('Authenticated clients cannot call the privileged merge RPC directly');
  console.log(report.map(s=>'PASS '+s).join('\n'));
 } catch(e) { console.error('SCENARIO FAILURE stage='+stage,e.name,e.message.split('\n')[0]);if(pageForFailure)await pageForFailure.screenshot({path:output+'/failure.png',fullPage:true}).catch(()=>{});console.error(e.message.split('\n').filter(line=>line.includes('waiting for') || line.includes('intercepts pointer')).join('\n')); throw e; } finally {
  if(browser)await browser.close();
  const ids=users.map(u=>u.id),emails=users.map(u=>u.email),codes=users.map(u=>u.sponsor_code).filter(Boolean);
  if(ids.length){
   for(const table of ['email_queue','email_sent_log'])check(await db.from(table).delete().in('to_email',emails),'cleanup '+table);
   check(await db.from('pro_onboarding_events').delete().in('user_id',ids),'cleanup onboarding events');
   if(recs.length)check(await db.from('recommendations').delete().in('id',recs),'cleanup leads');
   check(await db.from('contacts').delete().in('user_id',ids),'cleanup contacts');
   check(await db.from('companies').delete().in('owner_id',ids),'cleanup companies');
   check(await db.from('commission_transactions').delete().in('user_id',ids),'cleanup commissions');
   check(await db.from('user_wallet_summaries').delete().in('user_id',ids),'cleanup wallets');
   check(await db.from('profiles').update({sponsor_id:null}).in('id',ids),'cleanup sponsor links');
   for(const u of users)check(await db.auth.admin.deleteUser(u.id),'cleanup auth');
   check(await db.from('profiles').delete().in('id',ids),'cleanup profiles');
   const remains=await db.from('profiles').select('id',{count:'exact',head:true}).in('id',ids);check(remains,'verify cleanup');assert.equal(remains.count,0);
   for(const u of users)assert((await db.auth.admin.getUserById(u.id)).error,'auth user must be removed');
   report.push('Cleanup verified: temporary Auth accounts, profiles, wallets, companies, leads, contacts, onboarding events and email rows removed');
   console.log('PASS cleanup verified');
  }
  fs.writeFileSync(output+'/ui-verification.json',JSON.stringify({checks:report,date:'2026-10-29'},null,2));
 }
})().catch(e=>{console.error('FAIL',e.name,e.message.split('\n')[0]);process.exitCode=1});
