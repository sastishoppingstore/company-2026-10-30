import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { Download, Filter, Package, RotateCcw, Search } from 'lucide-react'
import { api } from '../lib/api'
import { formatDate, relativeTime } from '../lib/format'
import type { Order, OrderStatus, Priority, Shop } from '../lib/types'
import {
  Button, Card, CardHeader, EmptyState, IconButton, SearchInput, Select, Skeleton, StatusBadge,
} from '../components/ui'
import { priorityMeta } from '../lib/format'

const STATUS_OPTIONS: Array<{ value: string; label: string }> = [
  { value: 'all', label: 'All statuses' },
  { value: 'DRAFT', label: 'Draft' },
  { value: 'PENDING_ASSIGNMENT', label: 'Pending assignment' },
  { value: 'OFFERED', label: 'Offered' },
  { value: 'ACCEPTED', label: 'Accepted' },
  { value: 'PICKED_UP', label: 'Picked up' },
  { value: 'IN_TRANSIT', label: 'In transit' },
  { value: 'ARRIVED_AT_SHOP', label: 'Arrived at shop' },
  { value: 'OTP_VERIFIED', label: 'OTP verified' },
  { value: 'DELIVERED', label: 'Delivered' },
  { value: 'CANCELLATION_REQUESTED', label: 'Cancellation requested' },
  { value: 'CANCELLED', label: 'Cancelled' },
]

