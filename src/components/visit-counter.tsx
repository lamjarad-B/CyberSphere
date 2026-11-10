import { after } from "next/server";
import { requestIp } from "@/lib/audit";
import { getSession, isStaffAccount } from "@/lib/session";
import { isBotRequest, recordVisit } from "@/lib/stats";

/**
 * Compte le visiteur par pays et ville (lib/stats) une fois la page envoyée.
 * Placé dans le layout public : toutes les pages comptent, pas seulement les
 * articles. Ne rend rien ; composant à part pour ne pas retarder le layout.
 * Les robots et l'équipe connectée (admins, auteurs) ne sont pas des visiteurs.
 */
export async function VisitCounter() {
  // IP et user-agent se lisent pendant le rendu ; l'écriture part dans after()
  const [session, visitor, bot] = await Promise.all([getSession(), requestIp(), isBotRequest()]);
  if (bot || isStaffAccount(session)) return null;

  after(async () => {
    await recordVisit(visitor).catch((error) => {
      console.error("[stats] visite non comptabilisée :", error);
    });
  });
  return null;
}
