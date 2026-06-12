# GRQ

*"Get rich quick, slowly, with receipts."*

Autonomous Claude-powered investing fund for Cam & Graham at
[grq.camerontora.ca](https://grq.camerontora.ca) (SSO-protected, port 3012).

**Read [PROJECT_PLAN.md](PROJECT_PLAN.md) first** — architecture, guardrails, phases,
decisions log, and build runbook all live there. **Status: Phases 0–1 shipped 2026-06-11**
(site + dashboard + SimBroker paper engine live); next is Phase 2 (the agent).

## Documentation

| Doc | What |
|---|---|
| [PROJECT_PLAN.md](PROJECT_PLAN.md) | The plan: guardrails §6, phases §9, decisions §10, runbook §12, backlog §13 |
| [CLAUDE.md](CLAUDE.md) | Operating reference: rules, gotchas, commands |
| [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) | System design, broker seam, data model |
| [docs/DECISIONS.md](docs/DECISIONS.md) | Decision record (D1–D15) with rationale |
| [docs/PHASES.md](docs/PHASES.md) | Phase-by-phase detail, soak gate, exit criteria |
| [docs/SIM-ENGINE.md](docs/SIM-ENGINE.md) | Paper engine spec: gate order, fills, commissions, ACB |
| [docs/OPERATIONS.md](docs/OPERATIONS.md) | Runbook: deploy, db, secrets, troubleshooting |
| [docs/AGENT-SPEC.md](docs/AGENT-SPEC.md) | Phase 2 blueprint for the trading agent |
| [docs/DATA-SOURCES.md](docs/DATA-SOURCES.md) | 10-tier data taxonomy + source scoring system |
| [docs/IBKR-SETUP.md](docs/IBKR-SETUP.md) | Forwardable IBKR account-opening guide |
| [docs/OWNERSHIP.md](docs/OWNERSHIP.md) | Account ownership options (single/joint/dual) + tax notes |

## Layout

| Path | What |
|---|---|
| `web/` | Next.js dashboard (UI + API routes), Docker → host port 3012 |
| `agent/` | Trading agent worker (Phase 2) |
| `docker-compose.yaml` | web + postgres (`db` is compose-internal; host 5432 belongs to haymaker) |
| `.env` | Secrets — chmod 600, never commit |

## Run

```bash
docker compose up -d --build
curl localhost:3012/api/health
```

Access control: nginx + oauth2-proxy handle Google SSO upstream; the app additionally
enforces its own member list (`web/lib/users.ts` ∪ `GRQ_ALLOWED_EMAILS`) via the
`X-Forwarded-Email` header. Everyone else gets a 403.
