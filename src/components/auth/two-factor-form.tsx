"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { authClient } from "@/lib/auth-client";
import { localeHref } from "@/lib/i18n";
import { useI18n } from "@/components/i18n-provider";
import { buttonClass, errorClass, inputClass, labelClass } from "@/components/ui";

export function TwoFactorForm() {
  const router = useRouter();
  const { locale, t } = useI18n();
  const labels = t.auth.twoFactor;
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [useBackup, setUseBackup] = useState(false);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const code = String(form.get("code") ?? "").trim();
    setError(null);
    setLoading(true);

    const { error } = useBackup
      ? await authClient.twoFactor.verifyBackupCode({ code })
      : await authClient.twoFactor.verifyTotp({ code });
    setLoading(false);

    if (error) {
      if (error.status === 429) {
        setError(t.auth.tooManyAttempts);
        return;
      }
      setError(useBackup ? labels.invalidBackup : labels.invalidTotp);
      return;
    }

    router.push(localeHref(locale, "/"));
    router.refresh();
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4" noValidate>
      {error && <p className={errorClass}>{error}</p>}
      <div>
        <label htmlFor="code" className={labelClass}>
          {useBackup ? labels.backupLabel : labels.totpLabel}
        </label>
        <input
          id="code"
          name="code"
          type="text"
          inputMode={useBackup ? "text" : "numeric"}
          autoComplete="one-time-code"
          placeholder={useBackup ? "xxxxx-xxxxx" : "123456"}
          required
          autoFocus
          className={`${inputClass} text-center font-mono tracking-widest`}
        />
      </div>
      <button type="submit" disabled={loading} className={`${buttonClass} w-full`}>
        {loading ? labels.submitting : labels.submit}
      </button>
      <button
        type="button"
        onClick={() => {
          setUseBackup((v) => !v);
          setError(null);
        }}
        className="w-full text-center text-sm text-muted hover:text-accent hover:underline"
      >
        {useBackup ? labels.useTotp : labels.useBackup}
      </button>
    </form>
  );
}
