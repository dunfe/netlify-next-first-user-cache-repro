export const dynamic = 'force-static'

export async function generateStaticParams() {
  // A tiny static route to make the build exercise static generation.
  // The prebuild script simulates the Contentful connectivity failure that makes the Netlify adapter/runtime enter
  // the bad state in the reported production issue.
  return [{ slug: 'hello' }]
}

export default async function BlogPost({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  return (
    <main style={{ fontFamily: 'sans-serif', padding: 32 }}>
      <h1>Blog: {slug}</h1>
      <p>This route represents Contentful-backed static blog generation.</p>
    </main>
  )
}
