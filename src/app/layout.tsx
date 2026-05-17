import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Flash Image Converter",
  description:
    "Konversi cepat antar format gambar — JPEG, PNG, WebP, AVIF, TIFF, GIF. Privat, tanpa watermark.",
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
    <html lang="id">
      <body className="min-h-screen bg-[#0a0a0b] text-zinc-100 font-sans antialiased">
        {children}
      </body>
    </html>
  );
}
