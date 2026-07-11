import type { Metadata } from "next";
import Link from "next/link";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/session";
import { formatDateTime } from "@/lib/format";
import { localeHref, toLocale } from "@/lib/i18n";
import { articleCardSelect, localizeCard } from "@/lib/articles";
import { ProfileForm } from "@/components/membre/profile-form";
import { PasswordForm } from "@/components/membre/password-form";
import { TwoFactorSetup } from "@/components/membre/two-factor-setup";
import { PasskeyManager } from "@/components/membre/passkey-manager";
import { SessionManager } from "@/components/membre/session-manager";
import { ArticleCard } from "@/components/article-card";
import { cardClass } from "@/components/ui";

const copy = {
  fr: {
    title: "Mon profil",
    infos: "Informations",
    password: "Mot de passe",
    twoFactor: "Double authentification (2FA)",
    passkeys: "Passkeys",
    sessions: "Mes sessions actives",
    bookmarks: "Mes signets",
    bookmarksEmpty:
      "Aucun article en signet. Utilisez le bouton « Ajouter aux signets » sur un article pour le retrouver ici.",
    comments: "Mes derniers commentaires",
    commentsEmpty: "Vous n'avez pas encore commenté d'article.",
    on: "Sur",
  },
  en: {
    title: "My profile",
    infos: "Details",
    password: "Password",
    twoFactor: "Two-factor authentication (2FA)",
    passkeys: "Passkeys",
    sessions: "My active sessions",
    bookmarks: "My bookmarks",
    bookmarksEmpty:
      "No bookmarked articles. Use the “Add to bookmarks” button on an article to find it here.",
    comments: "My latest comments",
    commentsEmpty: "You haven't commented on any article yet.",
    on: "On",
  },
};

type Props = { params: Promise<{ locale: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  return { title: copy[toLocale((await params).locale)].title };
}

export default async function MembrePage({ params }: Props) {
  const locale = toLocale((await params).locale);
  const t = copy[locale];
  const session = await requireUser();

  const [user, passkeys, sessions, bookmarks, comments] = await Promise.all([
    db.user.findUnique({
      where: { id: session.user.id },
      select: { twoFactorEnabled: true },
    }),
    db.passkey.findMany({
      where: { userId: session.user.id },
      orderBy: { createdAt: "desc" },
      select: { id: true, name: true, deviceType: true, createdAt: true },
    }),
    db.session.findMany({
      where: { userId: session.user.id, expiresAt: { gt: new Date() } },
      orderBy: { createdAt: "desc" },
      select: { token: true, ipAddress: true, userAgent: true, createdAt: true },
    }),
    db.bookmark.findMany({
      where: { userId: session.user.id },
      orderBy: { createdAt: "desc" },
      take: 12,
      select: { id: true, article: { select: articleCardSelect } },
    }),
    db.comment.findMany({
      where: { authorId: session.user.id },
      orderBy: { createdAt: "desc" },
      take: 20,
      include: { article: { select: { title: true, slug: true } } },
    }),
  ]);

  return (
    <div className="space-y-10">
      <header>
        <h1 className="text-3xl font-bold">{t.title}</h1>
        <p className="mt-2 text-muted">{session.user.email}</p>
      </header>

      <div className="grid gap-6 lg:grid-cols-2">
        <section className={`${cardClass} p-6`}>
          <h2 className="mb-4 text-lg font-bold">{t.infos}</h2>
          <ProfileForm
            name={session.user.name}
            image={session.user.image ?? null}
          />
        </section>

        <section className={`${cardClass} p-6`}>
          <h2 className="mb-4 text-lg font-bold">{t.password}</h2>
          <PasswordForm />
        </section>

        <section className={`${cardClass} p-6`}>
          <h2 className="mb-4 text-lg font-bold">{t.twoFactor}</h2>
          <TwoFactorSetup enabled={user?.twoFactorEnabled ?? false} />
        </section>

        <section className={`${cardClass} p-6`}>
          <h2 className="mb-4 text-lg font-bold">{t.passkeys}</h2>
          <PasskeyManager passkeys={passkeys} />
        </section>
      </div>

      <section className={`${cardClass} p-6`}>
        <h2 className="mb-4 text-lg font-bold">
          {t.sessions}{" "}
          <span className="font-mono text-accent">({sessions.length})</span>
        </h2>
        <SessionManager
          sessions={sessions.map((item) => ({
            ...item,
            current: item.token === session.session.token,
          }))}
        />
      </section>

      <section className="space-y-4">
        <h2 className="text-lg font-bold">
          {t.bookmarks}{" "}
          <span className="font-mono text-accent">({bookmarks.length})</span>
        </h2>
        {bookmarks.length === 0 ? (
          <p className="text-sm text-muted">{t.bookmarksEmpty}</p>
        ) : (
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {bookmarks.map((bookmark) => (
              <ArticleCard
                key={bookmark.id}
                article={localizeCard(bookmark.article, locale)}
                locale={locale}
              />
            ))}
          </div>
        )}
      </section>

      <section className="space-y-4">
        <h2 className="text-lg font-bold">
          {t.comments}{" "}
          <span className="font-mono text-accent">({comments.length})</span>
        </h2>
        {comments.length === 0 ? (
          <p className="text-sm text-muted">{t.commentsEmpty}</p>
        ) : (
          <ul className="divide-y divide-border">
            {comments.map((comment) => (
              <li key={comment.id} className="space-y-1 py-3">
                <p className="text-sm text-muted">
                  {t.on}{" "}
                  <Link
                    href={localeHref(locale, `/articles/${comment.article.slug}`)}
                    className="font-medium text-accent hover:underline"
                  >
                    {comment.article.title}
                  </Link>{" "}
                  · {formatDateTime(comment.createdAt, locale)}
                </p>
                <p className="line-clamp-2 text-sm">{comment.content}</p>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
