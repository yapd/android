import { NavLink, Link } from 'react-router-dom'
import {
  LayoutDashboard, Smartphone, Server, Wifi, WifiOff,
  Activity, Cpu,
} from 'lucide-react'
import { useSocketStore } from '../../store/socketStore'

const navItems = [
  { to: '/dashboard', label: 'Dashboard',    icon: LayoutDashboard },
  { to: '/instances', label: 'Instâncias',   icon: Smartphone },
  { to: '/system',    label: 'Sistema',      icon: Server },
]

export default function Sidebar() {
  const { connected, instances, systemMetrics } = useSocketStore()
  const running = instances.filter((i) => i.status === 'running').length

  return (
    <aside className="w-60 min-h-screen bg-farm-surface border-r border-farm-border flex flex-col">
      {/* Logo */}
      <div className="px-4 py-5 border-b border-farm-border">
        <Link to="/dashboard" className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-farm-green/20 flex items-center justify-center">
            <Smartphone className="w-4 h-4 text-farm-green" />
          </div>
          <div>
            <p className="text-sm font-bold text-farm-text leading-none">Device Farm</p>
            <p className="text-xs text-farm-muted mt-0.5">Android ARM64</p>
          </div>
        </Link>
      </div>

      {/* Status bar */}
      <div className="px-4 py-3 border-b border-farm-border">
        <div className="flex items-center justify-between text-xs">
          <span className="flex items-center gap-1.5 text-farm-muted">
            {connected
              ? <><Wifi className="w-3 h-3 text-farm-green" /><span className="text-farm-green">Conectado</span></>
              : <><WifiOff className="w-3 h-3 text-farm-red" /><span className="text-farm-red">Offline</span></>
            }
          </span>
          <span className="text-farm-muted">{running} rodando</span>
        </div>
        {systemMetrics && (
          <div className="mt-2 space-y-1">
            <MetricBar label="CPU" value={systemMetrics.cpuLoad} color="farm-blue" />
            <MetricBar
              label="RAM"
              value={Math.round((systemMetrics.ramUsedMb / systemMetrics.ramTotalMb) * 100)}
              color="farm-purple"
            />
          </div>
        )}
      </div>

      {/* Nav */}
      <nav className="flex-1 px-2 py-4 space-y-1">
        {navItems.map(({ to, label, icon: Icon }) => (
          <NavLink
            key={to}
            to={to}
            className={({ isActive }) =>
              `flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors ${
                isActive
                  ? 'bg-farm-blue/15 text-farm-blue'
                  : 'text-farm-muted hover:text-farm-text hover:bg-farm-border/50'
              }`
            }
          >
            <Icon className="w-4 h-4 flex-shrink-0" />
            {label}
          </NavLink>
        ))}
      </nav>

      {/* Footer */}
      <div className="px-4 py-3 border-t border-farm-border">
        <p className="text-xs text-farm-muted font-mono">v1.0.0 · ARM64</p>
      </div>
    </aside>
  )
}

function MetricBar({ label, value, color }) {
  return (
    <div className="flex items-center gap-2">
      <span className="text-farm-muted w-7">{label}</span>
      <div className="flex-1 h-1.5 bg-farm-border rounded-full overflow-hidden">
        <div
          className={`h-full bg-${color} rounded-full transition-all duration-500`}
          style={{ width: `${Math.min(value, 100)}%` }}
        />
      </div>
      <span className="text-farm-muted w-8 text-right">{value}%</span>
    </div>
  )
}
