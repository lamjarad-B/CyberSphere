"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { authClient } from "@/lib/auth-client";

type UserMenuProps = {
  name: string;
  image: string | null;
  isAdmin: boolean;
};

export function UserMenu({ name, image, isAdmin }: UserMenuProps) {
  const router = useRouter();
  const [signingOut, setSigningOut] = useState(false);

  async function handleSignOut() {
    setSigningOut(true);
    await authClient.signOut();
    router.push("/");
    router.refresh();
  }

  return (
    <details className="relative">
      <summary className="flex cursor-pointer list-none items-center gap-2 rounded-md border border-border px-2 py-1.5 transition-colors hover:border-accent [&::-webkit-details-marker]:hidden">
        {image ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={image}
            alt=""
            className="h-6 w-6 rounded-full object-cover"
          />
        ) : (
          <span className="flex h-6 w-6 items-center justify-center rounded-full bg-accent/15 font-mono text-xs font-bold text-accent">
            {name.charAt(0).toUpperCase()}
          </span>
        )}
        <span className="hidden max-w-28 truncate text-sm font-medium sm:block">
          {name}
        </span>
      </summary>
      <div className="absolute right-0 top-full z-50 mt-2 w-52 rounded-lg border border-border bg-surface p-1.5 shadow-xl">
        <Link
          href="/membre"
          className="block rounded-md px-3 py-2 text-sm transition-colors hover:bg-accent/10"
        >
          Mon profil
        </Link>
        {isAdmin && (
          <Link
            href="/admin"
            className="block rounded-md px-3 py-2 text-sm transition-colors hover:bg-accent/10"
          >
            Administration
          </Link>
        )}
        <button
          type="button"
          onClick={handleSignOut}
          disabled={signingOut}
          className="block w-full rounded-md px-3 py-2 text-left text-sm text-red-500 transition-colors hover:bg-red-500/10 disabled:opacity-50"
        >
          {signingOut ? "Déconnexion…" : "Se déconnecter"}
        </button>
      </div>
    </details>
  );
}
