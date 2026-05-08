import Link from 'next/link'

export default function Home() {
  return (
    <main style={{ fontFamily: 'sans-serif', padding: 32 }}>
      <h1>Netlify Next first-user cache poisoning repro</h1>
      <p>
        Open <Link href="/dashboard">/dashboard</Link> with different <code>user</code> cookies after a deploy built with
        <code> SIMULATE_CONTENTFUL_FAILURE=1</code>.
      </p>
      <p>
        The page is dynamic (<code>ƒ</code>) and reads the current cookie for both header and dashboard data. The repro
        intentionally emits cacheable CDN headers only when the simulated Contentful build failure marker exists.
      </p>
    </main>
  )
}
