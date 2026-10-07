-- AlterEnum
ALTER TYPE "ArticleStatus" ADD VALUE 'SCHEDULED';

-- AlterTable
ALTER TABLE "Article" ADD COLUMN     "coverAlt" TEXT;

-- AlterTable
ALTER TABLE "ArticleTranslation" ADD COLUMN     "coverAlt" TEXT;

-- CreateTable
CREATE TABLE "LoginDevice" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "uaHash" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LoginDevice_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "LoginDevice_userId_uaHash_key" ON "LoginDevice"("userId", "uaHash");

-- AddForeignKey
ALTER TABLE "LoginDevice" ADD CONSTRAINT "LoginDevice_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
