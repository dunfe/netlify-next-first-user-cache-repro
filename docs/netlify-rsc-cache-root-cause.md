# Root cause report: Netlify Runtime v4 caches authenticated App Router RSC payloads when an SSG catch-all route exists

## Executive summary

A dynamic authenticated App Router route (`ƒ /dashboard`) can leak the first user's dashboard data to later users on Netlify when the application also contains an App Router SSG catch-all route (`● /[...slug]`).

The leak is not caused by the HTML document route becoming static. The `/dashboard` document request remains dynamic and usually renders the correct cookie user. The leak occurs on **React Server Component (RSC / Flight) requests** used by client-side navigation:

```txt
/dashboard?_rsc=...
RSC: 1
```

On Netlify Runtime v4 (`@netlify/plugin-nextjs@4.41.5`), the generated `rsc-data` edge function treats the broad SSG catch-all route as an RSC data route matcher. This means an RSC request for the concrete dynamic route `/dashboard` matches the catch-all regex from the prerender manifest:

```txt
^/(.+?)(?:/)?$
```

The request is then served as an RSC response and stored by **Netlify Durable Cache**. Netlify's vary key for this response includes only Next preview cookies, not the real auth/session cookie. Therefore the first authenticated RSC payload can be reused for later users.

The same reproduction does **not** leak on Vercel because Vercel returns `private, no-cache, no-store` for the RSC response and reports `x-vercel-cache: MISS`.

## Affected stack in this repro

```json
{
  "next": "14.2.35",
  "@netlify/plugin-nextjs": "4.41.5",
  "react": "18.3.1",
  "react-dom": "18.3.1"
}
```

Netlify build output confirms the runtime:

```txt
Using Next.js Runtime - v4.41.5
```

## Minimal route setup

### Dynamic authenticated route

File: `app/dashboard/page.tsx`

```ts
export const dynamic = 'force-dynamic'
export const revalidate = 0
export const fetchCache = 'force-no-store'
```

The page reads the current `user` cookie via `cookies()` and renders the user in the dashboard payload.

Build output keeps this route dynamic:

```txt
└ ƒ /dashboard
```

### App Router SSG catch-all route

File: `app/[...slug]/page.tsx`

```ts
export const revalidate = 3600

export async function generateStaticParams() {
  if (process.env.SIMULATE_CONTENTFUL_FAILURE === '1') {
    return []
  }

  return [
    { slug: ['contentful', 'hello'] },
    { slug: ['marketing', 'landing'] },
  ]
}
```

This mimics a Contentful-backed catch-all route:

- Contentful healthy: static child paths are generated.
- Contentful failed: `generateStaticParams()` returns `[]`; the route still appears as SSG but has no listed children.

Build output with simulated Contentful failure:

```txt
Route (app)
├ ● /[...slug]
├ ● /blog/[slug]
├   └ /blog/hello
└ ƒ /dashboard
```

This output shape is important: `/dashboard` remains dynamic, while `● /[...slug]` remains present.

### Cacheability trigger used by this repro

File: `middleware.ts`

```ts
if (
  process.env.SIMULATE_CONTENTFUL_FAILURE === '1' &&
  request.nextUrl.pathname.startsWith('/dashboard')
) {
  response.headers.set(
    'Cache-Control',
    'public, max-age=0, s-maxage=31536000, stale-while-revalidate=31536000',
  )
  response.headers.set('X-Repro-Contentful-Build-Failed', '1')
}
```

This simulates the bad production state observed after Contentful/static-generation trouble: a user-specific dashboard response becomes cacheable at Netlify's CDN/Durable layer.

## Generated Netlify artifacts that explain the bug

After running:

```bash
SIMULATE_CONTENTFUL_FAILURE=1 npx netlify build --offline
```

Netlify Runtime v4 generates an RSC data edge function:

```txt
.netlify/edge-functions/rsc-data/rsc-data.ts
.netlify/edge-functions/edge-shared/rsc-data.ts
.netlify/edge-functions/edge-shared/prerender-manifest.json
.netlify/edge-functions/manifest.json
```

### `prerender-manifest.json` contains a broad catch-all dynamic route

Relevant generated data:

```json
{
  "dynamicRoutes": {
    "/[...slug]": {
      "routeRegex": "^/(.+?)(?:/)?$",
      "dataRoute": "/[...slug].rsc",
      "fallback": null,
      "dataRouteRegex": "^/(.+?)\\.rsc$"
    }
  }
}
```

