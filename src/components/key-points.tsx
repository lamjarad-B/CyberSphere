import type { Locale } from "@/lib/i18n";
import { parseKeyPoints } from "@/lib/articles";

const labels: Record<Locale, string> = { fr: "Points clés", en: "Key points" };

/** Encadré « Points clés » placé sous le chapô ; rien si le champ est vide. */
export function KeyPoints({ raw, locale }: { raw: string | null | undefined; locale: Locale }) {
  const points = parseKeyPoints(raw);
  if (points.length === 0) return null;

  return (
    <aside
      className="rounded-xl border border-accent/30 border-l-4 border-l-accent bg-accent/5 px-6 py-5"
      aria-label={labels[locale]}
    >
      <p className="mb-3 font-mono text-xs font-semibold uppercase tracking-wider text-accent">
        {labels[locale]}
      </p>
      <ul className="list-disc space-y-2 pl-5 marker:text-accent">
        {points.map((point, i) => (
          <li key={i}>{point}</li>
        ))}
      </ul>
    </aside>
  );
}
