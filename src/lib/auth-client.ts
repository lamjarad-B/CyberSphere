"use client";

import { createAuthClient } from "better-auth/react";
import { adminClient, twoFactorClient } from "better-auth/client/plugins";
import { passkeyClient } from "@better-auth/passkey/client";

export const authClient = createAuthClient({
  plugins: [
    adminClient(),
    twoFactorClient({
      onTwoFactorRedirect() {
        // Connexion valide mais 2FA activée : saisie du code TOTP,
        // dans la langue de la page courante (/en/… → page anglaise)
        const onEnglishPage =
          window.location.pathname === "/en" ||
          window.location.pathname.startsWith("/en/");
        // La page demandée avant connexion (?redirection=) suit l'étape 2FA ;
        // elle est revalidée (chemin interne) par le formulaire 2FA.
        const redirection = new URLSearchParams(window.location.search).get("redirection");
        const query = redirection ? `?redirection=${encodeURIComponent(redirection)}` : "";
        // Callback du client better-auth, hors de l'arbre React (pas de
        // routeur) : navigation complète voulue vers l'étape 2FA.
        // eslint-disable-next-line @next/next/no-location-assign-relative-destination
        window.location.href = `${onEnglishPage ? "/en/deux-facteurs" : "/deux-facteurs"}${query}`;
      },
    }),
    passkeyClient(),
  ],
});
