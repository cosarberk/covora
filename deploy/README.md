# Covora kurulumu (Kubernetes / Helm)

Tek komutla tam kurulum: **Postgres + Ollama (modeller otomatik iner) + DB şeması
+ server + studio**. Elle adım yok.

## Önkoşul: imajları build et ve registry'ye push et

Server ve studio imajları bir registry'de olmalı (k8s oradan çeker). Depo
kökünden:

```bash
REG=registry.example.com/covora   # kendi registry ön ekin
TAG=latest

docker build -f apps/server/Dockerfile -t $REG/server:$TAG .
docker build -f apps/studio/Dockerfile -t $REG/studio:$TAG .
docker push $REG/server:$TAG
docker push $REG/studio:$TAG
```

## Kur (tek komut)

```bash
helm install covora deploy/helm/covora \
  --namespace covora --create-namespace \
  --set image.registry=$REG \
  --set image.tag=$TAG \
  --set storageClass=<cluster-storage-class>   # default varsa atlanabilir
```

Bu tek komut şunları yapar:
1. Postgres'i kalıcı diskle ayağa kaldırır.
2. Ollama'yı kurar; hazır olunca `qwen3-vl:8b` ve `qwen3-coder:7b` modellerini
   **otomatik indirir** (idempotent; model PVC'de kalıcı).
3. Şemayı DB'ye uygular (post-install Job, `prisma db push`).
4. server ve studio'yu ayağa kaldırır. Studio API'yi same-origin nginx proxy
   ile server'a yönlendirir (build-time URL gerekmez).

## Doğrula

```bash
kubectl -n covora get pods
kubectl -n covora logs job/covora-migrate     # şema uygulandı mı
```

## Eriş

```bash
kubectl -n covora port-forward svc/studio 8080:80
# tarayıcı: http://localhost:8080
```

Kalıcı erişim için studio (ve gerekiyorsa server) önüne bir Ingress eklenebilir.

## Notlar

- `qwen3-coder:7b` Ollama registry'de yoksa `values.yaml`'de
  `ollama.models.code`'u `qwen2.5-coder:7b` yapın.
- CPU inference yavaştır (görüntü başına ~1-3 dk); review asenkron olduğu için
  sorun değildir. GPU eklenirse Ollama şablonuna `nvidia.com/gpu` kaynağı
  eklenerek hızlanır.
