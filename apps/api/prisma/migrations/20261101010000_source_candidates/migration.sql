CREATE TABLE "source_candidates" (
  "id" UUID NOT NULL,
  "source" TEXT NOT NULL,
  "external_id" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "source_url" TEXT NOT NULL,
  "mime_type" TEXT NOT NULL,
  "size_bytes" BIGINT,
  "license" TEXT NOT NULL DEFAULT '',
  "artist" TEXT NOT NULL DEFAULT '',
  "license_url" TEXT NOT NULL DEFAULT '',
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "source_candidates_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "source_candidates_source_external_id_key" ON "source_candidates"("source", "external_id");
CREATE INDEX "source_candidates_created_at_idx" ON "source_candidates"("created_at");
