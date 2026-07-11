import type { Metadata } from "next";
import Link from "next/link";
import { db } from "@/lib/db";
import { requireStaff } from "@/lib/session";
import { AdminNav } from "@/components/admin/admin-nav";
import { buttonClass, cardClass } from "@/components/ui";

export const metadata: Metadata = {
  title: { default: "Administration", template: "%s — Admin CyberSphere" },
  robots: { index: false, follow: false },
};

export default async function AdminLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const session = await requireStaff();

  // 2FA obligatoire pour accéder à l'administration : un compte à
  // privilèges compromis par simple mot de passe est le pire scénario.
  const user = await db.user.findUnique({
    where: { id: session.user.id },
    select: { twoFactorEnabled: true },
  });
  if (!user?.twoFactorEnabled) {
    return (
      <div className="mx-auto max-w-lg px-4 py-16">
        <div className={`${cardClass} space-y-4 p-8`}>
          <h1 className="text-2xl font-bold">Double authentification requise</h1>
          <p className="text-sm text-muted">
            L&apos;accès à l&apos;administration exige la double
            authentification (TOTP). Activez-la depuis votre profil — cela
            prend moins de deux minutes avec une application comme Aegis,
            Google Authenticator ou Bitwarden.
          </p>
          <Link href="/membre" className={buttonClass}>
            Activer la 2FA sur mon profil
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen flex-col md:flex-row">
      <aside className="flex flex-col gap-6 border-b border-border bg-surface p-4 md:w-60 md:shrink-0 md:border-b-0 md:border-r">
        <Link href="/" className="flex items-center gap-2 px-2 pt-2">
          <span className="font-mono text-base font-bold text-accent" aria-hidden>
            &gt;_
          </span>
          <span className="font-bold">
            Cyber<span className="text-accent">Sphere</span>
          </span>
          <span className="rounded bg-accent/15 px-1.5 py-0.5 font-mono text-[10px] font-semibold uppercase text-accent">
            {session.user.role === "admin" ? "admin" : "auteur"}
          </span>
        </Link>
        <AdminNav role={session.user.role ?? "user"} />
        <Link
          href="/"
          className="mt-auto rounded-md px-3 py-2 text-sm text-muted transition-colors hover:text-accent"
        >
          ← Voir le site
        </Link>
      </aside>
      <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-8 md:px-8">
        {children}
      </main>
    </div>
  );
}
