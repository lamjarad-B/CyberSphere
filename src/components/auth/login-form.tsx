"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useState } from "react";
import { authClient } from "@/lib/auth-client";
import { localeHref } from "@/lib/i18n";
import { useI18n } from "@/components/i18n-provider";
import {
  buttonClass,
  buttonGhostClass,
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

export function LoginForm({ redirection }: { redirection?: string }) {
  const router = useRouter();
  const { locale, t } = useI18n();
  const labels = t.auth.login;
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  // Mémorise l'e-mail non vérifié pour proposer le renvoi du lien
  const [unverifiedEmail, setUnverifiedEmail] = useState<string | null>(null);
  const [resent, setResent] = useState(false);
  const [captchaToken, setCaptchaToken] = useState<string | null>(null);
  const onCaptcha = useCallback((token: string | null) => setCaptchaToken(token), []);

  const target =
    redirection && redirection.startsWith("/") && !redirection.startsWith("//")
      ? redirection
      : localeHref(locale, "/");

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const email = String(form.get("email") ?? "");
    setLoading(true);
    setError(null);
    setUnverifiedEmail(null);
    setResent(false);

    const { data, error } = await authClient.signIn.email(
      {
        email,
        password: String(form.get("password") ?? ""),
      },
      { headers: captchaHeaders(captchaToken) },
    );

    if (error) {
      setLoading(false);
      if (error.status === 429) {
        setError(t.auth.tooManyAttempts);
        return;
      }
      if (error.code === "EMAIL_NOT_VERIFIED") {
        // sendOnSignIn a déjà renvoyé un lien de vérification
        setUnverifiedEmail(email);
        return;
      }
      if (error.code === "BANNED_USER") {
        setError(labels.banned);
        return;
      }
      setError(labels.invalidCredentials);
      return;
    }

    // 2FA activée : le client redirige vers /deux-facteurs (twoFactorClient)
    if (data && "twoFactorRedirect" in data) return;

    router.push(target);
    router.refresh();
  }

  async function signInWithPasskey() {
    setError(null);
    const result = await authClient.signIn.passkey();
    if (result?.error) {
      setError(labels.passkeyError);
      return;
    }
    router.push(target);
    router.refresh();
  }

  async function resend() {
    if (!unverifiedEmail) return;
    setResent(false);
    await authClient.sendVerificationEmail({
      email: unverifiedEmail,
      callbackURL: localeHref(locale, "/"),
    });
    setResent(true);
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4" noValidate>
      {error && <p className={errorClass}>{error}</p>}

      {unverifiedEmail && (
        <div className="space-y-3 rounded-md border border-amber-500/40 bg-amber-500/10 p-3 text-sm">
          <p className="text-amber-600 dark:text-amber-400">
            {labels.unverifiedNotice}{" "}
            <span className="font-medium">{unverifiedEmail}</span>.
          </p>
          {resent ? (
            <p className={successClass}>{labels.resent}</p>
          ) : (
            <button type="button" onClick={resend} className={buttonGhostClass}>
              {labels.resendLink}
            </button>
          )}
        </div>
      )}

      <div>
        <label htmlFor="email" className={labelClass}>
          {t.auth.email}
        </label>
        <input
          id="email"
          name="email"
          type="email"
          autoComplete="email webauthn"
          required
          className={inputClass}
        />
      </div>
      <div>
        <div className="mb-1.5 flex items-baseline justify-between">
          <label htmlFor="password" className={`${labelClass} mb-0`}>
            {t.auth.password}
          </label>
          <Link
            href={localeHref(locale, "/mot-de-passe-oublie")}
            className="text-xs text-muted hover:text-accent hover:underline"
          >
            {labels.forgotPassword}
          </Link>
        </div>
        <input
          id="password"
          name="password"
          type="password"
          autoComplete="current-password"
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

      <button
        type="button"
        onClick={signInWithPasskey}
        className={`${buttonGhostClass} w-full`}
      >
        <svg
          aria-hidden
          viewBox="0 0 24 24"
          className="h-4 w-4"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <circle cx="12" cy="8" r="5" />
          <path d="M4 21v-1a7 7 0 0 1 10-6.3" />
          <path d="M17 13l4 4m0-4l-4 4" />
        </svg>
        {labels.passkey}
      </button>

      <p className="text-center text-sm text-muted">
        {labels.noAccount}{" "}
        <Link
          href={localeHref(locale, "/inscription")}
          className="font-medium text-accent hover:underline"
        >
          {labels.registerLink}
        </Link>
      </p>
    </form>
  );
}
