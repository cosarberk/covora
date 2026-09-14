# Covora studio — Vite build + nginx statik sunum.
# Depo kökünden build edilir:  docker build -f apps/studio/Dockerfile .

FROM node:22-alpine AS build
RUN corepack enable
WORKDIR /app
COPY . .
RUN pnpm install --frozen-lockfile
RUN pnpm --filter @covora/studio... build

FROM nginx:alpine AS runtime
COPY apps/studio/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/apps/studio/dist /usr/share/nginx/html
EXPOSE 80
