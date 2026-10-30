-- Run only in an isolated empty PostgreSQL database.
CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;
CREATE SCHEMA auth; CREATE SCHEMA winelio;
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT nullif(current_setting('test.uid',true),'')::uuid $$;
CREATE FUNCTION auth.role() RETURNS text LANGUAGE sql STABLE AS $$ SELECT coalesce(nullif(current_setting('test.role',true),''),'authenticated') $$;
CREATE FUNCTION auth.jwt() RETURNS jsonb LANGUAGE sql STABLE AS $$ SELECT coalesce(nullif(current_setting('test.jwt',true),''),'{}')::jsonb $$;
CREATE TABLE winelio.profiles(id uuid PRIMARY KEY,first_name text,last_name text,avatar text,email text,sponsor_id uuid,is_demo boolean DEFAULT false,demo_owner_id uuid,created_at timestamptz DEFAULT now());
CREATE TABLE winelio.commission_transactions(id uuid,user_id uuid,amount numeric,status text,is_demo boolean,created_at timestamptz DEFAULT now());
CREATE TABLE winelio.recommendations(id uuid,referrer_id uuid,is_demo boolean,created_at timestamptz DEFAULT now());
INSERT INTO winelio.profiles(id,first_name,last_name,sponsor_id,is_demo,demo_owner_id) VALUES
 ('10000000-0000-0000-0000-000000000001','Real','Root',null,false,null),
 ('10000000-0000-0000-0000-000000000002','Real','Child','10000000-0000-0000-0000-000000000001',null,null),
 ('10000000-0000-0000-0000-000000000003','Real','Grandchild','10000000-0000-0000-0000-000000000002',false,null),
 ('6b484bab-4f15-4a46-9a97-dd262097e896','Apple','Review','10000000-0000-0000-0000-000000000001',false,null),
 ('20000000-0000-0000-0000-000000000001','Demo','Child','6b484bab-4f15-4a46-9a97-dd262097e896',true,'6b484bab-4f15-4a46-9a97-dd262097e896'),
 ('20000000-0000-0000-0000-000000000002','Demo','Grandchild','20000000-0000-0000-0000-000000000001',true,'6b484bab-4f15-4a46-9a97-dd262097e896'),
 ('20000000-0000-0000-0000-000000000003','Demo','OtherSandbox','6b484bab-4f15-4a46-9a97-dd262097e896',true,'30000000-0000-0000-0000-000000000001'),
 ('20000000-0000-0000-0000-000000000004','Demo','UnderReal','10000000-0000-0000-0000-000000000002',true,'10000000-0000-0000-0000-000000000002'),
 ('20000000-0000-0000-0000-000000000005','Real','BehindDemo','20000000-0000-0000-0000-000000000004',false,null);
