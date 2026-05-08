export const dynamic = 'force-static'
export const dynamicParams = true

export async function generateStaticParams() {
  // Catch-all SSG route to mimic production setups where Contentful pages are rendered from /[...slug].
  // Intentionally includes ['dashboard'] as a "shadow" CMS slug candidate so we can test whether
  // the Netlify/Next runtime ever lets this static catch-all influence the concrete /dashboard route.
  return [
    { slug: ['dashboard'] },
    { slug: ['contentful', 'hello'] },
    { slug: ['marketing', 'landing'] },
  ]
}

export default async function CatchAllPage({ params }: { params: { slug: string[] } }) {
  const slug = params.slug.join('/')

  return (
    <main style={{ fontFamily: 'sans-serif', padding: 32 }}>
      <h1>SSG catch-all route: /{slug}</h1>
      <p>
        This page represents a Contentful-backed <code>/[...slug]</code> static route.
      </p>
      <p>
        If <code>/dashboard</code> ever serves this page, or if the build output changes
        <code> /dashboard</code> from <code>ƒ</code> to static/SSG, that is evidence that the
        catch-all route is shadowing or poisoning the dashboard route classification.
      </p>
      <ul>
        <li>Route kind: SSG catch-all</li>
        <li>Generated slug: {slug}</li>
        <li>Build failure flag: {process.env.SIMULATE_CONTENTFUL_FAILURE || '0'}</li>
      </ul>
    </main>
  )
}
