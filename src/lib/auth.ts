import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { admin } from "better-auth/plugins";
import { nextCookies } from "better-auth/next-js";
import { db } from "./db";
import { sendEmail, verificationEmail } from "./email";

export const auth = betterAuth({
  appName: "CyberSphere",
  baseURL: process.env.BETTER_AUTH_URL,
  database: prismaAdapter(db, { provider: "postgresql" }),
  emailAndPassword: {
    enabled: true,
    minPasswordLength: 8,
    // Aucune session tant que l'e-mail n'est pas vérifié
    requireEmailVerification: true,
  },
  emailVerification: {
    // Envoi automatique du lien de vérification à l'inscription
    sendOnSignUp: true,
    // …et à la connexion tant que l'e-mail n'est pas confirmé
    sendOnSignIn: true,
    autoSignInAfterVerification: true,
    expiresIn: 3600,
    sendVerificationEmail: async ({ user, url }) => {
      const { html, text } = verificationEmail(url);
      await sendEmail({
        to: user.email,
        subject: "Confirmez votre adresse e-mail — CyberSphere",
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
  // nextCookies doit rester le dernier plugin de la liste
  plugins: [admin(), nextCookies()],
});

export type Session = typeof auth.$Infer.Session;
