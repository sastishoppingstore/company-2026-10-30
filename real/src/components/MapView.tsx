import { useEffect, useRef } from 'react'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'

export interface MapPin {
  lat: number
  lng: number
  kind: 'pickup' | 'destination' | 'driver'
  label?: string
}

function pinIcon(kind: MapPin['kind']) {
  const palette: Record<MapPin['kind'], { bg: string; ring: string }> = {
    pickup: { bg: '#0F2242', ring: '#ffffff' },
    destination: { bg: '#2E6BFF', ring: '#ffffff' },
    driver: { bg: '#F97316', ring: '#ffffff' },
  }
  const { bg, ring } = palette[kind]
  return L.divIcon({
    className: '',
    html: `<div class="rna-marker" style="background:${bg};border-color:${ring}"><span></span></div>`,
    iconSize: [34, 34],
    iconAnchor: [17, 17],
  })
}

export function MapView({
  pins, path, className = '', interactive = true,
}: {
  pins: MapPin[]
  path?: Array<{ lat: number; lng: number }>
  className?: string
  interactive?: boolean
}) {
  const containerRef = useRef<HTMLDivElement | null>(null)
  const mapRef = useRef<L.Map | null>(null)
  const layerRef = useRef<L.LayerGroup | null>(null)
  const pathRef = useRef<L.Polyline | null>(null)

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return
    const map = L.map(containerRef.current, {
      zoomControl: false,
      attributionControl: true,
      dragging: interactive,
      scrollWheelZoom: interactive,
      touchZoom: interactive,
      doubleClickZoom: interactive,
    }).setView([18.53, 73.83], 12)
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '&copy; OpenStreetMap contributors',
    }).addTo(map)
    L.control.zoom({ position: 'bottomright' }).addTo(map)
    layerRef.current = L.layerGroup().addTo(map)
    mapRef.current = map
    setTimeout(() => map.invalidateSize(), 120)
    return () => {
      map.remove()
      mapRef.current = null
    }
  }, [interactive])

  useEffect(() => {
    const map = mapRef.current
    const layer = layerRef.current
    if (!map || !layer) return
    layer.clearLayers()
    for (const pin of pins) {
      L.marker([pin.lat, pin.lng], { icon: pinIcon(pin.kind) })
        .addTo(layer)
        .bindPopup(`<strong>${pin.kind === 'driver' ? 'Driver' : pin.kind === 'pickup' ? 'Pickup' : 'Destination'}</strong>${pin.label ? `<br/>${pin.label}` : ''}`)
    }
    if (pins.length) {
      const bounds = L.latLngBounds(pins.map((pin) => [pin.lat, pin.lng] as [number, number]))
      map.fitBounds(bounds, { padding: [46, 46], maxZoom: 15 })
    }
  }, [pins])

  useEffect(() => {
    const map = mapRef.current
    if (!map) return
    if (pathRef.current) {
      pathRef.current.remove()
      pathRef.current = null
    }
    if (path && path.length > 1) {
      pathRef.current = L.polyline(path.map((point) => [point.lat, point.lng] as [number, number]), {
        color: '#2E6BFF', weight: 3.5, opacity: 0.85, dashArray: '1 8', lineCap: 'round',
      }).addTo(map)
    }
  }, [path])

  return (
    <div className={`map-shell overflow-hidden rounded-xl bg-navy-50 ${className}`}>
      <div ref={containerRef} className="h-full w-full" />
    </div>
  )
}
