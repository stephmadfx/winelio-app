import type { Metadata, Viewport } from "next";
import { Montserrat, Geist } from "next/font/google";
import "./globals.css";
import { KeyboardScrollProvider } from "@/components/KeyboardScrollProvider";
import { ThemeProvider } from "@/components/theme-provider";
import { cn } from "@/lib/utils";

const geist = Geist({subsets:['latin'],variable:'--font-sans'});

const montserrat = Montserrat({
  subsets: ["latin"],
  variable: "--font-montserrat",
});

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export const metadata: Metadata = {
  title: "Winelio - Recommandez. Gagnez.",
  description:
    "Plateforme de recommandations professionnelles avec réseau de parrainage.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="fr" className={cn("font-sans", geist.variable)} suppressHydrationWarning>
      <body className={`${montserrat.variable} font-sans antialiased`}>
        <ThemeProvider>
          <KeyboardScrollProvider />
          {children}
        </ThemeProvider>
      </body>
    </html>
  );
}
