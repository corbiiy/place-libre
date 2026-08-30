import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const siteUrl = "https://place-libre-pathe-seats.cdilyas.chatgpt.site";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: "Place Libre : vérifiez les places de cinéma",
  description: "Choisissez un cinéma Pathé, une date et un film pour consulter les séances et ouvrir le plan officiel.",
  alternates: { canonical: "/" },
  icons: {
    icon: [{ url: "/favicon.svg?v=2", type: "image/svg+xml" }],
    shortcut: "/favicon.svg?v=2",
  },
  openGraph: {
    title: "Place Libre",
    description: "Le bon film. La bonne place.",
    url: siteUrl,
    siteName: "Place Libre",
    locale: "fr_FR",
    type: "website",
    images: [{ url: "/og.png", width: 1731, height: 909, alt: "Place Libre, aperçu des sièges disponibles" }],
  },
  twitter: { card: "summary_large_image", title: "Place Libre", description: "Le bon film. La bonne place.", images: ["/og.png"] },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="fr">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        {children}
      </body>
    </html>
  );
}
