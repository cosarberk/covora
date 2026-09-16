/**
 * @module studio/components/Login
 *
 * Giriş ekranı. E-posta + parola ile JWT alır; başarılı olunca `onLogin`
 * tetiklenir.
 */

import type { User } from '@covora/types'
import { useState } from 'react'

import type { StudioApi } from '../api/client.js'

/** {@link Login} props. */
export interface LoginProps {
  readonly api: StudioApi
  readonly onLogin: (user: User) => void
}

/**
 * Giriş formu.
 *
 * @param props - API ve giriş sonrası geri çağırım.
 */
export const Login = ({ api, onLogin }: LoginProps): React.JSX.Element => {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const submit = async (event: React.FormEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault()
    if (email.trim().length === 0 || password.length === 0) {
      return
    }
    setBusy(true)
    setError(null)
    try {
      onLogin(await api.login(email.trim(), password))
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Giriş başarısız')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="login">
      <form className="login__card" onSubmit={(event) => void submit(event)}>
        <h1 className="brand login__brand">
          Covora <span className="brand__accent">Studio</span>
        </h1>
        <p className="login__hint">Devam etmek için giriş yapın.</p>
        <input
          className="input login__input"
          type="email"
          placeholder="e-posta"
          autoComplete="username"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
        />
        <input
          className="input login__input"
          type="password"
          placeholder="parola"
          autoComplete="current-password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
        />
        {error !== null && <div className="state state--error">{error}</div>}
        <button className="button login__submit" type="submit" disabled={busy}>
          {busy ? 'Giriş yapılıyor…' : 'Giriş Yap'}
        </button>
      </form>
    </div>
  )
}
