-- Pages auteurs : slug public, bio bilingue et profils publics
ALTER TABLE "User" ADD COLUMN "slug" TEXT,
ADD COLUMN "bio" TEXT,
ADD COLUMN "bioEn" TEXT,
ADD COLUMN "links" TEXT;

CREATE UNIQUE INDEX "User_slug_key" ON "User"("slug");

-- Description anglaise des catégories
ALTER TABLE "Category" ADD COLUMN "descriptionEn" TEXT;

-- Date de dernière modification du contenu, distincte de updatedAt
ALTER TABLE "Article" ADD COLUMN "contentUpdatedAt" TIMESTAMP(3);

-- Remplissage : updatedAt ne peut pas servir, chaque vue le renouvelait
-- jusqu'à la v2.10. La dernière écriture éditoriale du journal d'audit en
-- tient lieu ; à défaut (entrée purgée, article du seed), la date de
-- publication, sinon celle de création.
UPDATE "Article" a
SET "contentUpdatedAt" = coalesce(
  greatest(
    a."publishedAt",
    (
      SELECT max(l."createdAt")
      FROM "AuditLog" l
      WHERE l."targetType" = 'article'
        AND l."targetId" = a."id"
        AND l."action" IN (
          'article.creation', 'article.modification', 'article.publication',
          'article.programmation', 'article.soumission', 'article.publication_programmee'
        )
    )
  ),
  a."createdAt"
);

-- Slug des auteurs ayant déjà publié, sur le modèle de lib/slug (accents
-- translittérés, [a-z0-9-], 80 caractères) ; homonymes suffixés -2, -3…
WITH auteurs AS (
  SELECT u."id", u."createdAt",
         coalesce(nullif(left(trim(both '-' from regexp_replace(
           translate(replace(replace(lower(u."name"), 'œ', 'oe'), 'æ', 'ae'),
                     'àáâäãåçèéêëìíîïñòóôöõùúûüýÿ', 'aaaaaaceeeeiiiinooooouuuuyy'),
           '[^a-z0-9]+', '-', 'g')), 80), ''), 'auteur') AS base
  FROM "User" u
  WHERE EXISTS (
    SELECT 1 FROM "Article" a WHERE a."authorId" = u."id" AND a."status" = 'PUBLISHED'
  )
), numerotes AS (
  SELECT "id", base, row_number() OVER (PARTITION BY base ORDER BY "createdAt") AS rang
  FROM auteurs
)
UPDATE "User" u
SET "slug" = n.base || CASE WHEN n.rang > 1 THEN '-' || n.rang ELSE '' END
FROM numerotes n
WHERE u."id" = n."id";
