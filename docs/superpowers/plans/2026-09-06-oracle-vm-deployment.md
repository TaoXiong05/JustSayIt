# Plan 6: Oracle VM Deployment

This is the deployment work Plan 5 renumbered out of the way ("the Oracle
VM deployment work previously called 'Plan 5' is now Plan 6 — it still
hasn't started and is still fully deferred"). The design spec
(`docs/superpowers/specs/2026-09-04-justsayit-design.md`, §10.3a, §11,
§12) already did the research and made the binding decisions — service
naming, network topology, CI/CD shape, ORM/driver choice, secrets
handling. This plan does not re-litigate any of that; it turns those
decisions into an ordered, concrete task list plus a go-live checklist.

**Scope check against current code** (so no task below re-does something
already shipped): the Rust-free Prisma client (`@prisma/adapter-pg`) is
already wired in `src/lib/server/db.ts`; Groq 429 retry/backoff is
already in `src/lib/ai/providers/groq.ts`; the 60s client-side recording
cap is already in `src/lib/voice/recorder.ts` (`DEFAULT_MAX_MS`);
per-user AI quota is already enforced via `src/lib/server/quota.ts`; a
Postgres migration already exists
(`prisma/migrations/20260904164706_init_user`). None of §10.3a's
"prepare for growth" items or §12.5's ORM requirement need a task here —
this plan is purely the missing infrastructure: no `Dockerfile`, no CI
workflow, no compose file, no Caddy snippet, no `.dockerignore`, and
none of the one-time external console actions (Oracle billing, Groq data
controls, Google OAuth publish state) have been done yet.

## Operating constraint for whoever executes this plan

`158.179.25.78` is a **shared** VM already running roster-creator,
portfolio, and AI_LLM_RAG. Per standing user feedback
(`feedback_production_step_confirmation` memory): every individual
production action against this VM — SSH commands, `docker compose up`
against a real container, editing `/opt/edge-proxy`, pushing a commit
that triggers real CI/CD — gets explained and confirmed **one at a
time**, not approved as a whole plan up front. A local `git commit`
inside this repo, or writing a new file, is not a production action and
doesn't need that treatment; anything that touches the VM or its shared
edge proxy does. If a Bash command against the VM gets blocked by the
agent harness's own safety classifier independent of user confirmation,
say so plainly and retry once verbatim before handing the exact command
to the user to run in their own SSH session.

## Global Constraints

1. **Service name is `justsayit-web`, never a generic name**, with an
   explicit `aliases: [justsayit-web]` on the shared `edge` Docker
   network. Roster-creator's `frontend`/`backend` generic aliases are a
   known landmine on this VM; this app must not repeat it.
2. **Never bind host port 80/443.** `/opt/edge-proxy` owns those
   exclusively. The app container only joins the `edge` network and
   listens on its own port 3000 inside that network.
3. **Domain is `justsayit.taoxiong.site`.** Don't touch the root domain
   `taoxiong.site` or any other app's Caddy file.
4. **Image must be `linux/arm64`.** The VM is ARM64 Ampere A1; GitHub's
   hosted runners are amd64. Every build step needs
   `docker/setup-qemu-action` + `platforms: linux/arm64` explicitly, or
   `docker compose pull` on the VM fails with `no matching manifest for
   linux/arm64/v8`.
5. **New deploy key, not reused.** A dedicated ed25519 keypair (secret
   `SSH_PRIVATE_KEY`) is created fresh for this repo. Do not reuse
   another repo's CI SSH key — a key
   leak in one project shouldn't compromise the others sharing this VM.
6. **Backend stays fully stateless.** No in-memory session, no local
   file cache. Session is already JWT-based (`src/lib/server/session.ts`)
   — nothing in this plan may introduce instance-bound state.
7. **`REFRESH_TOKEN_ENCRYPTION_KEY` and `DATABASE_URL` are separate
   secrets, never derivable from one another.** Both compromised
   simultaneously is what it takes to decrypt a user's Drive credentials
   — keeping them independent is the whole point.
8. **Postgres data is a named volume, and gets backed up.** The spec
   explicitly flags that every existing Postgres instance on this VM
   currently has zero backups — this project must not repeat that gap
   (Task 6).
9. **CI never modifies another app's compose stack or Caddy file.** The
   Caddy sync step (Task 5) touches exactly one file,
   `sites-enabled/justsayit.caddy`, validates before reloading, and rolls
   that one file back on failure — it must not risk any other site's
   config.

## Pre-flight scan

| Pair / Task | Produces vs Consumes | Finding |
|---|---|---|
| Task 1 (health route) → Task 2, 3 | `GET /api/health` | Dockerfile `HEALTHCHECK` and compose `healthcheck:` both call it; must exist before either references it. |
| Task 2 (Dockerfile) → Task 4, 5 | Buildable image, `server.js` entrypoint | Compose file (Task 4) names the image this produces; CI workflow (Task 5) builds it. |
| Task 3 (`@prisma/adapter-pg` dependency fix) → Task 2 | Correct `package.json` section | Build stage in Task 2's Dockerfile runs a full install either way (build needs devDependencies too), so this isn't strictly build-blocking, but it's a real miscategorization (production server code imports it) worth fixing before anyone copies this Dockerfile as a template for another app. |
| Task 4 (compose) + Task 6 (backup) | Same Postgres container/volume | Backup task must reference the exact service/volume names Task 4 defines — sequence 4 before 6. |
| Task 5 (CI workflow) | Consumes Tasks 2, 3, 4, 6, 7 all existing | This is the integration point; must land last among the file-producing tasks. |
| Global Constraint 2 vs. Task 4's compose file | No host port binding | Ruling recorded here: Task 4's `justsayit-web` service gets **no** `ports:` block at all, only `networks: [edge, internal]` — confirmed against Constraint 2 in advance so no implementer "fixes" a missing port mapping. |

**Verdict:** scan clean given the ruling above. Task order: 1 → 3 → 2 →
7 → 4 → 6 → 5, then the go-live checklist (not code, done last, once
everything above is merged and reviewed).

---

## Task 1: Health check endpoint

**Files:** new `src/app/api/health/route.ts`

**Why first:** both the Dockerfile's `HEALTHCHECK` (Task 2) and
docker-compose's `healthcheck:` (Task 4) need a real endpoint to poll
before either of those files makes sense to write.

**Steps:**
1. `GET` handler calling the already-existing `dbHealth()` from
   `src/lib/server/db.ts` (it runs `SELECT 1` through the Prisma
   adapter — nothing new to write there, it's just never been wired to
   a route).
2. Return `200 { status: 'ok' }` when `dbHealth()` resolves true, `503 {
   status: 'error' }` when it resolves false. No auth required — this
   is an infra probe, not a user-facing API, and it leaks nothing
   sensitive (no request body, no user data, just a boolean).
3. `export const runtime = 'nodejs'` (same as every other route that
   touches Prisma — the adapter needs the Node runtime, not Edge).

**Test:** mock `dbHealth()` true/false, assert the route returns
200/503 accordingly. No new query logic to test — `dbHealth()` already
has its own coverage if any exists; if not, that's out of scope here
(pre-existing function, not introduced by this plan).

---

## Task 3: Fix `@prisma/adapter-pg` dependency classification

**Files:** `package.json`, `package-lock.json`

**Steps:**
1. Move `@prisma/adapter-pg` from `devDependencies` to `dependencies` —
   it's imported directly by `src/lib/server/db.ts`, which runs in
   production, not just in tests/build tooling. `pg` is already
   correctly in `dependencies`; this is the matching half that was
   missed.
2. `npm install` to update the lockfile, confirm `npm run build` and
   `npm test -- --run` still pass (this is a pure classification move,
   nothing about the resolved dependency tree changes).

**Test:** N/A beyond the existing suite passing — this task has no new
behavior, just correct manifest bookkeeping.

---

## Task 2: Dockerfile, `.dockerignore`, entrypoint

**Files:** new `Dockerfile`, new `.dockerignore`, new
`deploy/entrypoint.sh`

**Depends on:** Task 1 (health route to reference), Task 3 (so the
image being built reflects the corrected manifest).

**Steps:**
1. `.dockerignore`: `node_modules`, `.next`, `.git`, `docs/`,
   `.claude/`, `*.md`, `.env*` (secrets never enter the build context as
   files — they're injected at container runtime via the compose `.env`,
   per Global Constraint 7 and the spec's §12.6; `.env` is already
   gitignored, this just makes sure it's also excluded from the Docker
   build context specifically).
2. Multi-stage `Dockerfile`:
   - **`deps` stage**: `node:24-alpine` (matches `package.json`'s
     `engines.node: ">=24 <25"` exactly — do not drift to `node:20` or
     `node:22`, both are outside the declared engine range), `npm ci`
     (full install, devDependencies included — the build stage needs
     TypeScript/Tailwind/Prisma CLI).
   - **`build` stage**: copy source, run `npx prisma generate` (schema
     lives in `prisma/schema.prisma`, output configured to
     `src/generated/prisma` per the schema's `generator` block — this
     must run before `next build` since server code imports from that
     generated path), then `npm run build` (already forces `--webpack`
     per the existing `package.json` script — do not strip that flag,
     see the detailed comment in `next.config.ts` explaining why
     Serwist's `injectManifest` silently stops regenerating
     `public/sw.js` under Turbopack).
   - **`runner` stage**: `node:24-alpine`, non-root user (`node` user
     already exists in the base image — use it, don't run as root),
     copy from `build`: `.next/standalone`, `.next/static` →
     `.next/static`, `public`, **and manually copy
     `prisma/schema.prisma`, `prisma/migrations/`, and
     `src/generated/prisma`** — this is the specific gotcha the spec
     calls out (§12.5): Next's standalone output tracing does not
     reliably pick up the Prisma schema/migrations/generated client,
     so `prisma migrate deploy` at container startup would fail to find
     them without this explicit copy.
   - `COPY deploy/entrypoint.sh` and `chmod +x` it before dropping to
     the non-root user.
   - `EXPOSE 3000`.
   - `HEALTHCHECK --interval=30s --timeout=5s --start-period=15s
     CMD wget -qO- http://localhost:3000/api/health || exit 1` (or
     `curl` if the alpine image needs an explicit install for it —
     `wget` is present on `node:24-alpine` by default via busybox, no
     extra package needed).
   - `ENTRYPOINT ["/deploy/entrypoint.sh"]`.
3. `deploy/entrypoint.sh`:
   ```sh
   #!/bin/sh
   set -e
   npx prisma migrate deploy
   exec node server.js
   ```
   (`prisma migrate deploy` — not `db push`, not `migrate dev` — is the
   non-interactive, production-safe command the spec names explicitly;
   it applies whatever's in `prisma/migrations/` and no-ops if the DB is
   already current, so restarts/redeploys with no new migration are
   safe to re-run this against.)

**Test:** `docker build -t justsayit:local .` succeeds locally (or via
QEMU emulation if building on a non-arm64 dev machine —
`docker buildx build --platform linux/arm64 -t justsayit:local . --load`
works cross-platform without pushing anywhere); `docker run` it
against a local Postgres and confirm `/api/health` returns 200 and the
app actually serves `/login`. This is the task's real verification —
everything downstream depends on this image working before it's ever
pushed to `ghcr.io`.

---

## Task 7: `deploy/justsayit.caddy`

**Files:** new `deploy/justsayit.caddy`

**Steps:**
1. Exactly the recipe the spec already specifies — nothing to design
   here, just create the file:
   ```
   justsayit.taoxiong.site {
       reverse_proxy justsayit-web:3000
   }
   ```
2. No other content. This file must stand alone — the CI sync step
   (Task 5) copies it verbatim to
   `/opt/edge-proxy/sites-enabled/justsayit.caddy` on the VM; it should
   never be concatenated with or reference any other app's block.

**Test:** `caddy validate` (or `caddy fmt --overwrite` then a visual
diff) against this file in isolation before it's ever synced to the
shared VM — catches a syntax typo locally instead of failing mid-deploy
against the real edge proxy.

---

## Task 4: `docker-compose.yml`

**Files:** new `deploy/docker-compose.yml`

**Depends on:** Task 2 (names the image it builds), Task 7 (Caddy
config assumes this compose file's service name/network match).

**Steps:**
1. Two services, `justsayit-web` and `justsayit-db`:
   ```yaml
   services:
     justsayit-web:
       image: ghcr.io/taoxiong05/justsayit:latest
       restart: unless-stopped
       env_file: .env
       depends_on:
         justsayit-db:
           condition: service_healthy
       networks:
         edge:
           aliases: [justsayit-web]
         internal: {}
       healthcheck:
         test: ["CMD", "wget", "-qO-", "http://localhost:3000/api/health"]
         interval: 30s
         timeout: 5s
         retries: 3
         start_period: 15s

     justsayit-db:
       image: postgres:16-alpine
       restart: unless-stopped
       environment:
         POSTGRES_USER: justsayit
         POSTGRES_PASSWORD: ${POSTGRES_PASSWORD}
         POSTGRES_DB: justsayit
       volumes:
         - justsayit-pg-data:/var/lib/postgresql/data
       networks:
         internal: {}
       healthcheck:
         test: ["CMD-SHELL", "pg_isready -U justsayit"]
         interval: 10s
         timeout: 5s
         retries: 5

   networks:
     edge:
       external: true
     internal: {}

   volumes:
     justsayit-pg-data:
   ```
2. **No `ports:` block on either service** — per Global Constraint 2,
   the edge proxy is the only thing that ever binds a host port for this
   app; Postgres is reachable only from `justsayit-web` over the
   `internal` network, never from the host or from other apps' stacks.
3. `${POSTGRES_PASSWORD}` and the rest of the app's secrets
   (`GROQ_API_KEY`, `GOOGLE_CLIENT_ID/SECRET`, `SESSION_SECRET`,
   `REFRESH_TOKEN_ENCRYPTION_KEY`, `AI_DAILY_QUOTA`) live in a
   `deploy`-owned, `chmod 600` `.env` file alongside this compose file
   on the VM (`/home/deploy/justsayit/.env`) — never committed. `DATABASE_URL`
   in that `.env` points at the internal service name:
   `postgresql://justsayit:<POSTGRES_PASSWORD>@justsayit-db:5432/justsayit`.
4. This file is a template checked into the repo — the VM's actual copy
   lives at `/home/deploy/justsayit/docker-compose.yml`, owned by `deploy`.
   First-time setup copies it there manually (or via the first CI run);
   CI only ever runs `docker compose pull && up -d` against the
   already-present file, it does not overwrite the compose file itself
   on every deploy (keeps `.env`/volume state stable across image
   updates).

   **Revised since this sketch was written** — see the real file
   (`deploy/docker-compose.yml`) for the current state, but the deltas
   worth calling out: the healthcheck uses `http://127.0.0.1:3000/...`,
   not `http://localhost:3000/...` (alpine's `wget` resolves `localhost`
   to `::1` first and the app only binds the IPv4 wildcard — found by
   actually running the built image, not by reading the Dockerfile);
   `POSTGRES_USER`/`POSTGRES_DB` are `${POSTGRES_USER}`/`${POSTGRES_DB}`
   substitutions, not the hardcoded `justsayit` literal shown above (the
   user configured these as their own GitHub secrets rather than
   accepting a hardcoded value); and the compose file syncs to
   `/home/deploy/justsayit/`, not `/opt/justsayit/`, on every CI run —
   there is no separate manual first-time-setup step (see the revised
   go-live checklist item 6).

**Test:** `docker compose config` validates the file locally (no VM
needed for this check — pure YAML/interpolation validation). Full
`docker compose up -d` against this file (with a placeholder `.env`)
locally, confirm both services report healthy and `/api/health` returns
200 through the container's own port before this ever gets copied to
the shared VM.

---

## Task 6: Postgres backup (`pg_dump` cron)

**Files:** new `deploy/backup.sh`, addition to Task 4's
`deploy/docker-compose.yml` notes (documented, not necessarily a new
service — see step 2)

**Depends on:** Task 4 (needs the exact service/volume names it
defines).

**Why this exists:** the spec explicitly flags that every existing
Postgres instance on this VM currently has no backup — Global Constraint
8 says this project must not repeat that gap.

**Steps:**
1. `deploy/backup.sh`:
   ```sh
   #!/bin/sh
   set -e
   STAMP=$(date +%Y%m%d-%H%M%S)
   docker exec justsayit-db pg_dump -U justsayit justsayit \
     | gzip > /home/deploy/justsayit/backups/justsayit-$STAMP.sql.gz
   # keep the last 14 daily dumps, prune anything older
   find /home/deploy/justsayit/backups -name 'justsayit-*.sql.gz' -mtime +14 -delete
   ```
2. Runs via a `deploy`-owned crontab entry on the VM host (not a
   long-running sidecar container — a plain daily cron calling
   `docker exec` is simplest and matches "no new instance-bound state"
   in spirit, since it's just periodically shelling into the already-
   running db container rather than adding another always-on process):
   `0 3 * * * /home/deploy/justsayit/backup.sh >> /home/deploy/justsayit/backups/backup.log 2>&1`.
3. `/home/deploy/justsayit/backups/` created with `deploy` ownership during
   first-time VM setup (go-live checklist), not by CI on every deploy.

**Test:** run `backup.sh` manually against a local `docker compose up`
Postgres, confirm a valid gzip'd SQL dump is produced and `gunzip -c
... | psql` against a scratch database round-trips the schema/data
correctly.

---

## Task 5: GitHub Actions CI/CD workflow

**Files:** new `.github/workflows/deploy.yml`

**Depends on:** Tasks 2, 3, 4, 6, 7 all merged — this workflow builds
and ships what they define.

**Steps:**
1. Trigger: `on: push: branches: [main]` (mirrors the "existing three
   repos" pattern the spec says to follow) — paths-filter is optional
   but reasonable (skip a rebuild+redeploy for docs-only commits):
   `paths-ignore: ['docs/**', '**.md']`.
2. Job `build-and-push`:
   - `actions/checkout@v4`
   - `docker/setup-qemu-action@v3` (Global Constraint 4 — mandatory, not
     optional, or the arm64 build silently produces an amd64-only
     manifest that fails to pull on the VM)
   - `docker/setup-buildx-action@v3`
   - `docker/login-action@v3` against `ghcr.io` using
     `${{ github.actor }}` / `${{ secrets.GITHUB_TOKEN }}` (the built-in
     token is sufficient for pushing to this repo's own GHCR namespace,
     no separate PAT needed for the push side)
   - `docker/build-push-action@v6` with `platforms: linux/arm64`,
     `push: true`, tags `ghcr.io/taoxiong05/justsayit:latest` and
     `ghcr.io/taoxiong05/justsayit:${{ github.sha }}` (the sha tag gives
     a rollback target — `docker compose` on the VM can be pointed at a
     specific sha if `:latest` ever ships something broken).
3. Job `deploy` (`needs: build-and-push`):
   - SSH via `appleboy/ssh-action@v1` (or equivalent), `host:
     158.179.25.78`, `username: deploy`, `key: ${{
     secrets.SSH_PRIVATE_KEY }}` (Global Constraint 5 — this secret
     is new and scoped to this repo only).
   - **Revised — self-bootstrapping, no manual VM setup** (the user
     explicitly asked to remove every manual VM step so the first
     deploy is also the first CI run): an `appleboy/scp-action` step
     first stages `deploy/docker-compose.yml` and `deploy/backup.sh`
     into `/tmp` on the VM, then the SSH step's remote script does, in
     order, every time: `mkdir -p /home/deploy/justsayit/backups`; copy both
     staged files into `/home/deploy/justsayit/`; write `/home/deploy/justsayit/.env`
     (mode 600) from a heredoc populated by the job's own env (each
     value sourced from a GitHub secret via `appleboy/ssh-action`'s
     `envs:` passthrough — see step 5 below for the full secret list);
     idempotently append the backup cron line if it isn't already in
     `deploy`'s crontab; assert the `edge` network exists (fail loudly,
     don't create one); then `cd /home/deploy/justsayit && docker compose pull
     && docker compose up -d`. Overwriting `.env` on every run is
     deliberate — GitHub secrets are the single source of truth, not
     whatever's already on the VM.
4. Job `sync-caddy` (`needs: deploy`, or folded into the same SSH step
   sequence — implementer's call, document the choice):
   - SCP `deploy/justsayit.caddy` to
     `/opt/edge-proxy/sites-enabled/justsayit.caddy` on the VM.
   - SSH: `docker exec edge-proxy caddy validate --config
     /etc/caddy/Caddyfile` (or whatever the existing edge-proxy stack's
     validate invocation is — confirm the exact command against how the
     other three apps' CI does this, don't guess a different one).
   - **On validate success**: `git -C /opt/edge-proxy add
     sites-enabled/justsayit.caddy && git -C /opt/edge-proxy commit -m
     "Add justsayit site" ` (conditional — only if there's a diff, per
     the spec's "条件 commit") `&& docker exec edge-proxy caddy reload`.
   - **On validate failure**: `git -C /opt/edge-proxy checkout --
     sites-enabled/justsayit.caddy` (or `rm` if the file didn't exist
     before) to roll back the one file, and fail the job loudly —
     Global Constraint 9, this must never leave the shared edge proxy in
     a broken state for the other three apps.
5. Repo secrets to create (GitHub → Settings → Secrets and variables →
   Actions) — **revised: all of the app's runtime secrets are now
   GitHub secrets**, not a hand-created VM `.env` (see the revision
   note in step 3 above and the go-live checklist's revised item 6):
   `SSH_PRIVATE_KEY`, `GROQ_API_KEY`, `CEREBRAS_API_KEY`,
   `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `SESSION_SECRET`,
   `REFRESH_TOKEN_ENCRYPTION_KEY`, `POSTGRES_PASSWORD`, and optionally
   `AI_DAILY_QUOTA` (defaults to 60 if absent). `GOOGLE_REDIRECT_URI` is
   hardcoded in the workflow instead of a secret (it's a public callback
   URL, not sensitive), and `ALLOW_UNAUTHENTICATED_API` is simply never
   written into `.env` at all (equivalent to unset/false).

**Test:** this is inherently only testable end-to-end against the real
VM (Global Constraint / operating-constraint territory — see the note
at the top of this plan). Before the first real run: validate the
workflow YAML with `actionlint` or GitHub's own syntax check on a draft
PR; dry-run the SSH/SCP steps manually against the VM by hand first
(exact commands, one at a time, confirmed) so the workflow's first real
execution isn't also the first time those exact commands have ever been
run.

---

## Go-live checklist (not code — one-time external actions)

These are the "didn't write any code but the app breaks or never
actually works without them" items the spec calls out. Each is a
distinct real-world action, not a file in this repo — do these one at a
time, confirmed, per the operating constraint at the top of this plan.

1. **Upgrade the Oracle Cloud account to Pay As You Go.** Always Free A1
   instances can be reclaimed after 7 days of consistently low
   CPU/network/memory utilization — this app's usage pattern almost
   certainly qualifies. Upgrading keeps Always Free resources free (only
   overage is billed) and removes the reclaim policy. Zero cost, one
   console action, and the cost of skipping it is the VM disappearing
   without warning someday.
2. **Enable Zero Data Retention in the Groq console** (Data Controls
   settings) — without this, Groq may retain inference inputs/outputs
   for up to 30 days by default; ZDR is available to all customers at no
   extra cost and is what the app's privacy claims to users depend on
   being true.
3. **Publish the Google OAuth consent app to "In production"** (Google
   Cloud Console → APIs & Services → OAuth consent screen). This is a
   button, not a review process, for this app's non-sensitive scopes
   (`openid`, `email`, `profile`, `drive.appdata`) — but skipping it
   leaves the app stuck in Testing state, which caps users at 100 and
   expires every user's authorization after 7 days (a weekly forced
   logout for everyone).
4. **Register the production redirect URI** in the same OAuth client:
   `https://justsayit.taoxiong.site/api/auth/callback`, alongside (not
   replacing) the existing `http://localhost:3000/api/auth/callback`
   dev entry.
5. **DNS**: create an A/AAAA record for `justsayit.taoxiong.site`
   pointing at `158.179.25.78`, matching how the other three apps'
   subdomains are already set up on `taoxiong.site`.
6. **Done — no manual VM file setup, self-bootstrapping CI.** Per the
   user's explicit request, the `deploy` job in
   `.github/workflows/deploy.yml` creates `/home/deploy/justsayit/backups`
   (not `/opt` — this project deploys under the `deploy` user's home
   directory), syncs `docker-compose.yml` and `backup.sh` from the repo,
   writes `.env` fresh from GitHub secrets, and sets up the backup cron
   line idempotently, all on every run. **The deploy key's public half
   is already on the VM** (user confirmed) — the one step CI genuinely
   can't bootstrap itself is done. The user configured the following in
   the GitHub repo (Settings → Secrets and variables → Actions),
   naming them differently than this plan originally sketched — the
   workflow was written to match what's actually there rather than the
   other way around:
   - Secrets: `SSH_HOST`, `SSH_USER`, `SSH_PRIVATE_KEY` (the connection
     details + the ed25519 keypair from Global Constraint 5),
     `GROQ_API_KEY`, `CEREBRAS_API_KEY`, `GOOGLE_CLIENT_ID`,
     `GOOGLE_CLIENT_SECRET`, `SESSION_SECRET`,
     `REFRESH_TOKEN_ENCRYPTION_KEY`, `POSTGRES_USER`,
     `POSTGRES_PASSWORD`, `POSTGRES_DB` — note `POSTGRES_USER`/
     `POSTGRES_DB` are now configurable secrets rather than the
     hardcoded `justsayit` literal this plan originally assumed; the
     compose file and `backup.sh` were both updated to read them
     instead (the healthcheck's `pg_isready -U ${POSTGRES_USER}`
     included).
   - Repository **variable** (not secret — not sensitive):
     `AI_DAILY_QUOTA` (set to 50).
   - `GOOGLE_REDIRECT_URI` and `ALLOW_UNAUTHENTICATED_API` are still not
     secrets at all under this design — the workflow hardcodes the
     production redirect URL directly (it's not sensitive, it's a
     public callback URL), and simply never writes
     `ALLOW_UNAUTHENTICATED_API` into `.env` at all, which is
     equivalent to it being unset/false (the escape-hatch flag per
     `.env.example` must never be `true` in production).
   - The `edge` Docker network is still never created by anything in
     this repo — the workflow checks for it and fails loudly if it's
     missing (it should already exist, owned by the edge-proxy stack).
7. **First deploy is the first real CI run** — push to `main` (or
   manually trigger the workflow) and watch it end to end: build, push,
   bootstrap `/home/deploy/justsayit`, up, Caddy sync. Confirm
   `https://justsayit.taoxiong.site` actually loads over HTTPS (the
   edge proxy handles TLS; nothing in this app's own config touches
   certificates) and that a real Google login round-trips correctly
   against the production redirect URI. Not yet run as of this note.

---

## Final whole-branch review

Same process as prior plans: after all tasks land (on a new branch —
this repo's convention is one branch per plan, matching
`plan5-ui-design-system`), dispatch one whole-branch review over the
full diff range, one fix wave if needed, one scoped re-review, then
`finishing-a-development-branch`. The go-live checklist above happens
after that review, not before — no reason to touch the shared VM with
code that hasn't been reviewed yet.
