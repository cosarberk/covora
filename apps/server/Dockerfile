# Covora — tek image: Fastify server + gömülü studio (React static).
# Depo kökünden build edilir:  docker build -f apps/server/Dockerfile -t cosarberk/covora .

FROM node:22-slim AS build
RUN corepack enable
WORKDIR /app
COPY . .
RUN pnpm install --frozen-lockfile
# Tüm workspace: server + studio (studio dist server tarafından serve edilir)
RUN pnpm build

FROM node:22-slim AS runtime
# Prisma query engine'i için OpenSSL 3; depoyu covora'nın kendisi çekebilmesi
# için git (operatörün ayrıca kurmasına gerek yok, image'a gömülüdür).
RUN corepack enable && apt-get update \
  && apt-get install -y --no-install-recommends openssl ca-certificates git \
  && rm -rf /var/lib/apt/lists/*
ENV NODE_ENV=production
WORKDIR /app
COPY --from=build /app ./
RUN chmod +x apps/server/docker-entrypoint.sh
EXPOSE 4000
# Acilista once DB semasini uygular (prisma db push), sonra server'i baslatir.
# Migration deploy yontemine (helm/Rancher Redeploy/restart) bagli degildir.
CMD ["sh", "apps/server/docker-entrypoint.sh"]
