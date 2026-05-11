import Link from 'next/link'
import { LoginForm } from './LoginForm'

export default function Home() {
  return (
    <main style={{ fontFamily: 'sans-serif', padding: 32 }}>
      <h1>Netlify Next first-user cache poisoning repro</h1>
      <p>
        Type a user name below and click the login button. The form sets the <code>user</code> cookie, then navigates to{' '}
        <Link href="/dashboard">/dashboard</Link> so you can reproduce the issue without browser devtools.
      </p>

      <LoginForm />

      <p>
        The page is dynamic (<code>ƒ</code>) and reads the current cookie for both header and dashboard data. The repro
        intentionally emits cacheable CDN headers only when the simulated Contentful build failure marker exists.
      </p>
    </main>
  )
}
