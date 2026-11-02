-- AlterTable
ALTER TABLE "Article" ADD COLUMN     "featuredUntil" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX "Article_featuredUntil_idx" ON "Article"("featuredUntil");
