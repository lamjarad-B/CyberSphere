import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { admin, captcha, haveIBeenPwned, twoFactor } from "better-auth/plugins";
import { nextCookies } from "better-auth/next-js";
import { APIError, createAuthMiddleware, isAPIError } from "better-auth/api";
import { passkey } from "@better-auth/passkey";
import { db } from "./db";
import { logAudit, requestIp } from "./audit";
import { isNewLoginDevice, sendSecurityAlert } from "./notifications";
import { deleteUpload } from "./uploads";
import { sendEmail, verificationEmail, resetPasswordEmail } from "./email";
import { LOCALE_COOKIE, type Locale } from "./i18n";
import { rateLimit } from "./rate-limit";
import { SITE_URL } from "./site";
import { registerSchema } from "./validations";

const baseURL = process.env.BETTER_AUTH_URL ?? SITE_URL;

/**
 * Plafond d'e-mails d'authentification par destinataire : 5 par heure et par
 * type. Le rate limiting de better-auth est par IP ; sans ce plafond, un
 * attaquant multipliant les IP pourrait bombarder une adresse de liens de
 * vérification ou de réinitialisation (harcèlement, réputation SMTP).
 * Au-delà, l'envoi est ignoré sans erreur : la réponse reste identique.
 */
function allowAuthEmail(kind: "verification" | "reinitialisation", email: string): boolean {
  return rateLimit(`courriel-auth:${kind}:${email.toLowerCase()}`, 5, 60 * 60_000);
}

/**
 * Langue de l'utilisateur au moment de l'appel auth : cookie de préférence,
 * sinon la page d'origine (les pages anglaises vivent sous /en).
 * Sert à envoyer les e-mails de vérification/réinitialisation dans sa langue.
 */
function requestLocale(request?: Request): Locale {
  if (!request) return "fr";
  const cookies = request.headers.get("cookie") ?? "";
  const match = cookies.match(
    new RegExp(`(?:^|;\\s*)${LOCALE_COOKIE}=(fr|en)`),
  );
  if (match) return match[1] as Locale;
  try {
    const refererPath = new URL(request.headers.get("referer") ?? "").pathname;
    if (refererPath === "/en" || refererPath.startsWith("/en/")) return "en";
  } catch {
    // referer absent ou invalide : français par défaut
  }
  return "fr";
}

