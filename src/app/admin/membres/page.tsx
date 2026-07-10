import type { Metadata } from "next";
import { db } from "@/lib/db";
import { toggleBan } from "@/actions/members";
import { formatDate } from "@/lib/format";
import { ActionButton } from "@/components/admin/action-button";
import { buttonDangerClass, buttonGhostClass, cardClass } from "@/components/ui";

export const metadata: Metadata = { title: "Membres" };

export default async function AdminMembresPage() {
  const members = await db.user.findMany({
    orderBy: { createdAt: "desc" },
    include: { _count: { select: { comments: true } } },
  });

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">
        Membres <span className="font-mono text-accent">({members.length})</span>
      </h1>

      <div className={`${cardClass} overflow-x-auto`}>
        <table className="w-full min-w-[40rem] text-sm">
          <thead>
            <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted">
              <th className="px-4 py-3 font-medium">Membre</th>
              <th className="px-4 py-3 font-medium">Rôle</th>
              <th className="px-4 py-3 font-medium">Statut</th>
              <th className="px-4 py-3 font-medium">Inscrit le</th>
              <th className="px-4 py-3 text-right font-medium">Comm.</th>
              <th className="px-4 py-3 text-right font-medium">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {members.map((member) => (
              <tr key={member.id}>
                <td className="px-4 py-3">
                  <p className="font-medium">{member.name}</p>
                  <p className="font-mono text-xs text-muted">{member.email}</p>
                </td>
                <td className="px-4 py-3">
                  <span
                    className={`rounded-full px-2 py-0.5 font-mono text-[11px] font-semibold ${
                      member.role === "admin"
                        ? "bg-accent/15 text-accent"
                        : "bg-border/60 text-muted"
                    }`}
                  >
                    {member.role === "admin" ? "Admin" : "Membre"}
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
                <td className="whitespace-nowrap px-4 py-3 text-muted">
                  {formatDate(member.createdAt)}
                </td>
                <td className="px-4 py-3 text-right font-mono">
                  {member._count.comments}
                </td>
                <td className="px-4 py-3">
                  <div className="flex justify-end">
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
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
