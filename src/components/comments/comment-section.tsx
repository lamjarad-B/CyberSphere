"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { useId, useState, useTransition } from "react";
import { addComment, addGuestComment, deleteComment, updateComment } from "@/actions/comments";
import { reportComment } from "@/actions/reports";
import { localeHref } from "@/lib/i18n";
import { useI18n } from "@/components/i18n-provider";
import {
  buttonClass,
  buttonGhostClass,
  cardClass,
  errorClass,
  focusOnMount,
  inputClass,
  labelClass,
  successClass,
} from "@/components/ui";

const AltchaWidget = dynamic(() => import("./altcha-widget"), { ssr: false });

export type CommentView = {
  id: string;
  content: string;
  createdAt: string;
  /** `id` null : commentaire d'un invité, sans compte. */
  author: { id: string | null; name: string; image: string | null };
  replies: CommentView[];
};

export type Viewer = { id: string; name: string; isAdmin: boolean } | null;

type CommentSectionProps = {
  articleId: string;
  articleSlug: string;
  comments: CommentView[];
  viewer: Viewer;
};

const textareaClass = `${inputClass} min-h-24 resize-y`;

function CommentForm({
  articleId,
  parentId,
  label,
  onDone,
}: {
  articleId: string;
  parentId?: string;
  label: string;
  onDone?: () => void;
}) {
  const { t } = useI18n();
  // Identifiant unique : les formulaires de réponse coexistent sur la page
  const fieldId = useId();
  const [content, setContent] = useState("");
  // Honeypot anti-bot : champ invisible, jamais rempli par un humain
  const [website, setWebsite] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function submit() {
    setError(null);
    startTransition(async () => {
      const result = await addComment({ articleId, parentId, content, website });
      if (!result.ok) {
        setError(result.error ?? t.comments.genericError);
        return;
      }
      setContent("");
      onDone?.();
    });
  }

  return (
    <div className="space-y-3">
      {error && <p className={errorClass} role="alert">{error}</p>}
      <div>
        <label htmlFor={fieldId} className={labelClass}>
          {label}
        </label>
        <textarea
          id={fieldId}
          value={content}
          onChange={(e) => setContent(e.target.value)}
          maxLength={2000}
          className={textareaClass}
        />
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
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={submit}
          disabled={pending || content.trim().length < 2}
          className={buttonClass}
        >
          {pending ? t.comments.sending : t.comments.publish}
        </button>
        {onDone && (
          <button type="button" onClick={onDone} className={buttonGhostClass}>
            {t.comments.cancel}
          </button>
        )}
      </div>
    </div>
  );
}

/** Libellé d'un champ obligatoire : l'étoile reste hors du nom accessible. */
function RequiredLabel({ htmlFor, children }: { htmlFor: string; children: React.ReactNode }) {
  return (
    <label htmlFor={htmlFor} className={labelClass}>
      {children} <span aria-hidden="true">*</span>
    </label>
  );
}

/**
 * Commentaire sans compte : il part en modération et n'apparaît qu'une fois
 * approuvé par un admin (actions/comments.ts).
 */
