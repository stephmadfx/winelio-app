import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import Link from "next/link";
import { Card, CardContent } from "@/components/ui/card";

export default async function CompaniesPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/auth/login");
  }

  const { data: companies } = await supabase
    .from("companies")
    .select("id, name, city, is_verified, category:categories(name)")
    .eq("owner_id", user.id)
    .order("created_at", { ascending: false });

  return (
    <div>
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-6">
        <h2 className="text-xl sm:text-2xl font-bold text-winelio-dark">
          Mes entreprises
        </h2>
        <Link
          href="/companies/new"
          className="px-5 py-2.5 bg-gradient-to-r from-winelio-orange to-winelio-amber text-white font-semibold rounded-xl hover:opacity-90 transition-opacity text-center"
        >
          Je suis professionnel
        </Link>
      </div>

      {!companies || companies.length === 0 ? (
        <Card className="!rounded-2xl text-center">
          <CardContent className="p-6 sm:p-12 flex flex-col items-center">
            <div className="w-16 h-16 mb-4 rounded-full bg-gradient-to-r from-winelio-orange/10 to-winelio-amber/10 flex items-center justify-center">
              <svg
                className="w-8 h-8 text-winelio-orange"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={1.5}
                  d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4"
                />
              </svg>
            </div>
            <h3 className="text-lg font-semibold text-winelio-dark mb-2">
              Vous êtes actuellement enregistré comme particulier
            </h3>
            <p className="text-muted-foreground mb-2">
              Si vous êtes un professionnel ou que vous possédez une entreprise, enregistrez-la ici pour commencer à recevoir des recommandations de la part du réseau Winelio.
            </p>
            <p className="text-sm text-muted-foreground mb-6">
              Votre entreprise sera vérifiée par notre équipe avant d&apos;apparaître dans le réseau.
            </p>
            <Link
              href="/companies/new"
              className="inline-block px-6 py-3 bg-gradient-to-r from-winelio-orange to-winelio-amber text-white font-semibold rounded-xl hover:opacity-90 transition-opacity"
            >
              Enregistrer mon entreprise
            </Link>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {companies.map((company) => {
            const cat = company.category as { name: string } | { name: string }[] | null;
            const categoryName =
              cat && !Array.isArray(cat)
                ? cat.name
                : Array.isArray(cat) && cat.length > 0
                ? cat[0].name
                : null;

            return (
              <Card key={company.id} className="!rounded-2xl">
                <CardContent className="p-6">
                  <div className="flex items-start justify-between mb-3">
                    <h3 className="text-lg font-semibold text-winelio-dark">
                      {company.name}
                    </h3>
                    {company.is_verified ? (
                      <span className="px-2.5 py-1 text-xs font-medium bg-green-50 text-green-700 rounded-full border border-green-200">
                        Vérifié
                      </span>
                    ) : (
                      <span className="px-2.5 py-1 text-xs font-medium bg-yellow-50 text-yellow-700 rounded-full border border-yellow-200">
                        En attente
                      </span>
                    )}
                  </div>
                  {categoryName && (
                    <p className="text-sm text-winelio-orange font-medium mb-1">
                      {categoryName}
                    </p>
                  )}
                  {company.city && (
                    <p className="text-sm text-muted-foreground">{company.city}</p>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
