import { FormEvent, useState } from 'react'
import { Link } from 'react-router-dom'
import BrandMark from '../components/BrandMark'

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('')
  const [sent, setSent] = useState(false)
  const [loading, setLoading] = useState(false)

  function onSubmit(e: FormEvent) {
    e.preventDefault()
    setLoading(true)
    window.setTimeout(() => {
      setLoading(false)
      setSent(true)
    }, 500)
  }

  return (
    <div className="flex min-h-dvh flex-col items-center justify-center px-4 py-10">
      <div className="w-full max-w-[400px]">
        <div className="mb-8"><BrandMark size="sm" /></div>
        <div className="rounded-2xl border border-zinc-100 bg-white p-6 shadow-card sm:p-8">
          <h1 className="mb-2 text-center text-lg font-semibold text-ink">Reset password</h1>
          <p className="mb-6 text-center text-[13px] text-ink-muted">Enter your official email. We will send a verification link.</p>
          {sent ? (
            <div className="space-y-4 text-center">
              <p className="rounded-lg bg-emerald-50 px-3 py-3 text-[13px] text-emerald-800">If this email is registered, a reset link has been sent.</p>
              <Link to="/login" className="btn-ghost">Back to login</Link>
            </div>
          ) : (
            <form onSubmit={onSubmit} className="space-y-4">
              <div>
                <label className="field-label" htmlFor="email">Official email</label>
                <input id="email" type="email" className="field-input" placeholder="name@bronee.com" value={email} onChange={(e) => setEmail(e.target.value)} required />
              </div>
              <button type="submit" className="btn-primary" disabled={loading}>{loading ? 'Sending…' : 'Send reset link'}</button>
              <Link to="/login" className="btn-ghost">Back to login</Link>
            </form>
          )}
        </div>
      </div>
    </div>
  )
}
