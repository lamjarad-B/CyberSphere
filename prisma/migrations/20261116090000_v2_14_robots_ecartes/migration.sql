-- Requêtes écartées des statistiques par le filtre de user-agent : compteurs par jour et par type
CREATE TABLE "BotHitStat" (
    "id" TEXT NOT NULL,
    "day" DATE NOT NULL,
    "kind" TEXT NOT NULL,
    "count" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "BotHitStat_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "BotHitStat_day_kind_key" ON "BotHitStat"("day", "kind");
