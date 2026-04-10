# Spec — Système de signalement de bugs (bêta)

**Date :** 2026-04-10  
**Statut :** Approuvé  
**Branche :** dev2

---

## Contexte

Lors du lancement en bêta, les testeurs ont besoin d'un moyen rapide de signaler un problème directement depuis l'app. Le support reçoit le rapport par email (avec screenshot), répond par email, et la réponse apparaît automatiquement dans l'app du bêta-testeur via Supabase Realtime.

---

## Fonctionnalités

### 1. Bouton flottant permanent
- Visible sur toutes les pages authentifiées (`(protected)/layout.tsx`)
- Position : `fixed bottom-20 right-4` (au-dessus de la nav mobile)
- Style : gradient Winelio (orange → amber), icône bug
- Badge orange quand une réponse non lue est disponible

### 2. Modal de signalement
- S'ouvre au clic sur le bouton flottant
- Capture automatique de l'écran avec `html2canvas` à l'ouverture
- Prévisualisation du screenshot capturé
- Bouton "Remplacer par mon screenshot" → input file (PNG/JPG/WebP, max 5 MB)
- Textarea pour décrire le problème
- Bouton Envoyer → POST `/api/bugs/report`

### 3. Notification de réponse
- Supabase Realtime écoute la table `bug_reports` filtrée par `user_id`
- Quand `status` passe à `'replied'` : toast affiché avec début de la réponse
- Clic sur "Voir" dans le toast → Dialog avec réponse complète
- Badge orange sur le bouton flottant jusqu'à lecture

---

## Architecture

### Base de données

Table `winelio.bug_reports` :

```sql
CREATE TABLE winelio.bug_reports (
  id             UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id        UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  message        TEXT NOT NULL,
  screenshot_url TEXT,           -- URL Supabase Storage (bucket bug-screenshots)
  page_url       TEXT,           -- URL de la page au moment du rapport
  status         TEXT DEFAULT 'pending', -- 'pending' | 'replied'
  admin_reply    TEXT,
  replied_at     TIMESTAMPTZ,
  created_at     TIMESTAMPTZ DEFAULT now()
);
```

RLS :
- `SELECT` : l'utilisateur ne voit que ses propres rapports (`user_id = auth.uid()`)
- `INSERT` : tout utilisateur authentifié peut insérer
- `UPDATE` : service role uniquement (cron IMAP)

Supabase Storage :
- Bucket `bug-screenshots` (privé)
- Accès via URL signée incluse dans l'email support

### Flux de soumission

```
Utilisateur clique "Envoyer"
  → POST /api/bugs/report
      1. Upload screenshot → Storage (bug-screenshots/{user_id}/{report_id}.webp)
      2. INSERT winelio.bug_reports
      3. nodemailer → support@winelio.app
         Subject: [Bug #UUID] Signalement - {page_url}
         Reply-To: support@winelio.app
         Corps: message + screenshot inline + lien Storage signé
```

### Flux de réponse (IMAP polling)

```
Vercel Cron toutes les 5 min → GET /api/bugs/imap-poll
  → Connexion IMAP OVH (support@winelio.app)
  → Recherche emails non lus avec sujet contenant [Bug #UUID]
  → Extraction UUID + corps de la réponse (texte brut)
  → UPDATE winelio.bug_reports
      SET status='replied', admin_reply=..., replied_at=now()
      WHERE id=UUID
  → Marque l'email comme lu (SEEN)
```

### Notification temps réel

```
BugReportButton (client) → Supabase Realtime
  → Canal: bug_reports filtrés par user_id courant
  → Événement UPDATE où status='replied'
  → Affiche toast + badge orange
  → Dialog réponse complète au clic
```

---

## Fichiers

### À créer

| Fichier | Rôle |
|---|---|
| `src/components/bug-report-button.tsx` | Bouton flottant + Modal + Dialog réponse + Realtime |
| `src/app/api/bugs/report/route.ts` | Upload Storage + INSERT DB + email support |
| `src/app/api/bugs/imap-poll/route.ts` | Cron IMAP — match UUID → UPDATE DB |
| `supabase/migrations/20260410_bug_reports.sql` | Table + RLS + bucket Storage |

### À modifier

| Fichier | Modification |
|---|---|
| `src/app/(protected)/layout.tsx` | Ajouter `<BugReportButton />` |

### Cron VPS (pas Vercel Cron — le projet est sur Coolify)

Ajouter un cron système sur le VPS (`crontab -e` en root) :

```bash
*/5 * * * * curl -s -X GET "https://dev2.winelio.app/api/bugs/imap-poll" \
  -H "Authorization: Bearer $CRON_SECRET" >> /var/log/imap-poll.log 2>&1
```

Variable d'env `CRON_SECRET` à définir dans Coolify pour sécuriser l'endpoint (la route vérifie le header avant d'exécuter le poll).

---

## Dépendances

```bash
npm install html2canvas imapflow
```

- `html2canvas` — capture écran côté client
- `imapflow` — client IMAP Node.js côté serveur (plus maintenu que `imap-simple`)

---

## Variables d'environnement

À ajouter dans Coolify (Build Variables pour `NEXT_PUBLIC_*`) :

```
IMAP_HOST=ssl0.ovh.net
IMAP_PORT=993
IMAP_USER=support@winelio.app
IMAP_PASS=<mot de passe support>
NEXT_PUBLIC_SUPABASE_STORAGE_BUCKET=bug-screenshots
CRON_SECRET=<secret aléatoire fort>
```

---

## Email envoyé au support

**Subject :** `[Bug #550e8400-e29b-41d4-a716-446655440000] Signalement - /dashboard`  
**From :** `support@winelio.app`  
**Reply-To :** `support@winelio.app`

Corps : charte visuelle Winelio (table HTML), screenshot inline, message du testeur, lien Storage signé, infos contextuelles (email utilisateur, page, date).

---

## Contraintes et limites

- Le cron IMAP est déclenché par un cron système VPS (crontab root) qui appelle `/api/bugs/imap-poll` via curl. L'endpoint est protégé par un header `Authorization: Bearer CRON_SECRET`.
- La réponse IMAP est extraite en texte brut (pas HTML) pour éviter la complexité du parsing.
- Un seul niveau de réponse supporté (pas de fil de conversation). Pour la bêta, c'est suffisant.
- Le screenshot est capturé côté client : les iframes et contenus cross-origin ne sont pas capturés par `html2canvas`.
