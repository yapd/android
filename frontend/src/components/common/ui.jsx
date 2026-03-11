import { clsx } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs) {
  return twMerge(clsx(inputs))
}

// Status badge helper
const STATUS_MAP = {
  running:  { label: 'Rodando',   cls: 'badge-running'  },
  stopped:  { label: 'Parado',    cls: 'badge-stopped'  },
  starting: { label: 'Iniciando', cls: 'badge-starting' },
  stopping: { label: 'Parando',   cls: 'badge-starting' },
  creating: { label: 'Criando',   cls: 'badge-creating' },
  error:    { label: 'Erro',      cls: 'badge-error'    },
}

export function StatusBadge({ status }) {
  const { label, cls } = STATUS_MAP[status] || { label: status, cls: 'badge-stopped' }
  return (
    <span className={cls}>
      <span className={`w-1.5 h-1.5 rounded-full inline-block ${
        status === 'running' ? 'bg-farm-green animate-pulse' :
        status === 'error'   ? 'bg-farm-red' :
        status === 'starting'|| status === 'creating' ? 'bg-farm-yellow animate-pulse' :
        'bg-farm-muted'
      }`} />
      {label}
    </span>
  )
}

export function Spinner({ size = 'sm' }) {
  const s = size === 'sm' ? 'w-4 h-4' : size === 'md' ? 'w-6 h-6' : 'w-8 h-8'
  return (
    <svg className={`animate-spin ${s} text-farm-blue`} fill="none" viewBox="0 0 24 24">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
    </svg>
  )
}

export function PageHeader({ title, subtitle, children }) {
  return (
    <div className="flex items-start justify-between mb-6">
      <div>
        <h1 className="text-xl font-bold text-farm-text">{title}</h1>
        {subtitle && <p className="text-sm text-farm-muted mt-1">{subtitle}</p>}
      </div>
      {children && <div className="flex items-center gap-2">{children}</div>}
    </div>
  )
}

export function StatCard({ label, value, sub, icon: Icon, color = 'blue' }) {
  const colorMap = {
    green:  'text-farm-green bg-farm-green/10',
    red:    'text-farm-red bg-farm-red/10',
    blue:   'text-farm-blue bg-farm-blue/10',
    yellow: 'text-farm-yellow bg-farm-yellow/10',
    purple: 'text-farm-purple bg-farm-purple/10',
  }
  return (
    <div className="card">
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs text-farm-muted font-medium uppercase tracking-wide">{label}</span>
        {Icon && (
          <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${colorMap[color]}`}>
            <Icon className="w-4 h-4" />
          </div>
        )}
      </div>
      <p className="text-2xl font-bold text-farm-text">{value}</p>
      {sub && <p className="text-xs text-farm-muted mt-1">{sub}</p>}
    </div>
  )
}
