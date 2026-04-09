# API Routes — Winelio

> Analyse froide des fichiers source. Généré le 2026-04-09.
> Toutes les routes sont sous `src/app/api/`.

---

## LÉGENDE

| Symbole | Signification |
|---------|--------------|
| `[PUBLIC]` | Accessible sans authentification |
| `[AUTH]` | Requiert session Supabase valide |
| `[ADMIN]` | Requiert `app_metadata.role === 'super_admin'` |
| `[ATOMIC]` | Exécutée via RPC PostgreSQL (transaction atomique) |

---

## AUTHENTIFICATION

### `POST /api/auth/send-code`
**Fichier** : `src/app/api/auth/send-code/route.ts`
**Accès** : `[PUBLIC]`

Génère un OTP à 6 chiffres et l'envoie par email.

**Body** :
```json
{ "email": "user@example.com" }
```

**Logique** :
1. Valide le format email
2. Génère code 6 chiffres (crypto.randomInt)
3. UPSERT dans `otp_codes` (TTL 10 min)
4. Envoie email HTML via nodemailer SMTP

**Réponse** :
```json
{ "success": true }
```

---

### `POST /api/auth/verify-code`
**Fichier** : `src/app/api/auth/verify-code/route.ts`
**Accès** : `[PUBLIC]`

Valide l'OTP, crée la session et assigne le parrain.

**Body** :
```json
{ "email": "user@example.com", "code": "123456", "sponsorCode": "ABC123" }
```

**Logique** :
1. Vérifie OTP dans `otp_codes` (code + expiration)
2. Supprime l'OTP de la table
3. `supabaseAdmin.auth.admin.generateLink()` → magic link
4. Échange le token via supabaseForSession
5. Stocke les cookies de session (HttpOnly)
6. Appelle `assignSponsorIfNeeded(userId, sponsorCode)`

**Réponse** :
```json
{ "success": true, "isNewUser": true }
```

---

### `GET /api/auth/callback`
**Fichier** : `src/app/api/auth/callback/route.ts`
**Accès** : `[PUBLIC]`

Callback PKCE après vérification email Supabase.

**Query params** : `?code=...`

**Logique** : Échange le code PKCE contre des tokens → redirect `/dashboard`.

---

### `POST /api/auth/assign-sponsor`
**Fichier** : `src/app/api/auth/assign-sponsor/route.ts`
**Accès** : `[AUTH]`

Assigne un parrain à un utilisateur existant sans parrain.

**Body** :
```json
{ "sponsorCode": "ABC123" }
```

---

### `POST /api/auth/sign-out`
**Fichier** : `src/app/api/auth/sign-out/route.ts`
**Accès** : `[AUTH]`

Déconnecte l'utilisateur. `supabase.auth.signOut()` + suppression cookies.

---

## RÉSEAU

### `GET /api/network/children`
**Fichier** : `src/app/api/network/children/route.ts`
**Accès** : `[AUTH]`

Retourne les enfants directs d'un utilisateur dans l'arbre MLM.

**Query params** : `?userId=...`

**Réponse** :
```json
{ "children": [{ "id": "...", "first_name": "...", "sponsor_code": "..." }] }
```

---

### `POST /api/network/send-invite`
**Fichier** : `src/app/api/network/send-invite/route.ts`
**Accès** : `[AUTH]`

Envoie un email d'invitation avec le lien de parrainage.

**Body** :
```json
{ "email": "prospect@example.com", "referralCode": "ABC123" }
```

---

### `POST /api/network/new-referral`
**Fichier** : `src/app/api/network/new-referral/route.ts`
**Accès** : `[AUTH]`

Notifie la chaîne de sponsors quand un nouveau filleul rejoint.

**Body** :
```json
{ "userId": "..." }
```

**Logique** : `notifyNewReferral(userId)` → emails jusqu'à 5 niveaux.

---

### `POST /api/network/assign-open-registration-sponsor`
**Fichier** : `src/app/api/network/assign-open-registration-sponsor/route.ts`
**Accès** : `[AUTH]`

Assigne le prochain sponsor par round-robin parmi les fondateurs.

**Logique** : RPC `get_next_open_registration_sponsor()` → UPDATE `profiles.sponsor_id`.

---

## RECOMMANDATIONS

### `POST /api/recommendations/complete-step`
**Fichier** : `src/app/api/recommendations/complete-step/route.ts`
**Accès** : `[AUTH]`

Marque une étape comme complétée. Déclenche les commissions à l'étape 6.

**Body** :
```json
{
  "recommendationId": "...",
  "stepIndex": 6,
  "data": { "amount": 5000 }
}
```

**Logique** :
1. Vérifie que l'utilisateur est autorisé (referrer ou professional)
2. UPDATE `recommendation_steps.completed_at = NOW()`
3. Si `stepIndex === 6` : appelle `createCommissions()` (idempotent)
   - INSERT dans `commission_transactions`
   - UPDATE `user_wallet_summaries`

---

## WALLET

### `POST /api/wallet/withdraw`
**Fichier** : `src/app/api/wallet/withdraw/route.ts`
**Accès** : `[AUTH]` `[ATOMIC]`

Traite une demande de retrait.

