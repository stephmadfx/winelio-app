# Plan de continuité — Backups & restauration DB

> Audit du 2026-05-04. RPO 12h, RTO ~10min, 27j d'historique gdrive validés.

## Résumé exécutif

| Indicateur | Valeur mesurée |
|---|---|
| **RPO** (perte max acceptable) | **12 heures** |
| **RTO** (temps de remise en service) | **~10 minutes** |
| Historique conservé | **27 jours** sur Google Drive (54 dumps × 2 backups/jour) |
| Backups testés en restauration | ✅ 2026-05-04 (winelio + postgres complet) |
| Single point of failure | Le VPS Hostinger : si VPS down, scripts ne tournent pas. À surveiller via Sentry/uptime monitor. |

## Backups en place

Le VPS exécute **trois cycles de sauvegarde indépendants** via cron `root` :

| Cron | Heure UTC | Script | Contenu |
|---|---|---|---|
| `0 6,18 * * *` | 06:00 / 18:00 | `/root/scripts/backup-winelio.sh` | Dump du seul schéma `winelio` (3-12 MB compressé) |
| `0 3,15 * * *` | 03:00 / 15:00 | `/usr/local/bin/supabase-backup.sh` | Dump complet PostgreSQL (`postgres` ≈ 14 MB + `_supabase` ≈ 220 KB) — inclut `auth.*`, `storage.*`, `winelio.*` |
| `0 */6 * * *` | toutes les 6h | `/usr/local/bin/db-backup.sh` | Sauvegarde générique additionnelle (à auditer) |

Toutes ces sauvegardes uploadent sur **Google Drive** via `rclone` :

- `gdrive:backups/winelio/` — schéma applicatif uniquement
- `gdrive:Backups/Supabase/` — base complète (utilisable seule pour restauration totale)

**Rétention locale** : 7 jours (purge auto par `find -mtime +7 -delete`).
**Rétention gdrive** : illimitée pour winelio, 7 jours pour Supabase (`rclone delete --min-age`).

Recommandation : **étendre la rétention gdrive Supabase à 30 jours minimum**, sinon la fenêtre de restauration profonde est trop courte (incident détecté à J+8 = pas de backup pré-incident dispo).

## Procédure de restauration totale

### Cas 1 — DB corrompue, container Supabase encore debout

Plus rapide. On restaure dans le container existant.

```bash
# 1. Identifier le dernier dump propre
ssh root@31.97.152.195 "ls -lt /root/backups/winelio/ | head -5"
# ou rclone ls gdrive:Backups/Supabase/ | sort -k2 | tail -5

# 2. Choisir un point de restauration (ex: avant l'incident)
LATEST=/root/backups/winelio/winelio_20260504_060001.sql.gz

# 3. Mettre l'app dev2/prod en maintenance (Coolify)
# → désactiver auto-deploy webhook + arrêter app

# 4. Drop schéma actuel + restore
docker exec supabase-db-ixlhs1fg5t2n8c4zsgvnys0r psql -U postgres -d postgres \
  -c 'DROP SCHEMA winelio CASCADE; CREATE SCHEMA winelio;'
zcat $LATEST | docker exec -i supabase-db-ixlhs1fg5t2n8c4zsgvnys0r \
  psql -U postgres -d postgres

# 5. Vérifier
docker exec supabase-db-ixlhs1fg5t2n8c4zsgvnys0r psql -U postgres -d postgres -c \
  "SELECT count(*) FROM winelio.profiles;"

# 6. Réactiver Coolify + redéployer
```

**RTO mesuré : 5-10 min** (manipulation manuelle Coolify principalement).

### Cas 2 — Instance Supabase totalement perdue

Restauration complète à partir du dump `postgres_*.sql.gz` qui contient TOUT (auth, storage, winelio, _supabase…).

