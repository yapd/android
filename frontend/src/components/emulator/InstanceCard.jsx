import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import {
  Play, Square, RotateCcw, Trash2, Eye, Smartphone,
  ChevronRight, Cpu, MemoryStick, MoreVertical, Trash,
} from 'lucide-react'
import { motion } from 'framer-motion'
import { instancesApi } from '../../services/api'
import { StatusBadge, Spinner } from '../common/ui'
import { useNavigate } from 'react-router-dom'

export default function InstanceCard({ instance }) {
  const qc = useQueryClient()
  const navigate = useNavigate()
  const [loading, setLoading] = useState(null)

  const mutate = async (action, fn, msg) => {
    setLoading(action)
    try {
      await fn()
      toast.success(msg)
      qc.invalidateQueries(['instances'])
    } catch (_) {}
    setLoading(null)
  }

  const isRunning  = instance.status === 'running'
  const isStopped  = instance.status === 'stopped'
  const isBusy     = ['starting', 'stopping', 'creating'].includes(instance.status)

  return (
    <motion.div
      layout
      initial={{ opacity: 0, scale: 0.97 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.95 }}
      className="card group hover:border-farm-blue/40 transition-all duration-200"
    >
      {/* Header */}
      <div className="flex items-start justify-between mb-3">
        <div className="flex items-center gap-3">
          <div className={`w-9 h-9 rounded-xl flex items-center justify-center
            ${isRunning ? 'bg-farm-green/15' : 'bg-farm-border'}`}>
            <Smartphone className={`w-4 h-4 ${isRunning ? 'text-farm-green' : 'text-farm-muted'}`} />
          </div>
          <div>
            <p className="text-sm font-semibold text-farm-text leading-tight">{instance.name}</p>
            <p className="text-xs text-farm-muted font-mono">
              {instance.profile?.model || instance.avdName || '—'}
            </p>
          </div>
        </div>
        <StatusBadge status={instance.status} />
      </div>

      {/* Info grid */}
      <div className="grid grid-cols-2 gap-2 mb-3 text-xs text-farm-muted">
        <InfoRow label="Porta"    value={instance.emulatorPort || '—'} />
        <InfoRow label="GPS"      value={`${instance.gpsLat?.toFixed(2)}, ${instance.gpsLng?.toFixed(2)}`} />
        <InfoRow label="Bateria"  value={`${instance.batteryLevel}% (${instance.batteryStatus})`} />
        <InfoRow label="Sinal"    value={`${instance.networkOperator} (${instance.networkStrength}/4)`} />
      </div>

      {/* CPU/RAM meters */}
      {isRunning && (
        <div className="mb-3 space-y-1">
          <MiniBar label="CPU" value={instance.cpuUsage || 0} color="bg-farm-blue" />
          <MiniBar label="RAM" value={Math.min(Math.round((instance.ramUsageMb || 0) / 40), 100)} color="bg-farm-purple" />
        </div>
      )}

      {/* Error */}
      {instance.status === 'error' && instance.error && (
        <p className="text-xs text-farm-red bg-farm-red/10 rounded-lg px-2 py-1.5 mb-3 font-mono truncate">
          {instance.error}
        </p>
      )}

      {/* Actions */}
      <div className="flex items-center gap-1.5 flex-wrap">
        {/* View */}
        <button
          className="btn-primary text-xs"
          onClick={() => navigate(`/instances/${instance.id}`)}
        >
          <Eye className="w-3.5 h-3.5" /> Detalhes
        </button>

        {/* Start */}
        {(isStopped || instance.status === 'error') && (
          <button
            className="btn-success text-xs"
            disabled={isBusy || loading}
            onClick={() => mutate('start', () => instancesApi.start(instance.id), 'Iniciando...')}
          >
            {loading === 'start' ? <Spinner size="sm" /> : <Play className="w-3.5 h-3.5" />}
            Start
          </button>
        )}

        {/* Stop */}
        {isRunning && (
          <button
            className="btn-warning text-xs"
            disabled={isBusy || loading}
            onClick={() => mutate('stop', () => instancesApi.stop(instance.id), 'Parando...')}
          >
            {loading === 'stop' ? <Spinner size="sm" /> : <Square className="w-3.5 h-3.5" />}
            Stop
          </button>
        )}

        {/* Reboot */}
        {isRunning && (
          <button
            className="btn-ghost text-xs"
            disabled={isBusy || loading}
            onClick={() => mutate('reboot', () => instancesApi.reboot(instance.id), 'Reiniciando...')}
          >
            {loading === 'reboot' ? <Spinner size="sm" /> : <RotateCcw className="w-3.5 h-3.5" />}
          </button>
        )}

        {/* Delete */}
        {!isBusy && (
          <button
            className="btn-danger text-xs ml-auto"
            disabled={loading}
            onClick={() => {
              if (confirm(`Excluir "${instance.name}"?`)) {
                mutate('delete', () => instancesApi.delete(instance.id), 'Instância excluída.')
              }
            }}
          >
            {loading === 'delete' ? <Spinner size="sm" /> : <Trash2 className="w-3.5 h-3.5" />}
          </button>
        )}

        {isBusy && <Spinner size="sm" />}
      </div>
    </motion.div>
  )
}

function InfoRow({ label, value }) {
  return (
    <div>
      <span className="text-farm-muted/70">{label}: </span>
      <span className="text-farm-text/80 font-mono">{value}</span>
    </div>
  )
}

function MiniBar({ label, value, color }) {
  return (
    <div className="flex items-center gap-2 text-xs">
      <span className="text-farm-muted w-6">{label}</span>
      <div className="flex-1 h-1 bg-farm-border rounded-full">
        <div className={`h-full ${color} rounded-full transition-all duration-700`} style={{ width: `${value}%` }} />
      </div>
      <span className="text-farm-muted w-7 text-right">{value}%</span>
    </div>
  )
}
