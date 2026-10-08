-- CreateEnum
CREATE TYPE "ArticleKind" AS ENUM ('ANALYSIS', 'EXPLAINER', 'OPINION', 'BRIEF', 'TUTORIAL');

-- AlterTable
ALTER TABLE "Article" ADD COLUMN     "keyPoints" TEXT,
ADD COLUMN     "kind" "ArticleKind" NOT NULL DEFAULT 'ANALYSIS';

-- AlterTable
ALTER TABLE "ArticleTranslation" ADD COLUMN     "keyPoints" TEXT;

-- CreateIndex
CREATE INDEX "Article_kind_idx" ON "Article"("kind");
