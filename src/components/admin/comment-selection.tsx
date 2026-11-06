"use client";

import { createContext, useContext, useState, useTransition } from "react";
import { deleteComments } from "@/actions/comments";
import { buttonDangerClass, errorClass } from "@/components/ui";

const checkboxClass = "h-5 w-5 shrink-0 accent-accent";

type Selection = { selected: Set<string>; toggle: (id: string) => void };

const SelectionContext = createContext<Selection | null>(null);

/** Case d'un commentaire, à placer dans une <CommentSelection>. */
export function CommentCheckbox({ id, label }: { id: string; label: string }) {
  const selection = useContext(SelectionContext);
  return (
    <input
      type="checkbox"
      aria-label={label}
      checked={selection?.selected.has(id) ?? false}
      onChange={() => selection?.toggle(id)}
      className={`mt-0.5 ${checkboxClass}`}
    />
  );
}

/** Liste de commentaires avec suppression groupée de ceux qui sont cochés. */
export function CommentSelection({
  ids,
  children,
}: {
  ids: string[];
  children: React.ReactNode;
}) {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  // Un commentaire coché peut avoir quitté la liste depuis (masqué, supprimé)
  const chosen = ids.filter((id) => selected.has(id));
  const allChosen = ids.length > 0 && chosen.length === ids.length;

  function toggle(id: string) {
    setSelected((current) => {
      const next = new Set(current);
      if (!next.delete(id)) next.add(id);
      return next;
    });
  }

  function remove() {
    const target = chosen.length > 1 ? `ces ${chosen.length} commentaires` : "ce commentaire";
    if (!window.confirm(`Supprimer définitivement ${target}, réponses comprises ?`)) return;
    setError(null);
    startTransition(async () => {
      const result = await deleteComments(chosen);
      if (!result.ok) {
        setError(result.error ?? "Une erreur est survenue.");
        return;
      }
      setSelected(new Set());
    });
  }

  return (
    <SelectionContext.Provider value={{ selected, toggle }}>
      <div className="space-y-3">
        {error && <p className={errorClass} role="alert">{error}</p>}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <label className="flex items-center gap-2 text-sm font-medium text-foreground">
            <input
              type="checkbox"
              checked={allChosen}
              onChange={() => setSelected(allChosen ? new Set() : new Set(ids))}
              className={checkboxClass}
            />
            Tout sélectionner sur cette page
          </label>
          <button
            type="button"
            onClick={remove}
            disabled={pending || chosen.length === 0}
            className={buttonDangerClass}
          >
            {pending ? "Suppression…" : `Supprimer la sélection (${chosen.length})`}
          </button>
        </div>
        {children}
      </div>
    </SelectionContext.Provider>
  );
}
