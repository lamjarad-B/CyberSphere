"use client";

import Link from "next/link";
import { useState } from "react";
import { authClient } from "@/lib/auth-client";
import { registerSchema, firstError } from "@/lib/validations";
import {
  buttonClass,
  errorClass,
  inputClass,
  labelClass,
  successClass,
} from "@/components/ui";

function messageFor(code: string | undefined, status: number): string {
  if (status === 429) return "Trop de tentatives. Réessayez dans une minute.";
  switch (code) {
    case "USER_ALREADY_EXISTS":
      return "Un compte existe déjà avec cette adresse e-mail.";
    case "PASSWORD_TOO_SHORT":
      return "Le mot de passe doit contenir au moins 8 caractères.";
    default:
      return "Une erreur est survenue. Réessayez.";
  }
}

export function RegisterForm() {
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [registeredEmail, setRegisteredEmail] = useState<string | null>(null);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setError(null);

    const parsed = registerSchema.safeParse({
      name: String(form.get("name") ?? ""),
      email: String(form.get("email") ?? ""),
      password: String(form.get("password") ?? ""),
    });
    if (!parsed.success) {
      setError(firstError(parsed.error));
      return;
    }
    if (parsed.data.password !== String(form.get("confirm") ?? "")) {
      setError("Les deux mots de passe ne correspondent pas.");
      return;
    }

    setLoading(true);
    const { error } = await authClient.signUp.email(parsed.data);
    setLoading(false);

    if (error) {
      setError(messageFor(error.code, error.status));
      return;
    }

    // Vérification obligatoire : aucune session n'est créée, on invite
    // l'utilisateur à confirmer son adresse.
    setRegisteredEmail(parsed.data.email);
  }

  if (registeredEmail) {
    return (
      <div className="space-y-4">
        <p className={successClass}>
          Compte créé ! Un e-mail de confirmation vient d&apos;être envoyé à{" "}
          <span className="font-medium">{registeredEmail}</span>.
        </p>
        <p className="text-sm text-muted">
          Cliquez sur le lien reçu pour activer votre compte, puis connectez-vous.
          Pensez à vérifier vos courriers indésirables.
        </p>
        <Link href="/connexion" className={`${buttonClass} w-full`}>
          Aller à la connexion
        </Link>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4" noValidate>
      {error && <p className={errorClass}>{error}</p>}
      <div>
        <label htmlFor="name" className={labelClass}>
          Nom (pseudonyme)
        </label>
        <input
          id="name"
          name="name"
          type="text"
          autoComplete="username"
          required
          className={inputClass}
        />
      </div>
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
          Mot de passe <span className="font-normal text-muted">(8 caractères minimum)</span>
        </label>
        <input
          id="password"
          name="password"
          type="password"
          autoComplete="new-password"
          required
          className={inputClass}
        />
      </div>
      <div>
        <label htmlFor="confirm" className={labelClass}>
          Confirmez le mot de passe
        </label>
        <input
          id="confirm"
          name="confirm"
          type="password"
          autoComplete="new-password"
          required
          className={inputClass}
        />
      </div>
      <button type="submit" disabled={loading} className={`${buttonClass} w-full`}>
        {loading ? "Création du compte…" : "Créer mon compte"}
      </button>
      <p className="text-center text-sm text-muted">
        Déjà membre ?{" "}
        <Link href="/connexion" className="font-medium text-accent hover:underline">
          Connectez-vous
        </Link>
      </p>
    </form>
  );
}