**Body** :
```json
{
  "amount": 150.00,
  "method": "bank_transfer",
  "details": { "iban": "FR76..." }
}
```

**Validations** :
- `amount > 0` et `amount <= available`
- `method` : `bank_transfer` ou `paypal`
- IBAN regex si bank_transfer
- Email valide si paypal

**Logique** : RPC `process_withdrawal()` (transaction atomique PostgreSQL).

---

## COMPTE

### `POST /api/account/delete`
**Fichier** : `src/app/api/account/delete/route.ts`
**Accès** : `[AUTH]`

Suppression complète du compte utilisateur.

**Logique** :
1. Récupère tous les enfants directs (sponsor_id = userId)
2. Réassigne les enfants vers le grand-parent
3. INSERT dans `deleted_sponsor_codes` (réservation permanente)
4. `supabaseAdmin.auth.admin.deleteUser(userId)` → cascade supprime le profil

---

## EMAIL

### `POST /api/email/welcome`
**Fichier** : `src/app/api/email/welcome/route.ts`
**Accès** : `[AUTH]`

Envoie l'email de bienvenue après inscription.

### `GET /api/email-template`
**Fichier** : `src/app/api/email-template/route.ts`
**Accès** : `[PUBLIC]` (debug uniquement)

Retourne le HTML d'un template email pour prévisualisation.

---

## SERVER ACTIONS

> Les Server Actions Next.js ne sont pas des endpoints REST mais des mutations serveur appelées depuis les composants React.

### `src/app/(protected)/profile/actions.ts`

| Fonction | Description | Tables |
|----------|-------------|--------|
| `updateProfile(formData)` | Met à jour first_name, last_name, phone, address, city, postal_code | `profiles` |
| `assignSponsor(sponsorCode)` | Assigne un parrain (vérifie `deleted_sponsor_codes`) | `profiles`, `deleted_sponsor_codes` |

### `src/app/gestion-reseau/actions.ts`

| Fonction | Accès | Description | Tables |
|----------|-------|-------------|--------|
| `advanceRecommendationStep(recoId, stepIndex, data?)` | `[ADMIN]` | Force l'avancement d'une étape | `recommendation_steps`, `commission_transactions` |
| `adjustCommission(userId, amount, notes)` | `[ADMIN]` | Ajustement manuel de commission | `commission_transactions`, `user_wallet_summaries` |
| `suspendUser(userId, suspend)` | `[ADMIN]` | Active/désactive un compte | `profiles` |
| `validateWithdrawal(withdrawalId, action, reason?)` | `[ADMIN]` | Valide ou rejette un retrait | `withdrawals`, `user_wallet_summaries` |

---

## RATE LIMITING

Middleware `src/middleware.ts` : **60 requêtes/minute par IP**.

```
Algorithme : fenêtre glissante en mémoire (Map<ip, {count, resetAt}>)
Seuil : 60 req/min
Réponse dépassement : 429 Too Many Requests
```

---

## PAGES (routes navigateur)

| Route | Fichier | Accès |
|-------|---------|-------|
| `/` | `app/page.tsx` | Public |
| `/auth/login` | `app/auth/login/page.tsx` | Public |
| `/auth/callback` | `app/auth/callback/page.tsx` | Public |
| `/dashboard` | `app/(protected)/dashboard/page.tsx` | Auth |
| `/profile` | `app/(protected)/profile/page.tsx` | Auth |
| `/recommendations` | `app/(protected)/recommendations/page.tsx` | Auth |
| `/recommendations/new` | `app/(protected)/recommendations/new/page.tsx` | Auth |
| `/recommendations/[id]` | `app/(protected)/recommendations/[id]/page.tsx` | Auth |
| `/network` | `app/(protected)/network/page.tsx` | Auth |
| `/network/stats` | `app/(protected)/network/stats/page.tsx` | Auth |
| `/wallet` | `app/(protected)/wallet/page.tsx` | Auth |
| `/wallet/history` | `app/(protected)/wallet/history/page.tsx` | Auth |
| `/wallet/withdraw` | `app/(protected)/wallet/withdraw/page.tsx` | Auth |
| `/companies` | `app/(protected)/companies/page.tsx` | Auth |
| `/companies/new` | `app/(protected)/companies/new/page.tsx` | Auth |
| `/settings` | `app/(protected)/settings/page.tsx` | Auth |
| `/gestion-reseau` | `app/gestion-reseau/page.tsx` | Super Admin |
| `/gestion-reseau/recommandations` | `app/gestion-reseau/recommandations/page.tsx` | Super Admin |
| `/gestion-reseau/recommandations/[id]` | `app/gestion-reseau/recommandations/[id]/page.tsx` | Super Admin |
| `/gestion-reseau/utilisateurs` | `app/gestion-reseau/utilisateurs/page.tsx` | Super Admin |
| `/gestion-reseau/utilisateurs/[id]` | `app/gestion-reseau/utilisateurs/[id]/page.tsx` | Super Admin |
| `/gestion-reseau/reseau` | `app/gestion-reseau/reseau/page.tsx` | Super Admin |
| `/gestion-reseau/retraits` | `app/gestion-reseau/retraits/page.tsx` | Super Admin |
| `/gestion-reseau/professionnels` | `app/gestion-reseau/professionnels/page.tsx` | Super Admin |
