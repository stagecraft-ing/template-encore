# Strategy 3 — Full rewrite (side-by-side)

Freeze the Express app, rewrite it into Encore.ts to feature parity,
cut over. This document is the side-by-side reference: for each
common Express pattern, the Encore equivalent.

## When to use

- Small-to-medium Express app (you can fit the route inventory in
  your head).
- You can afford a feature freeze for the rewrite window.
- The Express app has accumulated middleware/conventions you'd
  rather not carry forward.

If downtime is unacceptable, see [Strategy 2 (forklift)](./strategy-2-forklift-incremental.md).
If there's no Express app, see [Strategy 1 (greenfield)](./strategy-1-greenfield-encore.md).

## Concept mapping

| Express | Encore.ts | Notes |
|---|---|---|
| `express.Router()` | A directory + `encore.service.ts` | Services are file-system-defined, not constructed at runtime. |
| `router.get(path, handler)` | `api({ method: "GET", path }, handler)` | Each endpoint is its own exported binding. |
| `express.json()` middleware | implicit | Encore parses bodies automatically based on the handler's typed argument. |
| `cors()` middleware | `global_cors` in `encore.app` | Configured once at the app level, not per-route. |
| Zod / Joi validation middleware | TypeScript types + `encore.dev/validate` | Validation is the request type. |
| `res.json(payload)` | `return payload` | Return value is the response body; status defaults to 200. |
| `res.status(400).json(...)` | `throw APIError.invalidArgument(...)` | Error class carries status + structured payload. |
| Auth middleware (`req, res, next`) | `authHandler` + `{ auth: true }` per endpoint | One handler, opt-in per endpoint. |
| `app.listen(port, ...)` | nothing — Encore owns the listener | `encore run` boots the server. |
| `pg-promise` / raw client + manual env wiring | `new SQLDatabase(name, { migrations })` | Encore provisions the DB and applies migrations. |
| `fetch("https://other-service/...")` | `await otherService.someEndpoint(...)` | Cross-service calls go through the generated typed client. |
| `express.static("dir")` | `api.static({ path, dir })` | Same semantics, declarative. |
| `res.render("template", data)` | `api.raw` + your template engine of choice | Encore doesn't ship a view layer; pick Handlebars/Pug/EJS yourself. |
| `console.log` / Winston / Pino | `import log from "encore.dev/log"` | Logs are trace-correlated and visible in the dev dashboard. |

## Side-by-side per feature

### GET — path and query parameters

**Before (Express):**

```ts
import express, { Request, Response } from "express";

const router = express.Router();

router.get("/hello/:name", (req: Request, res: Response) => {
  res.json({ message: `Hello ${req.params.name}!` });
});

router.get("/hello", (req: Request, res: Response) => {
  res.json({ message: `Hello ${req.query.name}!` });
});

export default router;
```

**After (Encore):**

```ts
import { api, Query } from "encore.dev/api";

export const greetByPath = api(
  { expose: true, method: "GET", path: "/hello/:name" },
  async ({ name }: { name: string }): Promise<{ message: string }> => {
    return { message: `Hello ${name}!` };
  },
);

interface RequestParams {
  name?: Query<string>;
}

export const greetByQuery = api(
  { expose: true, method: "GET", path: "/hello" },
  async ({ name }: RequestParams): Promise<{ message: string }> => {
    return { message: `Hello ${name}!` };
  },
);
```

**Shape change:** path params arrive as typed function arguments;
query params need an explicit `Query<>` marker so Encore knows which
field comes from the query string vs the body. Return value replaces
`res.json()`.

### POST — JSON body

**Before:**

```ts
router.post("/order", (req: Request, res: Response) => {
  const price = req.body.price;
  const orderId = req.body.orderId;
  res.json({ message: "Order has been placed" });
});
```

**After:**

```ts
import { api } from "encore.dev/api";

interface OrderRequest {
  price: string;
  orderId: number;
}

export const placeOrder = api(
  { expose: true, method: "POST", path: "/order" },
  async ({ price, orderId }: OrderRequest): Promise<{ message: string }> => {
    return { message: "Order has been placed" };
  },
);
```

**Shape change:** no `express.json()` middleware — Encore parses
based on `OrderRequest`. The body's shape becomes a TypeScript
interface; mismatched requests return 400 before your handler runs.

### Request validation

**Before:**

