import { NextResponse, type NextRequest } from 'next/server'

export function proxy(request: NextRequest) {
  const response = NextResponse.next()

  // This simulates the bad post-build state: Contentful static generation failed, build still passed,
  // and the dynamic dashboard response now carries cacheable headers.
  // Netlify adapter's src/run/headers.ts will promote this Cache-Control into Netlify-CDN-Cache-Control + durable
  // unless the response already has CDN-specific headers.
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

  return response
}

export const config = {
  matcher: ['/dashboard/:path*'],
}
