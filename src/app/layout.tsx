import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  subsets: ["latin"],
  variable: "--font-sans",
  display: "swap",
});

const geistMono = Geist_Mono({
  subsets: ["latin"],
  variable: "--font-mono",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Flash Image Converter — Konversi cepat JPEG, PNG, WebP, AVIF, TIFF",
  description:
    "Konversi cepat antar format gambar — JPEG, PNG, WebP, AVIF, TIFF, GIF. Privat, tanpa watermark, server-side via sharp.",
  icons: {
    icon: "/favicon.svg",
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html
      lang="id"
      className={`${geistSans.variable} ${geistMono.variable}`}
      suppressHydrationWarning
    >
      <body className="min-h-screen bg-base text-foreground font-sans antialiased selection:bg-accent/30 selection:text-foreground">
        {children}
      </body>
    </html>
  );
}