```ts
import { z, ZodError } from "zod";

function validateData(schemas) {
  return (req, res, next) => {
    try {
      schemas.headers.parse(req.headers);
      schemas.body.parse(req.body);
      schemas.query.parse(req.query);
      next();
    } catch (error) {
      if (error instanceof ZodError) {
        const details = error.errors.map((i) => ({
          message: `${i.path.join(".")} is ${i.message}`,
        }));
        res.status(400).json({ error: "Invalid data", details });
      } else {
        res.status(500).json({ error: "Internal Server Error" });
      }
    }
  };
}

const bodySchema = z.object({
  someKey: z.string().optional(),
  requiredKey: z.array(z.number()),
  multipleTypesKey: z.union([z.boolean(), z.number()]).optional(),
  enumKey: z.enum(["John", "Foo"]).optional(),
});

router.post(
  "/validate",
  validateData({ headers: headersSchema, body: bodySchema, query: queryStringSchema }),
  (_, res) => res.json({ message: "Validation succeeded" }),
);
```

**After:**

```ts
import { api, Header, Query } from "encore.dev/api";

enum EnumType { FOO = "foo", BAR = "bar" }

interface RequestSchema {
  foo: Header<"x-foo">;
  name?: Query<string>;
  someKey?: string;
  requiredKey: number[];
  multipleTypesKey?: boolean | number;
  enumKey?: EnumType;
}

export const validate = api(
  { expose: true, method: "POST", path: "/validate" },
  (data: RequestSchema): { message: string } => {
    return { message: "Validation succeeded" };
  },
);
```

**Shape change:** delete the Zod schema and the `validateData`
middleware. The TypeScript interface IS the validator. For numeric
ranges, string lengths, regex, etc., compose with
`encore.dev/validate`:

```ts
import { Min, Max, MinLen, MaxLen } from "encore.dev/validate";

interface Stricter {
  age: number & (Min<0> & Max<120>);
  username: string & (MinLen<3> & MaxLen<30>);
}
```

### Error handling

**Before:**

```ts
router.get("/broken", (req, res) => {
  throw new Error("BROKEN"); // → 500
});

router.get("/get-user", (req: Request, res: Response) => {
  const id = req.query.id || "";
  if (id.length !== 3) {
    res.status(400).json({ error: "invalid id format" });
  }
  res.json({ user: "Simon" });
});
```

**After:**

```ts
import { api, APIError } from "encore.dev/api";

export const broken = api(
  { expose: true, method: "GET", path: "/broken" },
  async (): Promise<void> => {
    throw new Error("This is a broken endpoint"); // → 500
  },
);

export const getUser = api(
  { expose: true, method: "GET", path: "/broken/:id" },
  async ({ id }: { id: string }): Promise<{ user: string }> => {
    if (id.length !== 3) {
      throw APIError.invalidArgument("invalid id format");
    }
    return { user: "Simon" };
  },
);
```

**Shape change:** `res.status(N).json(...)` becomes
`throw APIError.<factory>(...)`. Available factories cover the
standard set: `notFound`, `invalidArgument`, `unauthenticated`,
`permissionDenied`, `alreadyExists`, `failedPrecondition`,
`unavailable`, `internal`. Note in the Express version, the original
code falls through after `res.status(400).json(...)` and sends both
responses — a bug Encore makes impossible (throw exits the handler).

### Database

**Before:**

```ts
import pgPromise from "pg-promise";

const db = pgPromise()({
  host: process.env.DB_HOST ?? "localhost",
  port: Number(process.env.DB_PORT ?? 5432),
  database: process.env.POSTGRES_DB ?? "database",
  user: process.env.POSTGRES_USER ?? "user1",
  password: process.env.POSTGRES_PASSWORD ?? "",
});

interface User { name: string; id: number; }

router.get("/user/:id", async (req: Request, res: Response) => {
  const user = await db.oneOrNone<User>(
    `SELECT * FROM users WHERE id = $1`, req.params.id,
  );
  res.json({ user });
});

router.post("/user", async (req: Request, res: Response) => {
  await db.none(
    `INSERT INTO users (name, id) VALUES ($1, $2)`,
    [req.body.name, req.body.id],
  );
  res.end();
});
```

**After:**

