import { useCallback, useEffect, useState } from 'react'
import {
  Activity, CheckCircle2, ClipboardList, Download, ScrollText, ShieldCheck, Store, Truck, UserCog, XCircle,
} from 'lucide-react'
import { api, ApiClientError } from '../../lib/api'
import { formatDateTime, relativeTime } from '../../lib/format'
import type { AuditLog, Driver, Order, OrderStatus } from '../../lib/types'
import {
  Alert, Badge, Button, Card, CardHeader, EmptyState, Modal, Select, Skeleton, StatCard, StatusBadge, useToast,
} from '../../components/ui'

interface AdminOrder extends Order {
  company_name: string
  driver_name: string | null
}

type Tab = 'orders' | 'drivers' | 'reports' | 'audit'

export function AdminConsole() {
  const { push } = useToast()
  const [tab, setTab] = useState<Tab>('orders')
  const [orders, setOrders] = useState<AdminOrder[]>([])
  const [drivers, setDrivers] = useState<Driver[]>([])
  const [audit, setAudit] = useState<AuditLog[]>([])
  const [summary, setSummary] = useState<{
    total: number; by_status: Record<string, number>; delivered: number; cancelled: number;
    on_time_rate: number; avg_delivery_minutes: number; top_shops: Array<{ shop: string; code: string; orders: number }>
  } | null>(null)
  const [loading, setLoading] = useState(true)
  const [assigning, setAssigning] = useState<AdminOrder | null>(null)
  const [driverId, setDriverId] = useState('')

  const load = useCallback(async () => {
    try {
      const [orderResult, driverResult, auditResult, summaryResult] = await Promise.all([
        api.get<{ data: AdminOrder[] }>('/admin/orders'),
        api.get<{ data: Driver[] }>('/admin/drivers'),
        api.get<{ data: AuditLog[] }>('/admin/audit-logs'),
        api.get<NonNullable<typeof summary>>('/admin/reports/summary'),
      ])
      setOrders(orderResult.data)
      setDrivers(driverResult.data)
      setAudit(auditResult.data)
      setSummary(summaryResult)
    } catch {
      /* empty states handle errors */
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { void load() }, [load])

  const assign = async () => {
    if (!assigning || !driverId) return
    try {
      await api.post(`/admin/orders/${assigning.id}/assign`, { driver_id: driverId })
      push({ tone: 'success', title: 'Driver assigned', message: `${assigning.order_code} is now assigned.` })
      setAssigning(null)
      setDriverId('')
      await load()
    } catch (err) {
      push({ tone: 'danger', title: 'Could not assign', message: err instanceof ApiClientError ? err.message : 'Please try again.' })
    }
  }

  const decide = async (order: AdminOrder, action: 'approve' | 'reject') => {
    try {
      await api.post(`/admin/orders/${order.id}/cancellation/${action}`)
      push({
        tone: action === 'approve' ? 'success' : 'info',
        title: action === 'approve' ? 'Cancellation approved' : 'Cancellation rejected',
        message: action === 'approve' ? 'The driver is released and the order is closed.' : 'The delivery continues.',
      })
      await load()
    } catch (err) {
      push({ tone: 'danger', title: 'Action failed', message: err instanceof ApiClientError ? err.message : 'Please try again.' })
    }
  }

  const exportCsv = () => {
    const header = ['Order ID', 'Company', 'Shop', 'Status', 'Driver', 'Created', 'Delivered']
    const rows = orders.map((order) => [
      order.order_code, order.company_name, order.shop_name, order.status,
      order.driver_name ?? '', order.created_at, order.delivered_at ?? '',
    ])
    const csv = [header, ...rows].map((row) => row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(',')).join('\n')
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8;' }))
    const link = document.createElement('a')
    link.href = url
    link.download = `rnaship-platform-orders-${new Date().toISOString().slice(0, 10)}.csv`
    link.click()
    URL.revokeObjectURL(url)
  }

  const tabs: Array<{ id: Tab; label: string; icon: typeof Activity }> = [
    { id: 'orders', label: 'Orders', icon: ClipboardList },
    { id: 'drivers', label: 'Drivers', icon: Truck },
    { id: 'reports', label: 'Reports', icon: Activity },
    { id: 'audit', label: 'Audit log', icon: ScrollText },
  ]

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <ShieldCheck size={20} className="text-brand-600" />
            <h1 className="text-[22px] font-extrabold leading-tight text-navy-900 sm:text-[26px]">Super Admin console</h1>
          </div>
          <p className="mt-1 text-sm text-slate-500">Platform-wide orders, driver assignment, cancellation decisions and the audit trail.</p>
        </div>
        <Button variant="secondary" icon={Download} onClick={exportCsv} disabled={orders.length === 0}>Export CSV</Button>
      </div>

      <div className="app-scrollbar flex gap-1 overflow-x-auto rounded-xl border border-hairline bg-white p-1">
        {tabs.map((item) => (
          <button
            key={item.id}
            onClick={() => setTab(item.id)}
            className={`flex flex-1 items-center justify-center gap-2 whitespace-nowrap rounded-lg px-4 py-2.5 text-[13px] font-bold transition ${tab === item.id ? 'bg-navy-900 text-white' : 'text-slate-500 hover:bg-navy-50 hover:text-navy-800'}`}
          >
            <item.icon size={15} /> {item.label}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="space-y-2">{Array.from({ length: 6 }).map((_, index) => <Skeleton key={index} className="h-14" />)}</div>
      ) : tab === 'orders' ? (
        <Card>
          <CardHeader icon={ClipboardList} title="All platform orders" subtitle="Every company is visible to the Super Admin only" />
          {orders.length === 0 ? (
            <EmptyState icon={ClipboardList} title="No orders" description="Orders from every company will appear here." />
          ) : (
            <ul className="divide-y divide-hairline">
              {orders.map((order) => (
                <li key={order.id} className="space-y-3 px-5 py-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="font-mono text-[13px] font-bold text-navy-900">{order.order_code}</p>
                        <Badge tone="neutral">{order.company_name}</Badge>
                        <StatusBadge status={order.status as OrderStatus} />
                      </div>
                      <p className="mt-1 text-[12.5px] font-semibold text-navy-800">{order.shop_name}</p>
                      <p className="mt-0.5 text-[11.5px] text-slate-500">
                        {order.driver_name ? `Driver: ${order.driver_name}` : 'No driver assigned'} · {relativeTime(order.created_at)}
                      </p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {['PENDING_ASSIGNMENT', 'OFFERED', 'ADMIN_REVIEW', 'CANCELLATION_REQUESTED'].includes(order.status) ? (
                        <Button size="xs" variant="secondary" icon={UserCog} onClick={() => { setAssigning(order); setDriverId('') }}>
                          Assign driver
                        </Button>
                      ) : null}
                      {order.status === 'CANCELLATION_REQUESTED' ? (
                        <>
                          <Button size="xs" variant="accent" icon={CheckCircle2} onClick={() => void decide(order, 'approve')}>Approve</Button>
                          <Button size="xs" variant="ghost" icon={XCircle} onClick={() => void decide(order, 'reject')}>Reject</Button>
                        </>
                      ) : null}
                    </div>
                  </div>
                  {order.cancellation_status === 'requested' ? (
                    <Alert tone="warning" title="Cancellation requested">
                      {order.cancellation_reason || 'No reason supplied.'}
                    </Alert>
                  ) : null}
                </li>
              ))}
            </ul>
          )}
        </Card>
      ) : tab === 'drivers' ? (
        <Card>
          <CardHeader icon={Truck} title="Driver network" subtitle="Availability is derived from active assignments" />
          <ul className="divide-y divide-hairline">
            {drivers.map((driver) => (
              <li key={driver.id} className="flex flex-wrap items-center gap-3 px-5 py-4">
                <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-navy-50 text-[12px] font-bold text-navy-700">
                  {driver.name.split(' ').map((part) => part[0]).slice(0, 2).join('')}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-[13.5px] font-bold text-navy-900">{driver.name}</p>
                  <p className="mt-0.5 font-mono text-[11.5px] text-slate-500">
                    {driver.vehicle ? `${driver.vehicle.type} · ${driver.vehicle.model} · ${driver.vehicle.plate}` : 'No vehicle registered'}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <Badge tone="info">★ {(driver.rating ?? 4.5).toFixed(1)}</Badge>
                  <Badge tone={driver.is_available ? 'success' : 'warning'}>
                    {driver.is_available ? 'Available' : `${driver.active_jobs} active job(s)`}
                  </Badge>
                  <Badge tone="neutral">{(driver as any).completed_jobs ?? 0} delivered</Badge>
                </div>
              </li>
            ))}
          </ul>
        </Card>
      ) : tab === 'reports' ? (
        <div className="space-y-5">
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <StatCard label="Total orders" value={summary?.total ?? 0} icon={ClipboardList} />
            <StatCard label="Delivered" value={summary?.delivered ?? 0} tone="success" icon={CheckCircle2} />
            <StatCard label="On-time rate" value={`${summary?.on_time_rate ?? 0}%`} tone="info" icon={Activity} />
            <StatCard label="Avg duration" value={`${summary?.avg_delivery_minutes ?? 0} min`} tone="progress" icon={Activity} />
          </div>

          <div className="grid gap-5 lg:grid-cols-2">
            <Card>
              <CardHeader icon={Activity} title="Orders by status" />
              <div className="space-y-2.5 p-5">
                {Object.entries(summary?.by_status ?? {}).map(([status, count]) => {
                  const total = summary?.total || 1
                  const width = Math.max(6, Math.round((count / total) * 100))
                  return (
                    <div key={status}>
                      <div className="mb-1 flex items-center justify-between text-[12px]">
                        <span className="font-semibold text-navy-800">{status.replace(/_/g, ' ')}</span>
                        <span className="font-mono text-slate-500">{count}</span>
                      </div>
                      <div className="h-2 overflow-hidden rounded-full bg-navy-100">
                        <div className="h-full rounded-full bg-brand-500" style={{ width: `${width}%` }} />
                      </div>
                    </div>
                  )
                })}
              </div>
            </Card>
            <Card>
              <CardHeader icon={Store} title="Top destination shops" />
              <ul className="divide-y divide-hairline">
                {(summary?.top_shops ?? []).map((shop) => (
                  <li key={shop.code} className="flex items-center justify-between px-5 py-3">
                    <div>
                      <p className="text-[13px] font-semibold text-navy-900">{shop.shop}</p>
                      <p className="font-mono text-[11px] text-slate-400">{shop.code}</p>
                    </div>
                    <Badge tone="info">{shop.orders} order(s)</Badge>
                  </li>
                ))}
              </ul>
            </Card>
          </div>
        </div>
      ) : (
        <Card>
          <CardHeader icon={ScrollText} title="Audit trail" subtitle="Server-side record of sensitive actions" />
          {audit.length === 0 ? (
            <EmptyState icon={ScrollText} title="No audit entries" description="Actions such as logins, assignments and cancellations are recorded here." />
          ) : (
            <ul className="divide-y divide-hairline">
              {audit.map((entry) => (
                <li key={entry.id} className="flex flex-wrap items-center gap-3 px-5 py-3">
                  <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-navy-50 text-navy-600">
                    <Activity size={14} />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-[12.5px] font-bold text-navy-900">{entry.action}</p>
                    <p className="mt-0.5 text-[11.5px] text-slate-500">
                      {entry.actor_name} ({entry.actor_role.replace(/_/g, ' ')}) · {entry.entity_type}/{entry.entity_id.slice(0, 12)} · ip {entry.ip}
                    </p>
                  </div>
                  <p className="text-[11px] text-slate-400">{formatDateTime(entry.created_at)}</p>
                </li>
              ))}
            </ul>
          )}
        </Card>
      )}

      <Modal
        open={Boolean(assigning)}
        onClose={() => setAssigning(null)}
        title="Assign a driver"
        subtitle={assigning ? `${assigning.order_code} · ${assigning.shop_name}` : ''}
        footer={
          <>
            <Button variant="ghost" onClick={() => setAssigning(null)}>Cancel</Button>
            <Button variant="accent" disabled={!driverId} onClick={() => void assign()}>Assign driver</Button>
          </>
        }
      >
        <div className="space-y-4">
          <Select value={driverId} onChange={(event) => setDriverId(event.target.value)}>
            <option value="">Select a driver…</option>
            {drivers.map((driver) => (
              <option key={driver.id} value={driver.id}>
                {driver.name} — {driver.vehicle?.plate ?? 'no vehicle'} {driver.is_available ? '' : '(busy)'}
              </option>
            ))}
          </Select>
          <Alert tone="info">
            Assigning a driver immediately moves the order to <strong>ACCEPTED</strong> and releases the outstanding offers.
          </Alert>
        </div>
      </Modal>
    </div>
  )
}
