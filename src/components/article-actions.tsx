"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { toggleBookmark, toggleReaction } from "@/actions/reactions";
import { localeHref } from "@/lib/i18n";
import { useI18n } from "@/components/i18n-provider";

type ArticleActionsProps = {
  articleId: string;
  articleSlug: string;
  reactionCount: number;
  reacted: boolean;
  bookmarked: boolean;
  isLoggedIn: boolean;
};

const pillClass =
  "inline-flex items-center gap-2 rounded-full border px-4 py-1.5 text-sm font-medium transition-colors disabled:opacity-50";

export function ArticleActions({
  articleId,
  articleSlug,
  reactionCount,
  reacted,
  bookmarked,
  isLoggedIn,
}: ArticleActionsProps) {
  const { locale, t } = useI18n();
  // État optimiste local : le serveur reste la source de vérité au rechargement
  const [liked, setLiked] = useState(reacted);
  const [count, setCount] = useState(reactionCount);
  const [saved, setSaved] = useState(bookmarked);
  const [pending, startTransition] = useTransition();

  if (!isLoggedIn) {
    return (
      <div className="flex flex-wrap items-center gap-3">
        <span className={`${pillClass} border-border text-muted`}>
          {t.articleActions.reactionSummary(reactionCount)}
        </span>
        <Link
          href={localeHref(
            locale,
            `/connexion?redirection=${encodeURIComponent(
              localeHref(locale, `/articles/${articleSlug}`),
            )}`,
          )}
          className="text-sm text-muted hover:text-accent hover:underline"
        >
          {t.articleActions.signInToReact}
        </Link>
      </div>
    );
  }

  function onReact() {
    startTransition(async () => {
      const result = await toggleReaction(articleId);
      if (result.ok) {
        setCount((c) => c + (liked ? -1 : 1));
        setLiked((v) => !v);
      }
    });
  }

  function onBookmark() {
    startTransition(async () => {
      const result = await toggleBookmark(articleId);
      if (result.ok) setSaved((v) => !v);
    });
  }

  return (
    <div className="flex flex-wrap items-center gap-3">
      <button
        type="button"
        onClick={onReact}
        disabled={pending}
        aria-pressed={liked}
        className={`${pillClass} ${
          liked
            ? "border-accent bg-accent/15 text-accent"
            : "border-border text-muted hover:border-accent hover:text-accent"
        }`}
      >
        {t.articleActions.useful} <span className="font-mono">({count})</span>
      </button>
      <button
        type="button"
        onClick={onBookmark}
        disabled={pending}
        aria-pressed={saved}
        className={`${pillClass} ${
          saved
            ? "border-accent bg-accent/15 text-accent"
            : "border-border text-muted hover:border-accent hover:text-accent"
        }`}
      >
        {saved ? t.articleActions.bookmarked : t.articleActions.addBookmark}
      </button>
    </div>
  );
}
