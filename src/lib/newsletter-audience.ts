import { supabaseAdmin } from "@/lib/supabase/admin";

export type NewsletterAudienceFilters = {
  audienceType?: "all" | "members" | "professionals" | "individuals";
  activeStatus?: "active" | "inactive" | "all";
  companyVerified?: "verified" | "unverified" | "all";
  hasSiret?: "yes" | "no" | "all";
  categoryId?: string;
  city?: string;
  postalCodePrefix?: string;
  workMode?: string;
  founder?: "yes" | "no" | "all";
  demo?: "yes" | "no" | "all";
  createdFrom?: string;
  createdTo?: string;
  recommendationRole?: "any" | "referrer" | "professional" | "none";
  recommendationStatus?: string;
  commissionStatus?: "EARNED" | "PENDING" | "any" | "none";
  withdrawalStatus?: "PENDING" | "PROCESSING" | "PAID" | "REJECTED" | "any" | "none";
  search?: string;
};

export type NewsletterAudienceRecipient = {
  id: string;
  email: string;
  firstName: string | null;
  lastName: string | null;
  isProfessional: boolean;
  isActive: boolean;
  city: string | null;
  postalCode: string | null;
  companyName: string | null;
  categoryName: string | null;
};

type ProfileRow = {
  id: string;
  email: string | null;
  first_name: string | null;
  last_name: string | null;
  is_professional: boolean | null;
  is_active: boolean | null;
  city: string | null;
  postal_code: string | null;
  created_at: string;
  work_mode: string | null;
  is_founder: boolean | null;
  is_demo: boolean | null;
  companies: Array<{
    name: string | null;
    legal_name: string | null;
    city: string | null;
    postal_code: string | null;
    siret: string | null;
    is_verified: boolean | null;
    category_id: string | null;
    category: { name: string | null } | Array<{ name: string | null }> | null;
  }> | null;
};

const uniq = <T>(values: T[]) => [...new Set(values)];

const first = <T>(value: T | T[] | null | undefined) =>
  Array.isArray(value) ? value[0] ?? null : value ?? null;

const normalize = (value?: string | null) => value?.trim().toLowerCase() ?? "";

const isTechnicalNewsletterEmail = (email?: string | null) => {
  const value = normalize(email);
  if (!value) return true;

  return (
    value.startsWith("removed-user-")
    || value.endsWith("@deleted.winelio.local")
    || value.endsWith("@winelio-demo.internal")
    || value.endsWith("@demo-winelio.fr")
    || value.endsWith("@kiparlo-demo.fr")
    || value.endsWith("@winelio-scraped.local")
    || value.endsWith("@winelio-pro.fr")
    || value.endsWith("@kiparlo-pro.fr")
    || value.endsWith("@yopmail.com")
    || value.endsWith("@mailsac.com")
    || value.includes("@winko")
    || value === "testlocal@winelio.app"
    || /^(demo|test)[._-]/.test(value)
  );
};

const asIsoBoundary = (value: string | undefined, endOfDay = false) => {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  if (endOfDay) date.setHours(23, 59, 59, 999);
  return date.toISOString();
};

const getRelatedUserIds = async (filters: NewsletterAudienceFilters) => {
  const ids = new Set<string>();

  if (filters.recommendationRole && filters.recommendationRole !== "any" && filters.recommendationRole !== "none") {
    let query = supabaseAdmin.from("recommendations").select(
      filters.recommendationRole === "referrer" ? "referrer_id" : "professional_id"
    );
    if (filters.recommendationStatus) query = query.eq("status", filters.recommendationStatus);
    const { data } = await query.limit(10_000);
    for (const row of data ?? []) {
      const id = filters.recommendationRole === "referrer"
        ? (row as { referrer_id?: string | null }).referrer_id
        : (row as { professional_id?: string | null }).professional_id;
      if (id) ids.add(id);
    }
  }

  if (filters.commissionStatus && filters.commissionStatus !== "any" && filters.commissionStatus !== "none") {
    const { data } = await supabaseAdmin
      .from("commission_transactions")
      .select("user_id")
      .eq("status", filters.commissionStatus)
      .limit(10_000);
    for (const row of data ?? []) {
      if (row.user_id) ids.add(row.user_id);
    }
  }

  if (filters.withdrawalStatus && filters.withdrawalStatus !== "any" && filters.withdrawalStatus !== "none") {
    const { data } = await supabaseAdmin
      .from("withdrawals")
      .select("user_id")
      .eq("status", filters.withdrawalStatus)
      .limit(10_000);
    for (const row of data ?? []) {
      if (row.user_id) ids.add(row.user_id);
    }
  }

  return ids;
};

