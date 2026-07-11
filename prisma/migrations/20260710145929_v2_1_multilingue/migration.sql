-- AlterTable
ALTER TABLE "Category" ADD COLUMN     "nameEn" TEXT;

-- AlterTable
ALTER TABLE "NewsletterSubscriber" ADD COLUMN     "locale" TEXT NOT NULL DEFAULT 'fr';

-- AlterTable
ALTER TABLE "Series" ADD COLUMN     "descriptionEn" TEXT,
ADD COLUMN     "titleEn" TEXT;

-- CreateTable
CREATE TABLE "ArticleTranslation" (
    "id" TEXT NOT NULL,
    "articleId" TEXT NOT NULL,
    "locale" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "excerpt" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "search" tsvector,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ArticleTranslation_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ArticleTranslation_search_idx" ON "ArticleTranslation" USING GIN ("search");

-- CreateIndex
CREATE UNIQUE INDEX "ArticleTranslation_articleId_locale_key" ON "ArticleTranslation"("articleId", "locale");

-- AddForeignKey
ALTER TABLE "ArticleTranslation" ADD CONSTRAINT "ArticleTranslation_articleId_fkey" FOREIGN KEY ("articleId") REFERENCES "Article"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Recherche full-text anglaise : colonne entretenue par trigger
-- (même approche que la colonne "search" française sur "Article")
CREATE OR REPLACE FUNCTION article_translation_search_update() RETURNS trigger AS $$
BEGIN
  NEW."search" :=
    setweight(to_tsvector('english', coalesce(NEW."title", '')), 'A') ||
    setweight(to_tsvector('english', coalesce(NEW."excerpt", '')), 'B') ||
    setweight(to_tsvector('english', coalesce(NEW."content", '')), 'C');
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER article_translation_search_trigger
  BEFORE INSERT OR UPDATE OF "title", "excerpt", "content"
  ON "ArticleTranslation"
  FOR EACH ROW
  EXECUTE FUNCTION article_translation_search_update();
