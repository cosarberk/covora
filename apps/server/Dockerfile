# Covora server — multi-stage monorepo build.
# Depo kökünden build edilir:  docker build -f apps/server/Dockerfile .

FROM node:22-alpine AS build
RUN corepack enable
WORKDIR /app
COPY . .
RUN pnpm install --frozen-lockfile
RUN pnpm --filter @covora/server... build

FROM node:22-alpine AS runtime
RUN corepack enable
ENV NODE_ENV=production
WORKDIR /app
COPY --from=build /app ./
EXPOSE 4000
CMD ["node", "apps/server/dist/index.js"]
