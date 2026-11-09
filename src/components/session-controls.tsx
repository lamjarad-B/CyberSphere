"use client";

import dynamic from "next/dynamic";

// Ces composants embarquent le client better-auth (passkeys, 2FA), une
// centaine de Ko de JavaScript : importés à la demande, ils ne sont chargés
// que lorsqu'un membre est connecté, jamais pour un visiteur anonyme.
export const UserMenu = dynamic(() => import("./user-menu").then((mod) => mod.UserMenu));

// Minuteur dont la boîte de dialogue est fermée au chargement : inutile côté serveur
export const IdleLogout = dynamic(
  () => import("./idle-logout").then((mod) => mod.IdleLogout),
  { ssr: false },
);
