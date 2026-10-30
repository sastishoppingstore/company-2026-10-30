import { useEffect, useState, type ReactNode } from 'react'
import { BrowserRouter, Navigate, Route, Routes, useLocation } from 'react-router-dom'
import { Truck } from 'lucide-react'
import { AuthProvider, useAuth } from './state/AuthContext'
import { ToastProvider } from './components/ui'
import { AppShell } from './components/AppShell'
import { Login } from './pages/Login'
import { ResetPassword } from './pages/ResetPassword'
import { Dashboard } from './pages/Dashboard'
import { CreateOrder } from './pages/CreateOrder'
import { Shops } from './pages/Shops'
import { ShopDetail } from './pages/ShopDetail'
import { Orders } from './pages/Orders'
import { OrderDetail } from './pages/OrderDetail'
import { OrderTracking } from './pages/OrderTracking'
import { ProofViewer } from './pages/ProofViewer'
import { Notifications } from './pages/Notifications'
import { Profile } from './pages/Profile'
import { PublicProof } from './pages/PublicProof'
import { NotFound } from './pages/NotFound'
import { DriverHome } from './pages/driver/DriverHome'
import { DriverJob } from './pages/driver/DriverJob'
import { AdminConsole } from './pages/admin/AdminConsole'

function Splash({ ready }: { ready: boolean }) {
  const [visible, setVisible] = useState(true)

  useEffect(() => {
    const timer = window.setTimeout(() => setVisible(false), 1100)
    return () => window.clearTimeout(timer)
  }, [])

  if (!visible || ready) {
    return ready ? null : <SplashBody />
  }
  return <SplashBody />
}

function SplashBody() {
  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-navy-950">
      <div className="grid-paper pointer-events-none absolute inset-0 opacity-30" />
      <div className="pointer-events-none absolute -top-24 left-1/3 h-72 w-72 rounded-full bg-brand-600/25 blur-3xl" />
      <div className="relative flex flex-col items-center">
        <span className="grid h-16 w-16 animate-pulse place-items-center rounded-2xl bg-brand-600 text-lg font-extrabold text-white shadow-[0_18px_40px_-14px_rgba(46,107,255,0.9)]">
          RNA
        </span>
        <p className="mt-5 font-display text-lg font-extrabold tracking-tight text-white">RNA Ship</p>
        <p className="mt-1.5 text-[12px] font-medium uppercase tracking-[0.2em] text-navy-300">Shipment desk</p>
        <div className="mt-6 h-1 w-32 overflow-hidden rounded-full bg-white/10">
          <div className="h-full w-1/2 animate-[rna-shimmer_1.2s_infinite_linear] rounded-full bg-brand-400" />
        </div>
        <p className="mt-6 flex items-center gap-1.5 text-[11.5px] text-navy-400">
          <Truck size={13} /> Connecting to the shipment API…
        </p>
      </div>
    </div>
  )
}

function RequireAuth({ children }: { children: ReactNode }) {
  const { status, user } = useAuth()
  const location = useLocation()

  if (status === 'loading') return <Splash ready={false} />
  if (status === 'anonymous') return <Navigate to="/login" replace state={{ from: location.pathname }} />
  if (!user) return <Splash ready={false} />
  return <>{children}</>
}

function RoleHome() {
  const { user } = useAuth()
  if (user?.role === 'driver') return <Navigate to="/driver" replace />
  if (user?.role === 'admin') return <Navigate to="/admin" replace />
  return <Dashboard />
}

export default function App() {
  const [booted, setBooted] = useState(false)

  useEffect(() => {
    const timer = window.setTimeout(() => setBooted(true), 1100)
    return () => window.clearTimeout(timer)
  }, [])

  return (
    <ToastProvider>
      <AuthProvider>
        <BrowserRouter>
          <Routes>
            <Route path="/login" element={<Login />} />
            <Route path="/reset-password" element={<ResetPassword />} />
            <Route path="/proof/:orderId" element={<PublicProof />} />

            <Route
              element={
                <RequireAuth>
                  <AppShell />
                </RequireAuth>
              }
            >
              <Route path="/" element={<RoleHome />} />
              <Route path="/orders" element={<Orders />} />
              <Route path="/orders/new" element={<CreateOrder />} />
              <Route path="/orders/:orderId" element={<OrderDetail />} />
              <Route path="/orders/:orderId/track" element={<OrderTracking />} />
              <Route path="/orders/:orderId/proof" element={<ProofViewer />} />
              <Route path="/shops" element={<Shops />} />
              <Route path="/shops/:shopId" element={<ShopDetail />} />
              <Route path="/notifications" element={<Notifications />} />
              <Route path="/profile" element={<Profile />} />
              <Route path="/driver" element={<DriverHome />} />
              <Route path="/driver/jobs/:orderId" element={<DriverJob />} />
              <Route path="/admin" element={<AdminConsole />} />
              <Route path="*" element={<NotFound />} />
            </Route>
          </Routes>
        </BrowserRouter>
      </AuthProvider>
    </ToastProvider>
  )
}
