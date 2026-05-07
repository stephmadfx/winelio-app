# Winelio — Routes API, Server Actions, Pages publiques

> Régénéré le 2026-05-07 depuis les fichiers source.
> Toutes les routes sont sous `src/app/api/`. Auth par défaut : session Supabase (cookie).

---

## Auth

| Méthode | URL | Auth | Logique |
|---|---|---|---|
| POST | `/api/auth/send-code` | public | Rate-limit 5/h/IP (bypass @winelio-e2e.local). Génère OTP 6 chiffres, stocke dans `public.otp_codes`, envoie email SMTP inline. Side-effect : email SMTP direct. |
| POST | `/api/auth/verify-code` | public | Vérifie OTP (max 5 attempts). Crée/trouve user via Pool pg direct (`SUPABASE_DB_URL`), pose session via SSR cookies. [DÉCLENCHE] `assignSponsorIfNeeded`. |
| POST | `/api/auth/reset-password` | public | Vérifie OTP + change mdp via admin API (Pool pg + GoTrue). |
| POST | `/api/auth/login-password` | public | Login email+mdp via GoTrue, pose cookies session. |
| POST | `/api/auth/set-password` | user | Met à jour mdp via `auth.admin.updateUserById`. |
| POST | `/api/auth/sign-out` | user | Invalide session GoTrue + efface cookies. |
| GET | `/api/auth/whoami` | user | Retourne `{ id, email }` de la session courante. |
| POST | `/api/auth/assign-sponsor` | user | Body `{ sponsorCode? }` — assigne sponsor si pas encore fait. |
| GET | `/api/auth/callback` | public | Callback PKCE legacy (redirect post-auth). |
| GET/POST | `/api/admin/auth-health` | public | Diagnostic fantômes (profils sans auth.users ou inversement), envoie alert email. Utilise Pool pg direct. |

---

## Recommendations

| Méthode | URL | Auth | Logique |
|---|---|---|---|
| POST | `/api/recommendations/create` | user | Body : `{ selectedContactId, selectedProId, description, urgency, selfForMe, createContact, selfProfile, contactForm }`. Crée reco + 7 recommendation_steps. [DÉCLENCHE] notifyNewRecommendation. |
| GET | `/api/recommendations/list` | user | `?tab=sent\|received` — liste recos du user (filtré referrer_id ou professional_id). |
| GET | `/api/recommendations/[id]` | user | Détail reco. Anonymat : identité pro masquée si status=PENDING. |
| POST | `/api/recommendations/complete-step` | user | Body `{ recommendation_id, step_id, quote_amount? }`. Valide étape (check completion_role REFERRER/PROFESSIONAL). Étape 6 → [DÉCLENCHE] Stripe checkout (stripe-checkout.ts). [DÉCLENCHE] notifyReferrerStep. |
| POST | `/api/recommendations/[id]/refuse` | user (pro) | Pro refuse la reco (status PENDING → CANCELLED). [DÉCLENCHE] notifyRecoRefused. |
| POST | `/api/recommendations/[id]/transfer` | user | Transfère la reco à un autre pro. [PERSISTE DANS] transferred_at, transfer_reason, original_recommendation_id. |
| POST | `/api/recommendations/process-followups` | Bearer CRON_SECRET | Cron 15min. Scanne followups pending échus, envoie relances, programme cycles 2/3, pose abandoned_by_pro_at après cycle 3. [UTILISE] notifyProFollowup, notifyProAbandoned. |
| GET/POST | `/api/recommendations/followup-action` | token HMAC | Actions email (done/postpone/abandon). GET=done/redirect, POST=confirmation postpone/abandon. [UTILISE] verifyFollowupToken. |
| POST | `/api/recommendations/cron-scraped-reminder` | Bearer CRON_SECRET | Relances pros scrapés 12h après création (si email placeholder et pas ouvert). 24h après → alerte referrer. [UTILISE] notifyScrapedReminder, notifyReferrerNoResponse. |

---

## Stripe