```ts
import { api } from "encore.dev/api";
import { SQLDatabase } from "encore.dev/storage/sqldb";

export const DB = new SQLDatabase("users", {
  migrations: "./migrations",
});

interface User { name: string; id: number; }

export const getUser = api(
  { expose: true, method: "GET", path: "/user/:id" },
  async ({ id }: { id: number }): Promise<{ user: User | null }> => {
    const user = await DB.queryRow<User>`
      SELECT name FROM users WHERE id = ${id}
    `;
    return { user };
  },
);

export const addUser = api(
  { expose: true, method: "POST", path: "/user" },
  async ({ name }: { name: string }): Promise<void> => {
    await DB.exec`INSERT INTO users (name) VALUES (${name})`;
  },
);
```

**Shape change:**

- No manual connection pool; `new SQLDatabase(name, {migrations})`
  is declarative and Encore provisions the local Postgres.
- No environment variables to wire — Encore manages the connection
  string. (For production, the deploy platform binds it.)
- Template literal queries are parameterised — `${id}` is bound, not
  interpolated. **SQL injection is structurally prevented at the
  type level.**
- Migrations live in the named directory next to the service.

Migration files use the standard numbered shape:

```sql
-- migrations/1_create_tables.up.sql
CREATE TABLE users (
  id   SERIAL PRIMARY KEY,
  name TEXT NOT NULL UNIQUE
);
```

### Authentication

**Before:**

```ts
function authMiddleware(req: Request, res: Response, next: NextFunction) {
  if (req.headers["authorization"] === undefined) {
    res.status(401).json({ error: "invalid request" });
  } else {
    next();
  }
}

router.get("/dashboard", authMiddleware, (_, res: Response) => {
  res.json({ message: "Secret dashboard message" });
});
```

**After:**

```ts
import { api, APIError, Gateway, Header } from "encore.dev/api";
import { authHandler } from "encore.dev/auth";
import { getAuthData } from "~encore/auth";

interface AuthParams { authorization: Header<"Authorization">; }

export const myAuthHandler = authHandler(
  async (params: AuthParams): Promise<{ userID: string }> => {
    if (params.authorization === undefined) {
      throw APIError.unauthenticated("missing authorization");
    }
    return { userID: "user123" };
  },
);

export const gateway = new Gateway({ authHandler: myAuthHandler });

export const dashboard = api(
  { auth: true, method: "GET", path: "/dashboard" },
  async (): Promise<{ message: string; userID: string }> => {
    return {
      message: "Secret dashboard message",
      userID: getAuthData()!.userID,
    };
  },
);
```

**Shape change:** there's no "middleware ordering" anymore — every
endpoint either opts in with `{ auth: true }` or doesn't. The auth
handler's return value is available to handlers via `getAuthData()`,
typed.

In the Express version, the original `authMiddleware` had a subtle
bug: it called `res.status(401).json(...)` and didn't `return`, so
on an invalid request it tried to call `next()` after sending a
response. The Encore version's `throw APIError.unauthenticated`
makes that bug class impossible.

### Microservice communication

**Before:**

```ts
router.get("/save-post", async (req: Request, res: Response) => {
  try {
    const resp = await fetch("https://another-service/posts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: req.query.title,
        content: req.query.content,
      }),
    });
    res.json(await resp.json());
  } catch (e) {
    res.status(500).json({ error: "Could not save post" });
  }
});
```

**After:**

```ts
import { api } from "encore.dev/api";
import { anotherService } from "~encore/clients";

export const callOther = api(
  { expose: true, method: "GET", path: "/call" },
  async (): Promise<{ message: string }> => {
    const fooResponse = await anotherService.foo();
    return { message: `Data from another service: ${fooResponse.data}` };
  },
);
```

**Shape change:** no URL string, no manual JSON serialisation, no
manual try/catch around the network call (Encore surfaces errors as
typed APIError). The call is fully type-checked end to end — if
`anotherService.foo` changes its signature, your code stops
compiling.

### Static assets

**Before:**

```ts
router.use("/assets", express.static("assets"));
```

**After:**

```ts
import { api } from "encore.dev/api";

export const assets = api.static({
  expose: true,
  path: "/assets/*path",
  dir: "./assets",
});
```

Same semantics, declarative. For an SPA with history-mode routing
where unmatched paths should fall back to `index.html`:

```ts
export const spa = api.static({
  expose: true,
  path: "/!path",
  dir: "./web/build",
  notFound: "./web/build/index.html",
});
```

### Dynamic HTML templates

**Before:**

```ts
router.get("/html", (_, res) => {
  res.render("index", { title: "Hey", message: "Hello there!" });
});
```

