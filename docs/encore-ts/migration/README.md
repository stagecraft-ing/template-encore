# Migrating to Encore.ts

Three strategies cover every realistic starting point. Pick one based on
what you have today and how much disruption you can absorb.

## Decision matrix

| If you have… | And you can… | Use |
|---|---|---|
| No existing backend (greenfield) | — | [Strategy 1 — Greenfield Encore.ts](./strategy-1-greenfield-encore.md) |
| A live Express.js app you can't pause | Ship in production while migrating routes one at a time | [Strategy 2 — Forklift (incremental)](./strategy-2-forklift-incremental.md) |
| A small-to-medium Express.js app | Freeze features for a cutover window | [Strategy 3 — Full rewrite](./strategy-3-full-rewrite.md) |

A rough rule: pick **Strategy 2** if downtime is unacceptable, **Strategy 3**
if the codebase fits in a single contributor's head, and **Strategy 1**
when you're not migrating anything.

## What Encore.ts is

Encore is an open-source infrastructure-orchestration toolchain for
TypeScript and Go backends. The framework, parser, compiler,
runtime, and CLI are all on GitHub under MPL-2.0 at
<https://github.com/encoredev/encore> (the main repo carries 11k+
stars; the TypeScript runtime contract lives at
<https://github.com/encoredev/encore.dev>, also MPL-2.0). Encore's
own README puts the licensing scope explicitly: *"the framework,
parser, compiler, runtime, CLI, and everything needed to develop,
build, and self-host an Encore application is Open Source"*.

**Encore Cloud** is a separate, optional commercial product layered
on top — it adds automated AWS/GCP provisioning, per-PR preview
environments, hosted observability, cost analytics, and a service
catalog. **This substrate does not use Encore Cloud.** It builds a
self-hostable Docker image via `encore build docker --base ...` (see
`docs/encore-ts/encore-custom-dockerfile.md` for the cancel-then-scrape
hotfix variant). The image runs anywhere Docker runs — your own
Kubernetes, ECS, Cloud Run, a bare VM, your laptop.

## What you get

The wins fall into three groups: runtime performance, eliminated
classes of bugs, and engineering affordances that compound across a
team.

### Runtime performance (Rust under the hood)

The Node process owns the business logic; everything underneath —
HTTP lifecycle, request parsing, validation, database connection
pooling, Pub/Sub, tracing, metrics — runs in an in-process Rust
runtime on Tokio. Validation happens *in Rust* using the type
information Encore's parser already extracted from your TypeScript,
so the JavaScript event loop never touches the validator's hot path.

Encore's own benchmark ([`ts-benchmarks`](https://github.com/encoredev/ts-benchmarks),
methodology in the repo's README) against Express, Fastify v4/v5,
Bun, Elysia, and Hono — schema validation enabled where each
framework supports it — reports:

| Metric (POST + schema validation) | Encore.ts | Express |
|---|---|---|
| Throughput | 121,005 req/s | 15,707 req/s (**9× slower**) |
| P99 latency (without validation) | 2.3 ms | 11.9 ms |
| P99 latency (with validation) | 3.6 ms | 18.2 ms |

