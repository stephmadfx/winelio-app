import { he } from "@/lib/html-escape";
import { supabaseAdmin } from "@/lib/supabase/admin";

type NewsletterVariables = {
  firstName: string;
  lastName: string;
  companyName: string;
  unsubscribeUrl: string;
  email: string;
  date: string;
};

const SITE_URL = (process.env.NEXT_PUBLIC_APP_URL || "https://winelio.app").replace(/\/$/, "");

const titleCase = (value: string) => {
  const clean = value.trim();
  if (!clean) return "";
  return clean.charAt(0).toUpperCase() + clean.slice(1).toLowerCase();
};

const fallbackFirstName = (email: string) => {
  const localPart = email.split("@")[0] || "";
  const firstToken = localPart.split(/[._+-]/)[0] || "";
  return titleCase(firstToken) || "Membre";
};

export const fetchNewsletterVariablesForEmail = async (email: string): Promise<NewsletterVariables> => {
  const normalizedEmail = email.trim().toLowerCase();
  const today = new Intl.DateTimeFormat("fr-FR", {
    day: "2-digit",
    month: "long",
    year: "numeric",
  }).format(new Date());

  const { data: profile } = await supabaseAdmin
    .from("profiles")
    .select("id, email, first_name, last_name")
    .ilike("email", normalizedEmail)
    .maybeSingle();

  const { data: company } = profile?.id
    ? await supabaseAdmin
      .from("companies")
      .select("name, legal_name")
      .eq("owner_id", profile.id)
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle()
    : { data: null };

  return {
    firstName: profile?.first_name?.trim() || fallbackFirstName(normalizedEmail),
    lastName: profile?.last_name?.trim() || "",
    companyName: company?.name?.trim() || company?.legal_name?.trim() || "Winelio",
    unsubscribeUrl: `${SITE_URL}/newsletter/unsubscribe?email=${encodeURIComponent(normalizedEmail)}`,
    email: profile?.email || normalizedEmail,
    date: today,
  };
};

export const applyNewsletterVariables = (content: string, variables: NewsletterVariables) =>
  content.replace(/\{\{\s*(firstName|lastName|companyName|unsubscribeUrl|email|date)\s*\}\}/g, (_match, key: keyof NewsletterVariables) =>
    he(variables[key])
  );
