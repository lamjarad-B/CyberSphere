"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { revokeMySession } from "@/actions/sessions";
import { authClient } from "@/lib/auth-client";
import { formatDateTime } from "@/lib/format";
import { describeUserAgent } from "@/lib/user-agent";
import { useI18n } from "@/components/i18n-provider";
import { buttonDangerClass, buttonGhostClass, errorClass } from "@/components/ui";

export type SessionItem = {
  id: string;
  ipAddress: string | null;
  userAgent: string | null;
  createdAt: Date;
  current: boolean;
};

export function SessionManager({ sessions }: { sessions: SessionItem[] }) {
  const router = useRouter();
  const { locale, t } = useI18n();
  const labels = t.member.sessions;
  const [error, setError] = useState<string | null>(null);

  async function revoke(id: string) {
    setError(null);
    const { ok } = await revokeMySession(id);
    if (!ok) {
      setError(labels.revokeError);
      return;
    }
    router.refresh();
  }

  async function revokeOthers() {
    setError(null);
    const { error } = await authClient.revokeOtherSessions();
    if (error) {
      setError(labels.revokeError);
      return;
    }
    router.refresh();
  }

  return (
    <div className="space-y-4">
      {error && <p className={errorClass}>{error}</p>}

      <ul className="divide-y divide-border rounded-md border border-border">
        {sessions.map((session) => (
          <li key={session.id} className="flex items-center justify-between gap-3 p-3">
            <div className="min-w-0">
              <p className="text-sm font-medium">
                {describeUserAgent(session.userAgent, labels)}
                {session.current && (
                  <span className="ml-2 rounded bg-accent/15 px-1.5 py-0.5 text-xs font-semibold text-accent">
                    {labels.current}
                  </span>
                )}
              </p>
              <p className="text-xs text-muted">
                {session.ipAddress || labels.unknownIp} · {labels.openedOn}{" "}
                {formatDateTime(session.createdAt, locale)}
              </p>
            </div>
            {!session.current && (
              <button
                type="button"
                onClick={() => revoke(session.id)}
                className={buttonDangerClass}
              >
                {labels.revoke}
              </button>
            )}
          </li>
        ))}
      </ul>

      {sessions.length > 1 && (
        <button type="button" onClick={revokeOthers} className={buttonGhostClass}>
          {labels.revokeOthers}
        </button>
      )}
    </div>
  );
}