function GuestCommentForm({
  articleId,
  parentId,
  label,
  onDone,
}: {
  articleId: string;
  parentId?: string;
  label: string;
  onDone?: () => void;
}) {
  const { locale, t } = useI18n();
  // Identifiant unique : les formulaires de réponse coexistent sur la page
  const fieldId = useId();
  const [content, setContent] = useState("");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  // Décochée par défaut : l'inscription doit rester un choix explicite
  const [newsletter, setNewsletter] = useState(false);
  // Honeypot anti-bot : champ invisible, jamais rempli par un humain
  const [website, setWebsite] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);
  const [pending, startTransition] = useTransition();
  // CAPTCHA chargé à la première interaction : rien à payer pour qui ne fait que lire
  const [engaged, setEngaged] = useState(false);
  // Défi à usage unique : le widget est régénéré après chaque réponse du serveur
  const [captchaKey, setCaptchaKey] = useState(0);

  function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;
    setError(null);
    // Pendant le calcul, la case du widget est `required` : un second clic est
    // bloqué par le navigateur et n'arrive pas ici.
    const captcha = new FormData(event.currentTarget).get("altcha");
    if (typeof captcha !== "string" || !captcha) {
      setError(t.comments.captchaRequired);
      return;
    }
    startTransition(async () => {
      const result = await addGuestComment({
        articleId,
        parentId,
        content,
        name,
        email,
        newsletter,
        website,
        captcha,
      });
      setCaptchaKey((key) => key + 1);
      if (!result.ok) {
        setError(result.error ?? t.comments.genericError);
        return;
      }
      setSent(true);
    });
  }

  if (sent) {
    return (
      <p ref={focusOnMount} tabIndex={-1} className={successClass}>
        {t.comments.guestSuccess}
      </p>
    );
  }

  return (
    <form onSubmit={submit} onFocus={() => setEngaged(true)} className="space-y-4">
      <p className="text-sm text-muted">{t.comments.requiredNotice}</p>
      {error && <p className={errorClass} role="alert">{error}</p>}
      <div>
        <RequiredLabel htmlFor={`${fieldId}-content`}>{label}</RequiredLabel>
        <textarea
          id={`${fieldId}-content`}
          value={content}
          onChange={(e) => setContent(e.target.value)}
          required
          minLength={2}
          maxLength={2000}
          className={textareaClass}
        />
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <RequiredLabel htmlFor={`${fieldId}-name`}>{t.comments.name}</RequiredLabel>
          <input
            id={`${fieldId}-name`}
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
            minLength={2}
            maxLength={50}
            autoComplete="name"
            className={inputClass}
          />
        </div>
        <div>
          <RequiredLabel htmlFor={`${fieldId}-email`}>{t.comments.email}</RequiredLabel>
          <input
            id={`${fieldId}-email`}
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            maxLength={254}
            autoComplete="email"
            className={inputClass}
          />
        </div>
      </div>
      <div className="flex items-start gap-2">
        <input
          id={`${fieldId}-newsletter`}
          type="checkbox"
          checked={newsletter}
          onChange={(e) => setNewsletter(e.target.checked)}
          aria-describedby={`${fieldId}-newsletter-hint`}
          className="mt-0.5 h-5 w-5 shrink-0 accent-accent"
        />
        <div>
          <label htmlFor={`${fieldId}-newsletter`} className="text-sm font-medium text-foreground">
            {t.comments.newsletter}
          </label>
          <p id={`${fieldId}-newsletter-hint`} className="text-xs text-muted">
            {t.comments.newsletterHint}
          </p>
        </div>
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
      {engaged && <AltchaWidget key={captchaKey} language={locale} />}
      <div className="flex items-center gap-2">
        <button type="submit" disabled={pending} className={buttonClass}>
          {pending ? t.comments.sending : t.comments.submitGuest}
        </button>
        {onDone && (
          <button type="button" onClick={onDone} className={buttonGhostClass}>
            {t.comments.cancel}
          </button>
        )}
      </div>
      <p className="text-xs text-muted">
        {t.comments.guestPrivacy}{" "}
        <Link href={localeHref(locale, "/contact")} className="text-accent underline">
          {t.comments.removalLink}
        </Link>
      </p>
    </form>
  );
}

