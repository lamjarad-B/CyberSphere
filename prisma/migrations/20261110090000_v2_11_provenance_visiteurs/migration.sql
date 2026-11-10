-- Provenance des visiteurs : compteurs par jour, pays, région et ville
CREATE TABLE "VisitorLocationStat" (
    "id" TEXT NOT NULL,
    "day" DATE NOT NULL,
    "country" TEXT NOT NULL,
    "region" TEXT NOT NULL,
    "city" TEXT NOT NULL,
    "count" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "VisitorLocationStat_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "VisitorLocationStat_day_country_region_city_key" ON "VisitorLocationStat"("day", "country", "region", "city");
