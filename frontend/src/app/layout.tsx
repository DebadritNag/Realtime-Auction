import type { Metadata } from "next";
import { Inter, Caveat } from "next/font/google";
import "./globals.css";
import { AppShell } from "@/components/layout/AppShell";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
});

const caveat = Caveat({
  subsets: ["latin"],
  weight: ["700"],
  variable: "--font-caveat",
  display: "swap",
});

export const metadata: Metadata = {
  title: "ARENAAUCTION - Create Auction Room",
  description:
    "Competitive real-time multiplayer football player auctions with live bidding, dynamic team purses, tactical squad management, and AI auction insights.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html
      lang="en"
      className={`${inter.variable} ${caveat.variable} dark h-full bg-[#020D15]`}
    >
      <body className="min-h-full bg-[#020D15] text-[#F7F9FC] antialiased selection:bg-[#00F5A0] selection:text-[#020D15]">
        <AppShell>{children}</AppShell>
      </body>
    </html>
  );
}
