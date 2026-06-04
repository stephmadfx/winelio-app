import { supabaseAdmin } from "@/lib/supabase/admin";
import type { NewsletterTestEmailPreset } from "@/components/admin/newsletters/newsletter-types";

const ASSOCIATE_NAMES = [
  { firstName: "Thierry", lastName: "Carlier" },
  { firstName: "Christophe", lastName: "Carlier" },
];

export const getNewsletterTestEmailPresets = async (
  currentUserEmail: string
): Promise<NewsletterTestEmailPreset[]> => {
  const presets: NewsletterTestEmailPreset[] = currentUserEmail
    ? [{ label: "Moi", email: currentUserEmail }]
    : [];

  const { data } = await supabaseAdmin
    .from("profiles")
    .select("email, first_name, last_name")
    .in("first_name", ASSOCIATE_NAMES.map((name) => name.firstName));

  for (const associate of ASSOCIATE_NAMES) {
    const profile = (data ?? []).find((row) =>
      row.first_name?.toLowerCase() === associate.firstName.toLowerCase()
      && row.last_name?.toLowerCase() === associate.lastName.toLowerCase()
      && row.email
    );

    if (profile?.email) {
      presets.push({
        label: `${associate.firstName} ${associate.lastName}`,
        email: profile.email,
      });
    }
  }

  return presets;
};
