import type { Metadata } from "next";
import { db } from "@/lib/db";
import { toggleAuthorRole, toggleBan } from "@/actions/members";
import { formatDate } from "@/lib/format";
import { requireAdmin } from "@/lib/session";
import { ActionButton } from "@/components/admin/action-button";
import { pageNumber } from "@/lib/articles";
import { Pagination } from "@/components/pagination";
import { buttonDangerClass, buttonGhostClass, cardClass, inputClass } from "@/components/ui";

export const metadata: Metadata = { title: "Membres" };

const roleBadge: Record<string, { label: string; className: string }> = {
  admin: { label: "Admin", className: "bg-accent/15 text-accent" },
  author: { label: "Auteur", className: "bg-violet-500/15 text-violet-400" },
  user: { label: "Membre", className: "bg-border/60 text-muted" },
};

const PAGE_SIZE = 50;

export default async function AdminMembresPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string; q?: string }>;
}) {
  await requireAdmin();
  const { page: pageParam, q: rawQuery } = await searchParams;
  const page = pageNumber(pageParam);
  const query = (rawQuery ?? "").trim().slice(0, 100);

  const where = query
    ? {
        OR: [
          { name: { contains: query, mode: "insensitive" as const } },
          { email: { contains: query, mode: "insensitive" as const } },
        ],
      }
    : undefined;
  const [members, total] = await Promise.all([
    db.user.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
      include: { _count: { select: { comments: true, articles: true } } },
    }),
    db.user.count({ where }),
  ]);
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-center justify-between gap-4">
        <h1 className="text-2xl font-bold">
          Membres <span className="font-mono text-accent">({total})</span>
        </h1>
        <form method="get" className="flex gap-2" role="search">
          <input
            type="search"
            name="q"
            defaultValue={query}
            placeholder="Nom ou e-mail…"
            aria-label="Rechercher un membre"
            className={inputClass}
          />
          <button type="submit" className={buttonGhostClass}>
            Rechercher
          </button>
        </form>
      </header>

      <div className={`${cardClass} overflow-x-auto`}>
        <table className="w-full min-w-[46rem] text-sm">
          <thead>
            <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted">
              <th className="px-4 py-3 font-medium">Membre</th>
              <th className="px-4 py-3 font-medium">Rôle</th>
              <th className="px-4 py-3 font-medium">Statut</th>
              <th className="px-4 py-3 font-medium">2FA</th>
              <th className="px-4 py-3 font-medium">Inscrit le</th>
              <th className="px-4 py-3 text-right font-medium">Comm.</th>
              <th className="px-4 py-3 text-right font-medium">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {members.map((member) => {
              const badge = roleBadge[member.role] ?? roleBadge.user;
              return (
                <tr key={member.id}>
                  <td className="px-4 py-3">
                    <p className="font-medium">{member.name}</p>
                    <p className="font-mono text-xs text-muted">{member.email}</p>
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={`rounded-full px-2 py-0.5 font-mono text-[11px] font-semibold ${badge.className}`}
                    >
                      {badge.label}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    {member.banned ? (
                      <span className="rounded-full bg-red-500/15 px-2 py-0.5 font-mono text-[11px] font-semibold text-red-500">
                        Banni
                      </span>
                    ) : (
                      <span className="rounded-full bg-emerald-500/15 px-2 py-0.5 font-mono text-[11px] font-semibold text-emerald-500">
                        Actif
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3 font-mono text-xs">
                    {member.twoFactorEnabled ? (
                      <span className="text-emerald-500">activée</span>
                    ) : (
                      <span className="text-muted">—</span>
                    )}
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 text-muted">
                    {formatDate(member.createdAt)}
                  </td>
                  <td className="px-4 py-3 text-right font-mono">
                    {member._count.comments}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex justify-end gap-2">
                      {member.role !== "admin" && !member.banned && (
                        <ActionButton
                          action={toggleAuthorRole.bind(null, member.id)}
                          label={
                            member.role === "author"
                              ? "Retirer le rôle auteur"
                              : "Promouvoir auteur"
                          }
                          pendingLabel="…"
                          confirmMessage={
                            member.role === "author"
                              ? `Retirer le rôle auteur à ${member.name} ?`
                              : `Permettre à ${member.name} de rédiger des articles (soumis à votre validation) ?`
                          }
                          className={`${buttonGhostClass} px-3 py-1.5`}
                        />
                      )}
                      {member.role !== "admin" &&
                        (member.banned ? (
                          <ActionButton
                            action={toggleBan.bind(null, member.id)}
                            label="Réintégrer"
                            pendingLabel="…"
                            className={`${buttonGhostClass} px-3 py-1.5`}
                          />
                        ) : (
                          <ActionButton
                            action={toggleBan.bind(null, member.id)}
                            label="Bannir"
                            pendingLabel="…"
                            confirmMessage={`Bannir ${member.name} ? Ses sessions seront révoquées.`}
                            className={buttonDangerClass}
                          />
                        ))}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <Pagination
        page={page}
        totalPages={totalPages}
        makeHref={(p) =>
          `/admin/membres?page=${p}${query ? `&q=${encodeURIComponent(query)}` : ""}`
        }
      />
    </div>
  );
}