UPDATE winelio.profiles SET email=id::text||'@example.invalid';
\ir ../../supabase/migrations/008_mlm_network_rpc.sql
\ir ../../supabase/migrations/20261030f_real_and_demo_networks.sql
\ir ../../supabase/migrations/20261030f_real_and_demo_networks.sql
CREATE FUNCTION check_test(ok boolean,label text) RETURNS void LANGUAGE plpgsql AS $$ BEGIN IF ok IS DISTINCT FROM TRUE THEN RAISE EXCEPTION 'FAIL: %',label; END IF; RAISE NOTICE 'PASS: %',label; END $$;
SELECT check_test((SELECT count(*)=9 FROM winelio.profiles),'migration preserves all profiles');
SELECT check_test((SELECT is_demo AND sponsor_id='10000000-0000-0000-0000-000000000001' FROM winelio.profiles WHERE id='6b484bab-4f15-4a46-9a97-dd262097e896'),'Apple flagged, sponsorship unchanged');
SELECT set_config('test.uid','10000000-0000-0000-0000-000000000001',false);
SELECT check_test((SELECT count(*)=2 AND max(depth)=2 FROM winelio.get_display_network_ids(auth.uid())),'real scope cuts every demo branch without promoting descendants');
SELECT check_test((SELECT count(*)=8 FROM winelio.get_network_ids(auth.uid())),'financial/history traversal unchanged');
SELECT check_test((SELECT count(*)=1 FROM winelio.get_display_network_ids(auth.uid(),1)),'depth limit respected');
SELECT check_test((SELECT count(*)=0 FROM winelio.get_display_network_ids(auth.uid(),0)),'zero depth empty');
SELECT check_test((SELECT count(*)=0 FROM winelio.get_display_network_ids('6b484bab-4f15-4a46-9a97-dd262097e896')),'real actor cannot read review sandbox RPC');
SELECT set_config('test.uid','6b484bab-4f15-4a46-9a97-dd262097e896',false);
SELECT check_test((SELECT count(*)=2 FROM winelio.get_display_network_ids(auth.uid())),'Apple retains own demo descendants, other sandbox excluded');
SELECT set_config('test.uid','20000000-0000-0000-0000-000000000001',false);
SELECT check_test((SELECT count(*)=1 FROM winelio.get_display_network_ids(auth.uid())),'demo descendant retains own branch');
SELECT set_config('test.uid','',false);
SELECT check_test((SELECT count(*)=0 FROM winelio.get_display_network_ids('10000000-0000-0000-0000-000000000001')),'anonymous read empty');
SELECT check_test(NOT has_function_privilege('anon','winelio.get_display_network_ids(uuid,integer)','EXECUTE'),'anon execution forbidden');
SELECT set_config('test.role','service_role',false);
SELECT check_test((SELECT count(*)=2 FROM winelio.get_display_network_ids('10000000-0000-0000-0000-000000000001')),'service anti-IDOR projection uses same real scope');
SELECT set_config('test.role','authenticated',false);
SELECT set_config('test.jwt','{"app_metadata":{"role":"super_admin"}}',false);
SELECT check_test((SELECT count(*)=2 FROM winelio.get_display_network_ids('10000000-0000-0000-0000-000000000001')),'admin projection authorized');
SELECT check_test((SELECT score=1 FROM winelio.leaderboard_top_sponsors('2000-01-01',100) WHERE user_id='10000000-0000-0000-0000-000000000001'),'direct ranking excludes Apple');
SELECT check_test((SELECT total_count=2 FROM winelio.leaderboard_top_network_total(100) WHERE user_id='10000000-0000-0000-0000-000000000001'),'total ranking cuts demo branches');
SELECT check_test(NOT EXISTS(SELECT 1 FROM winelio.leaderboard_top_network_total(100) l JOIN winelio.profiles p ON p.id=l.user_id WHERE p.is_demo),'demo roots absent from public ranking');
INSERT INTO winelio.commission_transactions(id,user_id,amount,status,is_demo) VALUES
 (gen_random_uuid(),'10000000-0000-0000-0000-000000000001',10,'EARNED',false),
 (gen_random_uuid(),'10000000-0000-0000-0000-000000000001',1000,'EARNED',true),
 (gen_random_uuid(),'6b484bab-4f15-4a46-9a97-dd262097e896',2000,'EARNED',false);
SELECT check_test((SELECT total_amount=10 FROM winelio.leaderboard_top_revenue('2000-01-01',100) WHERE user_id='10000000-0000-0000-0000-000000000001'),'demo amounts excluded from revenue ranking');
SELECT check_test(NOT EXISTS(SELECT 1 FROM winelio.leaderboard_top_revenue('2000-01-01',100) WHERE user_id='6b484bab-4f15-4a46-9a97-dd262097e896'),'demo actor excluded even if old transaction unflagged');
INSERT INTO winelio.recommendations(id,referrer_id,is_demo) VALUES
 (gen_random_uuid(),'10000000-0000-0000-0000-000000000001',false),
 (gen_random_uuid(),'10000000-0000-0000-0000-000000000001',true),
 (gen_random_uuid(),'6b484bab-4f15-4a46-9a97-dd262097e896',false);
SELECT check_test((SELECT reco_count=1 FROM winelio.leaderboard_top_recos('2000-01-01',100) WHERE user_id='10000000-0000-0000-0000-000000000001'),'recommendation ranking excludes demo data');
SELECT check_test(NOT EXISTS(SELECT 1 FROM winelio.leaderboard_top_recos('2000-01-01',100) WHERE user_id='6b484bab-4f15-4a46-9a97-dd262097e896'),'recommendation ranking excludes demo actor');
-- A broken cycle cannot repeat a member or loop forever.
UPDATE winelio.profiles SET sponsor_id='10000000-0000-0000-0000-000000000003' WHERE id='10000000-0000-0000-0000-000000000001';
SELECT set_config('test.uid','10000000-0000-0000-0000-000000000001',false);
SELECT check_test((SELECT count(*)=2 FROM winelio.get_display_network_ids(auth.uid(),999)),'cycle protected and depth bounded');
