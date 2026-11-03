CREATE TABLE "recent_tv_series" (
  "user_id" UUID NOT NULL,
  "tmdb_id" INTEGER NOT NULL,
  "title" TEXT NOT NULL,
  "poster_url" TEXT,
  "viewed_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "season" INTEGER,
  "episode" INTEGER,
  CONSTRAINT "recent_tv_series_pkey" PRIMARY KEY ("user_id", "tmdb_id"),
  CONSTRAINT "recent_tv_series_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "recent_tv_series_user_id_viewed_at_idx" ON "recent_tv_series"("user_id", "viewed_at");
