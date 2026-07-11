"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { authClient } from "@/lib/auth-client";
import { formatDateTime } from "@/lib/format";
import { useI18n } from "@/components/i18n-provider";
import {
  buttonDangerClass,
  buttonGhostClass,
  errorClass,
  inputClass,
  labelClass,
} from "@/components/ui";

export type PasskeyItem = {
  id: string;
  name: string | null;
  deviceType: string;
  createdAt: Date | null;
};

export function PasskeyManager({ passkeys }: { passkeys: PasskeyItem[] }) {
  const router = useRouter();
  const { locale, t } = useI18n();
  const labels = t.member.passkeys;
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function add(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const name = String(form.get("name") ?? "").trim() || undefined;
    setError(null);
    setLoading(true);

    const result = await authClient.passkey.addPasskey({ name });
    setLoading(false);

    if (result?.error) {
      setError(labels.addError);
      return;
    }
    (event.target as HTMLFormElement).reset?.();
    router.refresh();
  }

  async function remove(id: string) {
    setError(null);
    const { error } = await authClient.passkey.deletePasskey({ id });
    if (error) {
      setError(labels.deleteError);
      return;
    }
    router.refresh();
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted">{labels.intro}</p>
      {error && <p className={errorClass}>{error}</p>}

      {passkeys.length > 0 && (
        <ul className="divide-y divide-border rounded-md border border-border">
          {passkeys.map((passkey) => (
            <li key={passkey.id} className="flex items-center justify-between gap-3 p-3">
              <div className="min-w-0">
                <p className="truncate text-sm font-medium">
                  {passkey.name || labels.unnamed}
                </p>
                <p className="text-xs text-muted">
                  {passkey.deviceType === "multiDevice"
                    ? labels.synced
                    : labels.singleDevice}
                  {passkey.createdAt
                    ? ` · ${labels.addedOn} ${formatDateTime(passkey.createdAt, locale)}`
                    : null}
                </p>
              </div>
              <button
                type="button"
                onClick={() => remove(passkey.id)}
                className={buttonDangerClass}
              >
                {labels.delete}
              </button>
            </li>
          ))}
        </ul>
      )}

      <form onSubmit={add} className="space-y-3" noValidate>
        <div>
          <label htmlFor="passkey-name" className={labelClass}>
            {labels.nameLabel}{" "}
            <span className="font-normal text-muted">{labels.nameHint}</span>
          </label>
          <input
            id="passkey-name"
            name="name"
            type="text"
            maxLength={60}
            className={inputClass}
          />
        </div>
        <button type="submit" disabled={loading} className={buttonGhostClass}>
          {loading ? labels.adding : labels.add}
        </button>
      </form>
    </div>
  );
}
