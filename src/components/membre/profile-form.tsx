"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { updateProfile } from "@/actions/profile";
import {
  buttonClass,
  errorClass,
  inputClass,
  labelClass,
  successClass,
} from "@/components/ui";

export function ProfileForm({
  name,
  image,
}: {
  name: string;
  image: string | null;
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [pending, startTransition] = useTransition();

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    setError(null);
    setSaved(false);
    startTransition(async () => {
      const result = await updateProfile(formData);
      if (!result.ok) {
        setError(result.error ?? "Une erreur est survenue.");
        return;
      }
      setSaved(true);
      router.refresh();
    });
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {error && <p className={errorClass}>{error}</p>}
      {saved && <p className={successClass}>Profil mis à jour.</p>}

      <div className="flex items-center gap-4">
        {image ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={image}
            alt="Avatar actuel"
            className="h-16 w-16 rounded-full border border-border object-cover"
          />
        ) : (
          <span className="flex h-16 w-16 items-center justify-center rounded-full bg-accent/15 font-mono text-xl font-bold text-accent">
            {name.charAt(0).toUpperCase()}
          </span>
        )}
        <div className="flex-1">
          <label htmlFor="avatar" className={labelClass}>
            Avatar <span className="font-normal text-muted">(png, jpg, webp — 5 Mo max)</span>
          </label>
          <input
            id="avatar"
            name="avatar"
            type="file"
            accept="image/png,image/jpeg,image/webp,image/gif"
            className="block w-full text-sm text-muted file:mr-3 file:rounded-md file:border file:border-border file:bg-surface file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-foreground"
          />
        </div>
      </div>

      <div>
        <label htmlFor="name" className={labelClass}>
          Nom (pseudonyme)
        </label>
        <input
          id="name"
          name="name"
          type="text"
          defaultValue={name}
          required
          className={inputClass}
        />
      </div>

      <button type="submit" disabled={pending} className={buttonClass}>
        {pending ? "Enregistrement…" : "Enregistrer"}
      </button>
    </form>
  );
}
