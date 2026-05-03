function required(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`[E2E] variable d'env manquante : ${name} (cf. tests/e2e/.env.test)`);
  return v;
}

export const E2E = {
  baseUrl:        required("E2E_BASE_URL"),
  stagingPwd:     required("E2E_STAGING_PASSWORD"),
  supabaseUrl:    required("E2E_SUPABASE_URL"),
  supabaseKey:    required("E2E_SUPABASE_SERVICE_ROLE_KEY"),
  cronSecret:     required("E2E_CRON_SECRET"),
  emailDomain:    "winelio-e2e.local" as const,
};

export const e2eEmail = (label: string): string => {
  const slug = label.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
  const rand = Math.random().toString(36).slice(2, 8);
  return `${slug}-${rand}@${E2E.emailDomain}`;
};
