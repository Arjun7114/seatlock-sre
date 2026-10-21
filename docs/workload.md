# The workload under test

`seatlock-sre` does not contain the service it operates. It operates
[seatlock](https://github.com/Arjun7114/seatlock) — a concurrent seat-reservation
service in Go, backed by PostgreSQL and Redis — as the system under test (SUT).

This document is the reproducible way to bring that workload up locally and
confirm it serves bookings. Everything later in the repo (instrumentation,
alerts, fault injection) is layered on top of this baseline.

## Assumptions

- `seatlock` is cloned next to this repo, e.g. `../seatlock`.
- Docker Desktop, Go, and the `migrate` CLI (golang-migrate) are installed.
  - Verify the current golang-migrate install command against its docs; one
    option is `go install -tags 'postgres' github.com/golang-migrate/migrate/v4/cmd/migrate@latest`.
- The HTTP server listens on `:8080`. _(Inferred from seatlock's README example
  requests — confirm against `internal/config` and update here if different.)_

## 1. Start dependencies

From this repo (`seatlock-sre`):

```bash
docker compose -f deploy/compose/docker-compose.yml up -d
```

This starts `seatlock-db` (Postgres 17) and `seatlock-redis` (Redis 7) with
healthchecks. Wait until both report healthy:

```bash
docker compose -f deploy/compose/docker-compose.yml ps
```

## 2. Apply migrations and seed

Run from the **seatlock** checkout (it holds `migrations/` and `scripts/`).

Migrations (golang-migrate — same on every OS):

```bash
migrate -path migrations -database "postgres://seatlock:seatlock@localhost:5432/seatlock?sslmode=disable" up
```

Seed (1 event, 50 seats). The seed is piped into the `seatlock-db` container —
the command differs by shell because PowerShell has no `<` redirection:

```bash
# Linux / macOS / Windows cmd.exe
docker exec -i seatlock-db psql -U seatlock -d seatlock < scripts/seed.sql
```

```powershell
# Windows PowerShell
Get-Content scripts\seed.sql | docker exec -i seatlock-db psql -U seatlock -d seatlock
```

## 3. Run the server

From the **seatlock** checkout:

```bash
go run ./cmd/seatlock
# optimistic locking instead of the default pessimistic:
#   LOCK_STRATEGY=optimistic go run ./cmd/seatlock   (set the env var per your shell)
```

The server comes up on `http://localhost:8080`.

## 4. Confirm it serves bookings

seatlock ships a load generator (`cmd/loadtest`) that issues real concurrent
booking requests — the most reliable "it works" check, and it doubles as the
baseline traffic source for the SLO work. From the **seatlock** checkout, with
the server running:

```bash
go run ./cmd/loadtest
```

A healthy run books seats with zero double-bookings. Record the baseline it
reports — request rate, p95 latency, error count — because those numbers seed
the SLO targets in `docs/SLO.md` (next step). Measure them; don't assume them.

## Still needed before Phase 1

Two facts, read from seatlock's source rather than guessed, before the service
is containerized and deployed to Kubernetes:

1. The exact env-var names `internal/config` reads for the database DSN and the
   Redis address (localhost works for host `go run`, but not inside a pod).
2. The exact booking route(s) and request payload, for targeted smoke checks and
   the fault-injection load in Phase 3.