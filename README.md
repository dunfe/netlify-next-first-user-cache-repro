# Netlify + Next.js first-user cache poisoning repro

Detailed root-cause report: [`docs/netlify-rsc-cache-root-cause.md`](docs/netlify-rsc-cache-root-cause.md)

This is a minimal project to reproduce the reported behavior:

- `/dashboard` is a dynamic App Router page (`ƒ`).
- It reads the current user from the `user` cookie on every SSR render.
- `app/[...slug]/page.tsx` is an App Router SSG catch-all route. When Contentful is healthy it renders generated child pages; when simulated Contentful connection fails, it still appears as `● /[...slug]` without child paths.
- A simulated Contentful build failure is enabled with `SIMULATE_CONTENTFUL_FAILURE=1`.
- When that flag is enabled, middleware adds a cacheable `Cache-Control` header to `/dashboard`.
- On Netlify, the Next adapter/runtime can promote that response to `Netlify-CDN-Cache-Control: ..., durable` while the default `Netlify-Vary` does **not** vary by auth cookie.
- Result: the first user to hit `/dashboard` after deploy can seed the cached dashboard response for later users.

This project is pinned to Next.js `14.2.35` and `@netlify/plugin-nextjs` `4.41.5` to test the older runtime where the issue was reported.

## Files of interest

- `app/dashboard/page.tsx`
  - dynamic page
  - reads `cookies()` and prints both current header user and dashboard data owner
- `app/[...slug]/page.tsx`
  - App Router SSG catch-all page, like a Contentful route mapper
  - when `SIMULATE_CONTENTFUL_FAILURE=0`, `generateStaticParams()` returns CMS-like child paths
  - when `SIMULATE_CONTENTFUL_FAILURE=1`, `generateStaticParams()` returns `[]`, so build output stays `● /[...slug]` without listed children
  - used to test whether `/[...slug]` causes `/dashboard` to be treated as SSG by Next/Netlify
- `middleware.ts`
  - only when `SIMULATE_CONTENTFUL_FAILURE=1`, adds cacheable response headers for `/dashboard`
  - this mimics the post-build bad state seen when Contentful static generation fails but the deploy still succeeds
- `scripts/simulate-contentful-build.js`
  - prebuild script that writes `.contentful-build-failed` when `SIMULATE_CONTENTFUL_FAILURE=1`
- `netlify.toml`
  - uses `@netlify/plugin-nextjs`

## Deploy to Netlify

Set environment variable in Netlify:

```bash
SIMULATE_CONTENTFUL_FAILURE=1
```

Then deploy:

```bash
npm install
npm run build
```

or with Netlify CLI:

```bash
netlify deploy --build --prod
```

## Reproduce with browser

After the deploy is live, test **client-side navigation**, not only direct hard-refresh document loads.

1. Open a fresh browser profile as user A.
2. Visit `/` first.
3. Set cookie for the site, then navigate through the Next `<Link>` to `/dashboard`:

```js
document.cookie = 'user=A; Path=/; SameSite=Lax'
location.href = '/'
// then click the /dashboard link, or run:
document.querySelector('a[href="/dashboard"]').click()
```

4. Open another browser/profile as user B.
5. Repeat from `/` with:

```js
document.cookie = 'user=B; Path=/; SameSite=Lax'
location.href = '/'
// then click the /dashboard link, or run:
document.querySelector('a[href="/dashboard"]').click()
```

Expected bad result on Netlify when the RSC/Durable cache is hit:

- User B request has `Cookie: user=B`.
- The browser RSC request for `/dashboard?_rsc=...` can return user A's RSC payload if A was first.
- Direct document requests to `/dashboard` may still look correct because the leak is in the App Router RSC/flight payload.
- If B is first after deploy, A later sees B.

## Reproduce with curl

Replace `SITE` with your Netlify URL.

First request as A:

```bash
SITE='https://YOUR-SITE.netlify.app'

curl -i "$SITE/dashboard" \
  -H 'Cookie: user=A' \
  -H 'Accept: text/html' \
  | tee /tmp/a.html
```