(Express has the `view engine` set to Pug at app config time.)

**After:**

```ts
import { api } from "encore.dev/api";
import Handlebars from "handlebars";

const html = `
<!doctype html>
<html lang="en">
<head>
  <meta charset="UTF-8"/>
  <link rel="stylesheet" href="/assets/styles.css">
</head>
<body><h1>Hello {{name}}!</h1></body>
</html>
`;

export const renderPage = api.raw(
  { expose: true, path: "/html", method: "GET" },
  async (req, resp) => {
    const template = Handlebars.compile(html);
    resp.setHeader("Content-Type", "text/html");
    resp.end(template({ name: "Simon" }));
  },
);
```

**Shape change:** Encore doesn't ship a view layer — `api.raw` puts
you back in vanilla Node land, then bring whichever templating
library you want. Handlebars, Pug, EJS, JSX-as-template — all fine.
The above uses Handlebars to mirror what `res.render` did.

### Logging

**Before:** typically `console.log` or a third-party logger
configured at app boot.

**After:**

```ts
import log from "encore.dev/log";

log.info("log message", { is_subscriber: true });
log.error(err, "something went terribly wrong!");
```

The logger is trace-correlated — log lines emitted inside an endpoint
are stitched to that request's trace in the dev dashboard. No setup,
no app-level configuration.

## The cutover plan

1. **Stand up the Encore app alongside the Express app.** Both
   services in separate repos (or separate folders in the monorepo);
   both deployed; both behind the same reverse proxy if you have
   one.
2. **Feature freeze on the Express side.** Bug fixes only.
3. **Rewrite endpoint-by-endpoint** into the Encore app. Use the
   per-feature mappings above. Land each rewritten endpoint behind
   a feature flag at the proxy/load-balancer level until you've
   verified it.
4. **Cut over the proxy.** Point the public hostname at the Encore
   app for every route that's been rewritten. Express still serves
   the rest.
5. **Sunset Express.** Once every route is migrated, decommission
   the Express deploy and archive the repo.
6. **Remove the proxy fork.** All traffic now lands on Encore
   directly.

## CORS

`app.use(cors())` in Express becomes `global_cors` in `encore.app`:

```json
{
  "id": "",
  "lang": "typescript",
  "global_cors": {
    "debug": false,
    "allow_origins_without_credentials": ["*"],
    "allow_origins_with_credentials": [
      "https://your-production-host.example",
      "http://localhost:5173"
    ],
    "allow_headers": [
      "Authorization",
      "Content-Type",
      "X-CSRF-Token",
      "X-Requested-With"
    ],
    "expose_headers": [
      "Content-Length",
      "Content-Type",
      "Location"
    ]
  }
}
```

This applies to every endpoint. There's no per-route CORS
configuration in Encore — you set it once at the app level. If a
specific endpoint needs different headers, you'd typically handle
that with `api.raw` and write the headers yourself.

## Things that don't map cleanly

- **`req.session` / express-session.** Encore doesn't have a
  built-in session middleware. Options: write cookies directly via
  the auth handler's return value; use the `~encore/auth` API; or
  keep sessions in a database table queried in the auth handler.
- **Passport strategies.** No Passport equivalent in Encore. Roll
  the auth strategy you need inside the `authHandler` directly —
  OAuth flows are a few hundred lines and the substrate's
  `auth/google.ts` and `auth/microsoft.ts` show the shape.
- **WebSocket / SSE.** Encore supports streaming via `api.streamIn`,
  `api.streamOut`, and `api.streamInOut` — see Encore docs. The
  Express `ws` package patterns don't directly translate.
- **Server-Sent Events (`res.write` chunks).** Use `api.streamOut`.
- **Custom Express middleware that mutates `req`/`res`.** No direct
  equivalent. Re-implement the behaviour inside the endpoint, or
  use `api.raw` if you genuinely need the raw Node objects.

## Package.json essentials

```json
{
  "name": "your-app",
  "private": true,
  "type": "module",
  "scripts": {
    "test": "vitest --passWithNoTests"
  },
  "dependencies": {
    "encore.dev": "^1.40"
  },
  "devDependencies": {
    "@types/node": "^20",
    "typescript": "^5",
    "vitest": "^2"
  }
}
```

You may add `handlebars` (or whatever template engine), `zod` (if
you want richer validation alongside Encore's), etc. The Express
dependencies all come out.
