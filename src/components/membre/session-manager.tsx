"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { authClient } from "@/lib/auth-client";
import { formatDateTime } from "@/lib/format";
import { useI18n } from "@/components/i18n-provider";
import type { Dictionary } from "@/i18n/dictionaries";
import { buttonDangerClass, buttonGhostClass, errorClass } from "@/components/ui";

export type SessionItem = {
  token: string;
  ipAddress: string | null;
  userAgent: string | null;
  createdAt: Date;
  current: boolean;
};

/** Résume un user-agent en libellé lisible (« Firefox · Windows »). */
function describeUserAgent(
  userAgent: string | null,
  labels: Dictionary["member"]["sessions"],
): string {
  if (!userAgent) return labels.unknownDevice;
  const browser =
    /firefox\//i.test(userAgent) ? "Firefox"
    : /edg\//i.test(userAgent) ? "Edge"
    : /chrome\//i.test(userAgent) ? "Chrome"
    : /safari\//i.test(userAgent) ? "Safari"
    : labels.unknownBrowser;
  const os =
    /windows/i.test(userAgent) ? "Windows"
    : /android/i.test(userAgent) ? "Android"
    : /iphone|ipad|ios/i.test(userAgent) ? "iOS"
    : /mac os/i.test(userAgent) ? "macOS"
    : /linux/i.test(userAgent) ? "Linux"
    : labels.unknownOs;
  return `${browser} · ${os}`;
}

export function SessionManager({ sessions }: { sessions: SessionItem[] }) {
  const router = useRouter();
  const { locale, t } = useI18n();
  const labels = t.member.sessions;
  const [error, setError] = useState<string | null>(null);

  async function revoke(token: string) {
    setError(null);
    const { error } = await authClient.revokeSession({ token });
    if (error) {
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
          <li key={session.token} className="flex items-center justify-between gap-3 p-3">
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
                onClick={() => revoke(session.token)}
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
