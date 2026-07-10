"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { authClient } from "@/lib/auth-client";
import {
  buttonClass,
  buttonGhostClass,
  errorClass,
  inputClass,
  labelClass,
  successClass,
} from "@/components/ui";

export function LoginForm({ redirection }: { redirection?: string }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  // Mémorise l'e-mail non vérifié pour proposer le renvoi du lien
  const [unverifiedEmail, setUnverifiedEmail] = useState<string | null>(null);
  const [resent, setResent] = useState(false);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const email = String(form.get("email") ?? "");
    setLoading(true);
    setError(null);
    setUnverifiedEmail(null);
    setResent(false);

    const { error } = await authClient.signIn.email({
      email,
      password: String(form.get("password") ?? ""),
    });

    if (error) {
      setLoading(false);
      if (error.status === 429) {
        setError("Trop de tentatives. Réessayez dans une minute.");
        return;
      }
      if (error.code === "EMAIL_NOT_VERIFIED") {
        // sendOnSignIn a déjà renvoyé un lien de vérification
        setUnverifiedEmail(email);
        return;
      }
      if (error.code === "BANNED_USER") {
        setError("Ce compte a été banni.");
        return;
      }
      setError("E-mail ou mot de passe incorrect.");
      return;
    }

    const target =
      redirection && redirection.startsWith("/") && !redirection.startsWith("//")
        ? redirection
        : "/";
    router.push(target);
    router.refresh();
  }

  async function resend() {
    if (!unverifiedEmail) return;
    setResent(false);
    await authClient.sendVerificationEmail({
      email: unverifiedEmail,
      callbackURL: "/",
    });
    setResent(true);
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4" noValidate>
      {error && <p className={errorClass}>{error}</p>}

      {unverifiedEmail && (
        <div className="space-y-3 rounded-md border border-amber-500/40 bg-amber-500/10 p-3 text-sm">
          <p className="text-amber-600 dark:text-amber-400">
            Votre adresse n&apos;est pas encore confirmée. Nous venons de vous
            renvoyer un lien de vérification à{" "}
            <span className="font-medium">{unverifiedEmail}</span>.
          </p>
          {resent ? (
            <p className={successClass}>Nouveau lien envoyé.</p>
          ) : (
            <button type="button" onClick={resend} className={buttonGhostClass}>
              Renvoyer le lien
            </button>
          )}
        </div>
      )}

      <div>
        <label htmlFor="email" className={labelClass}>
          Adresse e-mail
        </label>
        <input
          id="email"
          name="email"
          type="email"
          autoComplete="email"
          required
          className={inputClass}
        />
      </div>
      <div>
        <label htmlFor="password" className={labelClass}>
          Mot de passe
        </label>
        <input
          id="password"
          name="password"
          type="password"
          autoComplete="current-password"
          required
          className={inputClass}
        />
      </div>
      <button type="submit" disabled={loading} className={`${buttonClass} w-full`}>
        {loading ? "Connexion…" : "Se connecter"}
      </button>
      <p className="text-center text-sm text-muted">
        Pas encore de compte ?{" "}
        <Link href="/inscription" className="font-medium text-accent hover:underline">
          Inscrivez-vous
        </Link>
      </p>
    </form>
  );
}
