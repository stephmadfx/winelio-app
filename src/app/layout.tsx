import type { Metadata, Viewport } from "next";
import { Montserrat } from "next/font/google";
import "./globals.css";
import { KeyboardScrollProvider } from "@/components/KeyboardScrollProvider";

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
  title: "Kiparlo - Recommandez. Gagnez.",
  description:
    "Plateforme de recommandations professionnelles avec réseau de parrainage.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="fr">
      <body className={`${montserrat.variable} font-sans antialiased`}>
        <KeyboardScrollProvider />
        {children}
      </body>
    </html>
  );
}
