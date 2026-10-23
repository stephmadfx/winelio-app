import { test, expect } from "@playwright/test";

const iphone = "Mozilla/5.0 (iPhone; CPU iPhone OS 18_6 like Mac OS X) AppleWebKit/605.1.15 Version/18.6 Mobile/15E148 Safari/604.1";
const android = "Mozilla/5.0 (Linux; Android 15; Pixel 9) AppleWebKit/537.36 Chrome/130.0 Mobile Safari/537.36";

test("le téléchargement reste derrière la vidéo", async ({ browser }) => {
  const context = await browser.newContext({ userAgent: android });
  const page = await context.newPage();
  await page.goto("http://127.0.0.1:43176/?ref=ABC12345");
  await expect(page.getByRole("button", { name: "Créer un compte", exact: true })).toBeDisabled();
  await expect(page.getByRole("link", { name: "Télécharger sur Android" })).toHaveCount(0);
  await context.close();
});

test("Android conserve le parrain et neutralise les anciennes invitations pro", async ({ browser }) => {
  const context = await browser.newContext({ userAgent: android, viewport: { width: 390, height: 844 } });
  await context.addInitScript(() => localStorage.setItem("winelio_promo_watched_v2", "1"));
  const page = await context.newPage();
  await page.goto("http://127.0.0.1:43176/?ref=ABC12345&type=pro");
  await page.getByRole("button", { name: "Continuer sans accepter" }).click();
  const download = page.getByRole("link", { name: "Télécharger sur Android" });
  await expect(download).toBeVisible();
  const store = new URL((await download.getAttribute("href"))!);
  const referrer = new URLSearchParams(store.searchParams.get("referrer")!);
  expect(referrer.get("ref")).toBe("ABC12345");
  expect(referrer.get("type")).toBeNull();
  expect(referrer.get("video")).toBe("1");
  expect(referrer.get("winelio_invite")).toBe("1");
  await expect(page.getByRole("link", { name: "Déjà installée ? Ouvrir mon invitation" })).toHaveAttribute("href", "winelio://invite?ref=ABC12345&video=1");
  await page.reload();
  await expect(download).toBeVisible();
  await page.screenshot({ path: "output/referral-install/android.png", fullPage: true });
  await context.close();
});

test("iPhone copie réellement le lien avant d'ouvrir l'App Store", async ({ browser }) => {
  const context = await browser.newContext({ userAgent: iphone, viewport: { width: 390, height: 844 } });
  await context.grantPermissions(["clipboard-read", "clipboard-write"], { origin: "http://127.0.0.1:43176" });
  await context.addInitScript(() => localStorage.setItem("winelio_promo_watched_v2", "1"));
  const page = await context.newPage();
  await page.route("https://apps.apple.com/**", (route) => route.fulfill({ body: "App Store simulé pour éviter une requête externe" }));
  await page.goto("http://127.0.0.1:43176/?ref=ABC12345&type=pro");
  await page.getByRole("button", { name: "Continuer sans accepter" }).click();
  await expect(page.getByRole("button", { name: "Télécharger sur iPhone" })).toBeVisible();
  await page.screenshot({ path: "output/referral-install/iphone.png", fullPage: true });
  await page.getByRole("button", { name: "Télécharger sur iPhone" }).click();
  await expect(page).toHaveURL(/apps\.apple\.com/);
  await page.goto("http://127.0.0.1:43176/?ref=ABC12345&type=pro");
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe("https://winelio.app/?ref=ABC12345&video=1");
  await context.close();
});

test("un refus de copie sur iPhone conserve l'invitation et explique la reprise", async ({ browser }) => {
  const context = await browser.newContext({ userAgent: iphone });
  await context.addInitScript(() => {
    localStorage.setItem("winelio_promo_watched_v2", "1");
    Object.defineProperty(navigator, "clipboard", { value: { writeText: () => Promise.reject(new DOMException("Refus simulé", "NotAllowedError")) } });
  });
  const page = await context.newPage();
  await page.goto("http://127.0.0.1:43176/?ref=ABC12345");
  await page.getByRole("button", { name: "Continuer sans accepter" }).click();
  await page.getByRole("button", { name: "Télécharger sur iPhone" }).click();
  await expect(page.getByRole("alert").filter({ hasText: "La copie du lien a été refusée" })).toBeVisible();
  await expect(page).toHaveURL(/127.0.0.1:43176/);
  await expect(page.getByRole("link", { name: "Déjà installée ? Ouvrir mon invitation" })).toBeVisible();
  await context.close();
});

test("l'application native et les liens invalides gardent l'inscription web", async ({ browser }) => {
  for (const [userAgent, query] of [[android + " WinelioNative/android", "ref=ABC12345"], [android, "ref=ABC12345&ref=DEF12345"]]) {
    const context = await browser.newContext({ userAgent });
    await context.addInitScript(() => localStorage.setItem("winelio_promo_watched_v2", "1"));
    const page = await context.newPage();
    await page.goto("http://127.0.0.1:43176/?" + query);
    await expect(page.getByRole("link", { name: "Créer un compte", exact: true })).toBeVisible();
    await expect(page.getByRole("link", { name: "Télécharger sur Android" })).toHaveCount(0);
    await context.close();
  }
});

test("une invitation native conserve le visionnage et préremplit le formulaire", async ({ browser }) => {
  const context = await browser.newContext({ userAgent: iphone + " WinelioNative/ios" });
  const page = await context.newPage();
  await page.goto("http://127.0.0.1:43176/auth/login?mode=register&ref=ABC12345&video=1");
  await expect(page.locator("#sponsor-code")).toHaveValue("ABC12345");
  await expect(page).toHaveURL(/auth\/login/);
  await context.close();
});