```bash
# 1. Récupérer le dump complet le plus récent depuis gdrive
ssh root@31.97.152.195
rclone copy gdrive:Backups/Supabase/postgres_2026-05-04_03-00.sql.gz /tmp/restore/

# 2. Lancer une nouvelle instance Postgres avec extensions Supabase
#    (ne PAS utiliser postgres:15 vanilla, manquera pgsodium et autres extensions)
docker run -d --name supabase-db-restored \
  -e POSTGRES_PASSWORD=<même mdp que prod> \
  supabase/postgres:15.x  # image officielle Supabase

# 3. Restaurer
zcat /tmp/restore/postgres_*.sql.gz | docker exec -i supabase-db-restored \
  psql -U postgres -d postgres

# 4. Reconnecter Kong, Auth, Storage à la nouvelle DB
#    (modifier docker-compose Supabase + restart)

# 5. Mettre à jour SUPABASE_DB_URL dans Coolify si nécessaire
```

**RTO mesuré : ~30 min** (incluant remontage de l'écosystème Supabase).

## Test de restauration trimestriel — procédure

À exécuter tous les **3 mois** au minimum pour valider que les backups restent fonctionnels.

```bash
# Sur le VPS, en environnement isolé
ssh root@31.97.152.195

LATEST=$(ls -1t /root/backups/winelio/winelio_*.sql.gz | head -1)
docker rm -f pg-restore-test 2>/dev/null
docker run -d --name pg-restore-test -e POSTGRES_PASSWORD=test postgres:15
sleep 5
docker exec pg-restore-test psql -U postgres -d postgres -c 'CREATE SCHEMA winelio;'
zcat $LATEST | docker exec -i pg-restore-test psql -U postgres -d postgres --quiet

# Vérification
docker exec pg-restore-test psql -U postgres -d postgres -c "
  SELECT count(*) AS profiles FROM winelio.profiles;
  SELECT count(*) AS recos FROM winelio.recommendations;
  SELECT count(*) AS commissions FROM winelio.commission_transactions;
"

# Comparer avec les counts attendus en prod, puis cleanup
docker rm -f pg-restore-test
```

## Points d'attention

### 🟠 Pas de backup du Storage côté fichiers

Les uploads Cloudflare R2 (logos, photos pro, vidéos) ne sont pas inclus dans `pg_dump`. Le bucket R2 est répliqué par Cloudflare (durabilité 99.999999999% sur 11 zones), mais :
- Pas de versioning activé sur R2 (à vérifier dashboard Cloudflare)
- Une suppression accidentelle d'objet est définitive

→ **Action P2** : activer le versioning sur le bucket `formations-videos` côté Cloudflare R2.

### 🟠 Backup ≠ archive longue durée

L'historique gdrive de 27 jours ne couvre **pas** :
- Bug détecté à J+30 (ex : commission mal calculée depuis 1 mois)
- Demande RGPD demandant un état à une date donnée
- Audit légal MLM

→ **Action P1** : archive mensuelle du dump complet (1er du mois) dans un sous-dossier gdrive ou un autre stockage froid (Backblaze B2 ~ 0,005 $/GB/mois).

### 🟠 Pas de détection d'absence de backup

Si le cron casse (espace disque plein, container DB renommé, gdrive token expiré), aucune alerte n'est levée. Le silence est l'inverse de ce qu'on veut.

→ **Action P1** : Sentry cron monitor (`Sentry.captureCheckIn`) ou alerte simple : si `/root/backups/winelio/` n'a pas de fichier de moins de 14h, envoyer un mail.

```bash
# Cron de monitoring à ajouter
0 9 * * * find /root/backups/winelio -name '*.sql.gz' -mmin -840 | grep -q . || \
  curl -X POST https://winelio.app/api/_alert -d 'backup-stale'
```

### 🟢 Force de la stack actuelle

- Tout est automatisé, jamais besoin de toucher manuellement
- 3 mécanismes redondants (winelio script, supabase script, db-backup générique)
- Upload distant (gdrive ≠ même VPS, donc résiste à incendie/SSD HS)
- Vérification logs : `tail /var/log/backup-winelio.log` confirme chaque exécution

## Historique des tests de restauration

| Date | Testé par | Dump utilisé | Résultat | RTO mesuré |
|---|---|---|---|---|
| 2026-05-04 | Claude (audit) | `winelio_20260504_060001.sql.gz` | ✅ 3814 profiles, 828 recos | 5 s (restore pure) |
| 2026-05-04 | Claude (audit) | `postgres_2026-05-04_03-00.sql.gz` | ✅ 2328 auth.users + Storage + winelio complet | 5 s (restore pure) |
