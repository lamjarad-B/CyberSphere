import { after } from "next/server";
import { requestIp } from "@/lib/audit";
import { getSession, isStaffAccount } from "@/lib/session";
import { recordBotHit, recordVisit, requestBotKind } from "@/lib/stats";

/**
 * Compte le visiteur par pays et ville (lib/stats) une fois la page envoyée.
 * Placé dans le layout public : toutes les pages comptent, pas seulement les
 * articles. Ne rend rien ; composant à part pour ne pas retarder le layout.
 * Les robots et l'équipe connectée (admins, auteurs) ne sont pas des visiteurs ;
 * les robots sont comptés à part, pour montrer ce que le filtre écarte.
 */
export async function VisitCounter() {
  // IP et user-agent se lisent pendant le rendu ; l'écriture part dans after()
  const [session, visitor, bot] = await Promise.all([getSession(), requestIp(), requestBotKind()]);
  if (isStaffAccount(session)) return null;
  if (bot) {
    recordBotHit(bot);
    return null;
  }

  after(async () => {
    await recordVisit(visitor).catch((error) => {
      console.error("[stats] visite non comptabilisée :", error);
    });
  });
  return null;
}
