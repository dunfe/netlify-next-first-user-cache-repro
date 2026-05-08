export const revalidate = 3600

export async function generateStaticParams() {
  // This mimics a Contentful catch-all route.
  // - CTF good: build has concrete generated children under ● /[...slug]
  // - CTF failed: build still classifies the catch-all as SSG (● /[...slug]) but has no children
  if (process.env.SIMULATE_CONTENTFUL_FAILURE === '1') {
    return []
  }

  return [
    { slug: ['contentful', 'hello'] },
    { slug: ['marketing', 'landing'] },
  ]
}

export default function CatchAllPage({ params }: { params: { slug: string[] } }) {
  const slug = params.slug.join('/')

  return (
    <main style={{ fontFamily: 'sans-serif', padding: 32 }}>
      <h1>App Router SSG catch-all: /{slug}</h1>
      <p>
        This page represents a Contentful-backed <code>app/[...slug]</code> SSG route.
      </p>
      <p>
        When <code>SIMULATE_CONTENTFUL_FAILURE=1</code>, <code>generateStaticParams()</code>
        returns an empty array. Next.js still reports the route as <code>● /[...slug]</code>,
        but there are no listed child paths.
      </p>
      <ul>
        <li>Route kind: App Router SSG catch-all</li>
        <li>Runtime slug: {slug}</li>
        <li>Build failure flag: {process.env.SIMULATE_CONTENTFUL_FAILURE || '0'}</li>
      </ul>
    </main>
  )
}
