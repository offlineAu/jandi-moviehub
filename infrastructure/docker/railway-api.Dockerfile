# syntax=docker/dockerfile:1.7
# Retain the Prisma CLI for Railway's pre-deploy migration command.
FROM node:24-bookworm-slim
ENV PNPM_HOME=/pnpm PATH=/pnpm:$PATH CI=true NODE_ENV=production
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates tini && rm -rf /var/lib/apt/lists/*
RUN corepack enable
WORKDIR /app
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
COPY packages/shared/package.json packages/shared/
COPY packages/typescript-config/package.json packages/typescript-config/
COPY packages/eslint-config/package.json packages/eslint-config/
RUN --mount=type=cache,id=pnpm,target=/pnpm/store pnpm install --frozen-lockfile --prod=false
COPY packages packages
COPY apps/api apps/api
RUN pnpm --filter @jandi/shared build && pnpm --filter @jandi/api build
WORKDIR /app/apps/api
EXPOSE 4000
ENTRYPOINT ["/usr/bin/tini", "--"]
CMD ["node", "dist/main.js"]
