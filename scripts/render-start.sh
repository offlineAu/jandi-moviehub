#!/usr/bin/env sh
set -eu

# Render Free has no pre-deploy command. The build command applies migrations (over the direct
# Neon connection) and leaves a marker, so a cold start skips the Prisma CLI and boots faster.
# If the service's build command doesn't do that (e.g. configured in the dashboard instead of
# render.yaml), migrate here as before. Application traffic uses the pooled DATABASE_URL.
if [ ! -f .migrated-at-build ]; then
  DATABASE_URL="${DATABASE_URL_UNPOOLED:-$DATABASE_URL}" pnpm --filter @jandi/api db:deploy
fi
exec pnpm --filter @jandi/api start
