import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { admin, captcha, haveIBeenPwned, twoFactor } from "better-auth/plugins";
import { nextCookies } from "better-auth/next-js";
import { passkey } from "@better-auth/passkey";
import { db } from "./db";
import { logAudit } from "./audit";
import { sendEmail, verificationEmail, resetPasswordEmail } from "./email";
import { LOCALE_COOKIE, type Locale } from "./i18n";

const baseURL = process.env.BETTER_AUTH_URL ?? "http://localhost:3000";

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
    sendResetPassword: async ({ user, url }, request) => {
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
  rateLimit: {
    enabled: true,
    window: 60,
    max: 30,
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
        after: async (session) => {
          await logAudit({
            action: "auth.connexion",
            actorId: session.userId,
            ipAddress: session.ipAddress ?? null,
          });
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
          }
        },
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
    // CAPTCHA Cloudflare Turnstile sur inscription/connexion/mot de passe
    // oublié — actif uniquement si la clé secrète est configurée
    ...(process.env.TURNSTILE_SECRET_KEY
      ? [
          captcha({
            provider: "cloudflare-turnstile",
            secretKey: process.env.TURNSTILE_SECRET_KEY,
          }),
        ]
      : []),
    // nextCookies doit rester le dernier plugin de la liste
    nextCookies(),
  ],
});

export type Session = typeof auth.$Infer.Session;
