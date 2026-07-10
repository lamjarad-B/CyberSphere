"use client";

import { useRouter } from "next/navigation";
import { useRef, useState, useTransition } from "react";
import { previewMarkdown, saveArticle } from "@/actions/articles";
import {
  buttonClass,
  buttonGhostClass,
  cardClass,
  errorClass,
  inputClass,
  labelClass,
} from "@/components/ui";

export type CategoryOption = { id: string; label: string };

export type ArticleFormData = {
  id: string;
  title: string;
  excerpt: string;
  content: string;
  coverImage: string | null;
  categoryId: string;
  status: "DRAFT" | "PUBLISHED";
  tags: string;
};

type ArticleFormProps = {
  categories: CategoryOption[];
  article?: ArticleFormData;
};

const toolbar: { label: string; title: string; before: string; after: string }[] = [
  { label: "B", title: "Gras", before: "**", after: "**" },
  { label: "I", title: "Italique", before: "*", after: "*" },
  { label: "H2", title: "Titre", before: "\n## ", after: "\n" },
  { label: "</>", title: "Code en ligne", before: "`", after: "`" },
  { label: "```", title: "Bloc de code", before: "\n```bash\n", after: "\n```\n" },
  { label: "🔗", title: "Lien", before: "[", after: "](https://)" },
  { label: "• —", title: "Liste", before: "\n- ", after: "" },
  { label: "❝", title: "Citation", before: "\n> ", after: "" },
];

