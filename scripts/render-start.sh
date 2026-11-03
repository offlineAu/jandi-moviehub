#!/usr/bin/env sh
set -eu

# Render Free has no pre-deploy command. Migrate over the direct Neon connection
# before starting; application traffic continues to use the pooled DATABASE_URL.
DATABASE_URL="${DATABASE_URL_UNPOOLED:-$DATABASE_URL}" pnpm --filter @jandi/api db:deploy
exec pnpm --filter @jandi/api start
