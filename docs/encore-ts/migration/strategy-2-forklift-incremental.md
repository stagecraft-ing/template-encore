# Strategy 2 — Forklift (incremental)

Wrap an entire Express app inside a single Encore raw endpoint, then
move routes off the Express app one at a time as you go. The app
ships under Encore from day one; the migration runs invisibly behind
the catch-all.

## When to use

- You have a live Express.js app that can't pause for a rewrite.
- You want Encore's observability + deploy pipeline immediately.
- The migration timeline is measured in months and you're going to
  pick routes off opportunistically — when you're already in that
  module, when you're fixing a bug there, when a route needs a new
  feature anyway.

If you can afford a cutover window, [Strategy 3 (full rewrite)](./strategy-3-full-rewrite.md)
is faster end-to-end. If you don't have an Express app at all,
[Strategy 1 (greenfield)](./strategy-1-greenfield-encore.md) is what
you want.

## The pattern

Two files. That's the whole bridge.

```ts
// app/express-app.ts
import express, {
  Express,
  request,
  Request,
  response,
  Response,
} from "express";
import { RawRequest, RawResponse } from "encore.dev/api";

// Extending Express's request/response prototypes so that Encore-typed
// raw handlers can pass them through cleanly.
Object.setPrototypeOf(request, RawRequest.prototype);
Object.setPrototypeOf(response, RawResponse.prototype);

const app: Express = express();

app.use(express.json()).set("view engine", "pug");

// Your existing Express routes go here, untouched.
app.get("/express", (_: Request, res: Response) => {
  res.json({ message: "Hello from Express.js" });
});

app.get("/html", (_, res) => {
  res.render("index", { title: "Hey", message: "Hello there!" });
});

// No app.listen — Encore handles the listener.
export default app;
```

```ts
// app/app.ts
import { api } from "encore.dev/api";
import app from "./express-app";

// A typed Encore endpoint — the migration starts with these.
export const get = api(
  { expose: true, method: "GET", path: "/encore" },
  async (): Promise<{ message: string }> => {
    return { message: "Hello from Encore!" };
  },
);

// The catch-all: every request that does NOT match an Encore endpoint
// above falls through to the Express app. method: "*" matches every
// verb; path: "/!rest" matches everything (the !rest pattern is
// Encore's catch-all syntax).
export const expressApp = api.raw(
  { expose: true, method: "*", path: "/!rest" },
  app,
);
```

And the service marker:

```ts
// app/encore.service.ts
import { Service } from "encore.dev/service";
export default new Service("exampleService");
```

That's it. `encore run` boots the whole thing. Your existing Express
routes serve from the catch-all; any Encore endpoint you add takes
precedence over it.

## How matching works

Encore matches the more specific path first. Given:

- An Encore endpoint at `GET /encore`
- A catch-all at `* /!rest`

A request to `GET /encore` hits the typed Encore endpoint. A request
to `GET /anything-else` falls through to Express. As you add more
typed endpoints (`GET /user/:id`, `POST /order`, …), more traffic
moves off Express and onto Encore. The catch-all keeps serving the
long tail until you're done.

## What you give up while forklifted

The Express routes (everything served by the catch-all) don't get
Encore's per-endpoint affordances:

- **Type-safe routing** — the catch-all is one endpoint as far as
  Encore knows; it can't enforce per-route types.
- **Schema validation** — Encore's automatic request validation only
  fires for typed endpoints, not for the catch-all.
- **Per-endpoint dashboard rows** — the dev dashboard shows the raw
  catch-all as one entry, not each Express route. (Traces still
  cover the request; you just can't filter the dashboard list by
  Express route.)
- **OpenAPI** — `encore gen client --lang=openapi` won't emit
  schemas for the Express routes; only for the typed Encore
  endpoints you've added.

Everything still works — you have a healthy Express app behind the
forklift. You just don't get Encore's contracted-endpoint benefits
until you replace each Express route with a typed Encore endpoint.

## Picking routes off one at a time

The migration loop:

1. Pick a route from the Express app — usually one you're already
   touching for unrelated reasons, or one whose behavior you want to
   tighten.
2. Write the equivalent Encore endpoint with proper request/response
   types. See the per-feature mappings in
   [Strategy 3](./strategy-3-full-rewrite.md) for what each shape
   looks like.
3. Delete the corresponding `router.get/post/...` call from the
   Express app.
4. Deploy. The Encore endpoint now takes precedence; the catch-all
   no longer matches that path.

The Express app shrinks; the Encore endpoint count grows. When the
Express app is empty, remove `expressApp` and the
`express-app.ts` file. You're now a Strategy-1 greenfield project.

## Caveats

### Middleware ordering and the prototype trick

The two `Object.setPrototypeOf` calls at the top of `express-app.ts`
are load-bearing. They reassign Express's prototype chain so that
the `req`/`res` objects Encore hands the raw endpoint satisfy the
`Request` and `Response` types Express expects internally. Without
them, the first Express handler that reaches for a method that lives
on the prototype (most of them) crashes.

Don't move those calls into a function, don't make them conditional,
don't wrap them in a try/catch. Top of file, before `express()` is
called.

### CORS

If you used `app.use(cors())` in Express, you have two options after
forklifting:

- **Keep CORS in Express.** Leave the `cors` middleware on the
  Express app for now. It applies only to the catch-all routes.
- **Move CORS to Encore.** Add `global_cors` to `encore.app`:

  ```json
  {
    "global_cors": {
      "allow_origins_with_credentials": ["https://your-site.example"],
      "allow_headers": ["Authorization", "Content-Type"]
    }
  }
  ```

  This applies to every endpoint including the catch-all. If you
  also have CORS in Express, the two will double up — the second
  pass is a no-op but the headers are set twice. Pick one or the
  other.

### Body parsing

`express.json()` runs inside the Express app on the catch-all path.
Encore parses bodies for *its* typed endpoints automatically. Both
work; they don't conflict because they operate on different
requests.

If you also have `express.urlencoded()` or `multer` for file
uploads, those keep working on the catch-all. Encore has its own
file-upload patterns (see the substrate's `lib/file-validation.ts`
for the canonical local pattern) but you don't need to use them
until you migrate the upload route off Express.

### Cookies

Express cookies set by `res.cookie(...)` still work via the
catch-all. Encore endpoints set cookies via the response header
mechanism on `api.raw` or by configuring them on the gateway. As
long as both sides agree on cookie name + domain + path, sessions
move cleanly across the bridge.

## When to graduate from Strategy 2

Indicators that the forklift has done its job and you should pull
the plug:

- Fewer than ~5 Express routes left, and they're not load-bearing.
- The remaining routes are simple enough to rewrite in an afternoon.
- The catch-all is showing up in your dashboard as a small fraction
  of total traffic (under 10%).

At that point, finish the migration with a [Strategy 3 cutover](./strategy-3-full-rewrite.md)
on the remainder.

Indicators that you should stay forklifted longer:

- Routes with non-trivial middleware stacks (auth + rate limiting +
  custom session handling) that you don't want to re-implement now.
- A third-party Express middleware (Passport strategies, Sentry
  Express integration, etc.) you depend on.
- Active development on the Express side that would conflict with a
  rewrite cutover.

## Package.json essentials

```json
{
  "name": "your-app",
  "dependencies": {
    "encore.dev": "^1.40",
    "express": "^4.19",
    "pug": "^3.0"
  },
  "devDependencies": {
    "@types/express": "^4.17",
    "@types/node": "^20",
    "typescript": "^5"
  }
}
```

Keep your existing Express deps. Add `encore.dev`. That's the only
change at the dependency layer.
