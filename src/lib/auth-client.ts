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
        window.location.href = onEnglishPage ? "/en/deux-facteurs" : "/deux-facteurs";
      },
    }),
    passkeyClient(),
  ],
});
