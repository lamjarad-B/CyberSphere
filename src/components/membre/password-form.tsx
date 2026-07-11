"use client";

import { useState } from "react";
import { authClient } from "@/lib/auth-client";
import { useI18n } from "@/components/i18n-provider";
import {
  buttonClass,
  errorClass,
  inputClass,
  labelClass,
  successClass,
} from "@/components/ui";

export function PasswordForm() {
  const { t } = useI18n();
  const labels = t.member.password;
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
      setError(labels.tooShort);
      return;
    }
    if (newPassword !== confirm) {
      setError(t.auth.passwordsMismatch);
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
        error.code === "INVALID_PASSWORD" ? labels.wrongCurrent : t.auth.genericError,
      );
      return;
    }

    setSaved(true);
    form.reset();
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {error && <p className={errorClass}>{error}</p>}
      {saved && <p className={successClass}>{labels.saved}</p>}

      <div>
        <label htmlFor="current" className={labelClass}>
          {labels.current}
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
          {labels.new}
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
          {labels.confirm}
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
        {loading ? labels.submitting : labels.submit}
      </button>
    </form>
  );
}
