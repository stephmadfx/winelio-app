# Workflow Recommandation Winelio

## Vue d'ensemble

Le parcours d'une recommandation se déroule en 2 grandes phases :
1. **Phase de recommandation** — WIN soumet une reco, WINPRO l'accepte/refuse/transfère
2. **Phase de suivi** — WINPRO documente l'avancement jusqu'à la facturation acquittée

---

## PHASE 1 — RECOMMANDATION

### Étape 1 : WIN recommande un Pro

| Élément | Détail |
|---------|--------|
| **Acteur** | WIN (le parrain / apporteur d'affaires) |
| **Action** | WIN fait une recommandation à un Pro pour une connaissance |
| **Notification Pro** | WINPRO reçoit uniquement la description du besoin (pas les coordonnées du contact) |
| **Astuce UX** | Info-bulle / cadre coloré : "Plus la demande est complète, plus le Pro répondra vite" |

---

### Étape 2 : WINPRO reçoit la recommandation

| Élément | Détail |
|---------|--------|
| **Acteur** | WINPRO (le professionnel ciblé) |
| **Actions possibles** | **Accepter** → reçoit les coordonnées de l'ami |
| | **Refuser** |
| | **Transférer** → invite un autre Pro (et gagne 1% de commission) |
| **Notification WIN** | WIN est informé de l'état : acceptée / refusée / transférée |
| **Astuce UX** | Inciter WINPRO à élargir son réseau en transférant |

---

## PHASE 2 — SUIVI DE LA RECO

> À tout moment la reco peut s'arrêter → WIN est informé + explication

### Étape 1 : Prise de contact

| Élément | Détail |
|---------|--------|
| **Acteur** | WINPRO |
| **Action** | WINPRO confirme qu'il a contacté l'ami |
| **Notification** | WIN est informé |

---

### Étape 2 : RDV pris

| Élément | Détail |
|---------|--------|
| **Acteur** | WINPRO |
| **Action** | WINPRO confirme le rendez-vous |
| **Notification** | WIN est informé |

---

### Étape 3 : Devis soumis puis accepté

| Élément | Détail |
|---------|--------|
| **Acteurs** | WINPRO puis le client final |
| **Action** | WINPRO saisit le montant et peut indiquer une date estimée facultative. Le client accepte ou conteste le devis via un lien sécurisé. |
| **Notification** | WIN est informé du montant |

---

### Étape 4 : Prestation achevée et paiement reçu

| Élément | Détail |
|---------|--------|
| **Acteurs** | WINPRO puis le client final |
| **Action** | WINPRO déclare la prestation terminée et le paiement reçu. Le client confirme la conformité ou signale un problème via son lien sécurisé. |
| **Notification** | WIN est informé |

---

### Étape 5 : Clôture et commission Winelio

| Élément | Détail |
|---------|--------|
| **Acteur** | Winelio + WINPRO |
| **Action** | Après confirmation du client, Winelio prépare le règlement de la commission d'intermédiation due par le professionnel. |
| **Notification** | WIN et WINPRO sont informés. |

---

## Résumé du flux

```
WIN → soumet reco (besoin uniquement)
         ↓
WINPRO → Accepte / Refuse / Transfère
         ↓ (si accepte)
[Suivi]
  1. Prise de contact confirmée
  2. RDV confirmé
  3. Devis soumis par WINPRO → accepté par le client via lien sécurisé
  4. Prestation + paiement déclarés par WINPRO → conformité confirmée par le client
  5. Clôture → règlement de la commission Winelio par WINPRO
```

---

## Acteurs

| Terme | Rôle |
|-------|------|
| **WIN** | Utilisateur standard — apporteur d'affaires / parrain |
| **WINPRO** | Professionnel — reçoit et gère les recommandations |
| **L'ami** | Contact de WIN — prospect / client final |
| **Siège Winelio** | Plateforme — émet les liens de facturation |