export function ArticleForm({ categories, article }: ArticleFormProps) {
  const router = useRouter();
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [content, setContent] = useState(article?.content ?? "");
  const [tab, setTab] = useState<"write" | "preview">("write");
  const [previewHtml, setPreviewHtml] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, startSaving] = useTransition();
  const [previewing, startPreviewing] = useTransition();

  function insertSnippet(before: string, after: string) {
    const textarea = textareaRef.current;
    if (!textarea) return;
    const { selectionStart, selectionEnd, value } = textarea;
    const selected = value.slice(selectionStart, selectionEnd);
    const next =
      value.slice(0, selectionStart) + before + selected + after + value.slice(selectionEnd);
    setContent(next);
    requestAnimationFrame(() => {
      textarea.focus();
      const cursor = selectionStart + before.length + selected.length;
      textarea.setSelectionRange(cursor, cursor);
    });
  }

  function showPreview() {
    setTab("preview");
    startPreviewing(async () => {
      const { html } = await previewMarkdown(content);
      setPreviewHtml(html);
    });
  }

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    formData.set("content", content);
    setError(null);
    startSaving(async () => {
      const result = await saveArticle(article?.id ?? null, formData);
      if (!result.ok) {
        setError(result.error ?? "Une erreur est survenue.");
        window.scrollTo({ top: 0, behavior: "smooth" });
        return;
      }
      router.push("/admin/articles");
      router.refresh();
    });
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {error && <p className={errorClass}>{error}</p>}

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <div>
            <label htmlFor="title" className={labelClass}>
              Titre
            </label>
            <input
              id="title"
              name="title"
              type="text"
              required
              defaultValue={article?.title}
              className={inputClass}
            />
          </div>

          <div>
            <label htmlFor="excerpt" className={labelClass}>
              Extrait <span className="font-normal text-muted">(affiché dans les listes et le SEO)</span>
            </label>
            <textarea
              id="excerpt"
              name="excerpt"
              required
              maxLength={500}
              defaultValue={article?.excerpt}
              className={`${inputClass} min-h-20 resize-y`}
            />
          </div>

          <div>
            <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
              <span className={`${labelClass} mb-0`}>Contenu (Markdown)</span>
              <div className="flex rounded-md border border-border p-0.5">
                <button
                  type="button"
                  onClick={() => setTab("write")}
                  className={`rounded px-3 py-1 text-sm font-medium ${
                    tab === "write" ? "bg-accent/15 text-accent" : "text-muted"
                  }`}
                >
                  Écrire
                </button>
                <button
                  type="button"
                  onClick={showPreview}
                  className={`rounded px-3 py-1 text-sm font-medium ${
                    tab === "preview" ? "bg-accent/15 text-accent" : "text-muted"
                  }`}
                >
                  Aperçu
                </button>
              </div>
            </div>

            <div className={tab === "write" ? "" : "hidden"}>
              <div className="flex flex-wrap gap-1 rounded-t-md border border-b-0 border-border bg-surface px-2 py-1.5">
                {toolbar.map((tool) => (
                  <button
                    key={tool.title}
                    type="button"
                    title={tool.title}
                    onClick={() => insertSnippet(tool.before, tool.after)}
                    className="rounded px-2 py-1 font-mono text-xs text-muted transition-colors hover:bg-accent/10 hover:text-accent"
                  >
                    {tool.label}
                  </button>
                ))}
              </div>
              <textarea
                ref={textareaRef}
                name="content"
                value={content}
                onChange={(e) => setContent(e.target.value)}
                spellCheck={false}
                className={`${inputClass} min-h-[28rem] resize-y rounded-t-none font-mono text-[13px] leading-relaxed`}
                placeholder={"## Introduction\n\nVotre article en **Markdown**…\n\n```bash\nnmap -sV cible.local\n```"}
              />
            </div>

            {tab === "preview" && (
              <div className={`${cardClass} min-h-[28rem] p-6`}>
                {previewing ? (
                  <p className="text-sm text-muted">Génération de l&apos;aperçu…</p>
                ) : (
                  <div
                    className="prose prose-neutral max-w-none dark:prose-invert"
                    dangerouslySetInnerHTML={{ __html: previewHtml }}
                  />
                )}
              </div>
            )}
          </div>
        </div>

        <aside className="space-y-6">
          <div className={`${cardClass} space-y-4 p-5`}>
            <div>
              <label htmlFor="status" className={labelClass}>
                Statut
              </label>
              <select
                id="status"
                name="status"
                defaultValue={article?.status ?? "DRAFT"}
                className={inputClass}
              >
                <option value="DRAFT">Brouillon</option>
                <option value="PUBLISHED">Publié</option>
              </select>
            </div>

            <div>
              <label htmlFor="categoryId" className={labelClass}>
                Catégorie
              </label>
              <select
                id="categoryId"
                name="categoryId"
                required
                defaultValue={article?.categoryId ?? ""}
                className={inputClass}
              >
                <option value="" disabled>
                  — Choisir —
                </option>
                {categories.map((category) => (
                  <option key={category.id} value={category.id}>
                    {category.label}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label htmlFor="tags" className={labelClass}>
                Tags <span className="font-normal text-muted">(séparés par des virgules)</span>
              </label>
              <input
                id="tags"
                name="tags"
                type="text"
                defaultValue={article?.tags}
                placeholder="pentest, linux, owasp"
                className={inputClass}
              />
            </div>

            <div>
              <label htmlFor="cover" className={labelClass}>
                Image de couverture
              </label>
              {article?.coverImage && (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={article.coverImage}
                  alt="Couverture actuelle"
                  className="mb-2 aspect-video w-full rounded-md border border-border object-cover"
                />
              )}
              <input
                id="cover"
                name="cover"
                type="file"
                accept="image/png,image/jpeg,image/webp,image/gif"
                className="block w-full text-sm text-muted file:mr-3 file:rounded-md file:border file:border-border file:bg-surface file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-foreground"
              />
            </div>
          </div>

          <div className="flex gap-2">
            <button type="submit" disabled={saving} className={`${buttonClass} flex-1`}>
              {saving ? "Enregistrement…" : "Enregistrer"}
            </button>
            <button
              type="button"
              onClick={() => router.push("/admin/articles")}
              className={buttonGhostClass}
            >
              Annuler
            </button>
          </div>
        </aside>
      </div>
    </form>
  );
}
