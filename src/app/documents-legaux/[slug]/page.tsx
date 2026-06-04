import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { LegalDocument } from "@/components/legal-document";
import { getLegalDocumentMarkdown, legalDocumentBySlug, legalDocuments } from "@/lib/legal-documents";

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

export default async function LegalDocumentPage({ params }: PageProps) {
  const { slug } = await params;
  const markdown = getLegalDocumentMarkdown(slug);

  if (!markdown) notFound();

  return <LegalDocument markdown={markdown} currentSlug={slug} />;
}
