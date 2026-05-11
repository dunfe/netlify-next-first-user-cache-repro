'use client'

import { useState, type FormEvent } from 'react'
import { useRouter } from 'next/navigation'

type LoginFormProps = {
  initialUser?: string
}

export function LoginForm({ initialUser = '' }: LoginFormProps) {
  const router = useRouter()
  const [user, setUser] = useState(initialUser)

  function login(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()

    const normalizedUser = user.trim()
    if (!normalizedUser) {
      return
    }

    document.cookie = `user=${encodeURIComponent(normalizedUser)}; Path=/; Max-Age=31536000; SameSite=Lax`
    router.push('/dashboard')
  }

  return (
    <form
      onSubmit={login}
      style={{
        display: 'flex',
        flexWrap: 'wrap',
        gap: 8,
        alignItems: 'center',
        padding: 16,
        border: '1px solid #ccc',
        borderRadius: 8,
        margin: '16px 0',
      }}
    >
      <label htmlFor="user-name" style={{ fontWeight: 700 }}>
        User name
      </label>
      <input
        id="user-name"
        name="user"
        value={user}
        onChange={(event) => setUser(event.target.value)}
        placeholder="A, B, Alice, Bob..."
        autoComplete="off"
        style={{ minWidth: 220, padding: '8px 10px' }}
      />
      <button type="submit" disabled={!user.trim()} style={{ padding: '8px 12px', cursor: user.trim() ? 'pointer' : 'not-allowed' }}>
        Login as user
      </button>
    </form>
  )
}
