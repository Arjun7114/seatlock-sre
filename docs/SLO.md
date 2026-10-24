# Service Level Objectives — seatlock

This document defines what "healthy" means for the seatlock reservation service.
Every alert, incident severity, and "is this a regression?" decision in this repo
derives from the objectives below. Targets are set here; actual performance is
measured against them (see `METRICS.md`), never asserted.

## Critical user journey

The journey that matters is **booking a seat**: an authenticated user places a
hold (`POST /v1/seats/{id}/hold`) and confirms it
(`POST /v1/seats/{id}/confirm`), turning the hold into a booking. The `confirm`
step is the one that must stay correct and fast under contention, so it is the
primary target of these SLOs.

## Service Level Indicators (SLIs)

| SLI | Definition |
|---|---|
| **Availability** | Proportion of valid booking-flow requests answered without a server error: `1 − (5xx + timeouts) ÷ total valid requests`. A `409/422` conflict (seat already taken) is a **correct** answer and counts as available, not a failure. |
| **Latency** | 95th-percentile server-side response time of the `confirm` endpoint. |
| **Correctness** | Number of double-bookings: distinct confirmed bookings for the same seat. Backed by a `UNIQUE` constraint and verified against the database under concurrent load. |

## Service Level Objectives (SLOs)

| Objective | Target | Window |
|---|---|---|
| **Availability** | ≥ 99.5% of valid requests succeed | rolling 30 days |
| **Latency** | `confirm` p95 < 500 ms | rolling 30 days |
| **Correctness** | **exactly 0** double-bookings | always (hard invariant) |

Rationale:
- **Latency < 500 ms** is set against the measured baseline: under 200 concurrent
  clients the confirm p95 is ~170–190 ms (pessimistic locking, local Docker), so
  500 ms leaves headroom for production variance while staying tight enough that
  database contention or pool exhaustion will visibly burn it — exactly what the
  Phase 3 incidents exercise.
- **Availability 99.5%** is a deliberately modest starting objective for a
  single-node local deployment; it tightens as the system hardens.
- **Correctness is not a budget.** Any double-booking is a critical incident, not
  a tolerated error — the whole purpose of seatlock is that this never happens.

## Error budget

The availability SLO implies an error budget — the failure tolerated before the
objective is breached:

- **99.5% over 30 days** → a **0.5% error budget**.
- In time terms: ~**3 h 36 m** of full unavailability per 30 days.
- In request terms: up to **5 in every 1,000** valid requests may fail.

Burn-rate alerting (Phase 2) watches how fast this budget is consumed: a fast
burn (budget vanishing in hours) pages immediately; a slow burn (eroding over
days) is a warning. The latency objective has its own budget: no more than 5% of
`confirm` requests may exceed 500 ms.

## Measurement

- SLIs are computed from OpenTelemetry metrics on the `confirm` endpoint
  (Phase 1), surfaced in SigNoz with an error-budget panel.
- Correctness is checked directly against the database (no seat with more than one
  confirmed booking) during every load and fault-injection run.
- The window is a rolling 30 days once the service runs continuously; during
  development, each load/fault run is evaluated as a point-in-time sample.

## Baseline (observed 2026-10-24)

First clean baseline — 200 concurrent clients, pessimistic locking, local Docker:

| SLI | Baseline | SLO | Headroom |
|---|---|---|---|
| Latency (confirm p95) | ~189 ms | < 500 ms | ~2.6× |
| Correctness | 0 double-bookings (50/50 seats) | 0 | meets |
| Availability | not yet measured over a window | ≥ 99.5% | — |

Single-run local figures from the k6 generator in `loadgen/`. Real,
continuously measured numbers land in `METRICS.md` in Phase 5.