This regex matches `/dashboard`.

### `manifest.json` registers the broad catch-all for the `rsc-data` edge function

Relevant generated entries:

```json
{
  "function": "rsc-data",
  "name": "RSC data routing",
  "pattern": "^/(.+?)(?:/)?$",
  "generator": "@netlify/next-runtime@4.41.5"
}
```

That means the `rsc-data` edge function is in the request path for many App Router RSC requests, including `/dashboard`.

### `rsc-data.ts` matches RSC requests against all SSG dynamic route regexes

File: `.netlify/edge-functions/edge-shared/rsc-data.ts`

```ts
const dynamicRouteMatcher = Object.values(dynamicRoutes)
  .filter(({ dataRoute }) => dataRoute?.endsWith('.rsc'))
  .map(({ routeRegex }) => new RegExp(routeRegex))

const matchesDynamicRscDataRoute = (pathname: string) => {
  return dynamicRouteMatcher.some((matcher) => matcher.test(pathname))
}

const matchesRscRoute = (pathname: string) => {
  return matchesStaticRscDataRoute(pathname) || matchesDynamicRscDataRoute(pathname)
}

return (request, context) => {
  const url = new URL(request.url)

  if (request.headers.get('rsc') === '1') {
    if (matchesRscRoute(url.pathname)) {
      request.headers.set('x-rsc-route', url.pathname)
      const target = rscifyPath(url.pathname)
      return context.rewrite(target)
    }
  }
}
```

For an RSC request to `/dashboard`, `matchesRscRoute('/dashboard')` returns true because `/dashboard` matches the generated catch-all regex `^/(.+?)(?:/)?$`.

This is the routing/matching root cause.

## Live reproduction evidence on Netlify

Site tested:

```txt
https://netlify-next-first-user-cache-repro.netlify.app
```

### Direct HTML requests are correct

Direct document requests render the correct user:

```bash
curl -i "$SITE/dashboard" \
  -H 'Cookie: user=A' \
  -H 'Accept: text/html'

curl -i "$SITE/dashboard" \
  -H 'Cookie: user=B' \
  -H 'Accept: text/html'
```

Observed body markers:

```txt
A HTML body: User A
B HTML body: User B
```

This proves the whole `/dashboard` document route is not simply static.

### RSC requests leak

RSC request as user A:

```bash
curl -i "$SITE/dashboard?_rsc=<token>" \
  -H 'Cookie: user=A' \
  -H 'RSC: 1' \
  -H 'Next-Url: /' \
  -H 'Next-Router-State-Tree: <encoded-tree>'
```

Observed:

```txt
content-type: text/x-component
cache-status: "Netlify Durable"; fwd=stale; ttl=31534724; stored, "Netlify Edge"; fwd=miss
netlify-vary: cookie=__next_preview_data:presence|__prerender_bypass:presence
body: User A
```

RSC request as user B:

```bash
curl -i "$SITE/dashboard?_rsc=<token>" \
  -H 'Cookie: user=B' \
  -H 'RSC: 1' \
  -H 'Next-Url: /' \
  -H 'Next-Router-State-Tree: <encoded-tree>'
```

Observed:

```txt
content-type: text/x-component
cache-status: "Netlify Durable"; hit; ttl=31535998, "Netlify Edge"; fwd=miss
netlify-vary: cookie=__next_preview_data:presence|__prerender_bypass:presence
body: User A
```

This is the leak:

```txt
B sends Cookie: user=B
B receives RSC payload containing User A
```

The relevant problem header is:

```txt
netlify-vary: cookie=__next_preview_data:presence|__prerender_bypass:presence
```

It does not vary on:

- `Cookie: user=...`
- application auth/session cookies
- `Authorization`

Therefore a user-specific RSC payload can be shared across users.

## Control test: remove `app/[...slug]`

We temporarily removed:

```txt
app/[...slug]/page.tsx
```

Build output no longer included the catch-all route:

```txt
Route (app)
├ ● /blog/[slug]
├   └ /blog/hello
└ ƒ /dashboard
```

Generated Netlify prerender manifest no longer contained the broad catch-all:

```txt
dynamic routes: [ '/blog/[slug]' ]
has catch-all: false
```

Live checks confirmed catch-all pages were gone:

```txt
/contentful/hello -> 404
/marketing/landing -> 404
```

