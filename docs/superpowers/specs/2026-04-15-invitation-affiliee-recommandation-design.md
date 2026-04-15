# Spec — Invitation affilié depuis le formulaire de recommandation

**Date :** 2026-04-15
**Projet :** Winelio (`dev2`)
**Statut :** Approuvé — prêt pour implémentation

---

## Contexte

Quand un recommandeur crée une recommandation pour un contact (potentiel client d'un professionnel), il peut cocher une case indiquant que ce contact souhaite également rejoindre le réseau Winelio. Si coché, un email d'invitation est envoyé immédiatement après la création de la recommandation, avec le code parrain du recommandeur.

---

## Périmètre

- **Déclenché par :** la création d'une recommandation depuis `/recommendations/new`
- **Concerne :** les contacts humains uniquement — la case est masquée pour "pour moi-même"
- **Visible pour :** nouveau contact (formulaire) ET contact existant sélectionné
- **Email envoyé via :** l'API existante `/api/network/send-invite` (code parrain du recommandeur, template Winelio standard)

---

## État ajouté

Dans `page.tsx`, un nouveau state :

```typescript
const [wantsToJoin, setWantsToJoin] = useState(false);
```

Remis à `false` quand le recommandeur bascule vers "pour moi-même" (`setSelfForMe`).

---

## UI — Checkbox dans `StepContact.tsx`

La checkbox apparaît à deux endroits :

**1. Nouveau contact** — juste sous le champ téléphone, dans le formulaire `createContact` :

```
[ ] Ce contact souhaite rejoindre le réseau Winelio
    Je lui enverrai une invitation par email avec mon code de parrainage.
```

**2. Contact existant sélectionné** — juste sous la carte du contact sélectionné (quand `selectedContactId !== null`).

**Masquée** quand `selfForMe === true`.

**Style** : case carrée avec bordure `border-gray-300`, cochée = fond gradient orange (`from-winelio-orange to-winelio-amber`) + ✓ blanc. Identique à la checkbox d'engagement du wizard pro (`ProOnboardingWizard.tsx`).

---

## Logique d'envoi — `handleSubmit` dans `page.tsx`

Après la création réussie de la recommandation, avant la redirection :

```typescript
if (wantsToJoin) {
  const contactEmail = createContact
    ? contactForm.email
    : contacts.find((c) => c.id === selectedContactId)?.email;

  if (contactEmail) {
    fetch("/api/network/send-invite", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ to: contactEmail }),
    }).catch(console.error); // fire & forget
  }
}
```

L'invitation est envoyée en fire & forget — une erreur d'envoi n'annule pas la recommandation.

---

## Fichiers modifiés

| Fichier | Modification |
|---------|-------------|
| `src/app/(protected)/recommendations/new/page.tsx` | State `wantsToJoin` + props vers StepContact + appel send-invite dans handleSubmit |
| `src/app/(protected)/recommendations/new/StepContact.tsx` | Checkbox conditionnelle (nouveau contact + contact existant sélectionné, masquée pour selfForMe) |

Aucun nouveau fichier. Aucune migration DB. Aucune modification de l'API `/api/network/send-invite`.

---

## Hors scope v1

- Vérification si le contact est déjà inscrit sur Winelio (éviter doublon d'invitation)
- Message personnalisé joint à l'invitation
- Traçabilité de l'invitation dans la DB (colonne `invited_to_winelio` sur `contacts`)
