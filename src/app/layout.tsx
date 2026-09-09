import type { Metadata } from "next";
import { DM_Sans, Geist_Mono } from "next/font/google";
import localFont from "next/font/local";
import "./globals.css";
import AppShell from "@/components/AppShell";

// Stacked brand type stack, per the partner dashboard spec. Three faces, no
// others: Chunko Bold for display, DM Sans for everything readable, Geist Mono
// for numbers. Chunko is the licensed Stacked file, self-hosted from src/fonts
// (it is not on Google Fonts); the other two come through next/font.
const chunko = localFont({
  src: "../fonts/chunko-bold.woff2",
  variable: "--font-chunko",
  weight: "700",
  display: "swap",
});
const dmSans = DM_Sans({
  variable: "--font-dm-sans",
  subsets: ["latin"],
  display: "swap",
});
const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
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
      className={`${chunko.variable} ${dmSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col bg-brand-cream-soft text-brand-green">
        <AppShell>{children}</AppShell>
      </body>
    </html>
  );
}
