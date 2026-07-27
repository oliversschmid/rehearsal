import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { Sidebar } from "@/components/Sidebar";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Simulated Audiences",
  description: "Rehearse marketing campaigns against a simulated audience before send.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}>
      <body className="min-h-full">
        <div className="grid" style={{ gridTemplateColumns: "204px 1fr", minHeight: "100vh" }}>
          <Sidebar />
          <main className="min-w-0">{children}</main>
        </div>
      </body>
    </html>
  );
}
