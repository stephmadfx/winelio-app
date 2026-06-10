# Simulateur de gains v2 — refonte visuelle

**Date** : 2026-06-10 · **Validé par** : Steph

## Problème

Le simulateur actuel (`src/components/affiliate-simulator.tsx`, affiché sur /wallet) :
1. Calcule la part réseau avec **4 %/niveau** alors que le Plan Standard réel est **3 %/niveau** (sur-promesse de 33 %).
2. Demande de saisir 5 effectifs par niveau à l'aveugle (champs numériques bruts, pyramides incohérentes possibles).
3. Aucune notion d'activité réelle des filleuls, montant réseau couplé au montant direct.

## Design retenu (option « refonte complète visuelle »)

### Modèle
- Taux alignés Plan Standard : commission pro 10 % du deal, part directe 60 %, **3 %/niveau** (constantes commentées, source `winelio.compensation_plans`).
- Mode simple réseau : `filleuls directs` (0-20) × `duplication moyenne` (0-5) → effectifs N1-N5 géométriques ; `% actifs` (10-100) ; `recos/filleul actif/mois` ; `montant moyen réseau` séparé du direct.
- Mode expert : sliders d'effectifs par niveau, préremplis par le modèle géométrique (override).
- Gain niveau k = actifs_k × recos × (montant réseau × 10 %) × 3 %.

### Visualisations
- **Pyramide SVG 5 étages** : largeur proportionnelle aux effectifs actifs, étiquettes effectif + €/mois, animation CSS aux changements.
- **Courbe 12 mois (Recharts, AreaChart empilé)** : cumul direct + réseau, avec montée en puissance linéaire du réseau sur 12 mois (réseau complet seulement à M12 — projection honnête). Projection annuelle = cumul réel de la courbe (12×direct + 6,5×réseau).

### Contraintes
- Même export `AffiliateSimulator` sans props (intégration /wallet inchangée).
- Mobile d'abord (sliders, pas de champs numériques obligatoires), dark mode conservé, aucune nouvelle dépendance (recharts déjà présent).
