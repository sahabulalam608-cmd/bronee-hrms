import { FormEvent, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import BrandMark from '../components/BrandMark'
import { DEPARTMENTS } from '../lib/departments'

type Step = 'form' | 'otp' | 'done'

export default function SignupPage() {
  const [step, setStep] = useState<Step>('form')
  const [loading, setLoading] = useState(false)
  const [otp, setOtp] = useState('')
  const [error, setError] = useState('')
  const [fullName, setFullName] = useState('')
  const [mobile, setMobile] = useState('')
  const [employeeId, setEmployeeId] = useState('')
  const [designation, setDesignation] = useState('')
  const [email, setEmail] = useState('')
  const [departmentId, setDepartmentId] = useState('')
  const [subDepartmentId, setSubDepartmentId] = useState('')
  const [manager, setManager] = useState('')
  const [joiningDate, setJoiningDate] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')

  const selectedDept = useMemo(() => DEPARTMENTS.find((d) => d.id === departmentId), [departmentId])
  const needsSub = selectedDept?.type === 'parent'

  function onDeptChange(id: string) {
    setDepartmentId(id)
    setSubDepartmentId('')
  }

  function validateForm(): string | null {
    if (!fullName.trim()) return 'Full name is required.'
    if (!mobile.trim()) return 'Mobile number is required.'
    if (!employeeId.trim()) return 'Employee ID is required.'
    if (!designation.trim()) return 'Designation is required.'
    if (!email.trim()) return 'Official email is required.'
    if (!departmentId) return 'Department is required.'
    if (needsSub && !subDepartmentId) return 'Sub-department is required for Sales Team.'
    if (!joiningDate) return 'Joining date is required.'
    if (password.length < 8) return 'Password must be at least 8 characters.'
    if (password !== confirmPassword) return 'Passwords do not match.'
    return null
  }

  function onFormSubmit(e: FormEvent) {
    e.preventDefault()
    setError('')
    const err = validateForm()
    if (err) { setError(err); return }
    setLoading(true)
    window.setTimeout(() => { setLoading(false); setStep('otp') }, 500)
  }

  function onOtpSubmit(e: FormEvent) {
    e.preventDefault()
    setError('')
    if (otp.trim().length < 4) { setError('Enter the OTP sent to your email.'); return }
    setLoading(true)
    window.setTimeout(() => { setLoading(false); setStep('done') }, 500)
  }

  return (
    <div className="flex min-h-dvh flex-col items-center px-4 py-8 sm:py-12">
      <div className="w-full max-w-[480px]">
        <div className="mb-6"><BrandMark size="sm" /></div>
        <div className="rounded-2xl border border-zinc-100 bg-white p-5 shadow-card sm:p-8">
          {step === 'done' ? (
            <div className="space-y-4 text-center">
              <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-emerald-50 text-xl font-bold text-emerald-600">✓</div>
              <h1 className="text-lg font-semibold text-ink">Registration submitted</h1>
              <p className="text-[14px] leading-relaxed text-ink-muted">Your account is pending HR approval. You will receive an email when it is activated. You cannot sign in until then.</p>
              <Link to="/login" className="btn-primary">Back to login</Link>
            </div>
          ) : step === 'otp' ? (
            <>
              <h1 className="mb-1 text-lg font-semibold text-ink">Verify email</h1>
              <p className="mb-5 text-[13px] text-ink-muted">Enter the OTP sent to <span className="font-medium text-ink">{email}</span></p>
              <form onSubmit={onOtpSubmit} className="space-y-4">
                <div>
                  <label className="field-label" htmlFor="otp">Gmail OTP</label>
                  <input id="otp" inputMode="numeric" autoComplete="one-time-code" className="field-input tracking-widest" placeholder="Enter OTP" value={otp} onChange={(e) => setOtp(e.target.value)} required />
                </div>
                {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-[13px] text-red-700">{error}</p>}
                <button type="submit" className="btn-primary" disabled={loading}>{loading ? 'Verifying…' : 'Verify & submit registration'}</button>
                <button type="button" className="btn-ghost" onClick={() => setStep('form')} disabled={loading}>Back to form</button>
              </form>
            </>
          ) : (
            <>
              <h1 className="mb-1 text-lg font-semibold text-ink">Create employee account</h1>
              <p className="mb-5 text-[13px] text-ink-muted">Fill in your details. HR will review before you can log in.</p>
              <form onSubmit={onFormSubmit} className="space-y-3.5" noValidate>
                <div className="grid gap-3.5 sm:grid-cols-2">
                  <div className="sm:col-span-2">
                    <label className="field-label" htmlFor="fullName">Full name *</label>
                    <input id="fullName" className="field-input" value={fullName} onChange={(e) => setFullName(e.target.value)} required />
                  </div>
                  <div>
                    <label className="field-label" htmlFor="mobile">Mobile number *</label>
                    <input id="mobile" type="tel" className="field-input" placeholder="01XXXXXXXXX" value={mobile} onChange={(e) => setMobile(e.target.value)} required />
                  </div>
                  <div>
                    <label className="field-label" htmlFor="employeeId">Employee ID *</label>
                    <input id="employeeId" className="field-input" value={employeeId} onChange={(e) => setEmployeeId(e.target.value)} required />
                  </div>
                  <div>
                    <label className="field-label" htmlFor="designation">Designation *</label>
                    <input id="designation" className="field-input" placeholder="e.g. Sales Executive" value={designation} onChange={(e) => setDesignation(e.target.value)} required />
                  </div>
                  <div>
                    <label className="field-label" htmlFor="email">Official email *</label>
                    <input id="email" type="email" className="field-input" value={email} onChange={(e) => setEmail(e.target.value)} required />
                  </div>
                  <div>
                    <label className="field-label" htmlFor="department">Department *</label>
                    <select id="department" className="field-select" value={departmentId} onChange={(e) => onDeptChange(e.target.value)} required>
                      <option value="">Select department</option>
                      {DEPARTMENTS.map((d) => (<option key={d.id} value={d.id}>{d.name}</option>))}
                    </select>
                  </div>
                  {needsSub && (
                    <div>
                      <label className="field-label" htmlFor="subDept">Sub-department *</label>
                      <select id="subDept" className="field-select" value={subDepartmentId} onChange={(e) => setSubDepartmentId(e.target.value)} required>
                        <option value="">Select sub-department</option>
                        {selectedDept?.subDepartments?.map((s) => (<option key={s.id} value={s.id}>{s.name}</option>))}
                      </select>
                    </div>
                  )}
                  <div>
                    <label className="field-label" htmlFor="manager">Reporting manager</label>
                    <input id="manager" className="field-input" placeholder="Optional" value={manager} onChange={(e) => setManager(e.target.value)} />
                  </div>
                  <div>
                    <label className="field-label" htmlFor="joining">Joining date *</label>
                    <input id="joining" type="date" className="field-input" value={joiningDate} onChange={(e) => setJoiningDate(e.target.value)} required />
                  </div>
                  <div>
                    <label className="field-label" htmlFor="password">Password *</label>
                    <input id="password" type="password" className="field-input" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={8} />
                  </div>
                  <div>
                    <label className="field-label" htmlFor="confirm">Confirm password *</label>
                    <input id="confirm" type="password" className="field-input" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} required />
                  </div>
                </div>
                {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-[13px] text-red-700">{error}</p>}
                <button type="submit" className="btn-primary mt-1" disabled={loading}>{loading ? 'Please wait…' : 'Continue to email verification'}</button>
              </form>
              <p className="mt-5 text-center text-[13px] text-ink-muted">Already have an account? <Link to="/login" className="font-semibold text-bronee-600">Sign in</Link></p>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
