# API Routes - Kiparlo

> Next.js 15 App Router API Routes

---

## Endpoints

### Auth

| Méthode | Route | Fichier | Auth | Description |
|---------|-------|---------|------|-------------|
| GET | `/api/auth/callback` | `src/app/api/auth/callback/route.ts` | Non | Échange le code PKCE contre une session Supabase. Redirige vers `/dashboard` ou `?next=` (protégé contre open redirect). |

### Wallet

| Méthode | Route | Fichier | Auth | Description |
|---------|-------|---------|------|-------------|
| POST | `/api/wallet/withdraw` | `src/app/api/wallet/withdraw/route.ts` | Oui | Crée une demande de retrait. Validation serveur du montant (10-10000 EUR), IBAN (regex), email PayPal. Vérifie le solde côté serveur avant d'insérer. |

### Recommendations

| Méthode | Route | Fichier | Auth | Description |
|---------|-------|---------|------|-------------|
| POST | `/api/recommendations/complete-step` | `src/app/api/recommendations/complete-step/route.ts` | Oui | Complète une étape de recommandation. Validation des rôles serveur (referrer/professional). Déclenche la création des commissions MLM 5 niveaux à l'étape 6. |

---

## Détail des Endpoints

### GET /api/auth/callback

**Query Parameters :**
| Param | Type | Default | Description |
|-------|------|---------|-------------|
| `code` | string | - | Code d'autorisation PKCE de Supabase |
| `next` | string | `/dashboard` | Path de redirection post-auth (validé : doit commencer par `/`, pas `//`) |

**Réponses :**
- `302` -> `{origin}{next}` (succès)
- `302` -> `/auth/login?error=auth_failed` (échec)

---

### POST /api/wallet/withdraw

**Headers :** Cookie de session Supabase (automatique)

**Body (JSON) :**
```json
{
  "amount": 50.00,
  "payment_method": "bank_transfer",
  "iban": "FR7612345678901234567890123",
  "paypal_email": null
}
```

| Champ | Type | Requis | Validation |
|-------|------|--------|------------|
| `amount` | number | Oui | Min 10, Max 10000, <= solde disponible |
| `payment_method` | string | Oui | `bank_transfer` ou `paypal` |
| `iban` | string | Si bank_transfer | Regex `^[A-Z]{2}\d{2}[A-Z0-9]{11,30}$` |
| `paypal_email` | string | Si paypal | Format email valide |

**Réponses :**
| Status | Body | Cas |
|--------|------|-----|
| 200 | `{"success": true}` | Retrait créé |
| 400 | `{"error": "..."}` | Validation échouée (montant, IBAN, solde) |
| 401 | `{"error": "Non authentifié"}` | Pas de session |
| 404 | `{"error": "Wallet introuvable"}` | Pas de wallet pour l'utilisateur |
| 500 | `{"error": "..."}` | Erreur serveur |

**Actions côté serveur :**
1. `SELECT available FROM user_wallet_summaries WHERE user_id = ?`
2. Vérification solde >= montant
3. `INSERT INTO withdrawals (...)`
4. `UPDATE user_wallet_summaries SET available = available - amount`

---

## Routes Pages (App Router)

### Publiques
| Route | Fichier | Type | Description |
|-------|---------|------|-------------|
| `/` | `app/page.tsx` | Server | Landing page |
| `/auth/login` | `app/auth/login/page.tsx` | Client | Formulaire magic link |
| `/auth/callback` | `app/auth/callback/page.tsx` | Client | Callback PKCE |

### Protégées (requièrent authentification)
| Route | Fichier | Type | Description |
|-------|---------|------|-------------|
| `/dashboard` | `app/(protected)/dashboard/page.tsx` | Server | Tableau de bord |
| `/recommendations` | `app/(protected)/recommendations/page.tsx` | Client | Liste recommandations |
| `/recommendations/new` | `app/(protected)/recommendations/new/page.tsx` | Client | Nouvelle recommandation |
| `/recommendations/[id]` | `app/(protected)/recommendations/[id]/page.tsx` | Client | Détail recommandation |
| `/network` | `app/(protected)/network/page.tsx` | Server | Vue réseau |
| `/network/stats` | `app/(protected)/network/stats/page.tsx` | Server | Stats réseau détaillées |
| `/wallet` | `app/(protected)/wallet/page.tsx` | Server | Vue wallet |
| `/wallet/withdraw` | `app/(protected)/wallet/withdraw/page.tsx` | Client | Demande retrait |
| `/wallet/history` | `app/(protected)/wallet/history/page.tsx` | Client | Historique transactions |
| `/companies` | `app/(protected)/companies/page.tsx` | Server | Liste entreprises |
| `/companies/new` | `app/(protected)/companies/new/page.tsx` | Server | Nouvelle entreprise |
| `/profile` | `app/(protected)/profile/page.tsx` | Server | Mon profil |

---

## Middleware

**Fichier :** `src/middleware.ts`

**Logique :**
```
Requête entrante
  ├── Non authentifié + route protégée -> 302 /auth/login
  ├── Authentifié + route /auth/* -> 302 /dashboard
  └── Sinon -> Passe la requête
```

**Matcher :** Toutes les routes sauf `_next/static`, `_next/image`, `favicon.ico`, fichiers media.
