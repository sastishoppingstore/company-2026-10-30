import { useEffect, useMemo, useState } from 'react'
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom'
import {
  Bell, ChevronDown, LayoutDashboard, LogOut, MapPin, Package, Plus, Settings, ShieldCheck,
  Store, Truck, UserCog, Radio,
} from 'lucide-react'
import { useAuth } from '../state/AuthContext'
import { api, onApiEvent } from '../lib/api'
import { initials } from '../lib/format'
import { Badge, Button } from './ui'

interface NavItem {
  to: string
  label: string
  icon: typeof LayoutDashboard
}

function navFor(role?: string): NavItem[] {
  if (role === 'driver') {
    return [
      { to: '/driver', label: 'Jobs', icon: Truck },
      { to: '/notifications', label: 'Alerts', icon: Bell },
      { to: '/profile', label: 'Profile', icon: UserCog },
    ]
  }
  if (role === 'admin') {
    return [
      { to: '/admin', label: 'Console', icon: ShieldCheck },
      { to: '/notifications', label: 'Alerts', icon: Bell },
      { to: '/profile', label: 'Profile', icon: UserCog },
    ]
  }
  return [
    { to: '/', label: 'Dashboard', icon: LayoutDashboard },
    { to: '/orders', label: 'Orders', icon: Package },
    { to: '/shops', label: 'Shops', icon: Store },
    { to: '/notifications', label: 'Alerts', icon: Bell },
    { to: '/profile', label: 'Profile', icon: UserCog },
  ]
}

