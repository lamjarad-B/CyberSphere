"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { saveCategory } from "@/actions/categories";
import {
  buttonClass,
  buttonGhostClass,
  errorClass,
  inputClass,
  labelClass,
} from "@/components/ui";

type CategoryFormProps = {
  category?: {
    id: string;
    name: string;
    description: string;
    parentId: string;
  };
  parents: { id: string; name: string }[];
};

export function CategoryForm({ category, parents }: CategoryFormProps) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    setError(null);
    startTransition(async () => {
      const result = await saveCategory(category?.id ?? null, {
        name: String(data.get("name") ?? ""),
        description: String(data.get("description") ?? ""),
        parentId: String(data.get("parentId") ?? ""),
      });
      if (!result.ok) {
        setError(result.error ?? "Une erreur est survenue.");
        return;
      }
      if (!category) form.reset();
      router.push("/admin/categories");
      router.refresh();
    });
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {error && <p className={errorClass}>{error}</p>}

      <div>
        <label htmlFor="name" className={labelClass}>
          Nom
        </label>
        <input
          id="name"
          name="name"
          type="text"
          required
          defaultValue={category?.name}
          className={inputClass}
        />
      </div>

      <div>
        <label htmlFor="parentId" className={labelClass}>
          Catégorie parente
        </label>
        <select
          id="parentId"
          name="parentId"
          defaultValue={category?.parentId ?? ""}
          className={inputClass}
        >
          <option value="">— Aucune (catégorie principale) —</option>
          {parents.map((parent) => (
            <option key={parent.id} value={parent.id}>
              {parent.name}
            </option>
          ))}
        </select>
      </div>

      <div>
        <label htmlFor="description" className={labelClass}>
          Description <span className="font-normal text-muted">(optionnelle)</span>
        </label>
        <textarea
          id="description"
          name="description"
          maxLength={300}
          defaultValue={category?.description}
          className={`${inputClass} min-h-20 resize-y`}
        />
      </div>

      <div className="flex gap-2">
        <button type="submit" disabled={pending} className={buttonClass}>
          {pending
            ? "Enregistrement…"
            : category
              ? "Enregistrer"
              : "Créer la catégorie"}
        </button>
        {category && (
          <button
            type="button"
            onClick={() => router.push("/admin/categories")}
            className={buttonGhostClass}
          >
            Annuler
          </button>
        )}
      </div>
    </form>
  );
}