| Méthode | URL | Auth | Logique |
|---|---|---|---|
| POST | `/api/stripe/setup-intent` | user | Crée/récupère Stripe Customer, retourne client_secret d'un SetupIntent. |
| POST | `/api/stripe/payment-method` | user | Body `{ setupIntentId }`. Persiste payment_method sur profiles (brand, last4, saved_at). |
| GET | `/api/stripe/cron-reminders` | Bearer CRON_SECRET | Relances sessions pending : J+2 → email reminder, J+4 → email alert. [UTILISE] notifyCommissionPayment. |
| POST | `/api/stripe/webhook` | Stripe signature | `checkout.session.completed` → idempotence via stripe_payment_sessions → [DÉCLENCHE] createCommissions + recalculateWallet. |

---

## Network MLM

| Méthode | URL | Auth | Logique |
|---|---|---|---|
| GET | `/api/network/tree` | user | `?userId&maxLevel=5`. Anti-IDOR : vérifie que userId est dans le réseau du user. Construit l'arbre récursivement. [UTILISE] RPC get_network_ids. |
| GET | `/api/network/children` | user | `?parentId` — filleuls directs d'un nœud. |
| GET | `/api/network/user-events` | user | Feed événements réseau (recos actives des membres). |
| POST | `/api/network/send-invite` | user | Body `{ email, message? }`. Enqueue email d'invitation avec lien `?ref=CODE`. |
| POST | `/api/network/new-referral` | user | Notifie le parrain (envoi email notifyNewReferral). |
| POST | `/api/network/assign-open-registration-sponsor` | user | Assigne un fondateur via round-robin si pas de parrain. |

---

## Wallet

| Méthode | URL | Auth | Logique |
|---|---|---|---|
| POST | `/api/wallet/withdraw` | user | Body `{ amount, iban }`. Validation côté serveur (min 10€, max 10 000€, IBAN regex). Calcul frais (0,25€ si < 50€). Appelle RPC `process_withdrawal` (atomic, SECURITY DEFINER). |

---

## Profile

| Méthode | URL | Auth | Logique |
|---|---|---|---|
| POST | `/api/profile/avatar` | user | FormData `{ file }`. Upload vers R2 via r2-avatars.ts, MAJ colonne `profiles.avatar`. Max 5 Mo. |
| GET | `/api/profile/payment-method-status` | user | Retourne `{ hasPaymentMethod: bool }`. |
| POST | `/api/profile/complete-tour` | user | MAJ `profiles.tour_completed_at = now()`. |
| GET | `/api/avatars/[...path]` | user | Stream avatar R2 (accès : owner, sponsor N1, super_admin). Réponse : stream image. |

---

## Claim

| Méthode | URL | Auth | Logique |
|---|---|---|---|
| POST | `/api/claim/finalize` | user | Body `{ recommendationId }`. Lie user connecté à la company scraped associée à la reco. Vérifie anti-clash (pas déjà claimée). |

---

## Email & Tracking

| Méthode | URL | Auth | Logique |
|---|---|---|---|
| POST | `/api/email/process-queue` | Bearer CRON_SECRET | Dépile email_queue par lots de 10. Skip @winelio-e2e.local (status = test_skipped). Retry delays : 5/30/120 min. |
| POST | `/api/email/welcome` | user | Enqueue email de bienvenue pour le user connecté. |
| GET | `/api/email-template` | public | Retourne HTML du template email OTP (utilisé dans email client preview). |
| GET | `/api/email-template/preview` | public | Preview de template paramétré. |
| GET | `/api/email-track/open` | public | Pixel 1x1 — MAJ `email_opened_at` si null (premier clic uniquement). Retourne pixel transparent. |
| GET | `/api/email-track/click` | public | `?rid=recoId`. MAJ `email_clicked_at` si null, puis redirect vers `/recommendations/[rid]`. |

---

## Bugs

| Méthode | URL | Auth | Logique |
|---|---|---|---|
| POST | `/api/bugs/report` | user | FormData `{ message, screenshot?, pageUrl }`. Upload screenshot vers bucket bug-screenshots si fourni. Insère bug_reports. Enqueue email notification admin. |
| GET | `/api/bugs/imap-poll` | Bearer CRON_SECRET | Polling IMAP support@winelio.app. Crée bug_reports depuis emails non lus, upload pièces jointes R2, envoie accusé de réception. |
| GET | `/api/bugs/imap-debug` | Bearer CRON_SECRET | Test connexion IMAP (diagnostic). |

