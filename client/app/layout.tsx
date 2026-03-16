import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { ThemeProvider } from "@/components/common/ThemeProvider";
import { ClientProviders } from "@/components/common/ClientProviders";
import { Navbar } from "@/components/common/Navbar";
import { Footer } from "@/components/common/Footer";
import { Toaster } from "sonner";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "x402.skills — Pay-per-use AI Skills on Stacks",
  description:
    "Decentralized marketplace for pay-per-use AI services using STX micropayments. No subscriptions, no API keys, no accounts.",
  openGraph: {
    title: "x402.skills — AI Skills Marketplace",
    description:
      "Discover and pay for AI skills on-demand with STX micropayments on Stacks blockchain.",
    siteName: "x402.skills",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        <ThemeProvider>
          <ClientProviders>
            <div className="flex min-h-svh flex-col">
              <Navbar />
              <main className="flex-1">{children}</main>
              <Footer />
            </div>
            <Toaster position="top-right" richColors closeButton />
          </ClientProviders>
        </ThemeProvider>
      </body>
    </html>
  );
}
