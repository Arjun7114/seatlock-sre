# Measured metrics

Real numbers, measured from the harness in this repo — never asserted. Each entry
records how it was measured, so it's reproducible. Updated as phases land.

## Booking flow — load baseline

**Setup:** k6 `loadgen/booking.js`, 200 concurrent clients, one burst iteration
each; seatlock on local Docker (pessimistic locking), Postgres 17 + Redis 7; rate
limiter disabled for load (`RATE_LIMIT_PER_MINUTE=0`). Reproduce: `k6 run loadgen/booking.js`.

| Date | Confirm p95 | Confirm median | Bookings | Double-bookings | Throughput |
|---|---|---|---|---|---|
| 2026-10-24 | 189 ms | 96 ms | 50 / 50 seats | 0 | ~540 req/s |
| 2026-10-24 | 170 ms | 86 ms | 50 / 50 seats | 0 | ~599 req/s |

Both runs: 50 booked + 150 conflicts = 200, zero errors, zero double-bookings.

## Reliability — SLO attainment (Phase 1+)

_Availability and confirm-p95-vs-500ms from OpenTelemetry, added once instrumented._

## Incident metrics (Phase 3)

_TTD / TTR / error-budget burn per incident — added as incidents are run._