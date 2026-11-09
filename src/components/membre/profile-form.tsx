"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { updateProfile } from "@/actions/profile";
import { useI18n } from "@/components/i18n-provider";
import {
  buttonClass,
  errorClass,
  inputClass,
  labelClass,
  statusRegionClass,
  successClass,
} from "@/components/ui";

// Champs de la page auteur, réservés à l'équipe
const authorCopy = {
  fr: {
    heading: "Page auteur publique",
    intro:
      "Affichée sous vos articles et dans les données structurées. Laissez vide ce que vous ne souhaitez pas publier.",
    bio: "Bio",
    bioEn: "Bio en anglais",
    optional: "(facultatif, 600 caractères max)",
    links: "Profils publics",
    linksHint: "(une adresse https par ligne, 5 max : LinkedIn, GitHub, site…)",
    view: "Voir ma page auteur",
  },
  en: {
    heading: "Public author page",
    intro:
      "Shown with your articles and in structured data. Leave empty anything you don't want to publish.",
    bio: "Bio (French)",
    bioEn: "Bio in English",
    optional: "(optional, 600 characters max)",
    links: "Public profiles",
    linksHint: "(one https address per line, 5 max: LinkedIn, GitHub, website…)",
    view: "View my author page",
  },
};

export type AuthorProfile = {
  bio: string | null;
  bioEn: string | null;
  links: string | null;
  /** Page publique, une fois le slug attribué */
  href: string | null;
};

export function ProfileForm({
  name,
  image,
  author,
}: {
  name: string;
  image: string | null;
  /** Membres de l'équipe uniquement */
  author?: AuthorProfile;
}) {
  const router = useRouter();
  const { t, locale } = useI18n();
  const labels = t.member.profile;
  const authorLabels = authorCopy[locale];
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [pending, startTransition] = useTransition();

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    setError(null);
    setSaved(false);
    startTransition(async () => {
      const result = await updateProfile(formData);
      if (!result.ok) {
        setError(result.error ?? t.auth.genericError);
        return;
      }
      setSaved(true);
      router.refresh();
    });
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {error && <p className={errorClass} role="alert">{error}</p>}
      <div role="status" className={statusRegionClass}>
        {saved && <p className={successClass}>{labels.saved}</p>}
      </div>

      <div className="flex items-center gap-4">
        {image ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={image}
            alt={labels.avatarAlt}
            className="h-16 w-16 rounded-full border border-border object-cover"
          />
        ) : (
          <span className="flex h-16 w-16 items-center justify-center rounded-full bg-accent/15 font-mono text-xl font-bold text-accent">
            {name.charAt(0).toUpperCase()}
          </span>
        )}
        <div className="flex-1">
          <label htmlFor="avatar" className={labelClass}>
            {labels.avatarLabel}{" "}
            <span className="font-normal text-muted">{labels.avatarHint}</span>
          </label>
          <input
            id="avatar"
            name="avatar"
            type="file"
            accept="image/png,image/jpeg,image/webp,image/gif,image/svg+xml"
            className="block w-full text-sm text-muted file:mr-3 file:rounded-md file:border file:border-border file:bg-surface file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-foreground"
          />
        </div>
      </div>

      <div>
        <label htmlFor="name" className={labelClass}>
          {labels.nameLabel}
        </label>
        <input
          id="name"
          name="name"
          type="text"
          defaultValue={name}
          required
          className={inputClass}
        />
      </div>

      {author && (
        <fieldset className="space-y-4 border-t border-border pt-4">
          <legend className="pt-4 text-sm font-semibold">{authorLabels.heading}</legend>
          <p className="text-sm text-muted">{authorLabels.intro}</p>
          <div>
            <label htmlFor="bio" className={labelClass}>
              {authorLabels.bio}{" "}
              <span className="font-normal text-muted">{authorLabels.optional}</span>
            </label>
            <textarea
              id="bio"
              name="bio"
              rows={4}
              maxLength={600}
              lang="fr"
              defaultValue={author.bio ?? ""}
              className={inputClass}
            />
          </div>
          <div>
            <label htmlFor="bioEn" className={labelClass}>
              {authorLabels.bioEn}{" "}
              <span className="font-normal text-muted">{authorLabels.optional}</span>
            </label>
            <textarea
              id="bioEn"
              name="bioEn"
              rows={4}
              maxLength={600}
              lang="en"
              defaultValue={author.bioEn ?? ""}
              className={inputClass}
            />
          </div>
          <div>
            <label htmlFor="links" className={labelClass}>
              {authorLabels.links}{" "}
              <span className="font-normal text-muted">{authorLabels.linksHint}</span>
            </label>
            <textarea
              id="links"
              name="links"
              rows={3}
              spellCheck={false}
              defaultValue={author.links ?? ""}
              className={`${inputClass} font-mono text-sm`}
            />
          </div>
          {author.href && (
            <p className="text-sm">
              <Link href={author.href} className="text-accent underline">
                {authorLabels.view}
              </Link>
            </p>
          )}
        </fieldset>
      )}

      <button type="submit" disabled={pending} className={buttonClass}>
        {pending ? labels.saving : labels.save}
      </button>
    </form>
  );
}
