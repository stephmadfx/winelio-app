import Link from "next/link";

export default function Home() {
  return (
    <div className="min-h-screen bg-kiparlo-dark flex flex-col items-center justify-center px-4">
      <div className="text-center max-w-2xl">
        {/* Logo text */}
        <h1 className="text-6xl md:text-8xl font-extrabold tracking-tight mb-4">
          <span className="text-white">KI</span>
          <span className="bg-gradient-to-r from-kiparlo-orange to-kiparlo-amber bg-clip-text text-transparent">
            PAR
          </span>
          <span className="text-white">LO</span>
        </h1>

        <p className="text-kiparlo-gray text-lg md:text-xl tracking-[0.3em] uppercase mb-12">
          Recommandez. Gagnez.
        </p>

        <p className="text-gray-400 text-lg mb-10 leading-relaxed">
          Recommandez des professionnels de confiance et gagnez des commissions
          sur chaque affaire conclue. Jusqu&apos;à 5 niveaux de parrainage.
        </p>

        <div className="flex flex-col sm:flex-row gap-4 justify-center">
          <Link
            href="/auth/login"
            className="px-8 py-4 bg-gradient-to-r from-kiparlo-orange to-kiparlo-amber text-white font-semibold rounded-xl text-lg hover:opacity-90 transition-opacity"
          >
            Se connecter
          </Link>
          <Link
            href="/auth/login?mode=register"
            className="px-8 py-4 border-2 border-kiparlo-orange text-kiparlo-orange font-semibold rounded-xl text-lg hover:bg-kiparlo-orange hover:text-white transition-colors"
          >
            Créer un compte
          </Link>
        </div>
      </div>

      <footer className="absolute bottom-6 text-kiparlo-gray text-sm">
        &copy; {new Date().getFullYear()} Kiparlo. Tous droits réservés.
      </footer>
    </div>
  );
}
