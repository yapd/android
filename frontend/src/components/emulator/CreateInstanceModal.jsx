import { useState } from 'react'
import { X, Plus, Smartphone } from 'lucide-react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import { instancesApi, profilesApi } from '../../services/api'
import { Spinner } from '../common/ui'

export default function CreateInstanceModal({ onClose }) {
  const qc = useQueryClient()
  const [form, setForm] = useState({
    name: '',
    profileId: 'pixel-7',
    gpsLat: '-23.5505',
    gpsLng: '-46.6333',
    batteryLevel: '85',
    batteryStatus: 'charging',
    networkOperator: 'Claro BR',
    networkStrength: '4',
  })

  const { data: profiles = [] } = useQuery({
    queryKey: ['profiles'],
    queryFn: profilesApi.list,
  })

  const mutation = useMutation({
    mutationFn: () => instancesApi.create(form),
    onSuccess: () => {
      toast.success('Instância sendo criada...')
      qc.invalidateQueries(['instances'])
      onClose()
    },
  })

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }))

  return (
    <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-farm-surface border border-farm-border rounded-2xl w-full max-w-lg animate-slide-up">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-farm-border">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-farm-green/15 flex items-center justify-center">
              <Plus className="w-4 h-4 text-farm-green" />
            </div>
            <h2 className="text-sm font-semibold">Nova Instância</h2>
          </div>
          <button onClick={onClose} className="text-farm-muted hover:text-farm-text transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body */}
        <div className="px-6 py-5 space-y-4">
          {/* Nome */}
          <div>
            <label className="label">Nome da Instância</label>
            <input
              className="input"
              placeholder="ex: Meu Pixel 7"
              value={form.name}
              onChange={set('name')}
            />
          </div>

          {/* Perfil de Dispositivo */}
          <div>
            <label className="label">Perfil de Dispositivo (Spoofing)</label>
            <select className="select" value={form.profileId} onChange={set('profileId')}>
              {profiles.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.label} — {p.screenWidth}×{p.screenHeight} · {p.ram}MB RAM
                </option>
              ))}
            </select>
          </div>

          {/* GPS */}
          <div>
            <label className="label">Localização GPS Inicial</label>
            <div className="grid grid-cols-2 gap-2">
              <input className="input" placeholder="Latitude" value={form.gpsLat} onChange={set('gpsLat')} />
              <input className="input" placeholder="Longitude" value={form.gpsLng} onChange={set('gpsLng')} />
            </div>
            <p className="text-xs text-farm-muted mt-1">Default: São Paulo, Brasil</p>
          </div>

          {/* Bateria */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">Nível de Bateria (%)</label>
              <input type="number" min="1" max="100" className="input" value={form.batteryLevel} onChange={set('batteryLevel')} />
            </div>
            <div>
              <label className="label">Status da Bateria</label>
              <select className="select" value={form.batteryStatus} onChange={set('batteryStatus')}>
                <option value="charging">Carregando</option>
                <option value="discharging">Descarregando</option>
                <option value="full">Completa</option>
              </select>
            </div>
          </div>

          {/* GSM */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">Operadora</label>
              <input className="input" placeholder="ex: Claro BR" value={form.networkOperator} onChange={set('networkOperator')} />
            </div>
            <div>
              <label className="label">Sinal GSM (0-4)</label>
              <select className="select" value={form.networkStrength} onChange={set('networkStrength')}>
                <option value="0">Sem sinal</option>
                <option value="1">Fraco</option>
                <option value="2">Regular</option>
                <option value="3">Bom</option>
                <option value="4">Excelente</option>
              </select>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-farm-border">
          <button className="btn-ghost" onClick={onClose}>Cancelar</button>
          <button
            className="btn-success"
            onClick={() => mutation.mutate()}
            disabled={mutation.isPending}
          >
            {mutation.isPending ? <Spinner size="sm" /> : <Plus className="w-4 h-4" />}
            Criar Instância
          </button>
        </div>
      </div>
    </div>
  )
}
