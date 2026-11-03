CREATE TABLE "tv_episode_media" (
  "tmdb_id" INTEGER NOT NULL,
  "season" INTEGER NOT NULL,
  "episode" INTEGER NOT NULL,
  "movie_id" UUID NOT NULL,
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "tv_episode_media_pkey" PRIMARY KEY ("tmdb_id", "season", "episode"),
  CONSTRAINT "tv_episode_media_movie_id_fkey" FOREIGN KEY ("movie_id") REFERENCES "movies"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "tv_episode_media_movie_id_idx" ON "tv_episode_media"("movie_id");
