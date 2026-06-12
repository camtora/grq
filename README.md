# GRQ

*"Get rich quick, slowly, with receipts."*

Autonomous Claude-powered investing fund for Cam & Graham at
[grq.camerontora.ca](https://grq.camerontora.ca) (SSO-protected, port 3012).

**Read [PROJECT_PLAN.md](PROJECT_PLAN.md) first** — architecture, guardrails, phases,
decisions log, and build runbook all live there.

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
