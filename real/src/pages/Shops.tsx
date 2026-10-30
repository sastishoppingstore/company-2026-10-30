import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { MapPin, Phone, Search, Star, Store } from 'lucide-react'
import { api } from '../lib/api'
import type { Shop } from '../lib/types'
import { Badge, Button, Card, EmptyState, SearchInput, Select, Skeleton } from '../components/ui'

export function Shops() {
  const [shops, setShops] = useState<Shop[]>([])
  const [search, setSearch] = useState('')
  const [city, setCity] = useState('all')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const load = async () => {
      try {
        const result = await api.get<{ data: Shop[] }>('/shops', { status: 'all' })
        setShops(result.data)
      } finally {
        setLoading(false)
      }
    }
    void load()
  }, [])

  const cities = useMemo(() => Array.from(new Set(shops.map((shop) => shop.city))).sort(), [shops])

  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase()
    return shops.filter((shop) => {
      if (city !== 'all' && shop.city !== city) return false
      if (!query) return true
      return `${shop.name} ${shop.code} ${shop.address} ${shop.category}`.toLowerCase().includes(query)
    })
  }, [shops, search, city])

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-[22px] font-extrabold leading-tight text-navy-900 sm:text-[26px]">Shop directory</h1>
        <p className="mt-1 text-sm text-slate-500">
          Registered destination shops with their authorised receivers. Select a shop to see contact and delivery details.
        </p>
      </div>

      <div className="flex flex-col gap-3 sm:flex-row">
        <SearchInput
          className="flex-1"
          placeholder="Search by shop name, code, address or category…"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
        />
        <Select className="sm:w-52" value={city} onChange={(event) => setCity(event.target.value)}>
          <option value="all">All cities</option>
          {cities.map((item) => <option key={item} value={item}>{item}</option>)}
        </Select>
      </div>

      {loading ? (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: 6 }).map((_, index) => <Skeleton key={index} className="h-48" />)}
        </div>
      ) : filtered.length === 0 ? (
        <Card><EmptyState icon={Store} title="No shops found" description="Try a different search term or city filter." /></Card>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {filtered.map((shop) => (
            <Card key={shop.id} className="flex flex-col overflow-hidden transition hover:-translate-y-0.5 hover:shadow-[var(--shadow-lift)]">
              <div className="flex items-start justify-between gap-2 border-b border-hairline px-5 py-4">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <h3 className="truncate text-[15px] font-bold text-navy-900">{shop.name}</h3>
                    {shop.is_demo ? <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[9px] font-bold uppercase tracking-wide text-amber-700">Demo</span> : null}
                  </div>
                  <p className="mt-1 font-mono text-[11px] font-semibold text-brand-600">{shop.code}</p>
                </div>
                <Badge tone={shop.status === 'active' ? 'success' : 'neutral'}>
                  {shop.status === 'active' ? 'Active' : 'Inactive'}
                </Badge>
              </div>
              <div className="flex-1 space-y-2.5 px-5 py-4 text-[12.5px]">
                <p className="flex items-start gap-2 leading-relaxed text-slate-600">
                  <MapPin size={14} className="mt-0.5 shrink-0 text-slate-400" /> {shop.address}, {shop.city}
                </p>
                <p className="flex items-center gap-2 text-slate-600">
                  <Phone size={14} className="shrink-0 text-slate-400" /> <span className="font-mono">{shop.phone}</span>
                </p>
                <p className="flex items-center gap-2 text-slate-500">
                  <Star size={14} className="shrink-0 text-amber-400" /> {shop.rating.toFixed(1)} · {shop.category}
                </p>
              </div>
              <div className="flex items-center justify-between gap-2 border-t border-hairline bg-navy-50/50 px-5 py-3">
                <span className="text-[11px] font-medium text-slate-500">
                  {((shop as any).receiver_count ?? 0)} registered receiver(s)
                </span>
                <Link to={`/shops/${shop.id}`}>
                  <Button size="xs" variant="secondary">View details</Button>
                </Link>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}
