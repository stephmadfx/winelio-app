import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { DemoSeedBanner } from "@/components/DemoSeedBanner";
import { LegalDocument } from "@/components/legal-document";
import { MobileHeader } from "@/components/mobile-header";
import { MobileNav } from "@/components/mobile-nav";
import { getLegalDocumentMarkdown, legalDocumentBySlug, legalDocuments } from "@/lib/legal-documents";
import { createClient } from "@/lib/supabase/server";
import { getUser } from "@/lib/supabase/get-user";

type PageProps = {
  params: Promise<{ slug: string }>;
};

export const generateStaticParams = () =>
  legalDocuments.map((document) => ({ slug: document.slug }));

export const generateMetadata = async ({ params }: PageProps): Promise<Metadata> => {
  const { slug } = await params;
  const document = legalDocumentBySlug(slug);

  if (!document) {
    return {
      title: "Document légal introuvable - Winelio",
    };
  }

  return {
    title: `${document.title} - Winelio`,
    description: document.description,
  };
};

const DEMO_MODE = process.env.NEXT_PUBLIC_DEMO_MODE === "true";

export default async function LegalDocumentPage({ params }: PageProps) {
  const { slug } = await params;
  const markdown = getLegalDocumentMarkdown(slug);

  if (!markdown) notFound();

  const user = await getUser();
  const inApp = Boolean(user);
  const isSuperAdmin = user?.app_metadata?.role === "super_admin";

  let firstName: string | undefined;
  let avatar: string | null | undefined;

  if (user) {
    const supabase = await createClient();
    const { data: profile } = await supabase
      .from("profiles")
      .select("first_name, avatar")
      .eq("id", user.id)
      .single();

    firstName = profile?.first_name ?? undefined;
    avatar = profile?.avatar ?? undefined;
  }

  return (
    <>
      {inApp && (
        <>
          {DEMO_MODE && <DemoSeedBanner />}
          <MobileHeader
            userEmail={user?.email ?? ""}
            firstName={firstName}
            avatar={avatar}
            isSuperAdmin={isSuperAdmin}
            userId={user?.id ?? ""}
          />
          <MobileNav />
        </>
      )}
      <LegalDocument markdown={markdown} currentSlug={slug} inApp={inApp} />
    </>
  );
}
