import type { Metadata } from "next";
import { toLocale } from "@/lib/i18n";
import { cardClass } from "@/components/ui";

const CONTACT = process.env.SECURITY_CONTACT ?? "lamjarad@gmail.com";

const copy = {
  fr: {
    metaTitle: "Divulgation responsable",
    metaDescription:
      "Politique de divulgation responsable de CyberSphere : comment signaler une vulnérabilité.",
    title: "Divulgation responsable",
    intro:
      "Vous avez trouvé une vulnérabilité sur CyberSphere ? Merci de nous la signaler de façon responsable — ce blog prêche la sécurité, il se doit de l'appliquer.",
    howTitle: "Comment signaler",
    howEmail1: "Écrivez à",
    howEmail2:
      "avec une description du problème, les étapes de reproduction et l'impact estimé.",
    howTxt1: "Le point de contact est aussi publié dans",
    howTxt2: "(RFC 9116).",
    howAck: "Nous accusons réception sous 72 heures.",
    rulesTitle: "Règles du jeu",
    rule1:
      "Ne consultez, ne modifiez et ne supprimez aucune donnée qui ne vous appartient pas ; utilisez vos propres comptes de test.",
    rule2: "Pas de déni de service, de spam ni d'ingénierie sociale.",
    rule3: "Laissez-nous un délai raisonnable pour corriger avant toute publication.",
    rule4:
      "En retour : pas de poursuites pour une recherche de bonne foi respectant ces règles, et un crédit public si vous le souhaitez.",
  },
  en: {
    metaTitle: "Responsible disclosure",
    metaDescription:
      "CyberSphere's responsible disclosure policy: how to report a vulnerability.",
    title: "Responsible disclosure",
    intro:
      "Found a vulnerability on CyberSphere? Please report it responsibly — this blog preaches security, so it has to practice it.",
    howTitle: "How to report",
    howEmail1: "Write to",
    howEmail2:
      "with a description of the issue, reproduction steps and the estimated impact.",
    howTxt1: "The contact point is also published in",
    howTxt2: "(RFC 9116).",
    howAck: "We acknowledge reports within 72 hours.",
    rulesTitle: "Ground rules",
    rule1:
      "Don't access, modify or delete data that isn't yours; use your own test accounts.",
    rule2: "No denial of service, spam or social engineering.",
    rule3: "Give us a reasonable window to fix the issue before any publication.",
    rule4:
      "In return: no legal action for good-faith research that follows these rules, and public credit if you'd like it.",
  },
};

type Props = { params: Promise<{ locale: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const t = copy[toLocale((await params).locale)];
  return { title: t.metaTitle, description: t.metaDescription };
}

export default async function SecuritePage({ params }: Props) {
  const t = copy[toLocale((await params).locale)];

  return (
    <div className="mx-auto max-w-3xl space-y-8">
      <header>
        <h1 className="text-3xl font-bold">{t.title}</h1>
        <p className="mt-2 text-muted">{t.intro}</p>
      </header>

      <section className={`${cardClass} space-y-4 p-6`}>
        <h2 className="text-lg font-bold">{t.howTitle}</h2>
        <ul className="list-disc space-y-2 pl-5 text-sm text-muted">
          <li>
            {t.howEmail1}{" "}
            <a href={`mailto:${CONTACT}`} className="font-medium text-accent hover:underline">
              {CONTACT}
            </a>{" "}
            {t.howEmail2}
          </li>
          <li>
            {t.howTxt1}{" "}
            <a href="/.well-known/security.txt" className="font-mono text-accent hover:underline">
              /.well-known/security.txt
            </a>{" "}
            {t.howTxt2}
          </li>
          <li>{t.howAck}</li>
        </ul>
      </section>

      <section className={`${cardClass} space-y-4 p-6`}>
        <h2 className="text-lg font-bold">{t.rulesTitle}</h2>
        <ul className="list-disc space-y-2 pl-5 text-sm text-muted">
          <li>{t.rule1}</li>
          <li>{t.rule2}</li>
          <li>{t.rule3}</li>
          <li>{t.rule4}</li>
        </ul>
      </section>
    </div>
  );
}
