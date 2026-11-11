import { NavLink, Outlet, useNavigate } from 'react-router-dom'
import { useEffect, useState } from 'react'

const NAV = [
  { to: '/', label: 'Home', icon: '⌂' },
  { to: '/attendance', label: 'Time', icon: '◷' },
  { to: '/tasks', label: 'Tasks', icon: '☑' },
  { to: '/leave', label: 'Leave', icon: '✈' },
  { to: '/profile', label: 'Profile', icon: '◎' },
]

const SIDE = [
  { to: '/', label: 'Dashboard' },
  { to: '/attendance', label: 'Attendance' },
  { to: '/roster', label: 'Roster' },
  { to: '/tasks', label: 'My Tasks' },
  { to: '/leave', label: 'Leave' },
  { to: '/overtime', label: 'Overtime' },
  { to: '/salary', label: 'My Salary' },
  { to: '/notifications', label: 'Notifications' },
  { to: '/profile', label: 'My Profile' },
]

export default function EmployeeShell() {
  const navigate = useNavigate()
  const [name, setName] = useState('Employee')

  useEffect(() => {
    const raw = sessionStorage.getItem('bronee_session')
    if (!raw) {
      navigate('/login', { replace: true })
      return
    }
    try {
      const s = JSON.parse(raw) as { name?: string }
      if (s.name) setName(s.name)
    } catch {
      navigate('/login', { replace: true })
    }
  }, [navigate])

  function logout() {
    sessionStorage.removeItem('bronee_session')
    navigate('/login', { replace: true })
  }

  return (
    <div className="min-h-dvh bg-surface-soft">
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-56 flex-col border-r border-zinc-100 bg-white lg:flex">
        <div className="flex items-center gap-2.5 border-b border-zinc-100 px-4 py-4">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-bronee-600 text-sm font-bold text-white">B</div>
          <div>
            <div className="text-[13px] font-semibold text-ink">BRONEE HRMS</div>
            <div className="text-[11px] text-ink-muted">Employee</div>
          </div>
        </div>
        <nav className="flex-1 space-y-0.5 p-2">
          {SIDE.map((item) => (
            <NavLink key={item.to} to={item.to} end={item.to === '/'} className={({ isActive }) => `block rounded-lg px-3 py-2.5 text-[13px] font-medium transition ${isActive ? 'bg-bronee-50 text-bronee-700' : 'text-ink-soft hover:bg-zinc-50'}`}>
              {item.label}
            </NavLink>
          ))}
        </nav>
        <div className="border-t border-zinc-100 p-3">
          <button type="button" onClick={logout} className="w-full rounded-lg px-3 py-2 text-left text-[13px] font-medium text-ink-muted hover:bg-zinc-50">Log out</button>
        </div>
      </aside>
      <div className="lg:pl-56">
        <header className="sticky top-0 z-20 border-b border-zinc-100 bg-white/90 backdrop-blur">
          <div className="flex items-center justify-between px-4 py-3 sm:px-6">
            <div>
              <div className="text-[15px] font-semibold text-ink">Hi, {name}</div>
              <div className="text-[12px] text-ink-muted">Employee portal</div>
            </div>
            <NavLink to="/notifications" className="rounded-full border border-zinc-200 px-3 py-1.5 text-[12px] font-medium text-ink-soft">Alerts</NavLink>
          </div>
        </header>
        <main className="px-4 py-5 pb-24 sm:px-6 lg:pb-8">
          <Outlet />
        </main>
      </div>
      <nav className="fixed bottom-0 left-0 right-0 z-30 border-t border-zinc-100 bg-white/95 backdrop-blur lg:hidden">
        <div className="mx-auto flex max-w-lg items-stretch justify-around px-1 pb-[env(safe-area-inset-bottom)]">
          {NAV.map((item) => (
            <NavLink key={item.to} to={item.to} end={item.to === '/'} className={({ isActive }) => `flex min-w-0 flex-1 flex-col items-center gap-0.5 py-2 text-[10px] font-medium ${isActive ? 'text-bronee-600' : 'text-ink-faint'}`}>
              <span className="text-base leading-none">{item.icon}</span>
              {item.label}
            </NavLink>
          ))}
        </div>
      </nav>
    </div>
  )
}
