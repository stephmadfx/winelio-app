"use client";

import { useEffect, useRef } from "react";
import { driver, type Driver } from "driver.js";
import "driver.js/dist/driver.css";

// Visite guidée du dashboard, déclenchée à la première connexion uniquement.
// Le marquage de fin (tour_completed_at) se fait via /api/profile/complete-tour.
//
// Les éléments ciblés portent un attribut data-tour=<step>. On utilise des
// sélecteurs visibles uniquement sur desktop (lg:) ou mobile selon le cas — driver.js
// passe simplement à l'étape suivante si le sélecteur ne matche rien.

const markCompleted = () => {
  fetch("/api/profile/complete-tour", { method: "POST" }).catch(() => {});
};

export function DashboardTour() {
  const fired = useRef(false);

  useEffect(() => {
    if (fired.current) return;
    fired.current = true;

    // Petit délai pour laisser le dashboard se monter complètement (recharts, etc.)
    const t = setTimeout(() => {
      const d: Driver = driver({
        showProgress: true,
        progressText: "Étape {{current}} / {{total}}",
        nextBtnText: "Suivant →",
        prevBtnText: "← Précédent",
        doneBtnText: "C'est parti !",
        overlayColor: "rgba(45, 52, 54, 0.6)",
        overlayOpacity: 0.7,
        smoothScroll: true,
        allowClose: true,
        steps: [
          {
            popover: {
              title: "Bienvenue sur Winelio 👋",
              description:
                "On vous fait visiter en 30 secondes. Vous pouvez sortir à tout moment avec la croix.",
              align: "center",
            },
          },
          {
            element: '[data-tour="kpis"]',
            popover: {
              title: "Vos chiffres en un coup d'œil",
              description:
                "Recommandations en cours, gains totaux, taille de votre réseau et taux de succès. Tout est mis à jour en temps réel.",
              side: "bottom",
              align: "center",
            },
          },
          {
            element: '[data-tour="new-reco"]',
            popover: {
              title: "Démarrer une recommandation",
              description:
                "Le bouton principal : un parcours guidé en 8 étapes pour adresser un prospect à un professionnel de votre réseau.",
              side: "bottom",
              align: "end",
            },
          },
          {
            element: '[data-tour="sidebar-network"]',
            popover: {
              title: "Votre réseau MLM",
              description:
                "Visualisez les 5 niveaux de votre arbre de parrainage et invitez de nouveaux membres avec votre code unique.",
              side: "right",
              align: "start",
            },
          },
          {
            element: '[data-tour="sidebar-wallet"]',
            popover: {
              title: "Vos gains et retraits",
              description:
                "Le récap de vos commissions, la cagnotte Wins et la demande de retrait quand vous êtes prêt.",
              side: "right",
              align: "start",
            },
          },
          {
            element: '[data-tour="bug-button"]',
            popover: {
              title: "Un souci, une idée ?",
              description:
                "Cliquez ici pour nous écrire — on lit tout et on répond vite.",
              side: "left",
              align: "end",
            },
          },
          {
            popover: {
              title: "À vous de jouer 🚀",
              description:
                "Lancez votre première recommandation dès que vous êtes prêt. Bonne route avec Winelio !",
              align: "center",
            },
          },
        ],
        onDestroyed: () => {
          markCompleted();
        },
      });
      d.drive();
    }, 800);

    return () => clearTimeout(t);
  }, []);

  return null;
}
