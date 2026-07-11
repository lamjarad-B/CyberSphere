"use client";

import { useState, useTransition } from "react";
import { subscribeNewsletter } from "@/actions/newsletter";
import { useI18n } from "@/components/i18n-provider";
import { buttonClass, inputClass } from "@/components/ui";

export function NewsletterForm() {
  const { locale, t } = useI18n();
  const [email, setEmail] = useState("");
  // Honeypot anti-bot : champ invisible, jamais rempli par un humain
  const [website, setWebsite] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage(null);
    startTransition(async () => {
      const result = await subscribeNewsletter({ email, website, locale });
      if (!result.ok) {
        setMessage(result.error ?? t.newsletter.genericError);
        return;
      }
      setEmail("");
      setMessage(t.newsletter.success);
    });
  }

  return (
    <form onSubmit={submit} className="w-full max-w-sm space-y-2" noValidate>
      <p className="text-sm font-semibold">{t.newsletter.title}</p>
      <div className="flex gap-2">
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder={t.newsletter.emailPlaceholder}
          aria-label={t.newsletter.emailAria}
          required
          className={inputClass}
        />
        <button type="submit" disabled={pending} className={buttonClass}>
          {pending ? "…" : t.newsletter.subscribe}
        </button>
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
      {message && <p className="text-xs text-muted">{message}</p>}
      <p className="text-xs text-muted">{t.newsletter.note}</p>
    </form>
  );
}
