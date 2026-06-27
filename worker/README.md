# Migration workers (BullMQ on Valkey)

Background jobs that migrate the Neon prod data + images onto the Hetzner stack.
Pattern mirrors boahaus-backend (BullMQ + ioredis) and clickup-argo's concurrency
safety (Valkey `SET NX EX` lock, `FOR UPDATE SKIP LOCKED`, deterministic jobIds).

## What it does

1. **migrate-tables** — copies every `public` table from Neon → Hetzner `app` DB,
   idempotently (`INSERT … ON CONFLICT` upsert / ignore per `tables.ts`). Keyset-
   batched (handles the 78k `missing_persons`). **Re-runnable** = pull new syncs.
2. **migrate-photos** — one job per row id. Moves the photo to R2 and rewrites the
   `photo` column to the CDN URL, then stamps `photo_migrated_at` (resumable):
   - base64-in-DB photos (`data:image/...`) → decode → R2.
   - external URLs (`photo_external_url`, mostly AWS S3) → fetch → R2 (rate-limited).

## Pieces

| File | What |
|---|---|
| `redis.ts` | ioredis from `VALKEY_URL` + distributed lock (acquire/release/heartbeat) |
| `db.ts` | pg Pools: target (Hetzner `DATABASE_URL`) + source (`NEON_DATABASE_URL`) |
| `r2.ts` | S3-compatible R2 upload (`@aws-sdk/client-s3`) |
| `tables.ts` | per-table PK + conflict policy (update vs ignore) |
| `jobs/migrateTable.ts` | keyset-batched upsert copy |
| `jobs/migratePhoto.ts` | base64/external → R2, `FOR UPDATE SKIP LOCKED` |
| `queues.ts` | BullMQ queues + worker factory + producers |
| `index.ts` | worker entrypoint (graceful SIGTERM) |
| `enqueue.ts` | producer: acquires the Valkey lock, enqueues tables then photos |

## Run

Deployed as a separate **worker image** (`Dockerfile` `worker` target →
`ghcr.io/<repo>-worker`) and a `migrate-worker` Deployment. To run the migration:

```bash
# workers are already running (the Deployment). Kick off the producer Job:
kubectl -n mapa delete job migrate-enqueue --ignore-not-found
kubectl -n mapa apply -f infra/k8s/migrate-enqueue-job.yaml
kubectl -n mapa logs -f job/migrate-enqueue
# watch progress
kubectl -n mapa logs -f deploy/migrate-worker
```

Re-run the enqueue Job anytime to pull new Neon syncs / pick up pending photos —
deterministic jobIds + the `photo_migrated_at` stamp make it safe & resumable.

## Env (from `app-env` + `migrate-env` secrets)

`DATABASE_URL` (target), `VALKEY_URL`, `NEON_DATABASE_URL` (source),
`R2_ENDPOINT`, `R2_STATIC_BUCKET`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`,
`R2_PUBLIC_BASE`. Tunables: `PHOTOS_CONCURRENCY`, `TABLES_CONCURRENCY`,
`PHOTO_RATE_MAX`, `PHOTO_RATE_DURATION_MS`.

## Local

```bash
npm run worker          # run workers against your .env
npm run migrate:enqueue # run the producer
```
