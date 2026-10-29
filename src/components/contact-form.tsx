"use client";

import { useCallback, useState, useTransition } from "react";
import { sendContactMessage } from "@/actions/contact";
import { useI18n } from "@/components/i18n-provider";
import { TurnstileWidget, captchaEnabled } from "@/components/auth/turnstile-widget";
import { buttonClass, errorClass, inputClass, labelClass, successClass } from "@/components/ui";

export function ContactForm({
  defaultName = "",
  defaultEmail = "",
}: {
  defaultName?: string;
  defaultEmail?: string;
}) {
  const { t } = useI18n();
  const c = t.contact;
  const [name, setName] = useState(defaultName);
  const [email, setEmail] = useState(defaultEmail);
  const [subject, setSubject] = useState("");
  const [message, setMessage] = useState("");
  // Honeypot anti-bot : champ invisible, jamais rempli par un humain
  const [website, setWebsite] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);
  const [pending, startTransition] = useTransition();
  const [captchaToken, setCaptchaToken] = useState<string | null>(null);
  // Jeton Turnstile à usage unique : le widget est régénéré après chaque envoi
  const [captchaKey, setCaptchaKey] = useState(0);
  const onCaptcha = useCallback((token: string | null) => setCaptchaToken(token), []);

  function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setSent(false);
    startTransition(async () => {
      const result = await sendContactMessage({
        name,
        email,
        subject,
        message,
        website,
        captchaToken,
      });
      setCaptchaToken(null);
      setCaptchaKey((key) => key + 1);
      if (!result.ok) {
        setError(result.error ?? c.genericError);
        return;
      }
      setSubject("");
      setMessage("");
      setSent(true);
    });
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      {sent && (
        <p className={successClass} role="status">
          {c.success}
        </p>
      )}
      {error && (
        <p className={errorClass} role="alert">
          {error}
        </p>
      )}
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor="contact-name" className={labelClass}>
            {c.name}
          </label>
          <input
            id="contact-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
            minLength={2}
            maxLength={80}
            autoComplete="name"
            className={inputClass}
          />
        </div>
        <div>
          <label htmlFor="contact-email" className={labelClass}>
            {c.email}
          </label>
          <input
            id="contact-email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            autoComplete="email"
            className={inputClass}
          />
        </div>
      </div>
      <div>
        <label htmlFor="contact-subject" className={labelClass}>
          {c.subject}
        </label>
        <input
          id="contact-subject"
          value={subject}
          onChange={(e) => setSubject(e.target.value)}
          required
          minLength={3}
          maxLength={120}
          className={inputClass}
        />
      </div>
      <div>
        <label htmlFor="contact-message" className={labelClass}>
          {c.message}
        </label>
        <textarea
          id="contact-message"
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          required
          minLength={10}
          maxLength={5000}
          rows={8}
          className={inputClass}
        />
        <p className="mt-1 text-right text-xs text-muted">{message.length} / 5000</p>
      </div>
      <input
        type="text"
        name="website"
        value={website}
        onChange={(e) => setWebsite(e.target.value)}
        tabIndex={-1}
        autoComplete="off"
        aria-hidden="true"
        className="absolute -left-[9999px] h-0 w-0 opacity-0"
      />
      {/* CAPTCHA chargé seulement une fois le message entamé */}
      {message && <TurnstileWidget key={captchaKey} onToken={onCaptcha} />}
      <div className="flex items-center justify-between gap-4">
        <p className="text-xs text-muted">{c.privacy}</p>
        <button
          type="submit"
          disabled={pending || (captchaEnabled && !captchaToken)}
          className={buttonClass}
        >
          {pending ? c.sending : c.send}
        </button>
      </div>
    </form>
  );
}
