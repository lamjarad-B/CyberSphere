"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { saveSeries } from "@/actions/series";
import {
  buttonClass,
  buttonGhostClass,
  errorClass,
  inputClass,
  labelClass,
} from "@/components/ui";

type SeriesFormProps = {
  series?: {
    id: string;
    title: string;
    description: string;
    titleEn: string;
    descriptionEn: string;
  };
};

export function SeriesForm({ series }: SeriesFormProps) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    setError(null);
    startTransition(async () => {
      const result = await saveSeries(series?.id ?? null, {
        title: String(data.get("title") ?? ""),
        description: String(data.get("description") ?? ""),
        titleEn: String(data.get("titleEn") ?? ""),
        descriptionEn: String(data.get("descriptionEn") ?? ""),
      });
      if (!result.ok) {
        setError(result.error ?? "Une erreur est survenue.");
        return;
      }
      if (!series) form.reset();
      router.push("/admin/series");
      router.refresh();
    });
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {error && <p className={errorClass}>{error}</p>}

      <div>
        <label htmlFor="title" className={labelClass}>
          Titre de la série
        </label>
        <input
          id="title"
          name="title"
          type="text"
          required
          defaultValue={series?.title}
          placeholder="Ex. : Pentest web de A à Z"
          className={inputClass}
        />
      </div>

      <div>
        <label htmlFor="description" className={labelClass}>
          Description <span className="font-normal text-muted">(optionnelle)</span>
        </label>
        <textarea
          id="description"
          name="description"
          maxLength={500}
          defaultValue={series?.description}
          className={`${inputClass} min-h-20 resize-y`}
        />
      </div>

      <div>
        <label htmlFor="titleEn" className={labelClass}>
          Titre anglais{" "}
          <span className="font-normal text-muted">
            (optionnel — affiché sur le site en anglais)
          </span>
        </label>
        <input
          id="titleEn"
          name="titleEn"
          type="text"
          maxLength={120}
          defaultValue={series?.titleEn}
          placeholder="E.g.: Web pentesting from A to Z"
          className={inputClass}
        />
      </div>

      <div>
        <label htmlFor="descriptionEn" className={labelClass}>
          Description anglaise <span className="font-normal text-muted">(optionnelle)</span>
        </label>
        <textarea
          id="descriptionEn"
          name="descriptionEn"
          maxLength={500}
          defaultValue={series?.descriptionEn}
          className={`${inputClass} min-h-20 resize-y`}
        />
      </div>

      <div className="flex gap-2">
        <button type="submit" disabled={pending} className={buttonClass}>
          {pending ? "Enregistrement…" : series ? "Enregistrer" : "Créer la série"}
        </button>
        {series && (
          <button
            type="button"
            onClick={() => router.push("/admin/series")}
            className={buttonGhostClass}
          >
            Annuler
          </button>
        )}
      </div>
    </form>
  );
}
