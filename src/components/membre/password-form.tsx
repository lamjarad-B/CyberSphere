"use client";

import { useState } from "react";
import { authClient } from "@/lib/auth-client";
import {
  buttonClass,
  errorClass,
  inputClass,
  labelClass,
  successClass,
} from "@/components/ui";

export function PasswordForm() {
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    const currentPassword = String(data.get("current") ?? "");
    const newPassword = String(data.get("new") ?? "");
    const confirm = String(data.get("confirm") ?? "");

    setError(null);
    setSaved(false);

    if (newPassword.length < 8) {
      setError("Le nouveau mot de passe doit contenir au moins 8 caractères.");
      return;
    }
    if (newPassword !== confirm) {
      setError("Les deux mots de passe ne correspondent pas.");
      return;
    }

    setLoading(true);
    const { error } = await authClient.changePassword({
      currentPassword,
      newPassword,
      revokeOtherSessions: true,
    });
    setLoading(false);

    if (error) {
      setError(
        error.code === "INVALID_PASSWORD"
          ? "Mot de passe actuel incorrect."
          : "Une erreur est survenue. Réessayez.",
      );
      return;
    }

    setSaved(true);
    form.reset();
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {error && <p className={errorClass}>{error}</p>}
      {saved && <p className={successClass}>Mot de passe modifié.</p>}

      <div>
        <label htmlFor="current" className={labelClass}>
          Mot de passe actuel
        </label>
        <input
          id="current"
          name="current"
          type="password"
          autoComplete="current-password"
          required
          className={inputClass}
        />
      </div>
      <div>
        <label htmlFor="new" className={labelClass}>
          Nouveau mot de passe
        </label>
        <input
          id="new"
          name="new"
          type="password"
          autoComplete="new-password"
          required
          className={inputClass}
        />
      </div>
      <div>
        <label htmlFor="confirm" className={labelClass}>
          Confirmez le nouveau mot de passe
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

      <button type="submit" disabled={loading} className={buttonClass}>
        {loading ? "Modification…" : "Changer le mot de passe"}
      </button>
    </form>
  );
}
