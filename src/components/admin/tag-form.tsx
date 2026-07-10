"use client";

import { useState, useTransition } from "react";
import { createTag } from "@/actions/tags";
import { buttonClass, errorClass, inputClass } from "@/components/ui";

export function TagForm() {
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    startTransition(async () => {
      const result = await createTag(name);
      if (!result.ok) {
        setError(result.error ?? "Une erreur est survenue.");
        return;
      }
      setName("");
    });
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      {error && <p className={errorClass}>{error}</p>}
      <div className="flex gap-2">
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Nom du tag…"
          aria-label="Nom du tag"
          maxLength={40}
          className={inputClass}
        />
        <button
          type="submit"
          disabled={pending || name.trim().length < 2}
          className={buttonClass}
        >
          {pending ? "Création…" : "Créer"}
        </button>
      </div>
    </form>
  );
}
