# Explicit integration check: creates isolated newsletter rows, sends no email,
# exercises public HTTP routes without cookies, and deletes/verifies all fixtures
# in finally. Requires the existing SSH access to the Winelio database.
# Usage: python3 tests/integration/newsletter-tracking.py https://winelio.app
import json, subprocess, uuid, secrets, urllib.request, urllib.parse, urllib.error, sys
campaign=str(uuid.uuid4()); recipient=str(uuid.uuid4()); token=secrets.token_hex(24)
email='tracking-'+campaign+'@winelio-e2e.local'
base=sys.argv[1] if len(sys.argv)>1 else 'https://winelio.app'
def db(query):
    p=subprocess.run(['ssh','-o','BatchMode=yes','root@31.97.152.195','docker exec -i supabase-db-ixlhs1fg5t2n8c4zsgvnys0r psql -v ON_ERROR_STOP=1 -U supabase_admin -d postgres -At'],input=query,text=True,capture_output=True)
    if p.returncode: raise RuntimeError('La requête de vérification a échoué')
    return p.stdout.strip()
class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self,*args): return None
opener=urllib.request.build_opener(NoRedirect())
def get(path):
    try: r=opener.open(urllib.request.Request(base+path,headers={'User-Agent':'Winelio anonymous tracking integration test'}),timeout=30)
    except urllib.error.HTTPError as e: r=e
    return r.code,r.headers,r.read()
def state():
    q=f"select json_build_object('recipients',recipient_count,'sent',sent_count,'opened',opened_count,'clicked',clicked_count) from winelio.newsletters where id='{campaign}';"
    return json.loads(db(q))
cleanup=False
try:
    db(f"BEGIN; INSERT INTO winelio.newsletters(id,subject,content,status,created_by,recipient_count,sent_count) SELECT '{campaign}','[TEST TEMPORAIRE] Suivi newsletter','Contrôle technique sans envoi','sent',created_by,1,1 FROM winelio.newsletters WHERE created_by IS NOT NULL ORDER BY created_at DESC LIMIT 1; INSERT INTO winelio.newsletter_recipients(id,newsletter_id,email,recipient_type,sent_at,unsubscribe_token) VALUES ('{recipient}','{campaign}','{email}','profile',now(),'{token}'); COMMIT;")
    for _ in range(2):
        code,headers,body=get('/api/newsletter/track/open/'+recipient)
        assert code==200 and headers['Content-Type'].startswith('image/gif') and body[:6]==b'GIF89a', 'Pixel bloqué ou invalide'
    assert state()=={'recipients':1,'sent':1,'opened':1,'clicked':0}, 'Le compteur des ouvertures ne progresse pas ou double-compte'
    print('PASS : pixel sans session ; deux ouvertures => un destinataire ouvert',flush=True)
    apple='https://apps.apple.com/fr/app/winelio/id6792769653'
    google='https://play.google.com/store/apps/details?id=app.winelio.mobile&hl=fr&gl=FR'
    for target,expected in [(apple,apple),(google.replace('&','&amp;'),google),(apple,apple)]:
        code,headers,body=get('/api/newsletter/track/click/'+recipient+'?u='+urllib.parse.quote(target,safe=''))
        assert code==307 and headers['Location']==expected, 'Mauvaise redirection de téléchargement'
    assert state()=={'recipients':1,'sent':1,'opened':1,'clicked':1}, 'Les clics ne remontent pas ou sont double-comptés'
    print('PASS : liens suivis Apple et Google sans session ; paramètres Google préservés ; trois clics => un destinataire',flush=True)
    for _ in range(2):
        code,headers,body=get('/api/newsletter/unsubscribe/'+token)
        assert code==200 and 'Désinscription confirmée'.encode() in body, 'Désinscription bloquée'
    assert db(f"select count(*) from winelio.newsletter_recipients where id='{recipient}' and unsubscribed_at is not null;")=='1'
    assert db(f"select count(*) from winelio.newsletter_suppressions where email='{email}';")=='1'
    print('PASS : désinscription sans session, persistée et répétable',flush=True)
    for path in ['/api/newsletters', '/api/admin/newsletters/'+campaign+'/stats']:
        code,headers,body=get(path)
        assert code==401, 'Route admin devenue publique'
    print('PASS : éditeur et statistiques restent protégés',flush=True)
finally:
    db(f"BEGIN; DELETE FROM winelio.newsletter_suppressions WHERE email='{email}'; DELETE FROM winelio.newsletter_events WHERE newsletter_id='{campaign}'; DELETE FROM winelio.newsletter_recipients WHERE newsletter_id='{campaign}'; DELETE FROM winelio.newsletters WHERE id='{campaign}'; COMMIT;")
    checks=db(f"select (select count(*) from winelio.newsletters where id='{campaign}')+(select count(*) from winelio.newsletter_recipients where newsletter_id='{campaign}')+(select count(*) from winelio.newsletter_events where newsletter_id='{campaign}')+(select count(*) from winelio.newsletter_suppressions where email='{email}')+(select count(*) from auth.users where email='{email}')+(select count(*) from winelio.profiles where email='{email}');")
    assert checks=='0','Résidus de test détectés'
    print('PASS : nettoyage vérifié, zéro résidu dans campagnes, destinataires, événements, désinscriptions, Auth et profils',flush=True)
