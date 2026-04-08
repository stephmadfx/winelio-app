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

### Étape 3 : Devis accepté

| Élément | Détail |
|---------|--------|
| **Acteurs** | WINPRO + l'ami |
| **Action** | WINPRO & l'ami valident le deal — WINPRO notifie le montant du devis |
| **Notification** | WIN est informé du montant |

---

### Étape 4 : Prestation achevée

| Élément | Détail |
|---------|--------|
| **Acteur** | WINPRO |
| **Action** | WINPRO confirme la fin de prestation |
| **Notification** | WIN est informé |

---

### Étape 5 : Avis de l'ami

| Élément | Détail |
|---------|--------|
| **Acteur** | WIN |
| **Action** | WIN demande à son ami un retour sur la prestation |
| **Notification** | WIN reçoit l'avis et peut noter le WINPRO |

---

### Étape 6 : Facture acquittée

| Élément | Détail |
|---------|--------|
| **Acteur** | WINPRO |
| **Action** | WINPRO informe que sa facture est payée |
| **Notification** | Le siège Winelio envoie le lien de facturation |

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
  3. Devis accepté + montant
  4. Prestation achevée
  5. Avis de l'ami + notation WINPRO
  6. Facture acquittée → lien de facturation Winelio
```

---

## Acteurs

| Terme | Rôle |
|-------|------|
| **WIN** | Utilisateur standard — apporteur d'affaires / parrain |
| **WINPRO** | Professionnel — reçoit et gère les recommandations |
| **L'ami** | Contact de WIN — prospect / client final |
| **Siège Winelio** | Plateforme — émet les liens de facturation |
