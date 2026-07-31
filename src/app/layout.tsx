import type { Metadata } from "next";
import { Archivo_Black, DM_Sans, JetBrains_Mono } from "next/font/google";
import "./globals.css";
import AppShell from "@/components/AppShell";

// Stacked brand type stack. Archivo Black stands in for Chunko Bold (the paid
// display face) with the same chunky-heavy character. DM Sans carries the
// body. JetBrains Mono for data and code. All three self-hosted via next/font.
const archivoBlack = Archivo_Black({
  variable: "--font-archivo-black",
  subsets: ["latin"],
  weight: "400",
  display: "swap",
});
const dmSans = DM_Sans({
  variable: "--font-dm-sans",
  subsets: ["latin"],
  display: "swap",
});
const jetbrainsMono = JetBrains_Mono({
  variable: "--font-jetbrains-mono",
  subsets: ["latin"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "Approved Reporting · Stacked",
  description: "Partner reporting hub · Stacked",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${archivoBlack.variable} ${dmSans.variable} ${jetbrainsMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col bg-brand-cream-soft text-brand-green">
        <AppShell>{children}</AppShell>
      </body>
    </html>
  );
}
