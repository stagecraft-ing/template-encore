# Strategy 1 — Greenfield Encore.ts

Pick this when you have no existing backend. Every pattern below is
written in Encore-native idioms; nothing forces you to think about
Express compatibility.

## When to use

- New project, no legacy backend.
- Existing backend in a non-Node language (you're rewriting anyway).
- Internal service you're building from scratch alongside a legacy
  external service.

If you have a working Express app you want to keep running while
migrating, see [Strategy 2](./strategy-2-forklift-incremental.md). If
you're rewriting an Express app to feature-parity, see
[Strategy 3](./strategy-3-full-rewrite.md).

## Project skeleton

An Encore.ts project is just a Node package plus an `encore.app` file
at the root that marks the workspace for the Encore CLI. Minimum
viable layout:

```
my-app/
├── encore.app                ← marks the root for `encore run`
├── package.json              ← standard Node manifest; encore.dev as a dep
├── tsconfig.json
└── example-service/
    ├── encore.service.ts     ← marks this directory as a service
    └── ...endpoints.ts
```

`package.json` essentials:

```json
{
  "name": "my-app",
  "private": true,
  "type": "module",
  "scripts": {
    "test": "vitest --passWithNoTests"
  },
  "dependencies": {
    "encore.dev": "^1.40"
  }
}
```

`encore.app` is read by the Encore CLI and stores the app's id once
linked to the Encore Cloud platform; for self-hosted-only use it can
stay with an empty `id` field.

## Service shape

A service is any directory containing an `encore.service.ts` that
default-exports a `Service` instance. Everything under that
directory — and every subdirectory — is considered part of that
service.

```ts
// example-service/encore.service.ts
import { Service } from "encore.dev/service";

export default new Service("exampleService");
```

To make a *second* service, add a sibling directory with its own
`encore.service.ts`. Cross-service calls go through the typed
client generated under `~encore/clients` (see Microservice
communication below).

## GET endpoints — path and query parameters

```ts
import { api, Query } from "encore.dev/api";

// Dynamic path parameter :name → typed as a function argument
export const greetByPath = api(
  { expose: true, method: "GET", path: "/hello/:name" },
  async ({ name }: { name: string }): Promise<{ message: string }> => {
    return { message: `Hello ${name}!` };
  },
);

interface RequestParams {
  // Query<string> tells Encore to parse this from the query string,
  // not the request body.
  name?: Query<string>;
}

export const greetByQuery = api(
  { expose: true, method: "GET", path: "/hello" },
  async ({ name }: RequestParams): Promise<{ message: string }> => {
    return { message: `Hello ${name}!` };
  },
);
```

Key point: the handler's argument is destructured from the merged
shape of path params + query params + body. Encore picks each piece
out by type — `Query<>` for query string, `Header<>` for headers,
otherwise body for POST/PUT/PATCH or path-only for GET/DELETE.

## POST endpoints — JSON body

```ts
import { api } from "encore.dev/api";

interface OrderRequest {
  price: string;
  orderId: number;
}

export const placeOrder = api(
  { expose: true, method: "POST", path: "/order" },
  async ({ price, orderId }: OrderRequest): Promise<{ message: string }> => {
    // handle the order
    return { message: "Order has been placed" };
  },
);
```

No `express.json()` middleware needed — Encore reads the
`Content-Type` and parses the body to the typed shape automatically.

## Request validation

Validation is the request type itself. There's no separate Zod
schema and no `validateData` middleware:

```ts
import { api, Header, Query } from "encore.dev/api";

enum EnumType {
  FOO = "foo",
  BAR = "bar",
}

interface RequestSchema {
  foo: Header<"x-foo">;          // required header
  name?: Query<string>;          // optional query param
  someKey?: string;              // optional body field
  someOtherKey?: number;
  requiredKey: number[];         // required body field
  nullableKey?: number | null;
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

If a request doesn't match the type, Encore returns a 400 with a
structured error response. Optionals (`?`) and unions are honoured.
For stricter constraints (min/max numeric ranges, regex on strings),
import them from `encore.dev/validate`:

```ts
import { Min, Max, MinLen, MaxLen, IsEmail } from "encore.dev/validate";

interface Stricter {
  age: number & (Min<0> & Max<120>);
  username: string & (MinLen<3> & MaxLen<30>);
  email: string & IsEmail;
}
```

## Error handling

`APIError` carries a status code and a structured payload. Throwing
it from an endpoint returns the appropriate HTTP response.

```ts
import { api, APIError } from "encore.dev/api";

export const getUser = api(
  { expose: true, method: "GET", path: "/user/:id" },
  async ({ id }: { id: string }): Promise<{ user: string }> => {
    if (id.length !== 3) {
      throw APIError.invalidArgument("invalid id format");
    }
    return { user: "Simon" };
  },
);

// Uncaught errors fall through to a generic 500.
export const broken = api(
  { expose: true, method: "GET", path: "/broken" },
  async (): Promise<void> => {
    throw new Error("This is a broken endpoint");
  },
);
```

Available `APIError` factories include `notFound`, `invalidArgument`,
`unauthenticated`, `permissionDenied`, `alreadyExists`,
`failedPrecondition`, `unavailable`, `internal`.

## Database

A `SQLDatabase` is declared as code; Encore provisions the local
Postgres instance for `encore run` and applies migrations from the
named directory.

```ts
import { api } from "encore.dev/api";
import { SQLDatabase } from "encore.dev/storage/sqldb";

export const DB = new SQLDatabase("users", {
  migrations: "./migrations",
});

interface User {
  name: string;
  id: number;
}

export const getUser = api(
  { expose: true, method: "GET", path: "/user/:id" },
  async ({ id }: { id: number }): Promise<{ user: User | null }> => {
    // Template literal queries are parameterised — ${id} is bound, not interpolated.
    const user = await DB.queryRow<User>`
      SELECT name FROM users WHERE id = ${id}
    `;
    return { user };
  },
);

export const listUsers = api(
  { expose: true, method: "GET", path: "/user" },
  async (): Promise<{ users: User[] }> => {
    const rows = await DB.query<User>`SELECT * FROM users`;
    const users: User[] = [];
    for await (const u of rows) users.push(u);
    return { users };
  },
);

export const addUser = api(
  { expose: true, method: "POST", path: "/user" },
  async ({ name }: { name: string }): Promise<void> => {
    await DB.exec`INSERT INTO users (name) VALUES (${name})`;
  },
);
```

Migrations live next to the service in the directory you named:

```sql
-- example-service/migrations/1_create_tables.up.sql
CREATE TABLE users (
  id   SERIAL PRIMARY KEY,
  name TEXT NOT NULL UNIQUE
);
```

Encore runs them in order on `encore run` and on deploy. Use
idempotent forms (`CREATE TABLE IF NOT EXISTS`, etc.) if you re-run
the same migration in scripted setups.

## Authentication

Auth in Encore is a single function registered via `authHandler`,
mounted on a `Gateway`. Every endpoint that opts in with
`{ auth: true }` runs the handler before the body executes; the
return value is available to the endpoint via `getAuthData()`.

```ts
import { api, APIError, Gateway, Header } from "encore.dev/api";
import { authHandler } from "encore.dev/auth";
import { getAuthData } from "~encore/auth";

interface AuthParams {
  authorization: Header<"Authorization">;
}

export const myAuthHandler = authHandler(
  async (params: AuthParams): Promise<{ userID: string }> => {
    if (params.authorization === undefined) {
      throw APIError.unauthenticated("missing authorization header");
    }
    // validate the token here; return whatever you want available
    // via getAuthData() in handlers
    return { userID: "user123" };
  },
);

export const gateway = new Gateway({ authHandler: myAuthHandler });

// Endpoint that requires auth — getAuthData() is non-null inside.
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

There's no "auth middleware ordering" problem because there's no
middleware ordering — every endpoint either opts in or it doesn't.

## Microservice communication

Service-to-service calls go through the generated client:

```ts
// example-service/microservice-example.ts
import { api } from "encore.dev/api";
import { anotherService } from "~encore/clients";

export const callOther = api(
  { expose: true, method: "GET", path: "/call" },
  async (): Promise<{ message: string }> => {
    // Looks like a local function call; compiles to an HTTP request.
    const fooResponse = await anotherService.foo();
    return { message: `Data from another service: ${fooResponse.data}` };
  },
);
```

The other service:

```ts
// another-service/encore.service.ts
import { Service } from "encore.dev/service";
export default new Service("anotherService");
```

```ts
// another-service/foo.ts
import { api } from "encore.dev/api";

// expose: false means only callable service-to-service, not externally.
export const foo = api(
  { expose: false, method: "GET", path: "/foo" },
  async (): Promise<{ data: string }> => {
    return { data: "bar" };
  },
);
```

`~encore/clients` is generated; you don't write the client by hand
and the call is fully typed end-to-end.

## Static assets

`api.static` serves a directory of files at a path. Use it for SPA
bundles, asset folders, anything the client downloads as-is.

```ts
import { api } from "encore.dev/api";

export const assets = api.static({
  expose: true,
  path: "/assets/*path",
  dir: "./assets",
});
```

For SPA fallback (serve `index.html` for any unmatched path under the
static mount), add `notFound`:

```ts
export const spa = api.static({
  expose: true,
  path: "/!path",
  dir: "./web/build",
  notFound: "./web/build/index.html",
});
```

## Dynamic HTML templates

For server-side-rendered HTML, use a `api.raw` endpoint and a
template engine of your choice (Handlebars, Pug, EJS — Encore doesn't
prescribe one):

```ts
import { api } from "encore.dev/api";
import Handlebars from "handlebars";

const html = `
<!doctype html>
<html lang="en">
<head><meta charset="UTF-8"/></head>
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

`api.raw` gives you the underlying `IncomingMessage` and
`ServerResponse` — you're back in vanilla Node territory when you
need it.

## Logging

Encore ships a structured logger; output is correlated with the
in-flight request trace and visible in the dev dashboard.

```ts
import { api } from "encore.dev/api";
import log from "encore.dev/log";

export const example = api(
  { expose: true, method: "GET", path: "/logging" },
  async (): Promise<{ message: string }> => {
    try {
      // ...
    } catch (err) {
      log.error(err, "something went terribly wrong!");
    }
    log.info("log message", { is_subscriber: true });
    return { message: "Hello!" };
  },
);
```

`log.{debug,info,warn,error}` accept an Error (optional) plus a
message and an optional structured-fields object.

## Testing

Vitest plays nicely with Encore. A minimal `vitest.config.ts`:

```ts
import { defineConfig } from "vitest/config";
export default defineConfig({ test: { passWithNoTests: true } });
```

Tests import endpoints as plain functions:

```ts
import { describe, expect, test } from "vitest";
import { greetByPath } from "../get-request-example";

describe("greeting endpoint", () => {
  test("greets by name", async () => {
    const resp = await greetByPath({ name: "world" });
    expect(resp.message).toBe("Hello world!");
  });
});
```

Run with `encore test` (delegates to vitest with the Encore runtime
loaded). For unit-test isolation, the endpoint is just a function
you can call directly.

## Where to go next

- API surface reference — `docs/encore-ts/encore-ts-reference.md` in this repo
- Dev dashboard tour — <https://encore.dev/docs/ts/observability/dev-dash>
- Deploying — <https://encore.dev/docs/ts/deploy>
- Docker build pattern (self-hosted) — `docs/encore-ts/encore-custom-dockerfile.md` in this repo
