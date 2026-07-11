"use client";

import Link from "next/link";
import { useCallback, useState } from "react";
import { authClient } from "@/lib/auth-client";
import { localeHref } from "@/lib/i18n";
import { useI18n } from "@/components/i18n-provider";
import { buttonClass, errorClass, inputClass, labelClass, successClass } from "@/components/ui";
import {
  TurnstileWidget,
  captchaEnabled,
  captchaHeaders,
} from "@/components/auth/turnstile-widget";

export function ForgotPasswordForm() {
  const { locale, t } = useI18n();
  const labels = t.auth.forgot;
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const [captchaToken, setCaptchaToken] = useState<string | null>(null);
  const onCaptcha = useCallback((token: string | null) => setCaptchaToken(token), []);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setError(null);
    setLoading(true);

    const { error } = await authClient.requestPasswordReset(
      {
        email: String(form.get("email") ?? ""),
        redirectTo: localeHref(locale, "/reinitialisation"),
      },
      { headers: captchaHeaders(captchaToken) },
    );
    setLoading(false);

    if (error) {
      if (error.status === 429) {
        setError(t.auth.tooManyAttempts);
        return;
      }
      setError(t.auth.genericError);
      return;
    }
    // Toujours le même message, que l'adresse existe ou non :
    // ne divulgue pas quels comptes sont enregistrés.
    setSent(true);
  }

  if (sent) {
    return (
      <div className="space-y-4">
        <p className={successClass}>{labels.sent}</p>
        <Link href={localeHref(locale, "/connexion")} className={`${buttonClass} w-full`}>
          {labels.backToLogin}
        </Link>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4" noValidate>
      {error && <p className={errorClass}>{error}</p>}
      <div>
        <label htmlFor="email" className={labelClass}>
          {labels.emailLabel}
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

      <TurnstileWidget onToken={onCaptcha} />

      <button
        type="submit"
        disabled={loading || (captchaEnabled && !captchaToken)}
        className={`${buttonClass} w-full`}
      >
        {loading ? labels.submitting : labels.submit}
      </button>
      <p className="text-center text-sm text-muted">
        <Link
          href={localeHref(locale, "/connexion")}
          className="font-medium text-accent hover:underline"
        >
          {labels.backToLogin}
        </Link>
      </p>
    </form>
  );
}
