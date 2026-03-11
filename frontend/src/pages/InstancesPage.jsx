import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { AnimatePresence } from 'framer-motion'
import { Plus, RefreshCw, Smartphone, Play, Square, AlertTriangle, Loader2 } from 'lucide-react'
import { instancesApi } from '../services/api'
import { useSocketStore } from '../store/socketStore'
import InstanceCard from '../components/emulator/InstanceCard'
import CreateInstanceModal from '../components/emulator/CreateInstanceModal'
import { PageHeader, StatCard } from '../components/common/ui'

export default function InstancesPage() {
  const [showCreate, setShowCreate] = useState(false)
  const [filter, setFilter] = useState('all')
  const { instances } = useSocketStore()

  const { refetch, isFetching } = useQuery({
    queryKey: ['instances'],
    queryFn: instancesApi.list,
    refetchInterval: 8000,
  })

  const filtered = instances.filter((i) => {
    if (filter === 'all') return true
    return i.status === filter
  })

  const stats = {
    total:   instances.length,
    running: instances.filter((i) => i.status === 'running').length,
    stopped: instances.filter((i) => i.status === 'stopped').length,
    error:   instances.filter((i) => i.status === 'error').length,
  }

  return (
    <div>
      <PageHeader
        title="Instâncias"
        subtitle={`${stats.total} emuladores gerenciados`}
      >
        <button
          className="btn-ghost text-xs"
          onClick={() => refetch()}
          disabled={isFetching}
        >
          <RefreshCw className={`w-3.5 h-3.5 ${isFetching ? 'animate-spin' : ''}`} />
          Atualizar
        </button>
        <button className="btn-success" onClick={() => setShowCreate(true)}>
          <Plus className="w-4 h-4" /> Nova Instância
        </button>
      </PageHeader>

      {/* Stats */}
      <div className="grid grid-cols-4 gap-3 mb-6">
        <StatCard label="Total"   value={stats.total}   icon={Smartphone}      color="blue"  />
        <StatCard label="Rodando" value={stats.running} icon={Play}            color="green" />
        <StatCard label="Parados" value={stats.stopped} icon={Square}          color="purple"/>
        <StatCard label="Erro"    value={stats.error}   icon={AlertTriangle}   color="red"   />
      </div>

      {/* Filter tabs */}
      <div className="flex items-center gap-1.5 mb-4 border-b border-farm-border pb-3">
        {['all', 'running', 'stopped', 'creating', 'error'].map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
              filter === f
                ? 'bg-farm-blue/15 text-farm-blue'
                : 'text-farm-muted hover:text-farm-text'
            }`}
          >
            {f === 'all' ? 'Todos' : f.charAt(0).toUpperCase() + f.slice(1)}
          </button>
        ))}
      </div>

      {/* Grid */}
      {filtered.length === 0 ? (
        <div className="text-center py-16 text-farm-muted">
          <Smartphone className="w-12 h-12 mx-auto mb-3 opacity-20" />
          <p className="text-sm font-medium">Nenhuma instância encontrada</p>
          <p className="text-xs mt-1">
            {filter === 'all' ? 'Crie sua primeira instância clicando em "Nova Instância"' : `Sem instâncias com status "${filter}"`}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          <AnimatePresence mode="popLayout">
            {filtered.map((inst) => (
              <InstanceCard key={inst.id} instance={inst} />
            ))}
          </AnimatePresence>
        </div>
      )}

      {showCreate && <CreateInstanceModal onClose={() => setShowCreate(false)} />}
    </div>
  )
}
