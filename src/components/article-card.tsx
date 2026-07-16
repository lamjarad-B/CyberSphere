import Link from "next/link";
import Image from "next/image";
import { formatDate } from "@/lib/format";
import { localeHref, type Locale } from "@/lib/i18n";
import { cardClass } from "./ui";

export type ArticleCardData = {
  slug: string;
  title: string;
  excerpt: string;
  coverImage: string | null;
  publishedAt: Date | null;
  category: { name: string; slug: string };
  author: { name: string };
};

export function ArticleCard({
  article,
  locale,
}: {
  article: ArticleCardData;
  locale: Locale;
}) {
  return (
    <article
      className={`${cardClass} group flex flex-col overflow-hidden transition-colors hover:border-accent/60`}
    >
      <Link href={localeHref(locale, `/articles/${article.slug}`)} className="block">
        {article.coverImage ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={article.coverImage}
            alt=""
            loading="lazy"
            className="aspect-video w-full object-cover"
          />
        ) : (
          <div className="flex aspect-video w-full items-center justify-center bg-gradient-to-br from-accent/15 via-surface to-surface">
            <Image
              src="/images/Logo/cybersphere-icone.png"
              alt=""
              width={1024}
              height={1024}
              className="h-16 w-16 opacity-40"
              aria-hidden
            />
          </div>
        )}
      </Link>
      <div className="flex flex-1 flex-col gap-3 p-5">
        <Link
          href={localeHref(locale, `/categories/${article.category.slug}`)}
          className="w-fit rounded-full border border-accent/40 px-2.5 py-0.5 font-mono text-xs text-accent transition-colors hover:bg-accent/10"
        >
          {article.category.name}
        </Link>
        <h3 className="text-lg font-semibold leading-snug">
          <Link
            href={localeHref(locale, `/articles/${article.slug}`)}
            className="transition-colors group-hover:text-accent"
          >
            {article.title}
          </Link>
        </h3>
        <p className="line-clamp-3 text-sm text-muted">{article.excerpt}</p>
        <p className="mt-auto pt-2 text-xs text-muted">
          {formatDate(article.publishedAt, locale)} · {article.author.name}
        </p>
      </div>
    </article>
  );
}
