import type { Metadata } from "next";
import { Geist } from "next/font/google";
import "./globals.css";
import MobileNav from "@/components/MobileNav";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Tech on Toast - Partner Portal",
  description: "Partner reporting hub for Tech on Toast",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`${geistSans.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col bg-gray-50">
        <nav className="bg-white border-b border-gray-200 px-4 sm:px-6 py-4 relative">
          <div className="max-w-7xl mx-auto flex items-center justify-between">
            <a href="/" className="flex items-center gap-2 sm:gap-3">
              <div className="w-8 h-8 bg-orange-500 rounded-lg flex items-center justify-center text-white font-bold text-sm">
                ToT
              </div>
              <span className="font-semibold text-gray-900 text-lg hidden sm:inline">Partner Portal</span>
            </a>
            {/* Desktop nav */}
            <div className="hidden md:flex gap-6">
              <a href="/" className="text-sm text-gray-600 hover:text-gray-900">Dashboard</a>
              <a href="/leads" className="text-sm text-gray-600 hover:text-gray-900">All Leads</a>
              <a href="/activity" className="text-sm text-gray-600 hover:text-gray-900">Log Activity</a>
              <a href="/analytics" className="text-sm text-gray-600 hover:text-gray-900">Analytics</a>
              <a href="/metrics" className="text-sm text-gray-600 hover:text-gray-900">Metrics</a>
            </div>
            {/* Mobile nav */}
            <MobileNav />
          </div>
        </nav>
        <main className="max-w-7xl mx-auto px-4 sm:px-6 py-6 sm:py-8 w-full flex-1">
          {children}
        </main>
      </body>
    </html>
  );
}
