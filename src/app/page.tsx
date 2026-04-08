import Image from "next/image";
import Link from "next/link";

export default function Home() {
  return (
    <div className="min-h-screen bg-winelio-dark flex flex-col items-center justify-center px-4">
      <div className="text-center max-w-2xl">
        {/* Logo */}
        <div className="flex justify-center mb-6">
          <Image src="/logo-on-dark.png" alt="Winelio" width={320} height={88} priority className="h-20 w-auto" />
        </div>

        <p className="text-winelio-gray text-lg md:text-xl tracking-[0.3em] uppercase mb-12">
          Recommandez. Connectez. Gagnez.
        </p>

        <p className="text-gray-400 text-lg mb-10 leading-relaxed">
          Recommandez des professionnels de confiance et gagnez des commissions
          sur chaque affaire conclue. Jusqu&apos;à 5 niveaux de parrainage.
        </p>

        <div className="flex flex-col sm:flex-row gap-4 justify-center">
          <Link
            href="/auth/login"
            className="px-8 py-4 bg-gradient-to-r from-winelio-orange to-winelio-amber text-white font-semibold rounded-xl text-lg hover:opacity-90 transition-opacity"
          >
            Se connecter
          </Link>
          <Link
            href="/auth/login?mode=register"
            className="px-8 py-4 border-2 border-winelio-orange text-winelio-orange font-semibold rounded-xl text-lg hover:bg-winelio-orange hover:text-white transition-colors"
          >
            Créer un compte
          </Link>
        </div>
      </div>

      <footer className="absolute bottom-6 text-winelio-gray text-sm">
        &copy; {new Date().getFullYear()} Winelio. Tous droits réservés.
      </footer>
    </div>
  );
}
