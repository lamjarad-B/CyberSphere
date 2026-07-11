"use server";

import { getStaffSession } from "@/lib/session";

/**
 * Pré-traduction IA (API Claude) : produit un brouillon anglais des trois
 * champs d'un article, injecté dans le formulaire admin pour relecture et
 * correction humaine avant enregistrement. Aucune écriture en base ici.
 *
 * Désactivée proprement si ANTHROPIC_API_KEY est vide (comme Turnstile/SMTP).
 */

const ANTHROPIC_API_URL = "https://api.anthropic.com/v1/messages";
const MODEL = "claude-sonnet-5";
// Marge large : la traduction fait environ la taille de l'original.
const MAX_OUTPUT_TOKENS = 32_000;
const MAX_CONTENT_CHARS = 60_000;

const SYSTEM_PROMPT = `You are an expert French-to-English translator specialized in cybersecurity editorial content.
Translate the article faithfully and idiomatically, as a native English tech editor would write it — never word-for-word.
Rules:
- Preserve the Markdown structure exactly (headings, lists, links, quotes, tables).
- Never translate code blocks, inline code, commands, file paths or URLs: keep them byte-identical.
- Use the established English form of cybersecurity terms (e.g. « hameçonnage » → "phishing").
- The excerpt must stay under 500 characters and the title under 200 characters.
Reply with exactly three sections delimited by the markers ===TITLE===, ===EXCERPT=== and ===CONTENT===, each marker alone on its own line, and nothing else before, between or after the sections.`;

export type PretranslateResult =
  | { ok: true; titleEn: string; excerptEn: string; contentEn: string }
  | { ok: false; error: string };

function extractSections(
  text: string,
): { title: string; excerpt: string; content: string } | null {
  const match = text.match(
    /===TITLE===\s*([\s\S]*?)\s*===EXCERPT===\s*([\s\S]*?)\s*===CONTENT===\s*([\s\S]*?)\s*$/,
  );
  if (!match) return null;
  const [, title, excerpt, content] = match;
  if (!title || !excerpt || !content) return null;
  return { title, excerpt, content };
}

export async function pretranslateArticle(input: {
  title: string;
  excerpt: string;
  content: string;
}): Promise<PretranslateResult> {
  const session = await getStaffSession();
  if (!session) return { ok: false, error: "Accès refusé." };

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return {
      ok: false,
      error:
        "Pré-traduction indisponible : renseignez ANTHROPIC_API_KEY dans .env puis redémarrez le serveur.",
    };
  }

  const title = input.title.trim();
  const excerpt = input.excerpt.trim();
  const content = input.content.trim();
  if (!title || !excerpt || !content) {
    return {
      ok: false,
      error: "Remplissez d'abord le titre, l'extrait et le contenu français.",
    };
  }
  if (content.length > MAX_CONTENT_CHARS) {
    return {
      ok: false,
      error: `Article trop long pour la pré-traduction (${MAX_CONTENT_CHARS.toLocaleString("fr-FR")} caractères max).`,
    };
  }

  let response: Response;
  try {
    response = await fetch(ANTHROPIC_API_URL, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: MAX_OUTPUT_TOKENS,
        system: SYSTEM_PROMPT,
        messages: [
          {
            role: "user",
            content: `===TITLE===\n${title}\n===EXCERPT===\n${excerpt}\n===CONTENT===\n${content}`,
          },
        ],
      }),
      // Les longs articles prennent plusieurs minutes à traduire
      signal: AbortSignal.timeout(300_000),
    });
  } catch (error) {
    console.error("[pré-traduction] appel API impossible :", error);
    return {
      ok: false,
      error: "L'API Claude est injoignable (délai dépassé ou réseau). Réessayez.",
    };
  }

  if (!response.ok) {
    const body = await response.text().catch(() => "");
    console.error(`[pré-traduction] API ${response.status} :`, body.slice(0, 500));
    return {
      ok: false,
      error:
        response.status === 401
          ? "Clé ANTHROPIC_API_KEY invalide ou révoquée."
          : response.status === 429
            ? "Limite de débit de l'API Claude atteinte. Réessayez dans un instant."
            : "L'API Claude a renvoyé une erreur. Réessayez.",
    };
  }

  const payload = (await response.json()) as {
    content?: { type: string; text?: string }[];
    stop_reason?: string;
  };
  if (payload.stop_reason === "max_tokens") {
    return { ok: false, error: "Article trop long : la traduction a été tronquée." };
  }

  const text = (payload.content ?? [])
    .filter((block) => block.type === "text")
    .map((block) => block.text ?? "")
    .join("");
  const sections = extractSections(text);
  if (!sections) {
    console.error("[pré-traduction] réponse inattendue :", text.slice(0, 500));
    return { ok: false, error: "Réponse inexploitable de l'API. Réessayez." };
  }

  return {
    ok: true,
    // Bornes des champs (articleSchema) appliquées par sécurité
    titleEn: sections.title.slice(0, 200),
    excerptEn: sections.excerpt.slice(0, 500),
    contentEn: sections.content,
  };
}