function CommentItem({
  comment,
  articleId,
  viewer,
  isReply,
}: {
  comment: CommentView;
  articleId: string;
  viewer: Viewer;
  isReply: boolean;
}) {
  const { t } = useI18n();
  const editFieldId = useId();
  const [replying, setReplying] = useState(false);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(comment.content);
  const [error, setError] = useState<string | null>(null);
  const [reported, setReported] = useState(false);
  const [pending, startTransition] = useTransition();

  const isOwner = viewer?.id === comment.author.id;
  const canDelete = isOwner || viewer?.isAdmin;

  function report() {
    const reason = window.prompt(t.comments.reportPrompt);
    if (reason === null) return; // annulé
    setError(null);
    startTransition(async () => {
      const result = await reportComment(comment.id, reason);
      if (!result.ok) {
        setError(result.error ?? t.comments.genericError);
        return;
      }
      setReported(true);
    });
  }

  function saveEdit() {
    setError(null);
    startTransition(async () => {
      const result = await updateComment(comment.id, draft);
      if (!result.ok) {
        setError(result.error ?? t.comments.genericError);
        return;
      }
      setEditing(false);
    });
  }

  function remove() {
    if (!window.confirm(t.comments.confirmDelete)) return;
    setError(null);
    startTransition(async () => {
      const result = await deleteComment(comment.id);
      if (!result.ok) setError(result.error ?? t.comments.genericError);
    });
  }

  return (
    <div className={isReply ? "ml-6 border-l-2 border-border pl-4 sm:ml-10" : ""}>
      <div className="space-y-2 py-4">
        <div className="flex items-center gap-2">
          {comment.author.image ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={comment.author.image}
              alt=""
              className="h-7 w-7 rounded-full object-cover"
            />
          ) : (
            <span className="flex h-7 w-7 items-center justify-center rounded-full bg-accent/15 font-mono text-xs font-bold text-accent">
              {comment.author.name.charAt(0).toUpperCase()}
            </span>
          )}
          <span className="text-sm font-semibold">{comment.author.name}</span>
          {/* Un nom d'invité est libre : il ne doit pas passer pour celui d'un membre */}
          {comment.author.id === null && (
            <span className="rounded-full border border-border px-2 py-0.5 text-xs text-muted">
              {t.comments.guest}
            </span>
          )}
          <span className="text-xs text-muted">· {comment.createdAt}</span>
        </div>

        {error && <p className={errorClass} role="alert">{error}</p>}

        {editing ? (
          <div className="space-y-2">
            <div>
              <label htmlFor={editFieldId} className={labelClass}>
                {t.comments.editLabel}
              </label>
              {/* Le bouton « Modifier » vient de disparaître : le focus passe au champ */}
              <textarea
                id={editFieldId}
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                maxLength={2000}
                autoFocus
                className={textareaClass}
              />
            </div>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={saveEdit}
                disabled={pending}
                className={buttonClass}
              >
                {pending ? t.comments.saving : t.comments.save}
              </button>
              <button
                type="button"
                onClick={() => {
                  setEditing(false);
                  setDraft(comment.content);
                }}
                className={buttonGhostClass}
              >
                {t.comments.cancel}
              </button>
            </div>
          </div>
        ) : (
          <p className="whitespace-pre-wrap text-sm leading-relaxed">
            {comment.content}
          </p>
        )}

        {!editing && (viewer || !isReply) && (
          <div className="flex gap-3 text-xs">
            {!isReply && (
              <button
                type="button"
                onClick={() => setReplying((v) => !v)}
                className="font-medium text-accent hover:underline"
              >
                {t.comments.reply}
              </button>
            )}
            {isOwner && (
              <button
                type="button"
                onClick={() => setEditing(true)}
                className="font-medium text-muted hover:text-accent"
              >
                {t.comments.edit}
              </button>
            )}
            {canDelete && (
              <button
                type="button"
                onClick={remove}
                disabled={pending}
                className="font-medium text-danger hover:underline disabled:opacity-50"
              >
                {t.comments.delete}
              </button>
            )}
            {viewer &&
              !isOwner &&
              (reported ? (
                <span className="text-muted" role="status">{t.comments.reported}</span>
              ) : (
                <button
                  type="button"
                  onClick={report}
                  disabled={pending}
                  className="font-medium text-muted hover:text-danger disabled:opacity-50"
                >
                  {t.comments.report}
                </button>
              ))}
          </div>
        )}

        {replying && (
          <div className="pt-2">
            {viewer ? (
              <CommentForm
                articleId={articleId}
                parentId={comment.id}
                label={t.comments.replyLabel(comment.author.name)}
                onDone={() => setReplying(false)}
              />
            ) : (
              <GuestCommentForm
                articleId={articleId}
                parentId={comment.id}
                label={t.comments.replyLabel(comment.author.name)}
                onDone={() => setReplying(false)}
              />
            )}
          </div>
        )}
      </div>

      {comment.replies.map((reply) => (
        <CommentItem
          key={reply.id}
          comment={reply}
          articleId={articleId}
          viewer={viewer}
          isReply
        />
      ))}
    </div>
  );
}

export function CommentSection({
  articleId,
  articleSlug,
  comments,
  viewer,
}: CommentSectionProps) {
  const { locale, t } = useI18n();
  const count =
    comments.length + comments.reduce((sum, c) => sum + c.replies.length, 0);
  const articlePath = localeHref(locale, `/articles/${articleSlug}`);

  return (
    <section className="space-y-4" aria-label={t.comments.aria}>
      <h2 className="text-xl font-bold">
        {t.comments.title} <span className="font-mono text-muted">({count})</span>
      </h2>

      {viewer ? (
        <div className={`${cardClass} p-5`}>
          <p className="mb-3 text-sm text-muted">
            {t.comments.signedInAs}{" "}
            <span className="font-medium text-foreground">{viewer.name}</span>
          </p>
          <CommentForm articleId={articleId} label={t.comments.label} />
        </div>
      ) : (
        <div className={`${cardClass} p-5`}>
          <h3 className="mb-3 text-lg font-semibold">{t.comments.leaveTitle}</h3>
          <GuestCommentForm articleId={articleId} label={t.comments.label} />
          <p className="mt-4 border-t border-border pt-3 text-xs text-muted">
            {t.comments.memberHint}{" "}
            <Link
              href={localeHref(
                locale,
                `/connexion?redirection=${encodeURIComponent(articlePath)}`,
              )}
              className="text-accent underline"
            >
              {t.comments.memberLink}
            </Link>
          </p>
        </div>
      )}

      {comments.length === 0 ? (
        <p className="py-4 text-sm text-muted">{t.comments.empty}</p>
      ) : (
        <div className="divide-y divide-border">
          {comments.map((comment) => (
            <CommentItem
              key={comment.id}
              comment={comment}
              articleId={articleId}
              viewer={viewer}
              isReply={false}
            />
          ))}
        </div>
      )}
    </section>
  );
}
