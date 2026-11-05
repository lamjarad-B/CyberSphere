-- CreateEnum
CREATE TYPE "CommentStatus" AS ENUM ('PENDING', 'APPROVED');

-- Les commentaires existants, tous écrits par des membres, restent publiés…
ALTER TABLE "Comment"
    ALTER COLUMN "authorId" DROP NOT NULL,
    ADD COLUMN "status" "CommentStatus" NOT NULL DEFAULT 'APPROVED',
    ADD COLUMN "guestName" TEXT,
    ADD COLUMN "guestEmail" TEXT,
    ADD COLUMN "guestIpHash" TEXT,
    ADD COLUMN "newsletterOptIn" BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN "guestLocale" TEXT;

-- …mais tout nouveau commentaire attend la modération, sauf choix explicite
ALTER TABLE "Comment" ALTER COLUMN "status" SET DEFAULT 'PENDING';

-- Un commentaire a toujours un auteur à afficher (hors du modèle Prisma)
ALTER TABLE "Comment" ADD CONSTRAINT "Comment_author_or_guest_check"
    CHECK ("authorId" IS NOT NULL OR "guestName" IS NOT NULL);

-- DropIndex
DROP INDEX "Comment_articleId_idx";

-- CreateIndex
CREATE INDEX "Comment_articleId_status_idx" ON "Comment"("articleId", "status");

-- CreateIndex
CREATE INDEX "Comment_status_createdAt_idx" ON "Comment"("status", "createdAt");

-- CreateTable
CREATE TABLE "UsedCaptchaChallenge" (
    "nonce" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UsedCaptchaChallenge_pkey" PRIMARY KEY ("nonce")
);

-- CreateIndex
CREATE INDEX "UsedCaptchaChallenge_expiresAt_idx" ON "UsedCaptchaChallenge"("expiresAt");
