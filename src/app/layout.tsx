import type { Metadata } from "next";
import { headers } from "next/headers";
import { Geist, Geist_Mono } from "next/font/google";
import { ThemeProvider } from "@/components/theme-provider";
import "./globals.css";

// La CSP à nonce exige un rendu dynamique : le nonce est généré par requête
// dans src/proxy.ts et injecté dans les scripts au moment du rendu.
export const dynamic = "force-dynamic";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export async function generateMetadata(): Promise<Metadata> {
  const english = (await headers()).get("x-locale") === "en";
  return {
    metadataBase: new URL(process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000"),
    title: {
      default: english
        ? "CyberSphere — Cybersecurity blog"
        : "CyberSphere — Blog cybersécurité",
      template: "%s — CyberSphere",
    },
    description: english
      ? "CyberSphere: cybersecurity articles, analyses and tutorials — pentesting, defense, cryptography and infosec news."
      : "CyberSphere : articles, analyses et tutoriels de cybersécurité — pentest, défense, cryptographie et actualité de la sécurité informatique.",
  };
}

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const requestHeaders = await headers();
  const nonce = requestHeaders.get("x-nonce") ?? undefined;
  // Posé par le proxy selon l'URL ("en" sous /en, "fr" partout ailleurs)
  const lang = requestHeaders.get("x-locale") === "en" ? "en" : "fr";

  return (
    <html
      lang={lang}
      suppressHydrationWarning
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="flex min-h-full flex-col">
        <ThemeProvider
          attribute="class"
          defaultTheme="dark"
          enableSystem={false}
          disableTransitionOnChange
          nonce={nonce}
        >
          {children}
        </ThemeProvider>
      </body>
    </html>
  );
}
