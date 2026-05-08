import type { GetStaticPaths, GetStaticProps } from 'next'

type Props = {
  slug: string
}

export const getStaticPaths: GetStaticPaths = async () => {
  // No enumerated children in build output, but the route is still SSG via fallback blocking.
  return {
    paths: [],
    fallback: 'blocking',
  }
}

export const getStaticProps: GetStaticProps<Props> = async ({ params }) => {
  const slugParam = params?.slug
  const slug = Array.isArray(slugParam) ? slugParam.join('/') : String(slugParam || '')

  return {
    props: { slug },
    revalidate: 3600,
  }
}

export default function PagesCatchAll({ slug }: Props) {
  return (
    <main style={{ fontFamily: 'sans-serif', padding: 32 }}>
      <h1>Pages Router SSG catch-all: /{slug}</h1>
      <p>
        This page represents a Contentful-backed <code>pages/[...slug]</code> SSG route with fallback blocking.
      </p>
      <ul>
        <li>Route kind: Pages Router SSG catch-all</li>
        <li>Runtime slug: {slug}</li>
      </ul>
    </main>
  )
}
