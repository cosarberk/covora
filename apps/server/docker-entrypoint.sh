#!/bin/sh
# Covora server acilis betigi.
#
# Server baslamadan ONCE DB semasini uygular (prisma db push). Boylece yeni
# tablo/kolonlar her pod kalkisinda (helm upgrade, Rancher "Redeploy", crash
# restart) deploy yontemine bakmaksizin DB'ye yansir; sema-kod uyumsuzlugundan
# dolayi 500 alinmaz. `db push` idempotenttir: sema guncelse hizli no-op.
#
# Postgres henuz hazir degilse birkac kez yeniden dener; surekli basarisizsa
# pod crash eder ve k8s yeniden baslatir.
set -e

echo "[entrypoint] DB semasi uygulaniyor (prisma db push)..."
n=0
until pnpm --filter @covora/db db:push; do
  n=$((n + 1))
  if [ "$n" -ge 15 ]; then
    echo "[entrypoint] db push $n denemede basarisiz oldu, cikiliyor." >&2
    exit 1
  fi
  echo "[entrypoint] DB hazir degil; 3sn sonra tekrar ($n/15)..."
  sleep 3
done

echo "[entrypoint] Sema guncel. Server baslatiliyor..."
exec node apps/server/dist/index.js
