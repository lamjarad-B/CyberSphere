"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import QRCode from "qrcode";
import { authClient } from "@/lib/auth-client";
import { useI18n } from "@/components/i18n-provider";
import {
  buttonClass,
  buttonDangerClass,
  buttonGhostClass,
  errorClass,
  inputClass,
  labelClass,
  successClass,
} from "@/components/ui";

type Step =
  | { name: "idle" }
  | { name: "setup"; totpUri: string; qrDataUrl: string; backupCodes: string[] }
  | { name: "done" };

export function TwoFactorSetup({ enabled }: { enabled: boolean }) {
  const router = useRouter();
  const { t } = useI18n();
  const labels = t.member.twoFactor;
  const [step, setStep] = useState<Step>({ name: "idle" });
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function enable(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setError(null);
    setLoading(true);

    const { data, error } = await authClient.twoFactor.enable({
      password: String(form.get("password") ?? ""),
    });
    setLoading(false);

    if (error || !data) {
      setError(
        error?.status === 429 ? t.auth.tooManyAttempts : labels.wrongPassword,
      );
      return;
    }

    const qrDataUrl = await QRCode.toDataURL(data.totpURI, { margin: 1, width: 220 });
    setStep({
      name: "setup",
      totpUri: data.totpURI,
      qrDataUrl,
      backupCodes: data.backupCodes,
    });
  }

  async function confirm(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setError(null);
    setLoading(true);

    const { error } = await authClient.twoFactor.verifyTotp({
      code: String(form.get("code") ?? "").trim(),
    });
    setLoading(false);

    if (error) {
      setError(labels.invalidCode);
      return;
    }
    setStep({ name: "done" });
    router.refresh();
  }

  async function disable(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setError(null);
    setLoading(true);

    const { error } = await authClient.twoFactor.disable({
      password: String(form.get("password") ?? ""),
    });
    setLoading(false);

    if (error) {
      setError(labels.wrongPassword);
      return;
    }
    setStep({ name: "idle" });
    router.refresh();
  }

  if (step.name === "setup") {
    return (
      <div className="space-y-4">
        {error && <p className={errorClass}>{error}</p>}
        <ol className="list-decimal space-y-2 pl-5 text-sm text-muted">
          <li>{labels.step1}</li>
          <li>{labels.step2}</li>
          <li>{labels.step3}</li>
        </ol>

        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={step.qrDataUrl}
          alt={labels.qrAlt}
          className="mx-auto rounded-md border border-border bg-white p-2"
          width={220}
          height={220}
        />

        <div>
          <p className={labelClass}>{labels.backupCodes}</p>
          <div className="grid grid-cols-2 gap-1 rounded-md border border-border bg-background p-3 font-mono text-xs sm:grid-cols-3">
            {step.backupCodes.map((code) => (
              <span key={code}>{code}</span>
            ))}
          </div>
        </div>

        <form onSubmit={confirm} className="space-y-3" noValidate>
          <div>
            <label htmlFor="totp-confirm" className={labelClass}>
              {labels.totpCode}
            </label>
            <input
              id="totp-confirm"
              name="code"
              type="text"
              inputMode="numeric"
              autoComplete="one-time-code"
              required
              className={`${inputClass} text-center font-mono tracking-widest`}
            />
          </div>
          <button type="submit" disabled={loading} className={buttonClass}>
            {loading ? labels.activating : labels.activate}
          </button>
        </form>
      </div>
    );
  }

  if (enabled || step.name === "done") {
    return (
      <div className="space-y-4">
        <p className={successClass}>
          {labels.enabledLabel} <strong>{labels.enabledWord}</strong>.{" "}
          {labels.enabledNotice}
        </p>
        {error && <p className={errorClass}>{error}</p>}
        <form onSubmit={disable} className="space-y-3" noValidate>
          <div>
            <label htmlFor="disable-password" className={labelClass}>
              {labels.passwordToDisable}
            </label>
            <input
              id="disable-password"
              name="password"
              type="password"
              autoComplete="current-password"
              required
              className={inputClass}
            />
          </div>
          <button type="submit" disabled={loading} className={buttonDangerClass}>
            {loading ? labels.disabling : labels.disable}
          </button>
        </form>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted">{labels.intro}</p>
      {error && <p className={errorClass}>{error}</p>}
      <form onSubmit={enable} className="space-y-3" noValidate>
        <div>
          <label htmlFor="enable-password" className={labelClass}>
            {labels.passwordConfirm}
          </label>
          <input
            id="enable-password"
            name="password"
            type="password"
            autoComplete="current-password"
            required
            className={inputClass}
          />
        </div>
        <button type="submit" disabled={loading} className={buttonGhostClass}>
          {loading ? labels.enabling : labels.enable}
        </button>
      </form>
    </div>
  );
}
