CREATE TABLE "anime_titles" (
 "id" UUID NOT NULL, "catalog_key" TEXT NOT NULL, "title" TEXT NOT NULL,
 "aliases" TEXT[], "format" TEXT NOT NULL, "poster_url" TEXT,
 "external_ids" JSONB NOT NULL, "provenance" TEXT NOT NULL,
 "updated_at" TIMESTAMPTZ(3) NOT NULL, PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "anime_titles_catalog_key_key" ON "anime_titles"("catalog_key");
CREATE INDEX "anime_titles_title_idx" ON "anime_titles"("title");
CREATE TABLE "anime_episodes" (
 "id" UUID NOT NULL, "anime_id" UUID NOT NULL, "key" TEXT NOT NULL, "label" TEXT NOT NULL,
 "ordinal" INTEGER NOT NULL, "kind" TEXT NOT NULL DEFAULT 'episode', "still_url" TEXT,
 PRIMARY KEY ("id"), FOREIGN KEY ("anime_id") REFERENCES "anime_titles"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "anime_episodes_anime_id_key_key" ON "anime_episodes"("anime_id", "key");
CREATE INDEX "anime_episodes_anime_id_ordinal_idx" ON "anime_episodes"("anime_id", "ordinal");
CREATE TABLE "anime_sources" (
 "id" UUID NOT NULL, "episode_id" UUID NOT NULL, "adapter_id" TEXT NOT NULL,
 "provider_type" TEXT NOT NULL DEFAULT 'series', "provider_id" TEXT NOT NULL, "stream_name" TEXT NOT NULL, "edition" TEXT NOT NULL,
 "audio_language" TEXT NOT NULL DEFAULT 'ja', "subtitle_language" TEXT,
 "verified" BOOLEAN NOT NULL DEFAULT false, "enabled" BOOLEAN NOT NULL DEFAULT false, "evidence" TEXT NOT NULL,
 PRIMARY KEY ("id"), FOREIGN KEY ("episode_id") REFERENCES "anime_episodes"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "anime_sources_episode_id_adapter_id_provider_id_key" ON "anime_sources"("episode_id", "adapter_id", "provider_id");
CREATE INDEX "anime_sources_episode_id_enabled_verified_idx" ON "anime_sources"("episode_id", "enabled", "verified");
