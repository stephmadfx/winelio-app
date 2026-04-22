import { getUser } from "@/lib/supabase/get-user";
import { redirect } from "next/navigation";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { ScrapingImport } from "./ScrapingImport";

export default async function ScrapingAdminPage() {
  const user = await getUser();
  if (!user) redirect("/auth/login");
  if (user.app_metadata?.role !== "super_admin") redirect("/dashboard");

  const { count: scrapedCount } = await supabaseAdmin
    .schema("winelio")
    .from("companies")
    .select("id", { count: "exact", head: true })
    .eq("source", "scraped");

  const { count: ownerCount } = await supabaseAdmin
    .schema("winelio")
    .from("companies")
    .select("id", { count: "exact", head: true })
    .eq("source", "owner");

  const { count: scrapedWithEmail } = await supabaseAdmin
    .schema("winelio")
    .from("companies")
    .select("id", { count: "exact", head: true })
    .eq("source", "scraped")
    .not("email", "is", null);

  const { data: categories } = await supabaseAdmin
    .schema("winelio")
    .from("categories")
    .select("name")
    .order("name");

  return (
    <div className="max-w-4xl space-y-8 pb-24">
      <div>
        <h1 className="text-2xl font-black tracking-tight text-winelio-dark">
          Import de pros scrapés
        </h1>
        <p className="mt-1 text-sm text-winelio-gray">
          Importez des entreprises depuis un CSV. Elles seront marquées{" "}
          <code className="rounded bg-winelio-light px-1.5 py-0.5 text-xs">source=scraped</code>{" "}
          et recevront un email de découverte Winelio quand quelqu&apos;un les recommande.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <StatCard label="Companies owner" value={ownerCount ?? 0} color="green" />
        <StatCard label="Companies scraped" value={scrapedCount ?? 0} color="orange" />
        <StatCard
          label="Scraped avec email"
          value={scrapedWithEmail ?? 0}
          sub={`${Math.round(((scrapedWithEmail ?? 0) / Math.max(scrapedCount ?? 1, 1)) * 100)}%`}
          color="blue"
        />
      </div>

      <div className="rounded-2xl border border-winelio-gray/10 bg-white p-6 shadow-sm">
        <h2 className="text-lg font-bold text-winelio-dark">Format du CSV attendu</h2>
        <p className="mt-1 text-sm text-winelio-gray">
          Entête obligatoire sur la première ligne, séparateur{" "}
          <code className="rounded bg-winelio-light px-1.5 py-0.5 text-xs">,</code>. Colonnes :
        </p>
        <pre className="mt-3 overflow-x-auto rounded-xl bg-winelio-dark p-4 text-xs text-white">
{`name,email,phone,city,postal_code,address,category_name
Pizzeria Chez Mario,contact@chezmario.fr,0612345678,Lille,59000,12 rue de Paris,Restauration
Plomberie Express,info@plombex.fr,0623456789,Roubaix,59100,34 av Foch,Plomberie`}
        </pre>
        <p className="mt-3 text-xs text-winelio-gray/80">
          Les colonnes <strong>email, phone, city, postal_code, address, category_name</strong>{" "}
          sont optionnelles. Seul <strong>name</strong> est obligatoire.
          <br />
          Les doublons par email sont ignorés. Les <code>category_name</code> doivent
          correspondre à une catégorie existante (insensible à la casse).
        </p>
        {categories && categories.length > 0 && (
          <details className="mt-3">
            <summary className="cursor-pointer text-xs font-semibold text-winelio-orange">
              Catégories disponibles ({categories.length})
            </summary>
            <p className="mt-2 text-xs text-winelio-gray">
              {categories.map((c) => c.name).join(" · ")}
            </p>
          </details>
        )}
      </div>

      <ScrapingImport />
    </div>
  );
}

function StatCard({
  label,
  value,
  sub,
  color,
}: {
  label: string;
  value: number;
  sub?: string;
  color: "green" | "orange" | "blue";
}) {
  const colors = {
    green: "bg-green-50 text-green-700 ring-green-200",
    orange: "bg-orange-50 text-winelio-orange ring-orange-200",
    blue: "bg-blue-50 text-blue-700 ring-blue-200",
  };
  return (
    <div className={`rounded-2xl ring-1 ${colors[color]} p-5`}>
      <p className="text-[11px] font-bold uppercase tracking-wider opacity-70">{label}</p>
      <p className="mt-1 text-3xl font-black">{value.toLocaleString("fr-FR")}</p>
      {sub && <p className="mt-0.5 text-xs opacity-70">{sub}</p>}
    </div>
  );
}
