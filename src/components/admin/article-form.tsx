"use client";

import { useRouter } from "next/navigation";
import { useRef, useState, useTransition } from "react";
import { getPreviewLink, previewMarkdown, saveArticle } from "@/actions/articles";
import { pretranslateArticle } from "@/actions/translate";
import {
  buttonClass,
  buttonGhostClass,
  cardClass,
  errorClass,
  inputClass,
  labelClass,
} from "@/components/ui";

export type CategoryOption = { id: string; label: string };
export type SeriesOption = { id: string; label: string };

export type ArticleFormData = {
  id: string;
  title: string;
  excerpt: string;
  content: string;
  coverImage: string | null;
  categoryId: string;
  status: "DRAFT" | "SUBMITTED" | "PUBLISHED";
  tags: string;
  seriesId: string;
  seriesPosition: number | null;
  titleEn: string;
  excerptEn: string;
  contentEn: string;
};

type ArticleFormProps = {
  categories: CategoryOption[];
  series: SeriesOption[];
  article?: ArticleFormData;
  /** Les auteurs ne peuvent pas publier : ils soumettent à validation. */
  canPublish: boolean;
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

export function ArticleForm({ categories, series, article, canPublish }: ArticleFormProps) {
  const router = useRouter();
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [content, setContent] = useState(article?.content ?? "");
  const [tab, setTab] = useState<"write" | "preview">("write");
  const [previewHtml, setPreviewHtml] = useState("");
  const [seriesId, setSeriesId] = useState(article?.seriesId ?? "");
  const [error, setError] = useState<string | null>(null);
  const [shareLabel, setShareLabel] = useState("Copier le lien d'aperçu");
  const [saving, startSaving] = useTransition();
  const [previewing, startPreviewing] = useTransition();
  // Champs anglais contrôlés : la pré-traduction IA doit pouvoir les remplir
  const [titleEn, setTitleEn] = useState(article?.titleEn ?? "");
  const [excerptEn, setExcerptEn] = useState(article?.excerptEn ?? "");
  const [contentEn, setContentEn] = useState(article?.contentEn ?? "");
  const [translateMsg, setTranslateMsg] = useState<{
    text: string;
    isError: boolean;
  } | null>(null);
  const [translating, startTranslating] = useTransition();

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

  async function copyPreviewLink() {
    if (!article) return;
    const { url, error } = await getPreviewLink(article.id);
    if (!url) {
      setShareLabel(error ?? "Erreur");
      return;
    }
    try {
      await navigator.clipboard.writeText(url);
      setShareLabel("Lien copié ✓ (valable 72 h)");
    } catch {
      setShareLabel(url);
    }
    setTimeout(() => setShareLabel("Copier le lien d'aperçu"), 4000);
  }

  function pretranslate(event: React.MouseEvent<HTMLButtonElement>) {
    const form = event.currentTarget.form;
    if (!form) return;
    const fields = new FormData(form);
    const title = String(fields.get("title") ?? "").trim();
    const excerpt = String(fields.get("excerpt") ?? "").trim();
    if (!title || !excerpt || !content.trim()) {
      setTranslateMsg({
        text: "Remplissez d'abord le titre, l'extrait et le contenu français.",
        isError: true,
      });
      return;
    }
    if (
      (titleEn || excerptEn || contentEn) &&
      !window.confirm("Remplacer la traduction anglaise actuelle par un nouveau brouillon IA ?")
    ) {
      return;
    }
    setTranslateMsg(null);
    startTranslating(async () => {
      const result = await pretranslateArticle({ title, excerpt, content });
      if (!result.ok) {
        setTranslateMsg({ text: result.error, isError: true });
        return;
      }
      setTitleEn(result.titleEn);
      setExcerptEn(result.excerptEn);
      setContentEn(result.contentEn);
      setTranslateMsg({
        text: "Brouillon généré — relisez et corrigez avant d'enregistrer.",
        isError: false,
      });
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

          {/* Traduction anglaise relue par un humain : rédigée à la main ou
              pré-remplie par l'IA (brouillon à corriger). Complète ou
              absente : l'action refuse un remplissage partiel. Sans
              traduction, /en sert le français avec un bandeau. */}
          <details
            className={`${cardClass} p-5`}
            open={Boolean(article?.titleEn)}
          >
            <summary className="cursor-pointer text-sm font-semibold">
              Traduction anglaise{" "}
              <span className="font-normal text-muted">
                (facultatif — remplir les trois champs ou aucun)
              </span>
            </summary>
            <div className="mt-4 space-y-4">
              <div className="flex flex-wrap items-center gap-3">
                <button
                  type="button"
                  onClick={pretranslate}
                  disabled={translating}
                  className={buttonGhostClass}
                >
                  {translating ? "Pré-traduction en cours…" : "✨ Pré-traduire avec l'IA"}
                </button>
                <span className="text-xs text-muted">
                  Brouillon généré par l&apos;API Claude, à relire avant d&apos;enregistrer.
                </span>
              </div>
              {translateMsg && (
                <p
                  className={
                    translateMsg.isError ? errorClass : "text-sm font-medium text-accent"
                  }
                >
                  {translateMsg.text}
                </p>
              )}
              <div>
                <label htmlFor="titleEn" className={labelClass}>
                  Titre (EN)
                </label>
                <input
                  id="titleEn"
                  name="titleEn"
                  type="text"
                  value={titleEn}
                  onChange={(e) => setTitleEn(e.target.value)}
                  className={inputClass}
                />
              </div>
              <div>
                <label htmlFor="excerptEn" className={labelClass}>
                  Extrait (EN)
                </label>
                <textarea
                  id="excerptEn"
                  name="excerptEn"
                  maxLength={500}
                  value={excerptEn}
                  onChange={(e) => setExcerptEn(e.target.value)}
                  className={`${inputClass} min-h-20 resize-y`}
                />
              </div>
              <div>
                <label htmlFor="contentEn" className={labelClass}>
                  Contenu (EN, Markdown)
                </label>
                <textarea
                  id="contentEn"
                  name="contentEn"
                  value={contentEn}
                  onChange={(e) => setContentEn(e.target.value)}
                  spellCheck={false}
                  className={`${inputClass} min-h-[16rem] resize-y font-mono text-[13px] leading-relaxed`}
                  placeholder={"## Introduction\n\nYour article in **Markdown**…"}
                />
              </div>
            </div>
          </details>
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
                <option value="SUBMITTED">
                  {canPublish ? "Soumis (en attente)" : "Soumettre à validation"}
                </option>
                {canPublish && <option value="PUBLISHED">Publié</option>}
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
              <label htmlFor="seriesId" className={labelClass}>
                Série <span className="font-normal text-muted">(facultatif)</span>
              </label>
              <select
                id="seriesId"
                name="seriesId"
                value={seriesId}
                onChange={(e) => setSeriesId(e.target.value)}
                className={inputClass}
              >
                <option value="">— Aucune —</option>
                {series.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.label}
                  </option>
                ))}
              </select>
              {seriesId && (
                <div className="mt-2">
                  <label htmlFor="seriesPosition" className={labelClass}>
                    Position dans la série
                  </label>
                  <input
                    id="seriesPosition"
                    name="seriesPosition"
                    type="number"
                    min={1}
                    max={999}
                    defaultValue={article?.seriesPosition ?? 1}
                    className={inputClass}
                  />
                </div>
              )}
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
              <p className="mt-1 text-xs text-muted">
                Ré-encodée en WebP côté serveur (métadonnées EXIF supprimées).
              </p>
            </div>
          </div>

          {article && (
            <button
              type="button"
              onClick={copyPreviewLink}
              className={`${buttonGhostClass} w-full`}
            >
              {shareLabel}
            </button>
          )}

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
