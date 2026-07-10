import type { Metadata } from "next";
import Link from "next/link";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/session";
import { formatDateTime } from "@/lib/format";
import { ProfileForm } from "@/components/membre/profile-form";
import { PasswordForm } from "@/components/membre/password-form";
import { cardClass } from "@/components/ui";

export const metadata: Metadata = { title: "Mon profil" };

export default async function MembrePage() {
  const session = await requireUser();

  const comments = await db.comment.findMany({
    where: { authorId: session.user.id },
    orderBy: { createdAt: "desc" },
    take: 20,
    include: { article: { select: { title: true, slug: true } } },
  });

  return (
    <div className="space-y-10">
      <header>
        <h1 className="text-3xl font-bold">Mon profil</h1>
        <p className="mt-2 text-muted">{session.user.email}</p>
      </header>

      <div className="grid gap-6 lg:grid-cols-2">
        <section className={`${cardClass} p-6`}>
          <h2 className="mb-4 text-lg font-bold">Informations</h2>
          <ProfileForm
            name={session.user.name}
            image={session.user.image ?? null}
          />
        </section>

        <section className={`${cardClass} p-6`}>
          <h2 className="mb-4 text-lg font-bold">Mot de passe</h2>
          <PasswordForm />
        </section>
      </div>

      <section className="space-y-4">
        <h2 className="text-lg font-bold">
          Mes derniers commentaires{" "}
          <span className="font-mono text-accent">({comments.length})</span>
        </h2>
        {comments.length === 0 ? (
          <p className="text-sm text-muted">
            Vous n&apos;avez pas encore commenté d&apos;article.
          </p>
        ) : (
          <ul className="divide-y divide-border">
            {comments.map((comment) => (
              <li key={comment.id} className="space-y-1 py-3">
                <p className="text-sm text-muted">
                  Sur{" "}
                  <Link
                    href={`/articles/${comment.article.slug}`}
                    className="font-medium text-accent hover:underline"
                  >
                    {comment.article.title}
                  </Link>{" "}
                  · {formatDateTime(comment.createdAt)}
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
