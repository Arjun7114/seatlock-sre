seatlock-sre

Reliability engineering around the seatlock concurrent reservation service.

This repo does not re-implement seatlock. It treats seatlock as the production service under test, and builds the reliability layer around it: service-level objectives, OpenTelemetry instrumentation, burn-rate alerting, deliberate fault injection with blameless postmortems, toil automation, and AI-assisted operations.

The goal is to run seatlock the way an on-call SRE would — define what "healthy" means up front, measure it continuously, break it on purpose, and prove the system (and the process around it) recovers. Every number in this repo is measured from the harness in it, not asserted.

Status: 🚧 in progress — Phase 0 (scaffolding). Nothing below is "done" yet; the roadmap is the contract, and sections fill in as each phase lands.

Why this project

seatlock is a focused concurrency project — it proves no double-booking under load. That makes it a genuinely good system under test: it has real contention, a Postgres connection pool, and a Redis cache, so it fails in interesting, diagnosable ways. This repo is about operating that service reliably, which is a different discipline from building it — and the reason the two are kept in separate repos.

Stack
Service under test: seatlock — Go · PostgreSQL · Redis
Orchestration: Kubernetes (kind / minikube, local-first; optional EKS path)
Instrumentation: OpenTelemetry (metrics, traces, logs)
Observability backend/UI: SigNoz (OTel-native, self-hosted)
Alerting: multi-window burn-rate alerts on the error budget
Fault injection: scripted chaos harness (optionally Chaos Mesh / LitmusChaos)
AI-ops: log-anomaly detection (Drain3 + Isolation Forest) · LLM-call observability (Langfuse)
CI: GitHub Actions
Reliability targets

Defined in docs/SLO.md (Phase 0). The short version: availability, booking-endpoint p95 latency, and a hard zero-double-bookings correctness objective, with an error budget derived from the availability SLO. Everything else — alerts, incident severity, what counts as a regression — is derived from these.

Repository layout
seatlock-sre/
├── README.md
├── docs/
│   ├── SLO.md               # service-level objectives + error budget   (Phase 0)
│   ├── METRICS.md           # measured TTD / TTR / p95 / budget burn    (Phase 5)
│   └── runbooks/            # one runbook per alert                      (Phase 2)
├── deploy/
│   ├── compose/             # local seatlock workload (Phase 0)
│   └── k8s/                 # kind/minikube manifests (Phase 1)
├── observability/           # OTel config + SigNoz dashboards (Phase 1)
├── alerts/                  # burn-rate alert rules (Phase 2)
├── incidents/               # repro scripts + blameless postmortems (Phase 3)
└── automation/              # auto-remediation + AI-ops (Phase 4)
Architecture

Diagram added in Phase 5. For now, in words: a load generator drives seatlock running on local Kubernetes; the Go service is instrumented with OpenTelemetry and exports metrics, traces, and logs to a self-hosted SigNoz backend; burn-rate alert rules evaluate the error budget and notify a Slack/email channel; a fault-injection harness induces failures that are diagnosed and written up as postmortems; an automation layer handles one failure class and pipes logs through anomaly detection.

Roadmap
 Phase 0 — Scaffold + SLO spine. Repo, local seatlock workload, docs/SLO.md.
 Phase 1 — Observability. Deploy to local k8s; OpenTelemetry instrumentation; SigNoz dashboard with an SLO / error-budget panel.
 Phase 2 — Alerting + runbooks. Multi-window burn-rate alerts routed to Slack/email; a runbook per alert.
 Phase 3 — Incident engineering + RCA. Fault-injection harness; three incidents run end-to-end (Postgres pool exhaustion, pod kill, Redis outage) each with a blameless postmortem.
 Phase 4 — Toil automation + AI-ops. Auto-remediation for one failure class; log-anomaly detection; a real LLM call in the flow, observed with Langfuse.
 Phase 5 — Polish. Architecture diagram, measured METRICS.md, GitHub Actions CI.
Honesty guardrails
Measure, don't claim. Every figure (TTD, TTR, p95, remediation time, budget burn) comes from the harness in this repo. A measured miss with a fix is reported as a miss with a fix.
Verify APIs against live docs. Tool and config syntax (OpenTelemetry SDK, SigNoz, Langfuse, chaos tooling) is verified against current documentation before wiring, not reproduced from memory.