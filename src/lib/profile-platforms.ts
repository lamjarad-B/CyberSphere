/** Plateformes reconnues dans les profils publics d'un auteur. */
export type ProfilePlatform =
  | "github"
  | "gitlab"
  | "linkedin"
  | "x"
  | "bluesky"
  | "mastodon"
  | "youtube"
  | "stackoverflow"
  | "medium"
  | "reddit"
  | "discord"
  | "twitch"
  | "instagram"
  | "facebook"
  | "website";

/** Domaines de chaque plateforme, sous-domaines compris (www., fr., m.…). */
const DOMAINS: [ProfilePlatform, string[]][] = [
  ["github", ["github.com"]],
  ["gitlab", ["gitlab.com"]],
  ["linkedin", ["linkedin.com"]],
  ["x", ["x.com", "twitter.com"]],
  ["bluesky", ["bsky.app"]],
  // Instances Mastodon courantes ; les autres se repèrent à leur nom (mastodon.…)
  ["mastodon", ["mastodon.social", "mastodon.online", "infosec.exchange", "fosstodon.org", "piaille.fr"]],
  ["youtube", ["youtube.com", "youtu.be"]],
  ["stackoverflow", ["stackoverflow.com"]],
  ["medium", ["medium.com"]],
  ["reddit", ["reddit.com"]],
  ["discord", ["discord.com", "discord.gg"]],
  ["twitch", ["twitch.tv"]],
  ["instagram", ["instagram.com"]],
  ["facebook", ["facebook.com"]],
];

/**
 * Plateforme d'un lien de profil, d'après son hôte. Un site hébergé chez une
 * plateforme (pseudo.github.io) reste un site : seul le domaine exact ou un
 * de ses sous-domaines compte. Lien illisible ou inconnu : « website ».
 */
export function profilePlatform(url: string): ProfilePlatform {
  let host: string;
  try {
    host = new URL(url).hostname.toLowerCase();
  } catch {
    return "website";
  }
  for (const [platform, domains] of DOMAINS) {
    if (domains.some((domain) => host === domain || host.endsWith(`.${domain}`))) return platform;
  }
  if (host.startsWith("mastodon.")) return "mastodon";
  return "website";
}
