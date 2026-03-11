import { useQuery } from '@tanstack/react-query'
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts'
import { useState, useEffect } from 'react'
import { Cpu, MemoryStick, HardDrive, Smartphone, Play, Activity } from 'lucide-react'
import { useSocketStore } from '../store/socketStore'
import { instancesApi } from '../services/api'
import { StatCard, PageHeader } from '../components/common/ui'
import { useNavigate } from 'react-router-dom'
import { StatusBadge } from '../components/common/ui'

export default function DashboardPage() {
  const { instances, systemMetrics } = useSocketStore()
  const navigate = useNavigate()
  const [cpuHistory, setCpuHistory] = useState([])
  const [ramHistory, setRamHistory] = useState([])

  useEffect(() => {
    if (!systemMetrics) return
    const ts = new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', second: '2-digit' })
    setCpuHistory((h) => [...h.slice(-29), { time: ts, value: systemMetrics.cpuLoad }])
    setRamHistory((h) => [...h.slice(-29), {
      time: ts,
      value: Math.round((systemMetrics.ramUsedMb / systemMetrics.ramTotalMb) * 100),
    }])
  }, [systemMetrics])

  const stats = {
    total:   instances.length,
    running: instances.filter((i) => i.status === 'running').length,
    stopped: instances.filter((i) => i.status === 'stopped').length,
    error:   instances.filter((i) => i.status === 'error').length,
  }

  return (
    <div>
      <PageHeader
        title="Dashboard"
        subtitle="Visão geral do Android Device Farm"
      />

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
        <StatCard label="Instâncias"  value={stats.total}   icon={Smartphone} color="blue"   sub="total" />
        <StatCard label="Rodando"     value={stats.running} icon={Play}        color="green"  sub="online agora" />
        <StatCard label="CPU Host"    value={`${systemMetrics?.cpuLoad ?? '—'}%`} icon={Cpu}  color="purple" sub="servidor" />
        <StatCard
          label="RAM Host"
          value={systemMetrics ? `${systemMetrics.ramUsedMb}MB` : '—'}
          icon={Activity}
          color="yellow"
          sub={systemMetrics ? `de ${systemMetrics.ramTotalMb}MB` : ''}
        />
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-6">
        <ChartCard title="CPU do Servidor (%)" data={cpuHistory} color="#58A6FF" />
        <ChartCard title="RAM do Servidor (%)" data={ramHistory} color="#BC8CFF" />
      </div>

      {/* Recent instances */}
      <div className="card">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-sm font-semibold">Instâncias Recentes</h2>
          <button className="text-xs text-farm-blue hover:underline" onClick={() => navigate('/instances')}>
            Ver todas →
          </button>
        </div>
        {instances.length === 0 ? (
          <p className="text-sm text-farm-muted text-center py-8">
            Nenhuma instância criada ainda.
          </p>
        ) : (
          <div className="space-y-2">
            {instances.slice(0, 8).map((inst) => (
              <div
                key={inst.id}
                className="flex items-center gap-3 px-3 py-2.5 rounded-lg hover:bg-farm-border/30 cursor-pointer transition-colors"
                onClick={() => navigate(`/instances/${inst.id}`)}
              >
                <Smartphone className="w-4 h-4 text-farm-muted flex-shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{inst.name}</p>
                  <p className="text-xs text-farm-muted font-mono truncate">
                    {inst.profile?.model || inst.avdName || '—'}
                  </p>
                </div>
                <div className="flex items-center gap-3 text-xs text-farm-muted">
                  <span className="font-mono">:{inst.emulatorPort || '—'}</span>
                  <StatusBadge status={inst.status} />
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

function ChartCard({ title, data, color }) {
  return (
    <div className="card">
      <p className="text-xs text-farm-muted font-medium mb-3">{title}</p>
      {data.length < 2 ? (
        <div className="h-32 flex items-center justify-center text-farm-muted text-xs">
          Aguardando dados...
        </div>
      ) : (
        <ResponsiveContainer width="100%" height={120}>
          <AreaChart data={data} margin={{ top: 0, right: 0, left: -20, bottom: 0 }}>
            <defs>
              <linearGradient id={`grad-${color}`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={color} stopOpacity={0.3} />
                <stop offset="100%" stopColor={color} stopOpacity={0} />
              </linearGradient>
            </defs>
            <XAxis dataKey="time" tick={{ fontSize: 9, fill: '#7D8590' }} />
            <YAxis domain={[0, 100]} tick={{ fontSize: 9, fill: '#7D8590' }} />
            <Tooltip
              contentStyle={{ background: '#161B22', border: '1px solid #30363D', borderRadius: 8, fontSize: 11 }}
              labelStyle={{ color: '#7D8590' }}
              itemStyle={{ color: color }}
            />
            <Area
              type="monotone"
              dataKey="value"
              stroke={color}
              strokeWidth={1.5}
              fill={`url(#grad-${color})`}
              dot={false}
            />
          </AreaChart>
        </ResponsiveContainer>
      )}
    </div>
  )
}