const getExcludedUserIds = async (filters: NewsletterAudienceFilters) => {
  const excluded = new Set<string>();

  if (filters.recommendationRole === "none") {
    const { data } = await supabaseAdmin
      .from("recommendations")
      .select("referrer_id, professional_id")
      .limit(10_000);
    for (const row of data ?? []) {
      if (row.referrer_id) excluded.add(row.referrer_id);
      if (row.professional_id) excluded.add(row.professional_id);
    }
  }

  if (filters.commissionStatus === "none") {
    const { data } = await supabaseAdmin
      .from("commission_transactions")
      .select("user_id")
      .limit(10_000);
    for (const row of data ?? []) {
      if (row.user_id) excluded.add(row.user_id);
    }
  }

  if (filters.withdrawalStatus === "none") {
    const { data } = await supabaseAdmin
      .from("withdrawals")
      .select("user_id")
      .limit(10_000);
    for (const row of data ?? []) {
      if (row.user_id) excluded.add(row.user_id);
    }
  }

  return excluded;
};

const matchesCompanyFilters = (profile: ProfileRow, filters: NewsletterAudienceFilters) => {
  const companies = profile.companies ?? [];

  if (filters.categoryId && !companies.some((company) => company.category_id === filters.categoryId)) return false;
  if (filters.companyVerified === "verified" && !companies.some((company) => company.is_verified === true)) return false;
  if (filters.companyVerified === "unverified" && !companies.some((company) => company.is_verified !== true)) return false;
  if (filters.hasSiret === "yes" && !companies.some((company) => Boolean(company.siret?.trim()))) return false;
  if (filters.hasSiret === "no" && companies.some((company) => Boolean(company.siret?.trim()))) return false;

  return true;
};

const matchesTextFilters = (profile: ProfileRow, filters: NewsletterAudienceFilters) => {
  const city = normalize(filters.city);
  const postalPrefix = normalize(filters.postalCodePrefix);
  const search = normalize(filters.search);
  const companies = profile.companies ?? [];

  if (city) {
    const profileCity = normalize(profile.city);
    const companyCities = companies.map((company) => normalize(company.city));
    if (!profileCity.includes(city) && !companyCities.some((value) => value.includes(city))) return false;
  }

  if (postalPrefix) {
    const profilePostal = normalize(profile.postal_code);
    const companyPostals = companies.map((company) => normalize(company.postal_code));
    if (!profilePostal.startsWith(postalPrefix) && !companyPostals.some((value) => value.startsWith(postalPrefix))) return false;
  }

  if (search) {
    const haystack = [
      profile.email,
      profile.first_name,
      profile.last_name,
      profile.city,
      ...companies.flatMap((company) => [company.name, company.legal_name, company.city, company.siret]),
    ].map((value) => normalize(value ?? "")).join(" ");
    if (!haystack.includes(search)) return false;
  }

  return true;
};

const toRecipient = (profile: ProfileRow): NewsletterAudienceRecipient => {
  const company = profile.companies?.[0] ?? null;
  const category = first(company?.category);

  return {
    id: profile.id,
    email: profile.email ?? "",
    firstName: profile.first_name,
    lastName: profile.last_name,
    isProfessional: profile.is_professional === true,
    isActive: profile.is_active !== false,
    city: profile.city ?? company?.city ?? null,
    postalCode: profile.postal_code ?? company?.postal_code ?? null,
    companyName: company?.name ?? company?.legal_name ?? null,
    categoryName: category?.name ?? null,
  };
};

