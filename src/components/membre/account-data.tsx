"use client";

import { useState } from "react";
import { authClient } from "@/lib/auth-client";
import { localeHref } from "@/lib/i18n";
import { useI18n } from "@/components/i18n-provider";
import {
  buttonDangerClass,
  buttonGhostClass,
  errorClass,
  inputClass,
  labelClass,
} from "@/components/ui";

/** Export et suppression du compte (droits RGPD d'accès et d'effacement). */
export function AccountData({ isStaff }: { isStaff: boolean }) {
  const { locale, t } = useI18n();
  const labels = t.member.data;
  const [confirmText, setConfirmText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleDelete(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setError(null);
    setLoading(true);
    const { error } = await authClient.deleteUser({
      password: String(form.get("password") ?? ""),
    });
    setLoading(false);
    if (error) {
      setError(
        error.status === 429
          ? t.auth.tooManyAttempts
          : error.status === 403
            ? labels.staffForbidden
            : labels.wrongPassword,
      );
      return;
    }
    // Compte supprimé, cookie de session effacé : retour à l'accueil
    window.location.assign(localeHref(locale, "/"));
  }

  return (
    <div className="space-y-6">
      <p className="text-sm text-muted">{labels.intro}</p>
      {/* Lien classique : le navigateur télécharge le fichier JSON */}
      <a href="/api/compte/export" className={buttonGhostClass} download>
        {labels.export}
      </a>

      <div className="space-y-3 border-t border-border pt-6">
        <h3 className="font-semibold text-red-500">{labels.deleteTitle}</h3>
        {isStaff ? (
          <p className="text-sm text-muted">{labels.staffForbidden}</p>
        ) : (
          <form onSubmit={handleDelete} className="space-y-3" noValidate>
            <p className="text-sm text-muted">{labels.deleteWarning}</p>
            {error && <p className={errorClass}>{error}</p>}
            <div>
              <label htmlFor="delete-password" className={labelClass}>
                {labels.passwordLabel}
              </label>
              <input
                id="delete-password"
                name="password"
                type="password"
                autoComplete="current-password"
                required
                className={inputClass}
              />
            </div>
            <div>
              <label htmlFor="delete-confirm" className={labelClass}>
                {labels.confirmLabel}
              </label>
              <input
                id="delete-confirm"
                type="text"
                value={confirmText}
                onChange={(e) => setConfirmText(e.target.value)}
                autoComplete="off"
                className={inputClass}
              />
            </div>
            <button
              type="submit"
              disabled={loading || confirmText.trim() !== labels.confirmWord}
              className={buttonDangerClass}
            >
              {loading ? labels.submitting : labels.submit}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
