import { useParams, useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import {
  ArrowLeft, Play, Square, RotateCcw, Trash2, Eraser,
  Smartphone, Info, Terminal,
} from 'lucide-react'
import { instancesApi } from '../services/api'
import { useSocketStore } from '../store/socketStore'
import { StatusBadge, Spinner, PageHeader } from '../components/common/ui'
import ControlPanel from '../components/emulator/ControlPanel'
import ScrcpyViewer from '../components/emulator/ScrcpyViewer'

export default function InstanceDetailPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const qc = useQueryClient()
  const { instances } = useSocketStore()

  // Prioriza dado em tempo real do socket, fallback para query
  const liveInst = instances.find((i) => i.id === id)
  const { data: fetched, isLoading } = useQuery({
    queryKey: ['instances', id],
    queryFn: () => instancesApi.get(id),
    enabled: !liveInst,
  })
  const instance = liveInst || fetched

  const runMutation = (fn, msg) =>
    useMutation({
      mutationFn: fn,
      onSuccess: () => { toast.success(msg); qc.invalidateQueries(['instances']) },
    })

  const startMut  = useMutation({ mutationFn: () => instancesApi.start(id),  onSuccess: () => toast.success('Iniciando...') })
  const stopMut   = useMutation({ mutationFn: () => instancesApi.stop(id),   onSuccess: () => toast.success('Parando...')   })
  const rebootMut = useMutation({ mutationFn: () => instancesApi.reboot(id), onSuccess: () => toast.success('Reiniciando...')})
  const wipeMut   = useMutation({ mutationFn: () => instancesApi.wipe(id),   onSuccess: () => toast.success('Dados limpos!') })
  const deleteMut = useMutation({
    mutationFn: () => instancesApi.delete(id),
    onSuccess: () => { toast.success('Instância excluída.'); navigate('/instances') },
  })

  if (isLoading || !instance) {
    return (
      <div className="flex items-center justify-center py-24">
        <Spinner size="lg" />
      </div>
    )
  }

  const isRunning = instance.status === 'running'
  const isStopped = instance.status === 'stopped' || instance.status === 'error'
  const isBusy    = ['starting', 'stopping', 'creating'].includes(instance.status)

  return (
    <div>
      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <button className="btn-ghost text-xs" onClick={() => navigate('/instances')}>
          <ArrowLeft className="w-3.5 h-3.5" /> Voltar
        </button>
        <div className="flex-1">
          <div className="flex items-center gap-3">
            <h1 className="text-lg font-bold">{instance.name}</h1>
            <StatusBadge status={instance.status} />
          </div>
          <p className="text-xs text-farm-muted font-mono mt-0.5">
            {instance.avdName} · porta {instance.emulatorPort || '—'}
          </p>
        </div>
        {/* Lifecycle buttons */}
        <div className="flex items-center gap-2">
          {isStopped && (
            <button className="btn-success" onClick={() => startMut.mutate()} disabled={startMut.isPending || isBusy}>
              {startMut.isPending ? <Spinner size="sm" /> : <Play className="w-4 h-4" />} Start
            </button>
          )}
          {isRunning && (
            <>
              <button className="btn-warning" onClick={() => stopMut.mutate()} disabled={stopMut.isPending}>
                {stopMut.isPending ? <Spinner size="sm" /> : <Square className="w-4 h-4" />} Stop
              </button>
              <button className="btn-ghost" onClick={() => rebootMut.mutate()} disabled={rebootMut.isPending}>
                {rebootMut.isPending ? <Spinner size="sm" /> : <RotateCcw className="w-4 h-4" />}
              </button>
            </>
          )}
          {isStopped && (
            <button className="btn-ghost" onClick={() => { if(confirm('Limpar todos os dados?')) wipeMut.mutate() }} disabled={wipeMut.isPending}>
              {wipeMut.isPending ? <Spinner size="sm" /> : <Eraser className="w-4 h-4" />} Wipe
            </button>
          )}
          <button className="btn-danger" onClick={() => { if(confirm(`Excluir "${instance.name}"?`)) deleteMut.mutate() }} disabled={deleteMut.isPending}>
            {deleteMut.isPending ? <Spinner size="sm" /> : <Trash2 className="w-4 h-4" />}
          </button>
        </div>
      </div>

      {/* 2-column layout */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-5">
        {/* Left: Scrcpy viewer (2/3) */}
        <div className="xl:col-span-2 space-y-5">
          <ScrcpyViewer instance={instance} />

          {/* Build info */}
          {instance.profile && (
            <div className="card">
              <div className="flex items-center gap-2 mb-3">
                <Info className="w-4 h-4 text-farm-muted" />
                <h3 className="text-sm font-semibold">Perfil de Spoofing</h3>
              </div>
              <div className="grid grid-cols-2 gap-x-6 gap-y-1 text-xs font-mono">
                {Object.entries(instance.profile.buildProps || {}).map(([k, v]) => (
                  <div key={k} className="flex gap-2">
                    <span className="text-farm-muted truncate w-44">{k}</span>
                    <span className="text-farm-green truncate">{v}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Right: Controls (1/3) */}
        <div>
          <ControlPanel instance={instance} />
        </div>
      </div>
    </div>
  )
}
