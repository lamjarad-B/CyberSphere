import type { Metadata } from "next";
import Link from "next/link";
import { localeHref, toLocale } from "@/lib/i18n";
import { breadcrumbJsonLd, pageMetadata } from "@/lib/seo";
import { JsonLd } from "@/components/json-ld";
import { cardClass } from "@/components/ui";

/**
 * Chaque traitement décrit ici correspond à du code du dépôt : schéma Prisma,
 * purges de lib/maintenance (sessions et jetons expirés, inscriptions non
 * confirmées après 7 jours, empreintes d'IP après 30 jours, journal d'audit
 * après AUDIT_RETENTION_DAYS, 365 par défaut). Modifier l'un d'eux impose de
 * mettre cette page à jour.
 */
type Processing = {
  title: string;
  data: string;
  purpose: string;
  basis: string;
  retention: string;
  note?: string;
};

const copy = {
  fr: {
    home: "Accueil",
    breadcrumbAria: "Fil d'Ariane",
    title: "Politique de confidentialité",
    metaDescription:
      "Données personnelles traitées par CyberSphere, finalités, durées de conservation, cookies et exercice de vos droits.",
    updated: "Dernière mise à jour : 9 novembre 2026",
    intro:
      "Cette page décrit les données personnelles que CyberSphere traite, pourquoi, combien de temps, et comment exercer vos droits. Elle suit le fonctionnement réel du site.",
    controllerTitle: "Responsable du traitement",
    controller:
      "Brahim Lamjarad, éditeur du site à titre non professionnel",
    seeLegal: "voir les",
    contactBefore: "Pour toute question ou demande :",
    contactLink: "formulaire de contact",
    legalLink: "mentions légales",
    notDoneTitle: "Ce que le site ne fait pas",
    notDone: [
      "Aucune publicité, aucun outil de mesure d'audience tiers, aucun pixel de réseau social.",
      "Aucune donnée n'est vendue ni cédée.",
      "Les statistiques de lecture sont de simples compteurs (vues par article et par jour, sites d'où viennent les visites) : aucune adresse IP, aucun cookie ni identifiant de visiteur n'y est enregistré.",
    ],
    processingTitle: "Données traitées",
    labels: {
      data: "Données",
      purpose: "Finalité",
      basis: "Base légale",
      retention: "Conservation",
    },
    processing: [
      {
        title: "Compte membre",
        data: "Nom, adresse e-mail, mot de passe (stocké sous forme hachée), photo de profil facultative. Pour l'équipe de rédaction : bio et liens publics facultatifs, affichés sur la page auteur.",
        purpose:
          "Fournir l'espace membre : commentaires, réactions, signets, gestion du profil.",
        basis: "Exécution du service que vous demandez en créant un compte.",
        retention: "Jusqu'à la suppression du compte.",
        note: "Lorsque vous choisissez un mot de passe, il est vérifié auprès du service Have I Been Pwned par k-anonymat : seuls les cinq premiers caractères de son empreinte SHA-1 sont envoyés, jamais le mot de passe.",
      },
      {
        title: "Sécurité des comptes",
        data: "Sessions de connexion (adresse IP, navigateur), empreinte SHA-256 du navigateur des appareils déjà utilisés, secret de double authentification, codes de secours et clés d'accès (passkeys), jetons de vérification d'e-mail et de réinitialisation.",
        purpose:
          "Protéger les comptes : déconnexion après inactivité, alerte par e-mail lors d'une connexion depuis un nouvel appareil ou d'un changement sensible, double authentification.",
        basis: "Intérêt légitime : la sécurité des comptes et du site.",
        retention:
          "Sessions et jetons : supprimés à leur expiration (une session expire après une période d'inactivité, 30 minutes par défaut). Appareils connus, double authentification et clés d'accès : tant que le compte existe ou que la fonction reste activée.",
      },
      {
        title: "Journal de sécurité",
        data: "Événements de sécurité et d'administration (inscription, connexions et échecs de connexion, changement de mot de passe, actions de l'équipe), avec selon le cas l'identifiant du compte, l'adresse e-mail saisie et l'adresse IP.",
        purpose: "Détecter et analyser les abus et les incidents de sécurité.",
        basis: "Intérêt légitime : la sécurité du site.",
        retention: "365 jours, puis suppression automatique.",
      },
      {
        title: "Commentaires",
        data: "Membre : le texte du commentaire, rattaché au compte. Sans compte : le nom affiché, l'adresse e-mail (jamais publiée, visible des seuls administrateurs) et une empreinte HMAC de l'adresse IP, jamais l'adresse en clair. Signalement d'un commentaire par un membre : le commentaire visé et le motif facultatif.",
        purpose:
          "Publier les commentaires, les modérer et limiter les abus (nombre de commentaires par jour).",
        basis:
          "Votre demande de publication ; intérêt légitime pour la modération et la lutte contre les abus.",
        retention:
          "Jusqu'à la suppression du commentaire ou du compte. L'empreinte d'IP d'un commentaire sans compte est effacée après 30 jours ; l'adresse e-mail est supprimée avec le commentaire.",
      },
      {
        title: "Réactions et signets",
        data: "Les articles auxquels vous avez réagi ou que vous avez mis en signet, rattachés à votre compte.",
        purpose: "Fournir ces fonctions de l'espace membre.",
        basis: "Exécution du service.",
        retention: "Jusqu'à leur retrait ou la suppression du compte.",
      },
      {
        title: "Newsletter",
        data: "Adresse e-mail et langue choisie.",
        purpose: "Vous envoyer les nouveaux articles.",
        basis: "Votre consentement, retirable à tout moment.",
        retention:
          "Une inscription non confirmée est supprimée après 7 jours. Une inscription confirmée dure jusqu'à la désinscription, possible depuis le lien présent dans chaque e-mail, ou jusqu'à la suppression du compte associé à la même adresse.",
        note: "Une personne qui coche la case newsletter en commentant sans compte est inscrite sans lien de confirmation, 24 heures après la publication, si son commentaire est toujours en ligne.",
      },
      {
        title: "Formulaire de contact",
        data: "Nom, adresse e-mail, sujet et message.",
        purpose: "Répondre à votre message.",
        basis: "Votre demande.",
        retention:
          "Le message est transmis par e-mail à l'équipe ; il n'est pas enregistré sur le site.",
      },
    ] satisfies Processing[],
    abuse:
      "Pour limiter les abus (envois de messages, tentatives de connexion), le serveur tient des compteurs temporaires liés à l'adresse IP. Ils restent en mémoire, ne sont jamais écrits en base et disparaissent au redémarrage.",
    recipientsTitle: "Destinataires",
    recipients: [
      "L'éditeur du site et, pour les données nécessaires à leur rôle, les membres de l'équipe de rédaction.",
      "OVH SAS, hébergeur du site.",
      "Le prestataire d'envoi d'e-mails du site, pour les messages qui vous sont adressés (vérification, alertes de sécurité, newsletter) et pour les messages du formulaire de contact.",
      "Cloudflare, lorsque la vérification anti-robot Turnstile est activée sur les formulaires de compte (inscription, connexion, mot de passe oublié) et de contact : il reçoit le jeton de vérification et votre adresse IP.",
      "Les articles peuvent être pré-traduits par un service d'intelligence artificielle : seul le texte des articles lui est transmis, jamais de donnée de visiteur.",
    ],
    cookiesTitle: "Cookies et stockage local",
    cookies: [
      "Cookies de session, posés uniquement lorsque vous vous connectez : ils maintiennent la connexion et ses étapes de vérification (double authentification, clés d'accès).",
      "NEXT_LOCALE, posé seulement si vous utilisez le bouton FR/EN : il mémorise la langue choisie pendant un an.",
      "Stockage local du navigateur : le thème clair ou sombre (« theme ») et, pour un membre connecté, l'heure de sa dernière activité, qui sert à la déconnexion après inactivité.",
      "La vérification anti-robot des commentaires (ALTCHA) est calculée dans votre navigateur, sans service tiers ni cookie.",
    ],
    cookiesNote:
      "Ces éléments sont strictement nécessaires au fonctionnement du site ou à un choix que vous faites : aucun ne sert à la publicité ou à la mesure d'audience, d'où l'absence de bannière de consentement.",
    rightsTitle: "Vos droits",
    rights:
      "Vous disposez d'un droit d'accès, de rectification, d'effacement, de limitation, d'opposition et de portabilité de vos données, ainsi que du droit de retirer votre consentement à tout moment.",
    rightsHowTitle: "Comment les exercer",
    rightsHow: [
      "Depuis votre espace membre : modifier votre nom et votre photo, télécharger l'ensemble de vos données (fichier JSON), supprimer votre compte. La suppression emporte vos commentaires, réactions, signets, sessions, appareils et votre inscription à la newsletter. Les comptes de l'équipe de rédaction sont supprimés par un administrateur.",
      "Newsletter : le lien de désinscription présent dans chaque e-mail.",
    ],
    rightsOtherBefore: "Toute autre demande, notamment pour un commentaire publié sans compte :",
    complaintBefore:
      "Si vous estimez que vos droits ne sont pas respectés, vous pouvez adresser une réclamation à la",
    complaintLink: "Commission nationale de l'informatique et des libertés (CNIL)",
  },
  en: {
    home: "Home",
    breadcrumbAria: "Breadcrumb",
    title: "Privacy policy",
    metaDescription:
      "Personal data processed by CyberSphere, purposes, retention periods, cookies and how to exercise your rights.",
    updated: "Last updated: 9 November 2026",
    intro:
      "This page describes the personal data CyberSphere processes, why, for how long, and how to exercise your rights. It reflects how the site actually works.",
    controllerTitle: "Data controller",
    controller:
      "Brahim Lamjarad, who publishes the site in a non-professional capacity",
    seeLegal: "see the",
    contactBefore: "For any question or request:",
    contactLink: "contact form",
    legalLink: "legal notice",
    notDoneTitle: "What the site does not do",
    notDone: [
      "No advertising, no third-party analytics, no social media pixels.",
      "No data is sold or shared for commercial purposes.",
      "Reading statistics are plain counters (views per article and per day, sites that send visitors): no IP address, cookie or visitor identifier is stored for them.",
    ],
    processingTitle: "Data processed",
    labels: {
      data: "Data",
      purpose: "Purpose",
      basis: "Legal basis",
      retention: "Retention",
    },
    processing: [
      {
        title: "Member account",
        data: "Name, email address, password (stored hashed), optional profile picture. For the editorial team: optional bio and public links, shown on the author page.",
        purpose: "Provide the member area: comments, reactions, bookmarks, profile management.",
        basis: "Performance of the service you request by creating an account.",
        retention: "Until the account is deleted.",
        note: "When you choose a password, it is checked against the Have I Been Pwned service using k-anonymity: only the first five characters of its SHA-1 hash are sent, never the password itself.",
      },
      {
        title: "Account security",
        data: "Sign-in sessions (IP address, browser), a SHA-256 fingerprint of the browser of devices already used, the two-factor secret, backup codes and passkeys, email verification and password reset tokens.",
        purpose:
          "Protect accounts: sign-out after inactivity, email alerts for a sign-in from a new device or a sensitive change, two-factor authentication.",
        basis: "Legitimate interest: the security of accounts and of the site.",
        retention:
          "Sessions and tokens: deleted when they expire (a session expires after a period of inactivity, 30 minutes by default). Known devices, two-factor authentication and passkeys: as long as the account exists or the feature stays enabled.",
      },
      {
        title: "Security log",
        data: "Security and administration events (sign-up, sign-ins and failed sign-ins, password changes, team actions), with, depending on the event, the account identifier, the email address entered and the IP address.",
        purpose: "Detect and investigate abuse and security incidents.",
        basis: "Legitimate interest: the security of the site.",
        retention: "365 days, then automatic deletion.",
      },
      {
        title: "Comments",
        data: "Members: the comment text, linked to the account. Without an account: the display name, the email address (never published, visible to administrators only) and an HMAC fingerprint of the IP address, never the address itself. A member reporting a comment: the comment concerned and the optional reason.",
        purpose: "Publish comments, moderate them and limit abuse (number of comments per day).",
        basis:
          "Your request to publish; legitimate interest for moderation and abuse prevention.",
        retention:
          "Until the comment or the account is deleted. The IP fingerprint of a comment posted without an account is erased after 30 days; the email address is deleted with the comment.",
      },
      {
        title: "Reactions and bookmarks",
        data: "The articles you reacted to or bookmarked, linked to your account.",
        purpose: "Provide these member features.",
        basis: "Performance of the service.",
        retention: "Until you remove them or delete your account.",
      },
      {
        title: "Newsletter",
        data: "Email address and chosen language.",
        purpose: "Send you new articles.",
        basis: "Your consent, which you can withdraw at any time.",
        retention:
          "An unconfirmed sign-up is deleted after 7 days. A confirmed subscription lasts until you unsubscribe, using the link in every email, or until the account with the same address is deleted.",
        note: "Someone who ticks the newsletter box when commenting without an account is subscribed without a confirmation link, 24 hours after publication, if the comment is still online.",
      },
      {
        title: "Contact form",
        data: "Name, email address, subject and message.",
        purpose: "Reply to your message.",
        basis: "Your request.",
        retention: "The message is forwarded to the team by email; it is not stored on the site.",
      },
    ] satisfies Processing[],
    abuse:
      "To limit abuse (messages sent, sign-in attempts), the server keeps temporary counters tied to the IP address. They live in memory only, are never written to the database and disappear on restart.",
    recipientsTitle: "Recipients",
    recipients: [
      "The site's publisher and, for the data their role requires, members of the editorial team.",
      "OVH SAS, the site's hosting provider.",
      "The site's email delivery provider, for messages sent to you (verification, security alerts, newsletter) and for contact form messages.",
      "Cloudflare, when the Turnstile anti-bot check is enabled on the account forms (sign-up, sign-in, forgotten password) and the contact form: it receives the verification token and your IP address.",
      "Articles may be pre-translated by an artificial intelligence service: only the article text is sent to it, never any visitor data.",
    ],
    cookiesTitle: "Cookies and local storage",
    cookies: [
      "Session cookies, set only when you sign in: they keep you signed in and handle its verification steps (two-factor authentication, passkeys).",
      "NEXT_LOCALE, set only if you use the FR/EN button: it remembers your language for one year.",
      "Browser local storage: the light or dark theme (“theme”) and, for a signed-in member, the time of their last activity, used for sign-out after inactivity.",
      "The anti-bot check on comments (ALTCHA) runs in your browser, with no third-party service or cookie.",
    ],
    cookiesNote:
      "These items are strictly necessary for the site to work or remember a choice you make: none is used for advertising or analytics, which is why there is no consent banner.",
    rightsTitle: "Your rights",
    rights:
      "You have the right to access, rectify, erase and port your data, to restrict or object to its processing, and to withdraw your consent at any time.",
    rightsHowTitle: "How to exercise them",
    rightsHow: [
      "From your member area: change your name and picture, download all your data (JSON file), delete your account. Deletion removes your comments, reactions, bookmarks, sessions, devices and newsletter subscription. Editorial team accounts are deleted by an administrator.",
      "Newsletter: the unsubscribe link in every email.",
    ],
    rightsOtherBefore: "Any other request, including for a comment posted without an account:",
    complaintBefore:
      "If you believe your rights are not being respected, you can lodge a complaint with the French data protection authority, the",
    complaintLink: "CNIL",
  },
};