export const auth = betterAuth({
  appName: "CyberSphere",
  baseURL,
  database: prismaAdapter(db, { provider: "postgresql" }),
  emailAndPassword: {
    enabled: true,
    minPasswordLength: 8,
    // Aucune session tant que l'e-mail n'est pas vérifié
    requireEmailVerification: true,
    // Flux « mot de passe oublié » : lien valable 1 heure
    resetPasswordTokenExpiresIn: 3600,
    // Réinitialiser son mot de passe — le geste conseillé par les alertes de
    // sécurité — ferme toutes les sessions : une session volée n'y survit pas
    // (better-auth les conserve par défaut).
    revokeSessionsOnPasswordReset: true,
    sendResetPassword: async ({ user, url }, request) => {
      if (!allowAuthEmail("reinitialisation", user.email)) return;
      const locale = requestLocale(request);
      const { html, text } = resetPasswordEmail(url, locale);
      await sendEmail({
        to: user.email,
        subject:
          locale === "en"
            ? "Reset your password — CyberSphere"
            : "Réinitialisez votre mot de passe — CyberSphere",
        html,
        text,
      });
    },
  },
  emailVerification: {
    // Envoi automatique du lien de vérification à l'inscription
    sendOnSignUp: true,
    // …et à la connexion tant que l'e-mail n'est pas confirmé
    sendOnSignIn: true,
    autoSignInAfterVerification: true,
    expiresIn: 3600,
    sendVerificationEmail: async ({ user, url }, request) => {
      if (!allowAuthEmail("verification", user.email)) return;
      const locale = requestLocale(request);
      const { html, text } = verificationEmail(url, locale);
      await sendEmail({
        to: user.email,
        subject:
          locale === "en"
            ? "Confirm your email address — CyberSphere"
            : "Confirmez votre adresse e-mail — CyberSphere",
        html,
        text,
      });
    },
  },
  session: {
    // Opérations exigeant une session « fraîche » (enregistrement d'une
    // passkey) : 15 minutes au lieu de 24 h. Une session volée ne permet plus
    // d'ajouter une passkey — qui contournerait mot de passe et 2FA et
    // survivrait à une réinitialisation — sans se reconnecter.
    freshAge: 15 * 60,
  },
  rateLimit: {
    enabled: true,
    window: 60,
    max: 30,
  },
  hooks: {
    // Contrôles serveur sur les endpoints better-auth exposés tels quels
    // (/api/auth/*) : l'UI ne les appelle qu'avec des données validées,
    // mais un client peut les appeler directement.
    before: createAuthMiddleware(async (ctx) => {
      const body = (ctx.body ?? {}) as Record<string, unknown>;

      if (ctx.path === "/sign-up/email" || ctx.path === "/update-user") {
        // L'avatar ne se change que par l'upload ré-encodé (actions/profile) :
        // jamais une URL arbitraire (pixel de pistage, schéma exotique…)
        if ("image" in body) {
          throw new APIError("BAD_REQUEST", { message: "Champ image non autorisé." });
        }
        // Même règle que le formulaire (2–50 caractères), appliquée côté serveur
        if (
          (ctx.path === "/sign-up/email" || "name" in body) &&
          !registerSchema.shape.name.safeParse(body.name).success
        ) {
          throw new APIError("BAD_REQUEST", {
            message: "Le nom doit contenir entre 2 et 50 caractères.",
          });
        }
      }

      // Suppression de compte : mot de passe toujours exigé (better-auth
      // l'accepterait sinon pour toute session « fraîche », cf. freshAge)
      if (ctx.path === "/delete-user") {
        if (typeof body.password !== "string" || body.password.length === 0 || "token" in body) {
          throw new APIError("BAD_REQUEST", {
            message: "Mot de passe requis pour supprimer le compte.",
          });
        }
      }

      // API HTTP du plugin admin (/admin/* : rôles, mots de passe, usurpation,
      // création et suppression de comptes…) : fermée. Aucun écran ne s'en
      // sert — bans et rôles passent par les Server Actions, qui appliquent
      // les règles métier (un admin ne se bannit ni ne se rétrograde) et
      // écrivent le journal d'audit. Ouverte, elle laissait une session admin
      // compromise créer un autre admin ou changer un mot de passe sans trace.
      // Le plugin reste chargé : rôles et blocage des comptes bannis.
      if (ctx.path.startsWith("/admin/")) {
        throw new APIError("FORBIDDEN", {
          message: "API d'administration désactivée.",
        });
      }
    }),
    // Journal d'audit des échecs d'authentification (§ 1.6 du cahier) :
    // les succès sont tracés par les hooks base de données ci-dessous.
    after: createAuthMiddleware(async (ctx) => {
      if (!isAPIError(ctx.context.returned)) {
        // Succès d'opérations sensibles : audit + alerte au titulaire
        const userId = ctx.context.session?.user.id;
        if (!userId) return;
        const alert = {
          "/two-factor/disable": ["auth.2fa_desactivee", "two_factor_disabled"],
          "/passkey/verify-registration": ["auth.passkey_ajoutee", "passkey_added"],
        } as const;
        const event = alert[ctx.path as keyof typeof alert];
        if (!event) return;
        await logAudit({ action: event[0], actorId: userId });
        await sendSecurityAlert({
          userId,
          kind: event[1],
          locale: requestLocale(ctx.request),
          ipAddress: await requestIp(),
          userAgent: ctx.headers?.get("user-agent") ?? null,
        });
        return;
      }
      if (ctx.path === "/sign-in/email") {
        const body = (ctx.body ?? {}) as { email?: unknown };
        await logAudit({
          action: "auth.connexion_echouee",
          actorEmail: typeof body.email === "string" ? body.email.slice(0, 254) : null,
          detail: ctx.context.returned.message,
        });
      } else if (ctx.path.startsWith("/two-factor/verify-")) {
        await logAudit({
          action: "auth.2fa_echouee",
          actorId: ctx.context.session?.user.id ?? null,
          detail: ctx.path,
        });
      }
    }),
  },
  // Journal d'audit des événements d'authentification sensibles
  databaseHooks: {
    user: {
      create: {
        after: async (user) => {
          await logAudit({
            action: "auth.inscription",
            actorId: user.id,
            actorEmail: user.email,
          });
        },
      },
    },
    session: {
      create: {
        after: async (session, ctx) => {
          await logAudit({
            action: "auth.connexion",
            actorId: session.userId,
            ipAddress: session.ipAddress ?? null,
          });
          // Session d'usurpation (plugin admin) : pas une connexion du titulaire
          if ((session as { impersonatedBy?: string | null }).impersonatedBy) return;
          // Alerte si l'appareil n'a jamais servi à se connecter à ce compte
          try {
            if (await isNewLoginDevice(session.userId, session.userAgent)) {
              await sendSecurityAlert({
                userId: session.userId,
                kind: "new_device",
                locale: requestLocale(ctx?.request),
                ipAddress: session.ipAddress,
                userAgent: session.userAgent ?? null,
              });
            }
          } catch (error) {
            console.error("[alerte] suivi des appareils impossible :", error);
          }
        },
      },
    },
    account: {
      update: {
        after: async (account, ctx) => {
          const path = ctx?.path ?? "";
          if (path.includes("change-password") || path.includes("reset-password")) {
            await logAudit({
              action: "auth.mot_de_passe_modifie",
              actorId: account.userId,
            });
            await sendSecurityAlert({
              userId: account.userId,
              kind: "password_changed",
              locale: requestLocale(ctx?.request),
              ipAddress: await requestIp(),
              userAgent: ctx?.headers?.get("user-agent") ?? null,
            });
          }
        },
      },
    },
  },
  user: {
    // Droit à l'effacement (RGPD) : un membre supprime lui-même son compte
    // depuis /membre (mot de passe exigé, cf. hook before). Commentaires,
    // réactions, signets, sessions et appareils partent en cascade.
    deleteUser: {
      enabled: true,
      beforeDelete: async (user) => {
        // Le staff signe des articles (clé étrangère) et détient des droits :
        // sa suppression passe par un administrateur, après rétrogradation.
        const role = (user as { role?: string | null }).role;
        if (role === "admin" || role === "author") {
          throw new APIError("FORBIDDEN", {
            message:
              "Les comptes administrateur et auteur ne peuvent pas être supprimés depuis le profil.",
          });
        }
      },
      afterDelete: async (user) => {
        await db.newsletterSubscriber.deleteMany({ where: { email: user.email.toLowerCase() } });
        await deleteUpload(user.image);
        await logAudit({ action: "compte.suppression", actorEmail: user.email });
      },
    },
  },
  plugins: [
    admin(),
    // 2FA TOTP + codes de secours (activation dans l'espace membre,
    // imposée aux administrateurs par le layout /admin)
    twoFactor({ issuer: "CyberSphere" }),
    // Connexion sans mot de passe, résistante au phishing
    passkey({
      rpName: "CyberSphere",
      rpID: new URL(baseURL).hostname,
      origin: baseURL,
    }),
    // Refuse les mots de passe présents dans des fuites connues
    // (API k-anonymity : le mot de passe ne quitte jamais le serveur)
    haveIBeenPwned({
      customPasswordCompromisedMessage:
        "Ce mot de passe figure dans des fuites de données connues. Choisissez-en un autre.",
    }),
    // CAPTCHA Cloudflare Turnstile sur inscription, connexion, mot de passe
    // oublié et renvoi du lien de vérification (endpoint public qui envoie un
    // e-mail, absent de la liste par défaut du plugin) — actif uniquement si
    // la clé secrète est configurée
    ...(process.env.TURNSTILE_SECRET_KEY
      ? [
          captcha({
            provider: "cloudflare-turnstile",
            secretKey: process.env.TURNSTILE_SECRET_KEY,
            endpoints: [
              "/sign-up/email",
              "/sign-in/email",
              "/request-password-reset",
              "/send-verification-email",
            ],
          }),
        ]
      : []),
    // nextCookies doit rester le dernier plugin de la liste
    nextCookies(),
  ],
});

export type Session = typeof auth.$Infer.Session;
