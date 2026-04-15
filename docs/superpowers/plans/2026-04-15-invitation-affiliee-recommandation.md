# Invitation affilié depuis le formulaire de recommandation — Plan d'implémentation

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ajouter une checkbox "Ce contact souhaite rejoindre le réseau Winelio" dans le formulaire de recommandation, qui envoie une invitation par email (avec le code parrain du recommandeur) après la création réussie de la recommandation.

**Architecture:** Deux fichiers modifiés uniquement. La checkbox est dans `StepContact.tsx` (visible pour nouveau contact ET contact existant sélectionné, masquée pour "pour moi-même"). L'état `wantsToJoin` est géré dans `page.tsx`. L'envoi utilise l'API existante `/api/network/send-invite` en fire & forget dans `handleSubmit`.

**Tech Stack:** Next.js 15 App Router, React, TypeScript, API route nodemailer existante

---

## Fichiers

| Fichier | Action |
|---------|--------|
| `src/app/(protected)/recommendations/new/StepContact.tsx` | Modifier — checkbox conditionnelle |
| `src/app/(protected)/recommendations/new/page.tsx` | Modifier — state + props + envoi invite |

---

### Task 1 : Ajouter la checkbox dans StepContact.tsx

**Files:**
- Modify: `src/app/(protected)/recommendations/new/StepContact.tsx`

#### Contexte

Le fichier actuel a une interface `StepContactProps` et deux zones d'affichage :
1. La liste contacts + bouton "Ajouter" + bouton "Pour moi-même" (quand `!createContact`)
2. Le formulaire de nouveau contact (quand `createContact`)

La checkbox doit apparaître :
- Sous la carte d'un contact existant sélectionné (dans la liste, quand `selectedContactId !== null`)
- Sous le formulaire de nouveau contact (quand `createContact`)
- Jamais quand "pour moi-même" est actif (`selfForMe`)

- [ ] **Step 1 : Ajouter `wantsToJoin` et `setWantsToJoin` à l'interface `StepContactProps`**

Remplacer la définition de l'interface (lignes 10-23 du fichier actuel) :

```typescript
interface StepContactProps {
  contacts: Contact[];
  selfProfile: SelfProfile | null;
  selfForMe: boolean;
  setSelfForMe: (v: boolean) => void;
  selectedContactId: string | null;
  setSelectedContactId: (id: string | null) => void;
  createContact: boolean;
  setCreateContact: (v: boolean) => void;
  contactForm: ContactFormData;
  setContactForm: (form: ContactFormData) => void;
  contactErrors: Record<string, string>;
  setContactErrors: (e: Record<string, string>) => void;
  wantsToJoin: boolean;
  setWantsToJoin: (v: boolean) => void;
}
```

- [ ] **Step 2 : Ajouter le composant `JoinNetworkCheckbox` avant `export const StepContact`**

```typescript
const JoinNetworkCheckbox = ({
  checked,
  onChange,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
}) => (
  <label className="flex items-start gap-3 cursor-pointer mt-4">
    <div
      onClick={() => onChange(!checked)}
      className={`mt-0.5 w-5 h-5 rounded flex items-center justify-center shrink-0 border-2 transition-all cursor-pointer ${
        checked
          ? "bg-gradient-to-br from-winelio-orange to-winelio-amber border-winelio-orange"
          : "border-gray-300 hover:border-winelio-orange/50"
      }`}
    >
      {checked && (
        <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
        </svg>
      )}
    </div>
    <span className="text-sm text-winelio-dark leading-relaxed">
      Ce contact souhaite rejoindre le réseau Winelio —{" "}
      <span className="text-winelio-gray">je lui enverrai une invitation par email avec mon code de parrainage.</span>
    </span>
  </label>
);
```

- [ ] **Step 3 : Destructurer `wantsToJoin` et `setWantsToJoin` dans `StepContact`**

La signature de la fonction `StepContact` (ligne `export const StepContact = ({`) :

```typescript
export const StepContact = ({
  contacts, selfProfile, selfForMe, setSelfForMe,
  selectedContactId, setSelectedContactId,
  createContact, setCreateContact,
  contactForm, setContactForm, contactErrors, setContactErrors,
  wantsToJoin, setWantsToJoin,
}: StepContactProps) => {
```

- [ ] **Step 4 : Ajouter la checkbox sous la carte du contact existant sélectionné**

