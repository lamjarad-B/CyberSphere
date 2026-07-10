"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { addComment, deleteComment, updateComment } from "@/actions/comments";
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
  const [content, setContent] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function submit() {
    setError(null);
    startTransition(async () => {
      const result = await addComment({ articleId, parentId, content });
      if (!result.ok) {
        setError(result.error ?? "Une erreur est survenue.");
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
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={submit}
          disabled={pending || content.trim().length < 2}
          className={buttonClass}
        >
          {pending ? "Envoi…" : "Publier"}
        </button>
        {onDone && (
          <button type="button" onClick={onDone} className={buttonGhostClass}>
            Annuler
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
  const [replying, setReplying] = useState(false);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(comment.content);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const isOwner = viewer?.id === comment.author.id;
  const canDelete = isOwner || viewer?.isAdmin;

  function saveEdit() {
    setError(null);
    startTransition(async () => {
      const result = await updateComment(comment.id, draft);
      if (!result.ok) {
        setError(result.error ?? "Une erreur est survenue.");
        return;
      }
      setEditing(false);
    });
  }

  function remove() {
    if (!window.confirm("Supprimer ce commentaire ?")) return;
    setError(null);
    startTransition(async () => {
      const result = await deleteComment(comment.id);
      if (!result.ok) setError(result.error ?? "Une erreur est survenue.");
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
                {pending ? "Enregistrement…" : "Enregistrer"}
              </button>
              <button
                type="button"
                onClick={() => {
                  setEditing(false);
                  setDraft(comment.content);
                }}
                className={buttonGhostClass}
              >
                Annuler
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
                Répondre
              </button>
            )}
            {isOwner && (
              <button
                type="button"
                onClick={() => setEditing(true)}
                className="font-medium text-muted hover:text-accent"
              >
                Modifier
              </button>
            )}
            {canDelete && (
              <button
                type="button"
                onClick={remove}
                disabled={pending}
                className="font-medium text-red-500 hover:underline disabled:opacity-50"
              >
                Supprimer
              </button>
            )}
          </div>
        )}

        {replying && (
          <div className="pt-2">
            <CommentForm
              articleId={articleId}
              parentId={comment.id}
              placeholder={`Répondre à ${comment.author.name}…`}
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
  const count =
    comments.length + comments.reduce((sum, c) => sum + c.replies.length, 0);

  return (
    <section className="space-y-4" aria-label="Commentaires">
      <h2 className="text-xl font-bold">
        Commentaires <span className="font-mono text-accent">({count})</span>
      </h2>

      {viewer ? (
        <div className={`${cardClass} p-5`}>
          <p className="mb-3 text-sm text-muted">
            Connecté en tant que{" "}
            <span className="font-medium text-foreground">{viewer.name}</span>
          </p>
          <CommentForm articleId={articleId} placeholder="Votre commentaire…" />
        </div>
      ) : (
        <div className={`${cardClass} flex flex-col items-start gap-3 p-5`}>
          <p className="text-sm text-muted">
            Les commentaires sont réservés aux membres connectés.
          </p>
          <div className="flex gap-2">
            <Link
              href={`/connexion?redirection=/articles/${articleSlug}`}
              className={buttonClass}
            >
              Connexion
            </Link>
            <Link href="/inscription" className={buttonGhostClass}>
              Inscription
            </Link>
          </div>
        </div>
      )}

      {comments.length === 0 ? (
        <p className="py-4 text-sm text-muted">
          Aucun commentaire pour le moment. Lancez la discussion !
        </p>
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
