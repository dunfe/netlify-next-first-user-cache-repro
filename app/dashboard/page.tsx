import { cookies, headers } from 'next/headers'
import { LoginForm } from '../LoginForm'

export const dynamic = 'force-dynamic'
export const revalidate = 0
export const fetchCache = 'force-no-store'

type User = {
  id: string
  label: string
}

async function getCurrentUser(): Promise<User> {
  const cookieStore = await cookies()
  const id = cookieStore.get('user')?.value || 'anonymous'
  return { id, label: `User ${id}` }
}

export default async function DashboardPage() {
  const userForHeader = await getCurrentUser()
  const userForDashboardData = await getCurrentUser()
  const h = await headers()

  return (
    <main style={{ fontFamily: 'sans-serif', padding: 32 }}>
      <h1>/dashboard dynamic SSR page</h1>

      <section style={{ padding: 16, border: '2px solid #2563eb', marginBottom: 16 }}>
        <h2>Header/auth area</h2>
        <p>
          Current cookie user: <strong id="header-user">{userForHeader.label}</strong>
        </p>
      </section>

      <section style={{ padding: 16, border: '2px solid #dc2626', marginBottom: 16 }}>
        <h2>Dashboard info area</h2>
        <p>
          Dashboard data owner: <strong id="dashboard-owner">{userForDashboardData.label}</strong>
        </p>
      </section>

      <section style={{ padding: 16, border: '1px solid #16a34a', marginBottom: 16 }}>
        <h2>Manual login</h2>
        <p>Use this to switch the <code>user</code> cookie without opening devtools.</p>
        <LoginForm initialUser={userForHeader.id === 'anonymous' ? '' : userForHeader.id} />
      </section>

      <section style={{ padding: 16, border: '1px solid #aaa' }}>
        <h2>Debug</h2>
        <ul>
          <li>Render time: {new Date().toISOString()}</li>
          <li>Cookie header seen by SSR: {h.get('cookie') || '(none)'}</li>
          <li>Deploy ID: {process.env.DEPLOY_ID || '(local)'}</li>
          <li>Commit ref: {process.env.COMMIT_REF || '(local)'}</li>
          <li>SIMULATE_CONTENTFUL_FAILURE: {process.env.SIMULATE_CONTENTFUL_FAILURE || '0'}</li>
        </ul>
      </section>
    </main>
  )
}
