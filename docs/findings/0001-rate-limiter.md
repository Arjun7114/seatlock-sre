# Finding 0001 — Rate limiter is bypassable and not configurable

**Status:** Fixed (seatlock commit `eac1db4`)
**Discovered:** 2026-10-21, during load-test baselining (Phase 0)
**Component:** seatlock `internal/api` — per-IP rate-limiting middleware

## Summary

While building a load generator to baseline the booking flow, every `confirm`
request returned `429 Too Many Requests`. Investigating surfaced two real
weaknesses in seatlock's rate limiter:

1. **Not configurable.** The limit was hardcoded as `rateLimit(100, time.Minute)`
   in `Routes()`. Every other setting (DB, Redis, JWT, lock strategy) is
   env-driven; this one could only change by recompiling.
2. **Trusts `X-Forwarded-For` unconditionally.** The limiter derives the client
   IP via chi's `RealIP` middleware, which reads `X-Forwarded-For`. With no proxy
   in front, any client can send an arbitrary `X-Forwarded-For` on each request
   and land in a fresh per-IP bucket — defeating the limit. (This is exactly how
   the load test first got past it.) chi's documentation cautions that `RealIP`
   should only be used when those headers can be trusted — i.e. behind a proxy
   you control.

## Impact

- **Abuse / availability:** exposed without a trusted proxy that overwrites
  `X-Forwarded-For`, the per-IP limit gives no real protection — an attacker
  rotates the header to bypass it.
- **Operability:** the limit couldn't be tuned per environment (relaxed for
  internal load testing, tightened in production) without a rebuild.

## Evidence

k6 load runs against the booking flow, 200 concurrent clients:

| Scenario | Result |
|---|---|
| One source IP, limiter on (hardcoded 100/min) | ~100 requests served, rest `429`, 0 bookings |
| Spoofed unique `X-Forwarded-For` per client | limiter bypassed — ran unthrottled, 50 booked |
| After fix, `RATE_LIMIT_PER_MINUTE=0`, no spoofing | 50/50 seats booked, 0 double-bookings, 0 `429` |

## Root cause

`internal/api/api.go` wired the limiter with constants and trusted the header
globally:

```go
r.Use(middleware.RealIP)             // trusts X-Forwarded-For from anyone
r.Use(s.rateLimit(100, time.Minute)) // limit not configurable
```

## Fix

seatlock commit `eac1db4`:

- `RATE_LIMIT_PER_MINUTE` (default 100; `0` disables) makes the limit
  env-configurable.
- `TRUST_PROXY` (default `false`) gates `RealIP`, so `X-Forwarded-For` is trusted
  only when seatlock is explicitly deployed behind a proxy. Otherwise the real
  connection IP is used and the header is ignored — closing the bypass.

```go
if config.TrustProxy() {
    r.Use(middleware.RealIP)
}
if rpm := config.RateLimitPerMinute(); rpm > 0 {
    r.Use(s.rateLimit(rpm, time.Minute))
}
```

## Load-testing note

Because the limiter now ignores `X-Forwarded-For` by default, load tests from a
single host run the server with `RATE_LIMIT_PER_MINUTE=0`. The limiter can be
exercised deliberately later (a dedicated incident scenario) by setting a low
limit and confirming the error-budget burn.