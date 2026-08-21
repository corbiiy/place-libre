import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { headers } from "next/headers";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export async function generateMetadata(): Promise<Metadata> {
  const requestHeaders = await headers();
  const host = requestHeaders.get("host") ?? "localhost:3000";
  const protocol = requestHeaders.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  const socialImage = `${protocol}://${host}/og.png`;

  return {
    title: "Place Libre — vérifiez les places de cinéma",
    description: "Choisissez un cinéma Pathé, un film et une date pour repérer les séances et les meilleurs sièges disponibles.",
    openGraph: {
      title: "Place Libre",
      description: "Le bon film. La bonne place.",
      images: [{ url: socialImage, width: 1733, height: 907, alt: "Place Libre — aperçu des sièges disponibles" }],
    },
    twitter: { card: "summary_large_image", title: "Place Libre", description: "Le bon film. La bonne place.", images: [socialImage] },
  };
}

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
