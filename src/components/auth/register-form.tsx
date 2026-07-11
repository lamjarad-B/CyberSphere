"use client";

import Link from "next/link";
import { useCallback, useState } from "react";
import { authClient } from "@/lib/auth-client";
import { registerSchema, firstError } from "@/lib/validations";
import { localeHref } from "@/lib/i18n";
import { useI18n } from "@/components/i18n-provider";
import type { Dictionary } from "@/i18n/dictionaries";
import {
  buttonClass,
  errorClass,
  inputClass,
  labelClass,
  successClass,
} from "@/components/ui";
import {
  TurnstileWidget,
  captchaEnabled,
  captchaHeaders,
} from "@/components/auth/turnstile-widget";

function messageFor(
  code: string | undefined,
  status: number,
  t: Dictionary["auth"],
): string {
  if (status === 429) return t.tooManyAttempts;
  switch (code) {
    case "USER_ALREADY_EXISTS":
      return t.register.alreadyExists;
    case "PASSWORD_TOO_SHORT":
      return t.register.passwordTooShort;
    case "PASSWORD_COMPROMISED":
      return t.passwordCompromised;
    default:
      return t.genericError;
  }
}

export function RegisterForm() {
  const { locale, t } = useI18n();
  const labels = t.auth.register;
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [registeredEmail, setRegisteredEmail] = useState<string | null>(null);
  const [captchaToken, setCaptchaToken] = useState<string | null>(null);
  const onCaptcha = useCallback((token: string | null) => setCaptchaToken(token), []);

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
      setError(t.auth.passwordsMismatch);
      return;
    }

    setLoading(true);
    const { error } = await authClient.signUp.email(parsed.data, {
      headers: captchaHeaders(captchaToken),
    });
    setLoading(false);

    if (error) {
      setError(messageFor(error.code, error.status, t.auth));
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
          {labels.created}{" "}
          <span className="font-medium">{registeredEmail}</span>.
        </p>
        <p className="text-sm text-muted">{labels.checkInbox}</p>
        <Link href={localeHref(locale, "/connexion")} className={`${buttonClass} w-full`}>
          {labels.goToLogin}
        </Link>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4" noValidate>
      {error && <p className={errorClass}>{error}</p>}
      <div>
        <label htmlFor="name" className={labelClass}>
          {labels.name}
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
          {t.auth.email}
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
          {t.auth.password}{" "}
          <span className="font-normal text-muted">{t.auth.passwordMin}</span>
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
          {labels.confirmPassword}
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
      <TurnstileWidget onToken={onCaptcha} />

      <button
        type="submit"
        disabled={loading || (captchaEnabled && !captchaToken)}
        className={`${buttonClass} w-full`}
      >
        {loading ? labels.submitting : labels.submit}
      </button>
      <p className="text-center text-sm text-muted">
        {labels.alreadyMember}{" "}
        <Link
          href={localeHref(locale, "/connexion")}
          className="font-medium text-accent hover:underline"
        >
          {labels.loginLink}
        </Link>
      </p>
    </form>
  );
}