Then the same RSC A/B test returned correct users:

```txt
A RSC body: User A
B RSC body: User B
```

This control test strongly indicates that `app/[...slug]` is a necessary trigger for this repro.

## Control test: redeploy with `app/[...slug]` restored

After restoring `app/[...slug]/page.tsx`, live checks confirmed catch-all pages were active again:

```txt
/contentful/hello -> 200
/marketing/landing -> 200
```

The RSC leak returned:

```txt
A RSC body: User A
B RSC body: User A
```

With headers:

```txt
cache-status: "Netlify Durable"; hit
netlify-vary: cookie=__next_preview_data:presence|__prerender_bypass:presence
```

## Vercel comparison

The same repository deployed to Vercel:

```txt
https://netlify-next-first-user-cache-repro.vercel.app
```

RSC request as user A:

```txt
content-type: text/x-component
cache-control: private, no-cache, no-store, max-age=0, must-revalidate
x-vercel-cache: MISS
x-matched-path: /dashboard.rsc
body: User A
```

RSC request as user B:

```txt
content-type: text/x-component
cache-control: private, no-cache, no-store, max-age=0, must-revalidate
x-vercel-cache: MISS
x-matched-path: /dashboard.rsc
body: User B
```

Vercel does not leak because it does not store/share this user-specific RSC response.

## Root cause chain

1. `/dashboard` is a dynamic authenticated App Router route.
2. The app also has an App Router SSG catch-all route: `app/[...slug]/page.tsx`.
3. When Contentful/static generation fails, `generateStaticParams()` returns `[]`, but Next still reports `● /[...slug]`.
4. Netlify Runtime v4 writes `dynamicRoutes["/[...slug]"]` into the prerender manifest with route regex `^/(.+?)(?:/)?$`.
5. Netlify Runtime v4 registers this regex for the `rsc-data` edge function.
6. A browser client-side navigation to `/dashboard` sends an RSC request (`RSC: 1`, `?_rsc=...`).
7. The `rsc-data` edge function tests `/dashboard` against all dynamic SSG RSC matchers.
8. `/dashboard` matches the catch-all regex.
9. The RSC response for `/dashboard` contains user-specific dashboard data.
10. Because the response is cacheable in the bad Contentful-failure state, Netlify Durable Cache stores it.
11. Netlify varies the cached RSC response only on Next preview cookies, not on auth/session cookies.
12. Later users receive the first user's cached RSC payload.

## Why the issue is hard to reproduce manually

The leak appears on App Router RSC/Flight requests, not necessarily on the HTML document request.

A direct browser load of `/dashboard` may look correct:

```txt
/dashboard -> HTML document -> User B
```

But a client-side navigation from `/` to `/dashboard` can use:

```txt
/dashboard?_rsc=...
RSC: 1
```

That RSC payload may be cached and shared:

```txt
/dashboard?_rsc=... -> text/x-component -> User A
```

Therefore browser testing should inspect DevTools Network and filter for `_rsc` or `text/x-component` responses.

## Recommended issue title

```txt
Netlify Runtime v4 caches authenticated App Router RSC payload for dynamic route when SSG catch-all /[...slug] exists
```

Alternative:

```txt
App Router RSC request for ƒ route matches SSG catch-all and is cached without varying by auth cookie
```

## Suggested upstream fix direction

Netlify Runtime should avoid caching user-specific RSC payloads under a shared key. Possible fixes:

1. Do not let SSG catch-all RSC matchers intercept concrete dynamic App Router routes like `/dashboard`.
2. Do not Durable-cache RSC responses for routes that were rendered dynamically or that use cookies/headers.
3. Include auth-relevant request headers/cookies in `Netlify-Vary` for RSC responses, or bypass Durable Cache when `Cookie` / `Authorization` is present.
4. Respect Next.js dynamic route classification for RSC data routing, not only the SSG prerender manifest regex.

## Current repro state

The repo currently contains `app/[...slug]/page.tsx` restored for reproduction.

Expected failed-Contentful build output:

```txt
Route (app)
├ ● /[...slug]
├ ● /blog/[slug]
├   └ /blog/hello
└ ƒ /dashboard
```

Run:

```bash
SIMULATE_CONTENTFUL_FAILURE=1 npm run build
SIMULATE_CONTENTFUL_FAILURE=1 npx netlify build --offline
```

Then deploy to Netlify and reproduce via RSC/client-side navigation.
