import { useQuery } from '@tanstack/react-query'
import { systemApi } from '../services/api'
import { PageHeader, Spinner } from '../components/common/ui'
import { Cpu, HardDrive, MemoryStick, Terminal } from 'lucide-react'

export default function SystemPage() {
  const { data, isLoading, refetch } = useQuery({
    queryKey: ['system-metrics'],
    queryFn: systemApi.metrics,
    refetchInterval: 10000,
  })
  const { data: devices = [] } = useQuery({
    queryKey: ['adb-devices'],
    queryFn: systemApi.devices,
    refetchInterval: 15000,
  })

  if (isLoading) return (
    <div className="flex items-center justify-center py-24"><Spinner size="lg" /></div>
  )

  return (
    <div>
      <PageHeader title="Sistema" subtitle="Métricas do servidor host ARM64" />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-6">
        {/* CPU */}
        <div className="card">
          <div className="flex items-center gap-2 mb-3">
            <Cpu className="w-4 h-4 text-farm-blue" />
            <h3 className="text-sm font-semibold">Processador</h3>
          </div>
          <p className="text-lg font-bold">{data?.cpu.brand}</p>
          <p className="text-xs text-farm-muted">{data?.cpu.manufacturer}</p>
          <div className="mt-3 space-y-1 text-xs">
            <Row label="Núcleos físicos"  value={data?.cpu.cores} />
            <Row label="Threads"          value={data?.cpu.threads} />
            <Row label="Frequência"       value={`${data?.cpu.speed} GHz`} />
            <Row label="Uso atual"        value={`${data?.cpu.load}%`} color="farm-blue" />
          </div>
        </div>

        {/* RAM */}
        <div className="card">
          <div className="flex items-center gap-2 mb-3">
            <MemoryStick className="w-4 h-4 text-farm-purple" />
            <h3 className="text-sm font-semibold">Memória RAM</h3>
          </div>
          <p className="text-lg font-bold">{data?.memory.total} MB</p>
          <p className="text-xs text-farm-muted">Total disponível</p>
          <div className="mt-3 space-y-1 text-xs">
            <Row label="Em uso"   value={`${data?.memory.used} MB`} color="farm-purple" />
            <Row label="Livre"    value={`${data?.memory.free} MB`} color="farm-green" />
            <Row label="Uso (%)"  value={`${data?.memory.usedPercent}%`} />
          </div>
          <div className="mt-3 h-2 bg-farm-border rounded-full overflow-hidden">
            <div
              className="h-full bg-farm-purple rounded-full transition-all duration-700"
              style={{ width: `${data?.memory.usedPercent}%` }}
            />
          </div>
        </div>

        {/* Disk */}
        <div className="card">
          <div className="flex items-center gap-2 mb-3">
            <HardDrive className="w-4 h-4 text-farm-green" />
            <h3 className="text-sm font-semibold">Armazenamento</h3>
          </div>
          {data?.disk.map((d, i) => (
            <div key={i} className="mb-3">
              <p className="text-xs text-farm-muted font-mono">{d.fs}</p>
              <p className="text-sm font-bold">{d.used} GB <span className="text-farm-muted font-normal">/ {d.size} GB</span></p>
              <div className="mt-1.5 h-1.5 bg-farm-border rounded-full overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all duration-700 ${d.usedPercent > 80 ? 'bg-farm-red' : d.usedPercent > 60 ? 'bg-farm-yellow' : 'bg-farm-green'}`}
                  style={{ width: `${d.usedPercent}%` }}
                />
              </div>
              <p className="text-xs text-farm-muted mt-0.5">{d.usedPercent}% usado</p>
            </div>
          ))}
        </div>
      </div>

      {/* ADB Devices */}
      <div className="card">
        <div className="flex items-center gap-2 mb-3">
          <Terminal className="w-4 h-4 text-farm-orange" />
          <h3 className="text-sm font-semibold">Dispositivos ADB</h3>
          <span className="badge badge-creating ml-auto">{devices.length} detectados</span>
        </div>
        {devices.length === 0 ? (
          <p className="text-xs text-farm-muted text-center py-4">
            Nenhum dispositivo ADB detectado. Inicie um emulador primeiro.
          </p>
        ) : (
          <div className="space-y-2">
            {devices.map((d, i) => (
              <div key={i} className="flex items-center gap-3 px-3 py-2 bg-farm-bg rounded-lg font-mono text-xs">
                <span className="text-farm-blue">{d.serial}</span>
                <span className={`${d.status === 'device' ? 'text-farm-green' : 'text-farm-yellow'}`}>{d.status}</span>
                <span className="text-farm-muted">{d.info}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

function Row({ label, value, color }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-farm-muted">{label}</span>
      <span className={`font-mono font-medium ${color ? `text-${color}` : 'text-farm-text'}`}>{value}</span>
    </div>
  )
}