Second request as B:

```bash
curl -i "$SITE/dashboard" \
  -H 'Cookie: user=B' \
  -H 'Accept: text/html' \
  | tee /tmp/b.html
```

Inspect headers:

```bash
grep -iE 'cache-control|netlify-cdn-cache-control|netlify-vary|cache-status|age|x-repro|x-nf-request-id' /tmp/a.html /tmp/b.html
```

Inspect body:

```bash
grep -oE 'User [A-Z]|Cookie header seen by SSR: [^<]+' /tmp/a.html /tmp/b.html
```

Also test RSC/flight requests from browser DevTools; in real App Router navigations the poisoned response may be the RSC payload rather than the document HTML.

Manual RSC smoke test:

```bash
curl -i "$SITE/dashboard?_rsc=repro" \
  -H 'Cookie: user=A' \
  -H 'RSC: 1' \
  -H 'Next-Url: /' \
  -H 'Next-Router-State-Tree: %5B%22%22%2C%7B%22children%22%3A%5B%22__PAGE__%22%2C%7B%7D%5D%7D%2Cnull%2Cnull%2Ctrue%5D' \
  | tee /tmp/a-rsc.txt

curl -i "$SITE/dashboard?_rsc=repro" \
  -H 'Cookie: user=B' \
  -H 'RSC: 1' \
  -H 'Next-Url: /' \
  -H 'Next-Router-State-Tree: %5B%22%22%2C%7B%22children%22%3A%5B%22__PAGE__%22%2C%7B%7D%5D%7D%2Cnull%2Cnull%2Ctrue%5D' \
  | tee /tmp/b-rsc.txt
```

Smoking gun if B's RSC response contains `User A` and headers show:

```txt
content-type: text/x-component
cache-status: "Netlify Durable"; hit
netlify-vary: cookie=__next_preview_data:presence|__prerender_bypass:presence
```

## Expected smoking-gun headers

Look for:

```txt
Netlify-CDN-Cache-Control: ... durable
Netlify-Vary: query=__nextDataReq|_rsc,header=...|rsc,cookie=__prerender_bypass|__next_preview_data
Cache-Status: "Netlify Durable"; hit
```

The important part is that `Netlify-Vary` does not include `Cookie` or your auth cookie name.

## Adapter source paths to inspect

In generated Netlify Runtime v4 output, the RSC edge function is the important path:

- `.netlify/edge-functions/edge-shared/prerender-manifest.json`
  - On simulated CTF failure, it contains `dynamicRoutes["/[...slug]"].routeRegex = "^/(.+?)(?:/)?$"`.
  - It does **not** contain an explicit `/dashboard` prerender entry.
- `.netlify/edge-functions/edge-shared/rsc-data.ts`
  - `matchesRscRoute()` checks static routes OR dynamic SSG routes from the prerender manifest.
  - For `RSC: 1`, if the URL pathname matches the catch-all regex, it rewrites `/dashboard` to `/dashboard.rsc`.
  - That means client navigation to concrete dynamic `ƒ /dashboard` can be intercepted by the SSG catch-all RSC data router.

In `opennextjs-netlify`:

- `src/run/handlers/server.ts`
  - calls `setCacheControlHeaders`, `setVaryHeaders`, `setCacheStatusHeader`
- `src/run/headers.ts`
  - `setCacheControlHeaders()` promotes cacheable Next responses to `netlify-cdn-cache-control` and appends `durable`
  - `setVaryHeaders()` defaults to only preview cookies:
    - `__prerender_bypass`
    - `__next_preview_data`

This combination is what makes a first authenticated request cacheable for later authenticated requests when a dynamic/user-specific response is accidentally considered cacheable.

## Turn off the simulated build failure

Set:

```bash
SIMULATE_CONTENTFUL_FAILURE=0
```

or remove the env var and redeploy. The middleware stops adding cacheable headers to `/dashboard`.