type Props = { params: Promise<{ locale: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const locale = toLocale((await params).locale);
  const t = copy[locale];
  return pageMetadata({
    locale,
    path: "/confidentialite",
    title: t.title,
    description: t.metaDescription,
  });
}

export default async function ConfidentialitePage({ params }: Props) {
  const locale = toLocale((await params).locale);
  const t = copy[locale];
  const href = (path: string) => localeHref(locale, path);
  const contactLink = (
    <Link href={href("/contact")} className="font-medium text-accent hover:underline">
      {t.contactLink}
    </Link>
  );

  return (
    <div className="mx-auto max-w-3xl space-y-8">
      <JsonLd data={breadcrumbJsonLd([{ name: t.home, path: href("/") }, { name: t.title }])} />
      <header className="space-y-3">
        <nav aria-label={t.breadcrumbAria}>
          <ol className="font-mono text-sm text-muted [&>li]:inline">
            <li>
              <Link href={href("/")} className="hover:text-accent">
                {t.home}
              </Link>
              <span aria-hidden>{" / "}</span>
            </li>
            <li aria-current="page" className="text-foreground">
              {t.title}
            </li>
          </ol>
        </nav>
        <h1 className="text-3xl font-bold">{t.title}</h1>
        <p className="text-sm text-muted">{t.updated}</p>
        <p className="text-muted">{t.intro}</p>
      </header>

      <section className={`${cardClass} space-y-3 p-6`}>
        <h2 className="text-lg font-bold">{t.controllerTitle}</h2>
        <p className="text-sm text-muted">
          {t.controller} ({t.seeLegal}{" "}
          <Link href={href("/mentions-legales")} className="text-accent hover:underline">
            {t.legalLink}
          </Link>
          ).
        </p>
        <p className="text-sm text-muted">
          {t.contactBefore} {contactLink}.
        </p>
      </section>

      <section className={`${cardClass} space-y-3 p-6`}>
        <h2 className="text-lg font-bold">{t.notDoneTitle}</h2>
        <ul className="list-disc space-y-2 pl-5 text-sm text-muted">
          {t.notDone.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
      </section>

      <section className="space-y-4">
        <h2 className="text-xl font-bold">{t.processingTitle}</h2>
        {t.processing.map((item: Processing) => (
          <div key={item.title} className={`${cardClass} space-y-3 p-6`}>
            <h3 className="font-bold">{item.title}</h3>
            <dl className="grid gap-x-4 gap-y-2 text-sm sm:grid-cols-[9rem_1fr]">
              <dt className="font-medium">{t.labels.data}</dt>
              <dd className="text-muted">{item.data}</dd>
              <dt className="font-medium">{t.labels.purpose}</dt>
              <dd className="text-muted">{item.purpose}</dd>
              <dt className="font-medium">{t.labels.basis}</dt>
              <dd className="text-muted">{item.basis}</dd>
              <dt className="font-medium">{t.labels.retention}</dt>
              <dd className="text-muted">{item.retention}</dd>
            </dl>
            {item.note && <p className="text-sm text-muted">{item.note}</p>}
          </div>
        ))}
        <p className="text-sm text-muted">{t.abuse}</p>
      </section>

      <section className={`${cardClass} space-y-3 p-6`}>
        <h2 className="text-lg font-bold">{t.recipientsTitle}</h2>
        <ul className="list-disc space-y-2 pl-5 text-sm text-muted">
          {t.recipients.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
      </section>

      <section className={`${cardClass} space-y-3 p-6`}>
        <h2 className="text-lg font-bold">{t.cookiesTitle}</h2>
        <ul className="list-disc space-y-2 pl-5 text-sm text-muted">
          {t.cookies.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
        <p className="text-sm text-muted">{t.cookiesNote}</p>
      </section>

      <section className={`${cardClass} space-y-3 p-6`}>
        <h2 className="text-lg font-bold">{t.rightsTitle}</h2>
        <p className="text-sm text-muted">{t.rights}</p>
        <h3 className="font-bold">{t.rightsHowTitle}</h3>
        <ul className="list-disc space-y-2 pl-5 text-sm text-muted">
          {t.rightsHow.map((item) => (
            <li key={item}>{item}</li>
          ))}
          <li>
            {t.rightsOtherBefore} {contactLink}.
          </li>
        </ul>
        <p className="text-sm text-muted">
          {t.complaintBefore}{" "}
          <a
            href="https://www.cnil.fr/fr/plaintes"
            className="text-accent hover:underline"
            rel="noopener"
          >
            {t.complaintLink}
          </a>
          .
        </p>
      </section>
    </div>
  );
}
