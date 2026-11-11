import { FormEvent, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import BrandMark from '../components/BrandMark'

type LoginError =
  | 'unregistered'
  | 'pending'
  | 'declined'
  | 'invalid'
  | null

const ERROR_COPY: Record<Exclude<LoginError, null>, string> = {
  unregistered: 'Not a registered employee. Please sign up first.',
  pending: 'Your registration is awaiting HR approval.',
  declined: 'Your registration was not approved. Please contact HR.',
  invalid: 'Incorrect email or password.',
}

export default function LoginPage() {
  const navigate = useNavigate()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<LoginError>(null)
  const [loading, setLoading] = useState(false)

  function onSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    setLoading(true)
    window.setTimeout(() => {
      setLoading(false)
      if (!email.trim() || !password) {
        setError('invalid')
        return
      }
      sessionStorage.setItem(
        'bronee_session',
        JSON.stringify({ email: email.trim(), name: 'Employee' }),
      )
      navigate('/')
    }, 450)
  }

  return (
    <div className="flex min-h-dvh flex-col items-center justify-center px-4 py-10">
      <div className="w-full max-w-[400px]">
        <div className="mb-8">
          <BrandMark />
        </div>
        <div className="rounded-2xl border border-zinc-100 bg-white p-6 shadow-card sm:p-8">
          <h1 className="mb-6 text-center text-lg font-semibold text-ink">Sign in</h1>
          <form onSubmit={onSubmit} className="space-y-4" noValidate>
            <div>
              <label className="field-label" htmlFor="email">Official email</label>
              <input id="email" type="email" autoComplete="username" className="field-input" placeholder="name@bronee.com" value={email} onChange={(e) => setEmail(e.target.value)} required />
            </div>
            <div>
              <div className="mb-1.5 flex items-center justify-between">
                <label className="field-label !mb-0" htmlFor="password">Password</label>
                <Link to="/forgot-password" className="text-[12px] font-medium text-bronee-600 hover:text-bronee-700">Forgot password?</Link>
              </div>
              <input id="password" type="password" autoComplete="current-password" className="field-input" placeholder="Enter password" value={password} onChange={(e) => setPassword(e.target.value)} required />
            </div>
            {error && (<p className="rounded-lg bg-red-50 px-3 py-2 text-[13px] text-red-700" role="alert">{ERROR_COPY[error]}</p>)}
            <button type="submit" className="btn-primary" disabled={loading}>{loading ? 'Signing in…' : 'Login'}</button>
          </form>
          <div className="mt-6 border-t border-zinc-100 pt-5 text-center">
            <p className="text-[12px] text-ink-faint">New employee of BRONEE?</p>
            <Link to="/signup" className="mt-1 inline-block text-[14px] font-semibold text-bronee-600 hover:text-bronee-700">Create your employee account</Link>
          </div>
        </div>
        <p className="mt-6 text-center text-[11px] text-ink-faint">© {new Date().getFullYear()} BRONEE Limited</p>
      </div>
    </div>
  )
}