These are Encore's numbers on Encore's harness — read them as
"order-of-magnitude headroom" rather than as a final verdict. The
mechanism behind the gap is the bit worth taking seriously: moving
parsing/validation/IO off the JavaScript single-threaded event loop
to a multi-threaded Rust layer is a real architectural change, not a
micro-optimisation. (Background: [What We Learned Building a Rust Runtime for TypeScript](https://encore.dev/blog/rust-runtime).)

### Eliminated classes of bugs

These are recurring production bugs in Express/Fastify codebases
that Encore's shape makes structurally impossible:

- **Middleware ordering.** No `app.use` order to get wrong. Auth is
  per-endpoint opt-in (`{ auth: true }`), not "did I mount the auth
  middleware before the route?".
- **SQL injection.** Database queries use a tagged-template API
  (`DB.queryRow` + a template literal); `${value}` interpolations
  are bound as parameters, not concatenated into the SQL string.
  There is no `DB.query(rawString)` form to misuse.
- **Service contract drift.** Cross-service calls go through the
  generated `~encore/clients` types — change a return shape in
  service A, and every caller in service B stops compiling.
- **Stale OpenAPI.** `encore gen client --lang=openapi` regenerates
  from the application graph; there's no annotation file to drift
  out of sync.
- **Drift between IAM and code.** When Encore provisions cloud
  resources, the IAM/policy bindings are derived from the actual
  code paths that use those resources. Permissions match reality —
  no over-broad roles, no missing ones discovered in prod.
- **Double-response bugs.** The Express idiom of
  `res.status(400).json(...)` without a `return` (continues to
  execute, sends a second response) doesn't exist; Encore handlers
  return a value or throw an `APIError`.

### Engineering affordances

- **Local infrastructure parity.** `encore run` provisions Postgres,
  Pub/Sub, object storage, caches, and secrets locally — no
  docker-compose, no manual env wiring. The same code that runs
  locally produces the deploy image.
- **Dev dashboard at `localhost:9400`.** Live request traces,
  generated OpenAPI, a SQL playground against the local DB, an
  auto-derived architecture diagram, per-endpoint traffic stats.
  None of it is instrumentation code in your repo.
- **Trace-correlated logs for free.** `log.info("msg", { fields })`
  is stitched to the in-flight request trace automatically.
- **Type-safe service-to-service.** Calls look like local function
  calls (`anotherService.foo()`), compile to HTTP at runtime, and
  are checked end-to-end at build time.
- **Migrations are part of the runtime contract.** `new SQLDatabase("users", { migrations: "./migrations" })`
  runs the directory's numbered migrations on `encore run` and on
  deploy. No external runner to wire.
- **AI-assisted development is a first-class concern.** Encore
  ships a `CLAUDE.md` template + MCP server so agents can introspect
  the app graph and generate code that follows your patterns. Encore's
  [AI-readiness benchmark](https://encore.dev/blog/ai-benchmark)
  reports 100% production-readiness when Claude builds Encore
  backends vs lower scores for other frameworks — because a single
  primitive (`new Topic<T>(...)`) encodes durability semantics that
  would otherwise require wiring `pg-boss` + `drizzle-kit` + `pino`
  by hand.

## Trade-offs

Encore is OSS and self-hostable, so "vendor lock-in" doesn't apply
the way it would to a managed-only backend. The real costs:

- **Convention over flexibility.** You write against Encore's API
  surface (`api(...)`, `SQLDatabase`, `Topic`, …) instead of raw
  Express/Fastify + raw `pg`/`ioredis`/`@aws-sdk`. Business logic
  stays plain TypeScript; the IO layer is Encore-shaped. If you
  enjoy hand-wiring every layer, this will feel restrictive.
- **CLI dependency for dev.** `encore run`, `encore test`,
  `encore build` are required. You can't just `npm run dev`. The
  CLI is a Go binary distributed via Homebrew, an install script,
  and a Windows installer.
- **Generated-code friction.** `encore.gen/` is regenerated by the
  CLI; if it's stale (e.g. you moved files and haven't re-run
  `encore run`) standalone `tsc --noEmit` reports phantom errors
  in those generated files. IDE feedback can lag the regeneration.
- **Language scope.** TypeScript (Node) or Go only. Python is on
  the roadmap. No Rust/Java/.NET path.
- **Infrastructure scope.** Encore covers the "99% case" (services,
  databases, Pub/Sub, object storage, caches, cron, secrets). For
  the 1% — domain-specific services, anything not on Encore's
  resource list — you import the cloud-provider SDK directly and
  provision the resource yourself alongside Encore-managed ones.
- **Smaller ecosystem than Express.** Two decades of Express
  middleware doesn't all have a direct Encore equivalent (Passport
  strategies, express-session, Sentry's Express integration). The
  forklift pattern in Strategy 2 is the bridge; for greenfield
  projects it means a few wheels get re-cut.
- **Single-vendor stewardship.** Encore Inc. is the primary
  contributor. The OSS license (MPL-2.0) and ~3-year, 11k-star
  track record mitigate this — if the company pivots or folds, the
  code stays buildable and the migrate-away path is documented —
  but you are not in a "five competing implementations" world.
- **Debugging through the abstraction.** When something's off
  (connection string isn't binding, a migration didn't apply, a
  type validator rejects a request that "should" pass) the
  indirection between your code and the Rust runtime is one more
  layer to reason through. The dev dashboard helps; raw
  `console.log` on a typed validator error helps less.

**Migrate-away path is explicit, not theoretical.** Encore publishes
a [migrate-away guide](https://encore.dev/docs/ts/migration/migrate-away)
walking through the swap — ~99% of code stays plain TypeScript;
Encore's IO declarations are mechanically replaceable with raw
client libraries if you ever decide to leave. The exit cost is real
work, but it's bounded work, not a rewrite.

## Prerequisites for all three strategies

1. **Install the Encore CLI.** Pick the line for your OS:

   ```bash
   # macOS
   brew install encoredev/tap/encore

   # Linux
   curl -L https://encore.dev/install.sh | bash

   # Windows (PowerShell)
   iwr https://encore.dev/install.ps1 | iex
   ```

2. **Node 20+.** All three strategies target a modern Node baseline.

3. **The dev dashboard.** When `encore run` is running, open
   <http://localhost:9400/> — it lists every endpoint, shows live
   traces, surfaces the generated OpenAPI, and runs SQL queries
   against the local-dev Postgres instance Encore provisions for you.

## Where this fits in the substrate

This substrate's `public/server/` is itself an Encore.ts application —
see `docs/encore-ts/migration-plan.md` for the locked decisions
(auth handler shape, CSRF strategy, response envelope, file uploads,
streaming, rate limiting, Dockerfile path), and `docs/encore-ts/encore-ts-reference.md`
for the condensed API surface.

The three strategy docs below are general-purpose. They describe
*Encore patterns*, not substrate-specific patterns. When you're
making a decision that affects this repo, the substrate-specific
docs above take precedence.

## Upstream references

- Encore.ts documentation — <https://encore.dev/docs/ts>
- Express → Encore migration overview — <https://encore.dev/docs/ts/migration/express-migration>
- Encore.ts examples repo — <https://github.com/encoredev/examples/tree/main/ts>
- "Express.js vs Encore.ts" video — <https://www.youtube.com/watch?v=hA9syK_FtZw>

---

*All four documents in this folder distil the upstream Encore.ts
expressjs-migration example. Code excerpts are verbatim from that
source. Verified against Encore.ts 1.40+; the API surface for the
patterns shown here has been stable across minor versions.*
