# Schema Base de Donnees - Winelio

> Supabase PostgreSQL (self-hosted via Coolify)
> Toutes les tables utilisent Row Level Security (RLS)

---

## Tables et Relations

```
┌─────────────────────────┐       ┌─────────────────────────┐
│       profiles          │       │      categories         │
├─────────────────────────┤       ├─────────────────────────┤
│ id            UUID [PK] │──┐    │ id            UUID [PK] │
│ first_name    TEXT       │  │    │ name          TEXT       │
│ last_name     TEXT       │  │    └──────────┬──────────────┘
│ full_name     TEXT       │  │               │
│ phone         TEXT       │  │               │ 1:N
│ address       TEXT       │  │               ▼
│ city          TEXT       │  │    ┌─────────────────────────┐
│ postal_code   TEXT       │  │    │      companies          │
│ is_professional BOOL     │  │    ├─────────────────────────┤
│ sponsor_code  TEXT [UQ]  │  │    │ id            UUID [PK] │
│ sponsor_id    UUID [FK]──│──┘    │ name          TEXT       │
│ avatar_url    TEXT       │  │    │ legal_name    TEXT       │
│ created_at    TIMESTAMP  │  │    │ email         TEXT       │
│ sponsored_by  TEXT       │  │    │ phone         TEXT       │
└─────────┬───────────────┘  │    │ website       TEXT       │
          │                  │    │ address       TEXT       │
          │ self-ref         │    │ city          TEXT       │
          │ sponsor_id       │    │ postal_code   TEXT       │
          └──────────────────┘    │ siret         TEXT       │
                                  │ is_verified   BOOL       │
          │                       │ category_id   UUID [FK]──│──> categories.id
          │ 1:N                   │ owner_id      UUID [FK]──│──> profiles.id
          ▼                       │ created_at    TIMESTAMP  │
┌─────────────────────────┐       └─────────────────────────┘
│       contacts          │
├─────────────────────────┤
│ id            UUID [PK] │
│ first_name    TEXT       │
│ last_name     TEXT       │
│ email         TEXT       │
│ phone         TEXT       │
│ created_by    UUID [FK]──│──> profiles.id
└─────────┬───────────────┘
          │
          │ 1:N
          ▼
┌──────────────────────────────┐      ┌─────────────────────────┐
│      recommendations         │      │        steps            │
├──────────────────────────────┤      ├─────────────────────────┤
│ id              UUID [PK]    │      │ id            UUID [PK] │
│ referrer_id     UUID [FK]────│──>   │ step_order    INT       │
│ professional_id UUID [FK]────│──>   │ name          TEXT       │
│ contact_id      UUID [FK]────│──>   │ description   TEXT       │
│ description     TEXT         │      │ completion_role TEXT     │
│ urgency         TEXT         │      └──────────┬──────────────┘
│ deal_amount     NUMERIC      │                 │
│ status          TEXT         │                 │ 1:N (template)
│ created_at      TIMESTAMP    │                 ▼
└──────────┬───────────────────┘      ┌──────────────────────────────┐
           │                          │   recommendation_steps       │
           │ 1:N                      ├──────────────────────────────┤
           └─────────────────────────>│ id              UUID [PK]    │
                                      │ recommendation_id UUID [FK]  │
                                      │ step_id          UUID [FK]───│──> steps.id
                                      │ step_order       INT         │
                                      │ completed        BOOL        │
                                      │ completed_at     TIMESTAMP   │
                                      │ data             JSONB       │
                                      └──────────────────────────────┘

┌──────────────────────────────┐
│   commission_transactions    │
├──────────────────────────────┤
│ id                UUID [PK]  │
│ recommendation_id UUID [FK]──│──> recommendations.id
│ user_id           UUID [FK]──│──> profiles.id (bénéficiaire)
│ source_user_id    UUID [FK]──│──> profiles.id (source)
│ amount            NUMERIC    │
│ level             INT        │   (1-5, NULL = referrer direct)
│ type              TEXT       │   (referrer | sponsor)
│ status            TEXT       │   (completed | pending | failed)
│ description       TEXT       │
│ created_at        TIMESTAMP  │
└──────────────────────────────┘

┌──────────────────────────────┐
│   user_wallet_summaries      │
├──────────────────────────────┤
│ user_id       UUID [PK/FK]───│──> profiles.id
│ available     NUMERIC        │   Solde disponible
│ pending       NUMERIC        │   En attente de validation
│ total_wins    NUMERIC        │   Total cumulé gagné
│ total_withdrawn NUMERIC      │   Total retiré
└──────────────────────────────┘

┌──────────────────────────────┐
│        withdrawals           │
├──────────────────────────────┤
│ id              UUID [PK]    │
│ user_id         UUID [FK]────│──> profiles.id
│ amount          NUMERIC      │
│ payment_method  TEXT         │   (bank_transfer | paypal)
│ payment_details JSONB        │   {iban: "..."} ou {email: "..."}
│ status          TEXT         │   (pending | processing | completed | failed)
│ created_at      TIMESTAMP    │
└──────────────────────────────┘

┌──────────────────────────────┐
│     compensation_plans       │
├──────────────────────────────┤
│ id              UUID [PK]    │
│ base_percentage NUMERIC      │   % commission de base
│ referrer_cut    NUMERIC      │   Part du recommandeur direct
│ level_1-5_cut   NUMERIC      │   Parts par niveau de parrainage
└──────────────────────────────┘
```

---

## Relations Clés

| Relation | Type | Description |
|----------|------|-------------|
| profiles -> profiles (sponsor_id) | Self-referencing N:1 | Chaîne de parrainage multi-niveaux |
| recommendations -> profiles (referrer_id) | N:1 | Qui recommande |
| recommendations -> profiles (professional_id) | N:1 | Le professionnel recommandé |
| recommendations -> contacts (contact_id) | N:1 | Le client à mettre en relation |
| recommendation_steps -> steps | N:1 | Template d'étape |
| commission_transactions -> recommendations | N:1 | Source de la commission |
| commission_transactions -> profiles (user_id) | N:1 | Bénéficiaire de la commission |
| companies -> profiles (owner_id) | N:1 | Propriétaire de l'entreprise |
| companies -> categories | N:1 | Catégorie d'activité |
| withdrawals -> profiles (user_id) | N:1 | Demandeur du retrait |

---

## Statuts

### recommendations.status
| Valeur | Description |
|--------|-------------|
| `pending` | En attente de traitement |
| `in_progress` | Étapes en cours |
| `completed` | Deal conclu, commissions créées |
| `cancelled` | Annulée |

### commission_transactions.status
| Valeur | Description |
|--------|-------------|
| `completed` | Commission validée |
| `pending` | En attente |
| `failed` | Échouée |

### withdrawals.status
| Valeur | Description |
|--------|-------------|
| `pending` | Demande créée |
| `processing` | En cours de traitement |
| `completed` | Virement effectué |
| `failed` | Échoué |
| `cancelled` | Annulé |
