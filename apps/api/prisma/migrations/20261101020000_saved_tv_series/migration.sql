CREATE TABLE "saved_tv_series" (
    "user_id" UUID NOT NULL,
    "tmdb_id" INTEGER NOT NULL,
    "title" TEXT NOT NULL,
    "poster_url" TEXT,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "saved_tv_series_pkey" PRIMARY KEY ("user_id","tmdb_id"),
    CONSTRAINT "saved_tv_series_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "saved_tv_series_user_id_created_at_idx" ON "saved_tv_series"("user_id", "created_at");
