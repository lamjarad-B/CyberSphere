"use client";

import { useTransition } from "react";

type ActionButtonProps = {
  action: () => Promise<{ ok: boolean; error?: string }>;
  label: string;
  pendingLabel?: string;
  confirmMessage?: string;
  className?: string;
};

/** Bouton générique qui exécute une Server Action avec confirmation optionnelle. */
export function ActionButton({
  action,
  label,
  pendingLabel,
  confirmMessage,
  className,
}: ActionButtonProps) {
  const [pending, startTransition] = useTransition();

  function run() {
    if (confirmMessage && !window.confirm(confirmMessage)) return;
    startTransition(async () => {
      const result = await action();
      if (!result.ok) window.alert(result.error ?? "Une erreur est survenue.");
    });
  }

  return (
    <button type="button" onClick={run} disabled={pending} className={className}>
      {pending ? (pendingLabel ?? "…") : label}
    </button>
  );
}
