import Link from "next/link";

const sections = [
  {
    title: "1. Objet",
    body:
      "Winelio est une plateforme de mise en relation professionnelle et de recommandations. Les présentes conditions encadrent l'utilisation du service, la création d'un compte et l'accès aux fonctionnalités de réseau, de mise en relation et de suivi.",
  },
  {
    title: "2. Accès au service",
    body:
      "L'accès à Winelio est réservé aux personnes majeures. En complétant votre profil, vous confirmez que les informations fournies sont exactes, à jour et que vous êtes autorisé à utiliser la plateforme dans votre pays de résidence.",
  },
  {
    title: "3. Création et usage du compte",
    body:
      "Vous vous engagez à ne créer qu'un seul compte par personne, à protéger vos identifiants, à ne pas usurper l'identité d'un tiers et à conserver vos informations de profil exactes, notamment votre date de naissance.",
  },
  {
    title: "4. Fonctionnalités de mise en relation et de gains",
    body:
      "Winelio peut permettre de générer des revenus, commissions ou avantages liés au réseau. Vous acceptez d'utiliser ces fonctionnalités conformément aux règles affichées dans l'application, sans fraude, sans manipulation du système et sans utilisation d'un compte mineur.",
  },
  {
    title: "5. Comportements interdits",
    body:
      "Sont notamment interdits: les informations fausses ou trompeuses, l'utilisation de robots ou d'automatisations non autorisées, les tentatives de contournement des contrôles d'âge ou de sécurité, les contenus illicites et toute action portant atteinte au fonctionnement du service.",
  },
  {
    title: "6. Données personnelles",
    body:
      "Winelio traite certaines données personnelles nécessaires au fonctionnement du service, à la sécurité du compte et au respect des obligations légales. Vous pouvez consulter les informations détaillées dans l'application et contacter le support pour exercer vos droits.",
  },
  {
    title: "7. Suspension et fermeture",
    body:
      "Winelio peut suspendre ou fermer un compte en cas de manquement aux présentes conditions, de fraude suspectée, de tentative de contournement des règles ou si les informations nécessaires à l'accès au service ne sont pas fournies.",
  },
];

export default function TermsPage() {
  return (
    <div className="mx-auto max-w-4xl px-4 py-10 sm:px-6 lg:px-8">
      <div className="rounded-[2rem] border border-border bg-white p-6 shadow-sm sm:p-8">
        <div className="space-y-3 border-b border-border pb-6">
          <p className="text-xs font-semibold uppercase tracking-[0.24em] text-winelio-orange">
            Winelio
          </p>
          <h1 className="text-3xl font-bold text-winelio-dark sm:text-4xl">
            Conditions Générales d'Utilisation
          </h1>
          <p className="max-w-2xl text-sm leading-7 text-winelio-gray">
            Version de travail applicable au moment de la complétion du profil.
            Ce texte peut être enrichi ou précisé en fonction des évolutions du service.
          </p>
        </div>

        <div className="space-y-6 py-6">
          {sections.map((section) => (
            <section key={section.title} className="space-y-2">
              <h2 className="text-lg font-semibold text-winelio-dark">{section.title}</h2>
              <p className="text-sm leading-7 text-winelio-gray">{section.body}</p>
            </section>
          ))}

          <section className="rounded-2xl border border-amber-200 bg-amber-50 p-5">
            <h2 className="text-lg font-semibold text-winelio-dark">8. Contact</h2>
            <p className="mt-2 text-sm leading-7 text-winelio-gray">
              Pour toute question liée à ces conditions, vous pouvez contacter l'équipe Winelio depuis l'application ou via le support habituel.
            </p>
          </section>
        </div>

        <div className="border-t border-border pt-6">
          <p className="text-xs leading-6 text-winelio-gray">
            En cochant la case dans votre profil, vous reconnaissez avoir lu ces conditions et les accepter pour utiliser Winelio.
          </p>
          <div className="mt-4 flex flex-wrap gap-3">
            <Link
              href="/profile"
              className="inline-flex items-center justify-center rounded-2xl bg-gradient-to-r from-winelio-orange to-winelio-amber px-4 py-3 text-sm font-semibold text-white shadow-sm hover:opacity-90"
            >
              Retour au profil
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