export function AppShell() {
  const { user, company, logout } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const [unread, setUnread] = useState(0)
  const [menuOpen, setMenuOpen] = useState(false)
  const [live, setLive] = useState(true)
  const items = useMemo(() => navFor(user?.role), [user?.role])

  useEffect(() => {
    let cancelled = false
    const load = async () => {
      try {
        const data = await api.get<{ unread: number }>('/notifications')
        if (!cancelled) setUnread(data.unread)
      } catch {
        /* ignore transient errors */
      }
    }
    void load()
    const timer = window.setInterval(load, 30000)
    const off = onApiEvent(() => { void load() })
    return () => { cancelled = true; window.clearInterval(timer); off() }
  }, [location.pathname])

  useEffect(() => {
    const off = onApiEvent(() => setLive(true))
    const timer = window.setTimeout(() => setLive(false), 12000)
    return () => { off(); window.clearTimeout(timer) }
  }, [])

  const handleLogout = async () => {
    await logout()
    navigate('/login', { replace: true })
  }

  const roleLabel = user?.role === 'admin' ? 'Super Admin' : user?.role === 'driver' ? 'Driver' : 'Company user'

  return (
    <div className="min-h-screen bg-canvas">
      {/* ---------------------------------------------------- desktop sidebar */}
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-[264px] flex-col border-r border-navy-800/60 bg-navy-950 md:flex">
        <div className="flex items-center gap-3 px-6 pb-5 pt-6">
          <span className="grid h-10 w-10 place-items-center rounded-xl bg-brand-600 text-sm font-extrabold text-white shadow-[0_8px_20px_-10px_rgba(46,107,255,0.9)]">
            RNA
          </span>
          <div>
            <p className="font-display text-[15px] font-extrabold leading-none text-white">RNA Ship</p>
            <p className="mt-1 text-[11px] font-medium text-navy-300">Shipment desk</p>
          </div>
        </div>

        {user?.role !== 'driver' && user?.role !== 'admin' ? (
          <div className="px-4 pb-4">
            <Button icon={Plus} variant="accent" className="w-full" onClick={() => navigate('/orders/new')}>
              New delivery
            </Button>
          </div>
        ) : null}

        <nav className="flex-1 space-y-1 px-3">
          {items.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.to === '/' || item.to === '/driver' || item.to === '/admin'}
              className={({ isActive }) =>
                `flex items-center gap-3 rounded-xl px-3.5 py-2.5 text-sm font-semibold transition ${
                  isActive ? 'bg-white/10 text-white' : 'text-navy-300 hover:bg-white/5 hover:text-white'
                }`
              }
            >
              <item.icon size={17} />
              {item.label}
            </NavLink>
          ))}
        </nav>

        <div className="border-t border-white/10 p-4">
          <div className="flex items-center gap-3 rounded-xl bg-white/5 px-3 py-2.5">
            <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-brand-500 text-xs font-bold text-white">
              {initials(user?.name ?? 'RN')}
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-[13px] font-semibold text-white">{user?.name}</p>
              <p className="truncate text-[11px] text-navy-300">{company?.name ?? roleLabel}</p>
            </div>
            <button onClick={handleLogout} aria-label="Sign out" className="rounded-lg p-1.5 text-navy-300 transition hover:bg-white/10 hover:text-white">
              <LogOut size={16} />
            </button>
          </div>
          <p className="mt-3 flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-amber-400/90">
            <Radio size={11} /> Demo environment · OTP test mode
          </p>
        </div>
      </aside>

      {/* ------------------------------------------------------------ top bar */}
      <header className="sticky top-0 z-20 border-b border-hairline bg-white/85 backdrop-blur-md md:pl-[264px]">
        <div className="mx-auto flex h-16 max-w-[1400px] items-center justify-between gap-3 px-4 md:px-8">
          <div className="flex min-w-0 items-center gap-3">
            <span className="grid h-9 w-9 place-items-center rounded-xl bg-navy-950 text-[11px] font-extrabold text-white md:hidden">
              RNA
            </span>
            <div className="min-w-0">
              <p className="truncate text-[13px] font-semibold text-navy-900">{company?.name ?? 'RNA Ship'}</p>
              <p className="truncate text-[11px] text-slate-500">{roleLabel} · {user?.email}</p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <span className={`hidden items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold sm:inline-flex ${live ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-500'}`}>
              <span className={`h-1.5 w-1.5 rounded-full ${live ? 'bg-emerald-500' : 'bg-slate-400'}`} />
              {live ? 'Live' : 'Idle'}
            </span>
            <button
              onClick={() => navigate('/notifications')}
              aria-label="Notifications"
              className="relative grid h-10 w-10 place-items-center rounded-xl border border-hairline bg-white text-navy-600 transition hover:border-navy-300"
            >
              <Bell size={17} />
              {unread > 0 ? (
                <span className="absolute -right-1 -top-1 grid h-5 min-w-5 place-items-center rounded-full bg-rose-500 px-1 text-[10px] font-bold text-white">
                  {unread > 9 ? '9+' : unread}
                </span>
              ) : null}
            </button>
            <div className="relative">
              <button
                onClick={() => setMenuOpen((open) => !open)}
                className="flex items-center gap-2 rounded-xl border border-hairline bg-white py-1.5 pl-1.5 pr-2.5 transition hover:border-navy-300"
              >
                <span className="grid h-7 w-7 place-items-center rounded-lg bg-navy-900 text-[10px] font-bold text-white">
                  {initials(user?.name ?? 'RN')}
                </span>
                <ChevronDown size={14} className="text-slate-400" />
              </button>
              {menuOpen ? (
                <>
                  <div className="fixed inset-0 z-10" onClick={() => setMenuOpen(false)} />
                  <div className="absolute right-0 z-20 mt-2 w-56 overflow-hidden rounded-xl border border-hairline bg-white shadow-[var(--shadow-lift)]">
                    <div className="border-b border-hairline px-4 py-3">
                      <p className="text-sm font-bold text-navy-900">{user?.name}</p>
                      <p className="truncate text-[11px] text-slate-500">{user?.email}</p>
                    </div>
                    <button onClick={() => { setMenuOpen(false); navigate('/profile') }} className="flex w-full items-center gap-2.5 px-4 py-2.5 text-sm font-medium text-navy-700 transition hover:bg-navy-50">
                      <Settings size={15} /> Account settings
                    </button>
                    <button onClick={handleLogout} className="flex w-full items-center gap-2.5 px-4 py-2.5 text-sm font-medium text-rose-600 transition hover:bg-rose-50">
                      <LogOut size={15} /> Sign out
                    </button>
                  </div>
                </>
              ) : null}
            </div>
          </div>
        </div>
      </header>

      {/* --------------------------------------------------------------- main */}
      <main className="px-4 pb-28 pt-5 md:px-8 md:pb-12 md:pl-[296px]">
        <div className="mx-auto max-w-[1400px]">
          <Outlet />
        </div>
      </main>

      {/* ------------------------------------------------------ mobile tabbar */}
      <nav className="fixed inset-x-0 bottom-0 z-30 border-t border-hairline bg-white/95 backdrop-blur-md md:hidden">
        <div className="flex items-stretch justify-around px-2 pb-[max(env(safe-area-inset-bottom),6px)] pt-1.5">
          {items.slice(0, 2).map((item) => (
            <TabLink key={item.to} item={item} end={item.to === '/'} />
          ))}
          {user?.role !== 'driver' && user?.role !== 'admin' ? (
            <button
              onClick={() => navigate('/orders/new')}
              className="-mt-6 grid h-14 w-14 shrink-0 place-items-center self-start rounded-2xl bg-navy-900 text-white shadow-[0_10px_24px_-10px_rgba(8,21,43,0.9)]"
              aria-label="New delivery"
            >
              <Plus size={24} />
            </button>
          ) : null}
          {items.slice(2).map((item) => (
            <TabLink key={item.to} item={item} end={item.to === '/'} />
          ))}
        </div>
      </nav>
    </div>
  )
}

function TabLink({ item, end }: { item: NavItem; end?: boolean }) {
  return (
    <NavLink
      to={item.to}
      end={end}
      className={({ isActive }) =>
        `flex flex-1 flex-col items-center gap-1 rounded-lg px-1 py-1.5 text-[10px] font-semibold transition ${
          isActive ? 'text-brand-600' : 'text-slate-400'
        }`
      }
    >
      <item.icon size={19} />
      {item.label}
    </NavLink>
  )
}

export function ShopCodeChip({ code }: { code: string }) {
  return (
    <Badge tone="info" className="font-mono">
      <MapPin size={11} /> {code}
    </Badge>
  )
}