---

## Admin

| Méthode | URL | Auth | Logique |
|---|---|---|---|
| POST | `/api/admin/scraping/import` | super_admin | Body `{ rows: [...] }`. Import batch companies scrapées — crée profile factice + company pour chaque ligne (source='scraped'). |

---

## Demo

| Méthode | URL | Auth | Logique |
|---|---|---|---|
| POST | `/api/demo/seed-network` | user (DEMO_MODE) | Appelle `winelio.seed_demo_network(userId)` — génère réseau MLM 4-5 niveaux fictif. Idempotent. |
| GET | `/api/demo/status` | user (DEMO_MODE) | Retourne statut du réseau demo (présent ou non). |

---

## Staging & Vidéo

| Méthode | URL | Auth | Logique |
|---|---|---|---|
| POST | `/api/staging-auth` | public | Body `{ password }`. Vérifie STAGING_PASSWORD, pose cookie httpOnly. |
| GET | `/api/video/promo` | public | Stream vidéo `public/promo.mp4` avec support Range header. |

---

## Account

| Méthode | URL | Auth | Logique |
|---|---|---|---|
| POST | `/api/account/delete` | user | RGPD : sauvegarde sponsor_code dans deleted_sponsor_codes, réassigne enfants au grand-parent, supprime user via admin API. |

---

## Server Actions (fichiers `actions.ts`)

| Fichier | Fonctions | Auth | Description |
|---|---|---|---|
| `src/app/gestion-reseau/recommandations/[id]/actions.ts` | `addRecoAnnotation`, `deleteRecoAnnotation` | super_admin | Ajoute/supprime annotation sur reco ou étape. [PERSISTE DANS] recommendation_annotations. |
| `src/app/gestion-reseau/documents/actions.ts` | `addAnnotation`, `fillPlaceholder`, `publishDocument` | super_admin | Annotations CGU + remplissage placeholders + publication. |
| `src/app/gestion-reseau/processus/actions.ts` | `addFlowAnnotation`, `deleteFlowAnnotation` | super_admin | Annotations sur nœuds des organigrammes process. [PERSISTE DANS] process_flow_annotations. |
| `src/app/gestion-reseau/utilisateurs/[id]/audit-actions.ts` | `verifyDocumentIntegrity` | super_admin | Vérifie hash d'un document signé (audit trail). [UTILISE] lib/audit.ts. |

---

## Pages publiques notables (sans API)

| Route | Description |
|---|---|
| `/claim/[recommendationId]` | Page claim pro scrappé. Affiche info reco, bouton pour s'inscrire/se connecter et finaliser via `ClaimButton.tsx` → `/api/claim/finalize`. |
| `/conditions-generales-utilisation` | CGU publiques (rendu statique). |
| `/recommendations/followup/[token]/postpone` | Formulaire report relance (token HMAC). Appelle POST `/api/recommendations/followup-action`. |
| `/recommendations/followup/[token]/abandon` | Confirmation abandon (token HMAC). Appelle POST `/api/recommendations/followup-action`. |
| `/staging-login` | Formulaire mot de passe basique staging. |
| `/auth/login` | Saisie email (OTP ou password). |
| `/auth/verify` | Saisie code OTP. |

---

## Crons à configurer côté infra

| Endpoint | Fréquence | Description |
|---|---|---|
| POST `/api/recommendations/process-followups` | Toutes les 15 min | Relances pro |
| POST `/api/email/process-queue` | Toutes les 5 min | Envoi SMTP |
| GET `/api/stripe/cron-reminders` | Toutes les heures | Relances paiement Stripe |
| POST `/api/recommendations/cron-scraped-reminder` | Toutes les heures | Relances pros scrapés |
| GET `/api/bugs/imap-poll` | Toutes les 15 min | Polling IMAP support |