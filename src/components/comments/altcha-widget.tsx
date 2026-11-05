"use client";

import "altcha/external";
import "altcha/altcha.css";
import "altcha/i18n/fr-fr";
import type {} from "altcha/types/react";
import type { Locale } from "@/lib/i18n";

/*
 * Bundle « external » : ni worker en blob ni WASM, la CSP reste sur
 * worker-src 'self'. Seul l'algorithme des défis émis par le serveur est
 * enregistré (PBKDF2 via WebCrypto).
 */
$altcha.algorithms.set(
  "PBKDF2/SHA-256",
  () => new Worker(new URL("altcha/workers/pbkdf2", import.meta.url)),
);

// Pas de lien sortant vers altcha.org, et pas de collecte des gestes du
// visiteur : ce signal ne sert qu'au service ALTCHA Sentinel, absent ici.
$altcha.defaults.set({ hideFooter: true, hideLogo: true, humanInteractionSignature: false });

/**
 * Case « Je ne suis pas un robot » : preuve de travail calculée dans le
 * navigateur, sans cookie ni service tiers. Si le visiteur ne coche pas, le
 * calcul se lance à l'envoi puis le widget relance le formulaire. La preuve
 * arrive dans le champ caché `altcha` du formulaire parent.
 * À charger via next/dynamic : ce module n'a de sens que dans le navigateur.
 */
export default function AltchaWidget({ language }: { language: Locale }) {
  return (
    <altcha-widget
      challenge="/api/commentaires/defi"
      auto="onsubmit"
      type="checkbox"
      name="altcha"
      language={language}
    />
  );
}
