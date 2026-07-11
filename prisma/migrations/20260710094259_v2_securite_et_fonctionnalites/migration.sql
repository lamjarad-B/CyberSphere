-- AlterEnum
ALTER TYPE "ArticleStatus" ADD VALUE 'SUBMITTED';

-- AlterTable
ALTER TABLE "Article" ADD COLUMN     "search" tsvector,
ADD COLUMN     "seriesId" TEXT,
ADD COLUMN     "seriesPosition" INTEGER;

-- "search" : vecteur de recherche plein texte français maintenu par trigger,
-- pondéré titre (A) > extrait (B) > contenu (C). Un trigger plutôt qu'une
-- colonne générée : Prisma Migrate ne sait pas représenter l'expression de
-- génération et détecterait une dérive de schéma à chaque migration.
CREATE FUNCTION article_search_update() RETURNS trigger AS $$
BEGIN
  NEW."search" :=
    setweight(to_tsvector('french', coalesce(NEW."title", '')), 'A') ||
    setweight(to_tsvector('french', coalesce(NEW."excerpt", '')), 'B') ||
    setweight(to_tsvector('french', coalesce(NEW."content", '')), 'C');
  RETURN NEW;
END $$ LANGUAGE plpgsql;

CREATE TRIGGER article_search_trigger
BEFORE INSERT OR UPDATE OF "title", "excerpt", "content" ON "Article"
FOR EACH ROW EXECUTE FUNCTION article_search_update();

-- Remplissage des lignes existantes
UPDATE "Article" SET "search" =
  setweight(to_tsvector('french', coalesce("title", '')), 'A') ||
  setweight(to_tsvector('french', coalesce("excerpt", '')), 'B') ||
  setweight(to_tsvector('french', coalesce("content", '')), 'C');

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "twoFactorEnabled" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "TwoFactor" (
    "id" TEXT NOT NULL,
    "secret" TEXT NOT NULL,
    "backupCodes" TEXT NOT NULL,
    "verified" BOOLEAN NOT NULL DEFAULT true,
    "failedVerificationCount" INTEGER NOT NULL DEFAULT 0,
    "lockedUntil" TIMESTAMP(3),
    "userId" TEXT NOT NULL,

    CONSTRAINT "TwoFactor_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Passkey" (
    "id" TEXT NOT NULL,
    "name" TEXT,
    "publicKey" TEXT NOT NULL,
    "credentialID" TEXT NOT NULL,
    "counter" INTEGER NOT NULL,
    "deviceType" TEXT NOT NULL,
    "backedUp" BOOLEAN NOT NULL,
    "transports" TEXT,
    "aaguid" TEXT,
    "createdAt" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP,
    "userId" TEXT NOT NULL,

    CONSTRAINT "Passkey_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Series" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "description" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Series_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Reaction" (
    "id" TEXT NOT NULL,
    "articleId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Reaction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Bookmark" (
    "id" TEXT NOT NULL,
    "articleId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Bookmark_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CommentReport" (
    "id" TEXT NOT NULL,
    "commentId" TEXT NOT NULL,
    "reporterId" TEXT NOT NULL,
    "reason" TEXT,
    "resolvedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CommentReport_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "NewsletterSubscriber" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "confirmed" BOOLEAN NOT NULL DEFAULT false,
    "confirmedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "NewsletterSubscriber_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "actorId" TEXT,
    "actorEmail" TEXT,
    "targetType" TEXT,
    "targetId" TEXT,
    "detail" TEXT,
    "ipAddress" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ArticleDailyView" (
    "id" TEXT NOT NULL,
    "articleId" TEXT NOT NULL,
    "day" DATE NOT NULL,
    "views" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "ArticleDailyView_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReferrerStat" (
    "id" TEXT NOT NULL,
    "host" TEXT NOT NULL,
    "day" DATE NOT NULL,
    "count" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "ReferrerStat_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "TwoFactor_userId_idx" ON "TwoFactor"("userId");

-- CreateIndex
CREATE INDEX "TwoFactor_secret_idx" ON "TwoFactor"("secret");

-- CreateIndex
CREATE INDEX "Passkey_userId_idx" ON "Passkey"("userId");

-- CreateIndex
CREATE INDEX "Passkey_credentialID_idx" ON "Passkey"("credentialID");

-- CreateIndex
CREATE UNIQUE INDEX "Series_slug_key" ON "Series"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "Reaction_articleId_userId_key" ON "Reaction"("articleId", "userId");

-- CreateIndex
CREATE UNIQUE INDEX "Bookmark_articleId_userId_key" ON "Bookmark"("articleId", "userId");

-- CreateIndex
CREATE INDEX "CommentReport_resolvedAt_idx" ON "CommentReport"("resolvedAt");

-- CreateIndex
CREATE UNIQUE INDEX "CommentReport_commentId_reporterId_key" ON "CommentReport"("commentId", "reporterId");

-- CreateIndex
CREATE UNIQUE INDEX "NewsletterSubscriber_email_key" ON "NewsletterSubscriber"("email");

-- CreateIndex
CREATE UNIQUE INDEX "NewsletterSubscriber_token_key" ON "NewsletterSubscriber"("token");

-- CreateIndex
CREATE INDEX "AuditLog_createdAt_idx" ON "AuditLog"("createdAt");

-- CreateIndex
CREATE INDEX "AuditLog_actorId_idx" ON "AuditLog"("actorId");

-- CreateIndex
CREATE UNIQUE INDEX "ArticleDailyView_articleId_day_key" ON "ArticleDailyView"("articleId", "day");

-- CreateIndex
CREATE UNIQUE INDEX "ReferrerStat_host_day_key" ON "ReferrerStat"("host", "day");

-- CreateIndex
CREATE INDEX "Article_seriesId_idx" ON "Article"("seriesId");

-- CreateIndex
CREATE INDEX "Article_search_idx" ON "Article" USING GIN ("search");

-- AddForeignKey
ALTER TABLE "TwoFactor" ADD CONSTRAINT "TwoFactor_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Passkey" ADD CONSTRAINT "Passkey_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Article" ADD CONSTRAINT "Article_seriesId_fkey" FOREIGN KEY ("seriesId") REFERENCES "Series"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Reaction" ADD CONSTRAINT "Reaction_articleId_fkey" FOREIGN KEY ("articleId") REFERENCES "Article"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Reaction" ADD CONSTRAINT "Reaction_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Bookmark" ADD CONSTRAINT "Bookmark_articleId_fkey" FOREIGN KEY ("articleId") REFERENCES "Article"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Bookmark" ADD CONSTRAINT "Bookmark_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CommentReport" ADD CONSTRAINT "CommentReport_commentId_fkey" FOREIGN KEY ("commentId") REFERENCES "Comment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CommentReport" ADD CONSTRAINT "CommentReport_reporterId_fkey" FOREIGN KEY ("reporterId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ArticleDailyView" ADD CONSTRAINT "ArticleDailyView_articleId_fkey" FOREIGN KEY ("articleId") REFERENCES "Article"("id") ON DELETE CASCADE ON UPDATE CASCADE;