Dans la zone `{!createContact}`, après le bloc `.map((c) => (...))` de la liste des contacts existants, ajouter la checkbox conditionnelle juste après la fermeture du `<>` du bloc contacts :

Avant (structure actuelle condensée) :
```tsx
{contacts.length > 0 && (
  <>
    <p className="text-xs font-semibold uppercase tracking-widest text-winelio-gray/60">Contacts existants</p>
    {contacts.map((c) => (
      <button key={c.id} onClick={() => { setSelectedContactId(c.id); setSelfForMe(false); }}
        ...>
        ...
      </button>
    ))}
    {selectedContactId && contacts.some((c) => c.id === selectedContactId) && (
      <JoinNetworkCheckbox checked={wantsToJoin} onChange={setWantsToJoin} />
    )}
    <Separator />
  </>
)}
```

Remplacer le bloc `{contacts.length > 0 && (...)}` existant par :

```tsx
{contacts.length > 0 && (
  <>
    <p className="text-xs font-semibold uppercase tracking-widest text-winelio-gray/60">Contacts existants</p>
    {contacts.map((c) => (
      <button key={c.id} onClick={() => { setSelectedContactId(c.id); setSelfForMe(false); }}
        className={`w-full flex items-center gap-3 rounded-2xl border-2 p-4 text-left transition-all cursor-pointer ${
          selectedContactId === c.id
            ? "border-winelio-orange bg-winelio-orange/5 shadow-sm shadow-winelio-orange/10"
            : "border-transparent bg-white hover:border-winelio-orange/20 shadow-sm"
        }`}>
        <Initials name={`${c.first_name} ${c.last_name}`} />
        <div className="min-w-0 flex-1">
          <p className="font-semibold text-winelio-dark">{c.first_name} {c.last_name}</p>
          <p className="text-sm text-winelio-gray truncate">{c.email}</p>
        </div>
        {selectedContactId === c.id && <SelectedBadge />}
      </button>
    ))}
    {selectedContactId && contacts.some((c) => c.id === selectedContactId) && (
      <JoinNetworkCheckbox checked={wantsToJoin} onChange={setWantsToJoin} />
    )}
    <Separator />
  </>
)}
```

- [ ] **Step 5 : Ajouter la checkbox en bas du formulaire de nouveau contact**

Dans la zone `{createContact}` (le `<div className="rounded-2xl border ...">` du formulaire), après le bloc `Field` du téléphone et avant la fermeture `</div>` :

```tsx
<JoinNetworkCheckbox checked={wantsToJoin} onChange={setWantsToJoin} />
```

Le formulaire complet modifié :

```tsx
<div className="rounded-2xl border border-winelio-gray/10 bg-white p-6 shadow-sm space-y-4">
  <div className="flex items-center justify-between">
    <p className="font-semibold text-winelio-dark">Nouveau contact</p>
    <button onClick={resetContactForm} className="text-xs text-winelio-gray hover:text-winelio-dark transition-colors cursor-pointer">Annuler</button>
  </div>
  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
    <Field label="Prénom" error={contactErrors.first_name}>
      <input type="text" value={contactForm.first_name} onChange={(e) => setField("first_name", e.target.value)}
        placeholder="Pierre" className={inputCls(!!contactErrors.first_name)} />
    </Field>
    <Field label="Nom" error={contactErrors.last_name}>
      <input type="text" value={contactForm.last_name} onChange={(e) => setField("last_name", e.target.value)}
        placeholder="Dupont" className={inputCls(!!contactErrors.last_name)} />
    </Field>
  </div>
  <Field label="Email" error={contactErrors.email}>
    <input type="email" value={contactForm.email} onChange={(e) => setField("email", e.target.value)}
      placeholder="pierre.dupont@email.com" className={inputCls(!!contactErrors.email)} />
  </Field>
  <Field label="Téléphone" error={contactErrors.phone}>
    <div className="flex gap-2">
      <select value={contactForm.country_code} onChange={(e) => setField("country_code", e.target.value)}
        className="rounded-xl border border-winelio-gray/20 px-2 py-3 text-sm bg-white focus:border-winelio-orange focus:outline-none focus:ring-2 focus:ring-winelio-orange/15 w-24 shrink-0 cursor-pointer">
        {COUNTRY_CODES.map(([code, label]) => (
          <option key={code} value={code}>{label} {code}</option>
        ))}
      </select>
      <input type="tel" value={contactForm.phone} onChange={(e) => setField("phone", e.target.value)}
        placeholder="6 12 34 56 78" className={inputCls(!!contactErrors.phone)} />
    </div>
  </Field>
  <JoinNetworkCheckbox checked={wantsToJoin} onChange={setWantsToJoin} />
</div>
```

