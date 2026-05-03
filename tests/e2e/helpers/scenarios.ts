import {
  createTestUser,
  createTestCompany,
  createTestContact,
  pickCategory,
  type TestUser,
} from "./factories";
import { e2eEmail } from "./env";

export type Chain = {
  founder: TestUser;
  referrer: TestUser;
  pro: TestUser;
  companyId: string;
  contactId: string;
  categoryId: string;
};

/**
 * Crée un mini-réseau MLM (founder → referrer → pro) + 1 company + 1 contact.
 * Suffisant pour couvrir la majorité des chemins de reco.
 * Pour tester les 5 niveaux de commissions, utiliser `createDeepChain` à la place.
 */
export async function createBasicChain(opts: {
  scrapedPro?: boolean;
  proCompanyEmail?: string | null;
} = {}): Promise<Chain> {
  const founder = await createTestUser({
    email: e2eEmail("founder"), firstName: "Found", isFounder: true,
  });
  const referrer = await createTestUser({
    email: e2eEmail("ref"), firstName: "Refer", sponsorId: founder.id,
  });
  const pro = await createTestUser({
    email: e2eEmail("pro"), firstName: "Pro", sponsorId: referrer.id, isProfessional: true,
  });

  const categoryId = await pickCategory();
  const { id: companyId } = await createTestCompany({
    ownerId: pro.id,
    name:    "E2E Plomberie SA",
    categoryId,
    email:   opts.proCompanyEmail !== undefined ? opts.proCompanyEmail : e2eEmail("company"),
    source:  opts.scrapedPro ? "scraped" : "owner",
  });
  const { id: contactId } = await createTestContact({
    userId: referrer.id, firstName: "Clément", lastName: "Test",
  });

  return { founder, referrer, pro, companyId, contactId, categoryId };
}
