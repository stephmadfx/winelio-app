import { readFileSync } from "fs";
import path from "path";

export type LegalDocumentMeta = {
  slug: string;
  title: string;
  description: string;
  fileName: string;
};

export const legalDocuments: LegalDocumentMeta[] = [
  {
    slug: "mentions-legales",
    title: "Mentions légales",
    description: "Identification de l'éditeur, hébergement, propriété intellectuelle et contact.",
    fileName: "01-mentions-legales.md",
  },
  {
    slug: "conditions-generales-utilisation",
    title: "Conditions Générales d'Utilisation",
    description: "Règles d'accès, de compte, de recommandation, de wallet et d'usage de Winelio.",
    fileName: "02-cgu-utilisateurs.md",
  },
  {
    slug: "conditions-professionnels",
    title: "Conditions Professionnels / CGV",
    description: "Commission d'intermédiation, paiement, facturation et obligations des professionnels.",
    fileName: "03-conditions-professionnels-cgv.md",
  },
  {
    slug: "programme-affiliation-rewards",
    title: "Programme d'affiliation et Winelio Rewards",
    description: "Répartition des commissions d'intermédiation, réseau MLM, Wins, retraits et règles anti-fraude.",
    fileName: "04-programme-affiliation-et-rewards.md",
  },
  {
    slug: "politique-confidentialite",
    title: "Politique de confidentialité",
    description: "Données personnelles, finalités, bases légales, destinataires, cookies et droits RGPD.",
    fileName: "05-politique-confidentialite.md",
  },
];

export const legalDocumentBySlug = (slug: string) =>
  legalDocuments.find((document) => document.slug === slug);

export const getLegalDocumentMarkdown = (slug: string) => {
  const document = legalDocumentBySlug(slug);

  if (!document) return null;

  const fullPath = path.join(process.cwd(), "docs", "legal-drafts", document.fileName);
  return readFileSync(fullPath, "utf8");
};
