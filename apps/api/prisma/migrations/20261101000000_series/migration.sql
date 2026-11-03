CREATE TABLE "series" (
  "id" UUID NOT NULL,
  "title" TEXT NOT NULL,
  "description" TEXT NOT NULL DEFAULT '',
  "country" TEXT NOT NULL DEFAULT '',
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(3) NOT NULL,
  CONSTRAINT "series_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "series_title_idx" ON "series"("title");
CREATE TABLE "series_episodes" (
  "id" UUID NOT NULL,
  "series_id" UUID NOT NULL,
  "movie_id" UUID NOT NULL,
  "season_number" INTEGER NOT NULL,
  "episode_number" INTEGER NOT NULL,
  CONSTRAINT "series_episodes_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "series_episodes_series_id_fkey" FOREIGN KEY ("series_id") REFERENCES "series"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "series_episodes_movie_id_fkey" FOREIGN KEY ("movie_id") REFERENCES "movies"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "series_episodes_movie_id_key" ON "series_episodes"("movie_id");
CREATE UNIQUE INDEX "series_episodes_series_id_season_number_episode_number_key" ON "series_episodes"("series_id", "season_number", "episode_number");