export const previewNewsletterAudience = async (filters: NewsletterAudienceFilters) => {
  let query = supabaseAdmin
    .from("profiles")
    .select(`
      id,
      email,
      first_name,
      last_name,
      is_professional,
      is_active,
      city,
      postal_code,
      created_at,
      work_mode,
      is_founder,
      is_demo,
      companies!owner_id(
        name,
        legal_name,
        city,
        postal_code,
        siret,
        is_verified,
        category_id,
        category:categories!category_id(name)
      )
    `)
    .not("email", "is", null)
    .not("email", "ilike", "removed-user-%")
    .not("email", "ilike", "%@deleted.winelio.local")
    .not("email", "ilike", "%@winelio-demo.internal")
    .not("email", "ilike", "%@demo-winelio.fr")
    .not("email", "ilike", "%@kiparlo-demo.fr")
    .not("email", "ilike", "%@winelio-scraped.local")
    .not("email", "ilike", "%@winelio-pro.fr")
    .not("email", "ilike", "%@kiparlo-pro.fr")
    .not("email", "ilike", "%@yopmail.com")
    .not("email", "ilike", "%@mailsac.com")
    .not("email", "ilike", "%@winko%")
    .not("email", "ilike", "demo.%")
    .not("email", "ilike", "demo_%")
    .not("email", "ilike", "demo-%")
    .not("email", "ilike", "test.%")
    .not("email", "ilike", "test_%")
    .not("email", "ilike", "test-%")
    .order("created_at", { ascending: false })
    .limit(10_000);

  if (filters.audienceType === "professionals") query = query.eq("is_professional", true);
  if (filters.audienceType === "individuals") query = query.eq("is_professional", false);
  if (filters.activeStatus === "active") query = query.eq("is_active", true);
  if (filters.activeStatus === "inactive") query = query.eq("is_active", false);
  if (filters.workMode) query = query.eq("work_mode", filters.workMode);
  if (filters.founder === "yes") query = query.eq("is_founder", true);
  if (filters.founder === "no") query = query.eq("is_founder", false);
  if (filters.demo === "yes") query = query.eq("is_demo", true);
  if (filters.demo === "no") query = query.eq("is_demo", false);

  const createdFrom = asIsoBoundary(filters.createdFrom);
  const createdTo = asIsoBoundary(filters.createdTo, true);
  if (createdFrom) query = query.gte("created_at", createdFrom);
  if (createdTo) query = query.lte("created_at", createdTo);

  const { data, error } = await query;
  if (error) throw new Error(error.message);

  const relatedIds = await getRelatedUserIds(filters);
  const excludedIds = await getExcludedUserIds(filters);
  const hasRequiredRelations = relatedIds.size > 0;

  const recipients = ((data ?? []) as ProfileRow[])
    .filter((profile) => {
      if (!profile.email) return false;
      if (isTechnicalNewsletterEmail(profile.email)) return false;
      if (filters.audienceType === "members" && profile.is_professional === true) return false;
      if (hasRequiredRelations && !relatedIds.has(profile.id)) return false;
      if (excludedIds.has(profile.id)) return false;
      if (!matchesCompanyFilters(profile, filters)) return false;
      if (!matchesTextFilters(profile, filters)) return false;
      return true;
    })
    .map(toRecipient);

  const deduped = uniq(recipients.map((recipient) => recipient.email.toLowerCase()))
    .map((email) => recipients.find((recipient) => recipient.email.toLowerCase() === email))
    .filter(Boolean) as NewsletterAudienceRecipient[];

  return {
    count: deduped.length,
    sample: deduped.slice(0, 50),
  };
};