- [ ] **Step 6 : Vérifier le build**

```bash
npm run build 2>&1 | grep -E "error|Error|✓ Compiled"
```

Expected : `✓ Compiled` sans erreur TypeScript.

- [ ] **Step 7 : Commit**

```bash
git add src/app/\(protected\)/recommendations/new/StepContact.tsx
git commit -m "feat(ui): checkbox invitation réseau dans le formulaire de recommandation

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

---

### Task 2 : Connecter l'état et l'envoi dans page.tsx

**Files:**
- Modify: `src/app/(protected)/recommendations/new/page.tsx`

#### Contexte

`page.tsx` orchestre les 3 étapes du wizard. Il contient l'état de chaque étape et `handleSubmit` qui crée la recommandation puis redirige. L'état `wantsToJoin` doit vivre ici. L'envoi de l'invitation se fait en fire & forget juste avant `router.push`, uniquement si `wantsToJoin && !selfForMe`.

- [ ] **Step 1 : Ajouter l'état `wantsToJoin` après les autres états de Step 1**

Après la ligne `const [contactErrors, setContactErrors] = useState<Record<string, string>>({});` :

```typescript
const [wantsToJoin, setWantsToJoin] = useState(false);
```

- [ ] **Step 2 : Passer `wantsToJoin` et `setWantsToJoin` à `StepContact`**

Remplacer le bloc `{step === 1 && (...)}` :

```tsx
{step === 1 && (
  <StepContact
    contacts={contacts}
    selfProfile={selfProfile}
    selfForMe={selfForMe}
    setSelfForMe={setSelfForMe}
    selectedContactId={selectedContactId}
    setSelectedContactId={setSelectedContactId}
    createContact={createContact}
    setCreateContact={setCreateContact}
    contactForm={contactForm}
    setContactForm={setContactForm}
    contactErrors={contactErrors}
    setContactErrors={setContactErrors}
    wantsToJoin={wantsToJoin}
    setWantsToJoin={setWantsToJoin}
  />
)}
```

- [ ] **Step 3 : Ajouter l'envoi de l'invitation dans `handleSubmit`**

Dans `handleSubmit`, remplacer la section finale (après la création de la recommandation, avant `router.push`) :

Avant :
```typescript
      if (recError) throw new Error("Erreur création recommandation");
      router.push(`/recommendations/${recommendation.id}`);
```

Après :
```typescript
      if (recError) throw new Error("Erreur création recommandation");

      // Envoi invitation Winelio si demandé (fire & forget)
      if (wantsToJoin && !selfForMe) {
        const contactEmail = createContact
          ? contactForm.email
          : contacts.find((c) => c.id === selectedContactId)?.email;
        if (contactEmail) {
          fetch("/api/network/send-invite", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ to: contactEmail }),
          }).catch((err) => console.error("[send-invite]", err));
        }
      }

      router.push(`/recommendations/${recommendation.id}`);
```

- [ ] **Step 4 : Vérifier le build**

```bash
npm run build 2>&1 | grep -E "error|Error|✓ Compiled"
```

Expected : `✓ Compiled` sans erreur TypeScript.

- [ ] **Step 5 : Tester manuellement sur http://localhost:3002**

1. Aller sur `/recommendations/new`
2. Créer un nouveau contact avec un email valide → la checkbox doit apparaître sous le formulaire
3. Cocher la checkbox → le carré devient orange avec ✓
4. Sélectionner un professionnel, remplir le projet, soumettre
5. Vérifier dans les logs PM2 qu'aucune erreur n'apparaît :
   ```bash
   pm2 logs winelio --lines 20 --nostream
   ```
6. Vérifier que l'email d'invitation arrive dans la boîte du contact
7. Tester avec un contact existant sélectionné → la checkbox doit aussi apparaître
8. Tester avec "Pour moi-même" → la checkbox ne doit PAS apparaître

- [ ] **Step 6 : Commit**

```bash
git add src/app/\(protected\)/recommendations/new/page.tsx
git commit -m "feat(action): envoyer invitation Winelio depuis la recommandation

Si le recommandeur coche 'Ce contact souhaite rejoindre le réseau',
une invitation est envoyée en fire & forget après création de la recommandation.
Utilise /api/network/send-invite avec le code parrain du recommandeur.

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```
