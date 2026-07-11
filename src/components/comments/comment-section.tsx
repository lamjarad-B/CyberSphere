"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { addComment, deleteComment, updateComment } from "@/actions/comments";
import { reportComment } from "@/actions/reports";
import { localeHref } from "@/lib/i18n";
import { useI18n } from "@/components/i18n-provider";
import {
  buttonClass,
  buttonGhostClass,
  cardClass,
  errorClass,
  inputClass,
} from "@/components/ui";

export type CommentView = {
  id: string;
  content: string;
  createdAt: string;
  author: { id: string; name: string; image: string | null };
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
  placeholder,
  onDone,
}: {
  articleId: string;
  parentId?: string;
  placeholder: string;
  onDone?: () => void;
}) {
  const { t } = useI18n();
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
      {error && <p className={errorClass}>{error}</p>}
      <textarea
        value={content}
        onChange={(e) => setContent(e.target.value)}
        placeholder={placeholder}
        maxLength={2000}
        className={textareaClass}
      />
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
          <span className="text-xs text-muted">· {comment.createdAt}</span>
        </div>

        {error && <p className={errorClass}>{error}</p>}

        {editing ? (
          <div className="space-y-2">
            <textarea
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              maxLength={2000}
              className={textareaClass}
            />
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

        {viewer && !editing && (
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
                className="font-medium text-red-500 hover:underline disabled:opacity-50"
              >
                {t.comments.delete}
              </button>
            )}
            {!isOwner &&
              (reported ? (
                <span className="text-muted">{t.comments.reported}</span>
              ) : (
                <button
                  type="button"
                  onClick={report}
                  disabled={pending}
                  className="font-medium text-muted hover:text-red-500 disabled:opacity-50"
                >
                  {t.comments.report}
                </button>
              ))}
          </div>
        )}

        {replying && (
          <div className="pt-2">
            <CommentForm
              articleId={articleId}
              parentId={comment.id}
              placeholder={t.comments.replyPlaceholder(comment.author.name)}
              onDone={() => setReplying(false)}
            />
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
        {t.comments.title} <span className="font-mono text-accent">({count})</span>
      </h2>

      {viewer ? (
        <div className={`${cardClass} p-5`}>
          <p className="mb-3 text-sm text-muted">
            {t.comments.signedInAs}{" "}
            <span className="font-medium text-foreground">{viewer.name}</span>
          </p>
          <CommentForm articleId={articleId} placeholder={t.comments.placeholder} />
        </div>
      ) : (
        <div className={`${cardClass} flex flex-col items-start gap-3 p-5`}>
          <p className="text-sm text-muted">{t.comments.membersOnly}</p>
          <div className="flex gap-2">
            <Link
              href={localeHref(
                locale,
                `/connexion?redirection=${encodeURIComponent(articlePath)}`,
              )}
              className={buttonClass}
            >
              {t.comments.login}
            </Link>
            <Link href={localeHref(locale, "/inscription")} className={buttonGhostClass}>
              {t.comments.register}
            </Link>
          </div>
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
