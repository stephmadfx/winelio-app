# Winelio — Charte Graphique
> Version 1.0 — Avril 2026

---

## 1. Logo

### Logotype
Le logo Winelio est composé de deux éléments indissociables :
- Un **W cursif** en dégradé orange → ambre
- Le mot **inelio** en Poppins Bold

Ces deux éléments forment un **lockup horizontal** et ne doivent jamais être séparés ni réarrangés.

### Fichiers disponibles
| Fichier | Usage |
|---|---|
| `svg/winelio-logo-color.svg` | Usage principal — fond clair ou transparent |
| `svg/winelio-logo-white.svg` | Fond sombre (blanc intégral) |
| `svg/winelio-logo-dark.svg` | Variante sombre sur fond clair |
| `svg/winelio-logo-tagline.svg` | Logo + tagline complet |
| `svg/winelio-icon.svg` | Icône W seul (app icon, favicon) |

### Taille minimale
- Lockup complet : **120px** de largeur minimum
- Icône W seul : **32px** minimum

### Zone de protection
Respecter un espace vide autour du logo équivalent à la **hauteur de la lettre "i"** de inelio.

---

## 2. Couleurs

### Palette principale

| Nom | Hex | RGB | CMYK (approx.) | Usage |
|---|---|---|---|---|
| **Orange Winelio** | `#FF6B35` | 255, 107, 53 | 0, 58, 79, 0 | Couleur principale, CTA, accents |
| **Ambre Winelio** | `#F7931E` | 247, 147, 30 | 0, 40, 88, 3 | Dégradé, complémentaire |
| **Charcoal** | `#2D3436` | 45, 52, 54 | 17, 4, 0, 79 | Texte principal, fonds sombres |
| **Gris ardoise** | `#3D4A52` | 61, 74, 82 | 26, 10, 0, 68 | Wordmark "inelio", texte doux |
| **Gris neutre** | `#636E72` | 99, 110, 114 | 13, 4, 0, 55 | Texte secondaire, tagline |
| **Blanc cassé** | `#F8F9FA` | 248, 249, 250 | 0, 0, 0, 2 | Fond principal de l'app |

### Dégradé signature
```
linear-gradient(135deg, #FF6B35 0%, #F7931E 100%)
```
Direction : 135° (gauche-haut → droite-bas) pour les aplats, 90° (gauche → droite) pour le W.

### Utilisation des couleurs

**Orange `#FF6B35`**
- W du logo (départ du dégradé)
- Boutons d'action principaux (CTA)
- Mot "Gagnez." dans la tagline
- Éléments actifs dans la navigation

**Charcoal `#2D3436`**
- Fonds sombres (sidebar, headers dark)
- Texte sur fond blanc quand on veut du poids

**Gris ardoise `#3D4A52`**
- Wordmark "inelio" sur fond blanc
- Légèrement moins lourd que le charcoal pur

---

## 3. Typographie

### Police principale : Poppins

Source : [Google Fonts — Poppins](https://fonts.google.com/specimen/Poppins)

| Graisse | Poids | Usage |
|---|---|---|
| **Poppins ExtraBold** | 800 | Titres hero, très grands affichages |
| **Poppins Bold** | 700 | Wordmark "inelio", titres, boutons |
| **Poppins SemiBold** | 600 | Sous-titres, labels importants |
| **Poppins Regular** | 400 | Corps de texte, tagline, descriptions |

### Caractéristiques
- Letter-spacing du wordmark : **-0.04em** (légèrement serré pour l'équilibre avec le W)
- Letter-spacing de la tagline : **+0.04em** (légèrement aéré)
- Antialiasing : `-webkit-font-smoothing: antialiased`

### Hiérarchie recommandée
```
Hero title   : Poppins 800 — 48-72px
Section title: Poppins 700 — 28-36px
Subtitle     : Poppins 600 — 18-22px
Body         : Poppins 400 — 14-16px
Caption      : Poppins 400 — 11-12px, letter-spacing +0.1em
```

---

## 4. Tagline

> **Recommandez. Connectez. Gagnez.**

- "Recommandez. Connectez." — Poppins Regular, couleur secondaire
- **"Gagnez."** — Poppins Bold, couleur Orange `#FF6B35`
- Casse : première lettre en majuscule par mot (pas tout en majuscules)

---

## 5. Formats disponibles

### SVG (vecteur)
Idéal pour Figma, Illustrator, Sketch. S'adapte à toute taille sans perte de qualité.
Note : la police Poppins est chargée via Google Fonts — prévoir une connexion internet ou embarquer la police localement.

### PNG (haute résolution)
Exportés à **2× la résolution affichée** (ex. : un logo 800px est exporté en 1600px réels).
Fond transparent disponible pour les versions "color" et "transparent".

### JPEG (95% qualité)
Avec fond blanc pour les versions transparentes. Idéal pour e-mails, documents Office.

---

## 6. Règles d'usage

### ✅ À faire
- Utiliser le fichier SVG en priorité
- Respecter les couleurs officielles (pas d'approximation)
- Conserver le ratio W/inelio tel quel
- Laisser la zone de protection autour du logo

### ❌ À ne pas faire
- Déformer ou étirer le logo
- Changer la couleur du W ou de "inelio"
- Séparer le W de "inelio"
- Placer le logo couleur sur un fond orange/gradient
- Réduire le logo sous 120px de large
- Utiliser une police différente de Poppins pour le mot "inelio"
- Ajouter un contour, ombre portée ou effet au logo

---

## 7. Couleurs à éviter en fond

| Fond | Logo recommandé |
|---|---|
| Blanc / clair | `winelio-logo-color.svg` |
| Sombre (#2D3436) | `winelio-logo-white.svg` |
| Orange / gradient | `winelio-logo-white.svg` (tout blanc) |
| Photo | Version blanche avec opacité si nécessaire |

---

*Winelio — Tous droits réservés — Avril 2026*
