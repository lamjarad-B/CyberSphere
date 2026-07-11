"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { authClient } from "@/lib/auth-client";
import { localeHref } from "@/lib/i18n";
import { useI18n } from "@/components/i18n-provider";
import { buttonClass, errorClass, inputClass, labelClass, successClass } from "@/components/ui";

export function ResetPasswordForm({ token }: { token?: string }) {
  const router = useRouter();
  const { locale, t } = useI18n();
  const labels = t.auth.reset;
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);

  if (!token) {
    return (
      <div className="space-y-4">
        <p className={errorClass}>{labels.invalidLink}</p>
        <Link
          href={localeHref(locale, "/mot-de-passe-oublie")}
          className={`${buttonClass} w-full`}
        >
          {labels.requestNewLink}
        </Link>
      </div>
    );
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const password = String(form.get("password") ?? "");
    if (password.length < 8) {
      setError(t.auth.register.passwordTooShort);
      return;
    }
    if (password !== String(form.get("confirm") ?? "")) {
      setError(t.auth.passwordsMismatch);
      return;
    }

    setError(null);
    setLoading(true);
    const { error } = await authClient.resetPassword({
      newPassword: password,
      token: token as string,
    });
    setLoading(false);

    if (error) {
      if (error.code === "PASSWORD_COMPROMISED") {
        setError(t.auth.passwordCompromised);
        return;
      }
      setError(labels.expired);
      return;
    }

    setDone(true);
    setTimeout(() => router.push(localeHref(locale, "/connexion")), 2500);
  }

  if (done) {
    return (
      <div className="space-y-4">
        <p className={successClass}>{labels.done}</p>
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
        <label htmlFor="password" className={labelClass}>
          {labels.newPassword}{" "}
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
          {labels.confirmNewPassword}
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
        {loading ? labels.submitting : labels.submit}
      </button>
    </form>
  );
}
