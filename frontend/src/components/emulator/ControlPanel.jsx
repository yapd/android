import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import { MapPin, Battery, Signal, MessageSquare, X } from 'lucide-react'
import { instancesApi } from '../../services/api'
import { Spinner } from '../common/ui'

export default function ControlPanel({ instance }) {
  return (
    <div className="space-y-4">
      <GPSPanel instance={instance} />
      <BatteryPanel instance={instance} />
      <GSMPanel instance={instance} />
      <SMSPanel instance={instance} />
    </div>
  )
}

// ─── GPS ──────────────────────────────────────────────────────────────────────
function GPSPanel({ instance }) {
  const qc = useQueryClient()
  const [lat, setLat] = useState(String(instance.gpsLat ?? -23.5505))
  const [lng, setLng] = useState(String(instance.gpsLng ?? -46.6333))

  const mut = useMutation({
    mutationFn: () => instancesApi.setGPS(instance.id, { lat: parseFloat(lat), lng: parseFloat(lng) }),
    onSuccess: () => { toast.success('GPS atualizado!'); qc.invalidateQueries(['instances']) },
  })

  return (
    <div className="card">
      <div className="flex items-center gap-2 mb-3">
        <MapPin className="w-4 h-4 text-farm-blue" />
        <h3 className="text-sm font-semibold">GPS Spoofing</h3>
      </div>
      <div className="grid grid-cols-2 gap-2 mb-3">
        <div>
          <label className="label">Latitude</label>
          <input className="input" value={lat} onChange={(e) => setLat(e.target.value)} />
        </div>
        <div>
          <label className="label">Longitude</label>
          <input className="input" value={lng} onChange={(e) => setLng(e.target.value)} />
        </div>
      </div>
      <div className="mb-2">
        <label className="label">Presets Rápidos</label>
        <div className="flex flex-wrap gap-1.5">
          {GPS_PRESETS.map((p) => (
            <button key={p.label} className="btn-ghost text-xs py-1"
              onClick={() => { setLat(String(p.lat)); setLng(String(p.lng)) }}>
              {p.label}
            </button>
          ))}
        </div>
      </div>
      <button className="btn-primary text-xs" onClick={() => mut.mutate()} disabled={mut.isPending}>
        {mut.isPending ? <Spinner size="sm" /> : <MapPin className="w-3.5 h-3.5" />}
        Aplicar GPS
      </button>
    </div>
  )
}

const GPS_PRESETS = [
  { label: 'São Paulo', lat: -23.5505, lng: -46.6333 },
  { label: 'Rio de Janeiro', lat: -22.9068, lng: -43.1729 },
  { label: 'Brasília', lat: -15.7801, lng: -47.9292 },
  { label: 'Nova York', lat: 40.7128, lng: -74.0060 },
  { label: 'Londres', lat: 51.5074, lng: -0.1278 },
  { label: 'Tóquio', lat: 35.6762, lng: 139.6503 },
]

// ─── Battery ──────────────────────────────────────────────────────────────────
function BatteryPanel({ instance }) {
  const qc = useQueryClient()
  const [level, setLevel] = useState(instance.batteryLevel ?? 85)
  const [status, setStatus] = useState(instance.batteryStatus ?? 'charging')

  const mut = useMutation({
    mutationFn: () => instancesApi.setBat(instance.id, { level: parseInt(level), status }),
    onSuccess: () => { toast.success('Bateria atualizada!'); qc.invalidateQueries(['instances']) },
  })

  return (
    <div className="card">
      <div className="flex items-center gap-2 mb-3">
        <Battery className="w-4 h-4 text-farm-green" />
        <h3 className="text-sm font-semibold">Bateria Spoofing</h3>
      </div>
      <div className="grid grid-cols-2 gap-2 mb-3">
        <div>
          <label className="label">Nível ({level}%)</label>
          <input type="range" min="1" max="100" className="w-full accent-farm-green"
            value={level} onChange={(e) => setLevel(e.target.value)} />
        </div>
        <div>
          <label className="label">Status</label>
          <select className="select" value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="charging">Carregando</option>
            <option value="discharging">Descarregando</option>
            <option value="full">Completa</option>
          </select>
        </div>
      </div>
      <button className="btn-success text-xs" onClick={() => mut.mutate()} disabled={mut.isPending}>
        {mut.isPending ? <Spinner size="sm" /> : <Battery className="w-3.5 h-3.5" />}
        Aplicar Bateria
      </button>
    </div>
  )
}

// ─── GSM ──────────────────────────────────────────────────────────────────────
function GSMPanel({ instance }) {
  const qc = useQueryClient()
  const [strength, setStrength] = useState(String(instance.networkStrength ?? 4))
  const [operator, setOperator] = useState(instance.networkOperator ?? 'Claro BR')

  const mut = useMutation({
    mutationFn: () => instancesApi.setGSM(instance.id, {
      strength: parseInt(strength), operator,
    }),
    onSuccess: () => { toast.success('GSM atualizado!'); qc.invalidateQueries(['instances']) },
  })

  return (
    <div className="card">
      <div className="flex items-center gap-2 mb-3">
        <Signal className="w-4 h-4 text-farm-yellow" />
        <h3 className="text-sm font-semibold">GSM Spoofing</h3>
      </div>
      <div className="grid grid-cols-2 gap-2 mb-3">
        <div>
          <label className="label">Operadora</label>
          <input className="input" value={operator} onChange={(e) => setOperator(e.target.value)} />
        </div>
        <div>
          <label className="label">Força do Sinal</label>
          <select className="select" value={strength} onChange={(e) => setStrength(e.target.value)}>
            <option value="0">0 — Sem sinal</option>
            <option value="1">1 — Fraco</option>
            <option value="2">2 — Regular</option>
            <option value="3">3 — Bom</option>
            <option value="4">4 — Excelente</option>
          </select>
        </div>
      </div>
      <button className="btn-warning text-xs" onClick={() => mut.mutate()} disabled={mut.isPending}>
        {mut.isPending ? <Spinner size="sm" /> : <Signal className="w-3.5 h-3.5" />}
        Aplicar GSM
      </button>
    </div>
  )
}

// ─── SMS ──────────────────────────────────────────────────────────────────────
function SMSPanel({ instance }) {
  const [from, setFrom] = useState('+5511999999999')
  const [message, setMessage] = useState('')

  const mut = useMutation({
    mutationFn: () => instancesApi.sendSMS(instance.id, { from, message }),
    onSuccess: () => { toast.success('SMS injetado!'); setMessage('') },
  })

  return (
    <div className="card">
      <div className="flex items-center gap-2 mb-3">
        <MessageSquare className="w-4 h-4 text-farm-purple" />
        <h3 className="text-sm font-semibold">Injetar SMS</h3>
      </div>
      <div className="space-y-2 mb-3">
        <div>
          <label className="label">De (número)</label>
          <input className="input" value={from} onChange={(e) => setFrom(e.target.value)} />
        </div>
        <div>
          <label className="label">Mensagem</label>
          <textarea
            className="input resize-none"
            rows={3}
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            placeholder="Digite o conteúdo do SMS..."
          />
        </div>
      </div>
      <button className="btn-primary text-xs" onClick={() => mut.mutate()}
        disabled={mut.isPending || !message.trim()}>
        {mut.isPending ? <Spinner size="sm" /> : <MessageSquare className="w-3.5 h-3.5" />}
        Enviar SMS
      </button>
    </div>
  )
}