export function Orders() {
  const [orders, setOrders] = useState<Order[]>([])
  const [shops, setShops] = useState<Shop[]>([])
  const [meta, setMeta] = useState({ total: 0, page: 1, last_page: 1 })
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [status, setStatus] = useState('all')
  const [priority, setPriority] = useState('all')
  const [shopId, setShopId] = useState('all')
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [page, setPage] = useState(1)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const result = await api.get<{ data: Order[]; meta: typeof meta }>('/orders', {
        search, status, priority, shop_id: shopId, from, to, page, per_page: 20,
      })
      setOrders(result.data)
      setMeta(result.meta)
    } catch {
      /* empty state handles it */
    } finally {
      setLoading(false)
    }
  }, [search, status, priority, shopId, from, to, page])

  useEffect(() => {
    const timer = window.setTimeout(() => { void load() }, 220)
    return () => window.clearTimeout(timer)
  }, [load])

  useEffect(() => {
    api.get<{ data: Shop[] }>('/shops').then((result) => setShops(result.data)).catch(() => undefined)
  }, [])

  const stats = useMemo(() => ({
    total: meta.total,
    delivered: orders.filter((order) => order.status === 'DELIVERED').length,
    active: orders.filter((order) => ['ACCEPTED', 'PICKED_UP', 'IN_TRANSIT', 'ARRIVED_AT_SHOP', 'OTP_VERIFIED'].includes(order.status)).length,
    cancelled: orders.filter((order) => order.status === 'CANCELLED').length,
  }), [orders, meta.total])

  const exportCsv = () => {
    const header = ['Order ID', 'Shop', 'Shop code', 'Receiver', 'Status', 'Priority', 'Quantity', 'Description', 'Weight (kg)', 'Requested delivery', 'Created at', 'Delivered at']
    const rows = orders.map((order) => [
      order.order_code, order.shop_name, order.shop_code, order.receiver_name, order.status,
      order.priority, order.quantity, order.item_description, order.weight_kg ?? '',
      order.requested_delivery_at, order.created_at, order.delivered_at ?? '',
    ])
    const csv = [header, ...rows]
      .map((row) => row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(','))
      .join('\n')
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `rnaship-orders-${new Date().toISOString().slice(0, 10)}.csv`
    link.click()
    URL.revokeObjectURL(url)
  }

  const resetFilters = () => {
    setSearch(''); setStatus('all'); setPriority('all'); setShopId('all'); setFrom(''); setTo(''); setPage(1)
  }

  const hasFilters = Boolean(search || status !== 'all' || priority !== 'all' || shopId !== 'all' || from || to)

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-[22px] font-extrabold leading-tight text-navy-900 sm:text-[26px]">Order history</h1>
          <p className="mt-1 text-sm text-slate-500">Search, filter and export your company deliveries. Data is isolated per company account.</p>
        </div>
        <div className="flex items-center gap-2">
          {hasFilters ? (
            <Button variant="ghost" icon={RotateCcw} onClick={resetFilters}>Clear</Button>
          ) : null}
          <Button variant="secondary" icon={Download} onClick={exportCsv} disabled={orders.length === 0}>
            Export CSV
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {[
          { label: 'Matching orders', value: stats.total },
          { label: 'Delivered', value: stats.delivered },
          { label: 'In progress', value: stats.active },
          { label: 'Cancelled', value: stats.cancelled },
        ].map((item) => (
          <div key={item.label} className="rounded-2xl border border-hairline bg-white px-4 py-3 shadow-[var(--shadow-card)]">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">{item.label}</p>
            <p className="mt-1 text-2xl font-extrabold leading-none text-navy-900">{item.value}</p>
          </div>
        ))}
      </div>

      <Card>
        <CardHeader icon={Filter} title="Filters" subtitle="Narrow the history by status, priority, shop or date" />
        <div className="grid gap-3 p-5 sm:grid-cols-2 xl:grid-cols-6">
          <SearchInput
            className="sm:col-span-2"
            placeholder="Order ID, shop or receiver…"
            value={search}
            onChange={(event) => { setSearch(event.target.value); setPage(1) }}
          />
          <Select value={status} onChange={(event) => { setStatus(event.target.value); setPage(1) }}>
            {STATUS_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
          </Select>
          <Select value={priority} onChange={(event) => { setPriority(event.target.value); setPage(1) }}>
            <option value="all">All priorities</option>
            <option value="STANDARD">Standard</option>
            <option value="EXPRESS">Express</option>
            <option value="CRITICAL">Critical</option>
          </Select>
          <Select value={shopId} onChange={(event) => { setShopId(event.target.value); setPage(1) }}>
            <option value="all">All shops</option>
            {shops.map((shop) => <option key={shop.id} value={shop.id}>{shop.name}</option>)}
          </Select>
          <div className="flex gap-2">
            <input
              type="date"
              value={from}
              onChange={(event) => { setFrom(event.target.value); setPage(1) }}
              className="h-11 w-full rounded-xl border border-hairline bg-white px-3 text-[13px] text-navy-900 focus:border-brand-400 focus:outline-none focus:ring-4 focus:ring-brand-100"
              aria-label="From date"
            />
            <input
              type="date"
              value={to}
              onChange={(event) => { setTo(event.target.value); setPage(1) }}
              className="h-11 w-full rounded-xl border border-hairline bg-white px-3 text-[13px] text-navy-900 focus:border-brand-400 focus:outline-none focus:ring-4 focus:ring-brand-100"
              aria-label="To date"
            />
          </div>
        </div>
      </Card>

      <Card>
        <CardHeader
          icon={Package}
          title="Orders"
          subtitle={loading ? 'Loading…' : `${orders.length} shown of ${meta.total} matching`}
        />
        {loading ? (
          <div className="space-y-2 p-5">{Array.from({ length: 5 }).map((_, index) => <Skeleton key={index} className="h-16" />)}</div>
        ) : orders.length === 0 ? (
          <EmptyState
            icon={Search}
            title="No orders match these filters"
            description="Adjust the filters or clear them to see your full order history."
            action={hasFilters ? <Button variant="secondary" onClick={resetFilters}>Clear filters</Button> : undefined}
          />
        ) : (
          <>
            {/* desktop table */}
            <div className="hidden overflow-x-auto lg:block">
              <table className="w-full border-collapse text-left">
                <thead>
                  <tr className="border-b border-hairline bg-navy-50/60 text-[11px] uppercase tracking-wide text-slate-500">
                    <th className="px-5 py-3 font-bold">Order</th>
                    <th className="px-5 py-3 font-bold">Destination</th>
                    <th className="px-5 py-3 font-bold">Receiver</th>
                    <th className="px-5 py-3 font-bold">Priority</th>
                    <th className="px-5 py-3 font-bold">Status</th>
                    <th className="px-5 py-3 font-bold">Created</th>
                    <th className="px-5 py-3" />
                  </tr>
                </thead>
                <tbody>
                  {orders.map((order) => (
                    <tr key={order.id} className="border-b border-hairline transition last:border-0 hover:bg-navy-50/40">
                      <td className="px-5 py-3.5">
                        <Link to={`/orders/${order.id}`} className="font-mono text-[12.5px] font-bold text-brand-700 hover:underline">
                          {order.order_code}
                        </Link>
                        <p className="mt-0.5 max-w-[220px] truncate text-[11.5px] text-slate-500">{order.item_description}</p>
                      </td>
                      <td className="px-5 py-3.5">
                        <p className="text-[13px] font-semibold text-navy-900">{order.shop_name}</p>
                        <p className="font-mono text-[11px] text-slate-400">{order.shop_code}</p>
                      </td>
                      <td className="px-5 py-3.5 text-[13px] text-slate-600">{order.receiver_name}</td>
                      <td className="px-5 py-3.5">
                        <span className="text-[12px] font-semibold text-slate-600">{priorityMeta(order.priority as Priority).icon} {priorityMeta(order.priority as Priority).label}</span>
                      </td>
                      <td className="px-5 py-3.5"><StatusBadge status={order.status as OrderStatus} /></td>
                      <td className="px-5 py-3.5 text-[12px] text-slate-500" title={formatDate(order.created_at)}>{relativeTime(order.created_at)}</td>
                      <td className="px-5 py-3.5 text-right">
                        <Link to={`/orders/${order.id}`}>
                          <Button size="xs" variant="secondary">Open</Button>
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* mobile cards */}
            <ul className="divide-y divide-hairline lg:hidden">
              {orders.map((order) => (
                <li key={order.id}>
                  <Link to={`/orders/${order.id}`} className="block px-5 py-4 transition active:bg-navy-50">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="font-mono text-[12.5px] font-bold text-navy-900">{order.order_code}</p>
                        <p className="mt-0.5 truncate text-[13px] font-semibold text-navy-800">{order.shop_name}</p>
                        <p className="mt-0.5 truncate text-[11.5px] text-slate-500">{order.quantity} × {order.item_description}</p>
                      </div>
                      <StatusBadge status={order.status as OrderStatus} />
                    </div>
                    <p className="mt-2 text-[11px] text-slate-400">
                      {priorityMeta(order.priority as Priority).label} · {relativeTime(order.created_at)} · {order.receiver_name}
                    </p>
                  </Link>
                </li>
              ))}
            </ul>

            {meta.last_page > 1 ? (
              <div className="flex items-center justify-between gap-3 border-t border-hairline px-5 py-3.5">
                <p className="text-[12px] text-slate-500">Page {meta.page} of {meta.last_page}</p>
                <div className="flex gap-2">
                  <Button size="sm" variant="secondary" disabled={meta.page <= 1} onClick={() => setPage((value) => value - 1)}>Previous</Button>
                  <Button size="sm" variant="secondary" disabled={meta.page >= meta.last_page} onClick={() => setPage((value) => value + 1)}>Next</Button>
                </div>
              </div>
            ) : null}
          </>
        )}
      </Card>
    </div>
  )
}
