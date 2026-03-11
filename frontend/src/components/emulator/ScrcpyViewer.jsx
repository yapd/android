import { useEffect, useRef, useState } from 'react'
import { Monitor, Maximize2, RefreshCw } from 'lucide-react'
import { Spinner } from '../common/ui'

/**
 * ScrcpyViewer — Renderiza a tela do emulador via ws-scrcpy
 * Quando o ws-scrcpy não estiver disponível, exibe placeholder.
 */
export default function ScrcpyViewer({ instance }) {
  const iframeRef = useRef(null)
  const [status, setStatus] = useState('loading') // loading | ready | unavailable
  const [fullscreen, setFullscreen] = useState(false)

  const wsPort = instance.wsScrcpyPort
  // URL do ws-scrcpy: serve o cliente web + stream do emulador
  const scrcpyUrl = wsPort
    ? `http://${window.location.hostname}:${wsPort}/?action=stream&udid=emulator-${instance.emulatorPort}&ws=ws://${window.location.hostname}:${wsPort}`
    : null

  useEffect(() => {
    if (!wsPort || instance.status !== 'running') {
      setStatus('unavailable')
      return
    }
    setStatus('loading')
  }, [wsPort, instance.status])

  if (instance.status !== 'running') {
    return (
      <div className="card flex flex-col items-center justify-center py-16 text-center">
        <Monitor className="w-12 h-12 text-farm-muted mb-3" />
        <p className="text-sm font-medium text-farm-muted">Emulador não está rodando</p>
        <p className="text-xs text-farm-muted/60 mt-1">Inicie o emulador para acessar o controle remoto</p>
      </div>
    )
  }

  return (
    <div className={`card overflow-hidden ${fullscreen ? 'fixed inset-4 z-50' : ''}`}>
      {/* Toolbar */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <div className="w-2 h-2 rounded-full bg-farm-green animate-pulse" />
          <span className="text-xs font-medium text-farm-text">
            Tela Remota — emulator-{instance.emulatorPort}
          </span>
        </div>
        <div className="flex items-center gap-1.5">
          <button className="btn-ghost text-xs py-1" onClick={() => iframeRef.current?.contentWindow?.location.reload()}>
            <RefreshCw className="w-3 h-3" />
          </button>
          <button className="btn-ghost text-xs py-1" onClick={() => setFullscreen((f) => !f)}>
            <Maximize2 className="w-3 h-3" />
          </button>
        </div>
      </div>

      {/* Screen */}
      <div
        className="relative bg-black rounded-xl overflow-hidden flex items-center justify-center"
        style={{ height: fullscreen ? 'calc(100vh - 120px)' : '480px' }}
      >
        {status === 'loading' && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-black/80 z-10">
            <Spinner size="lg" />
            <p className="text-xs text-farm-muted">Conectando ao ws-scrcpy...</p>
          </div>
        )}

        {status === 'unavailable' || !scrcpyUrl ? (
          <div className="flex flex-col items-center justify-center gap-3 text-center px-6">
            <Monitor className="w-16 h-16 text-farm-muted/30" />
            <div>
              <p className="text-sm font-medium text-farm-text">ws-scrcpy não configurado</p>
              <p className="text-xs text-farm-muted mt-1 max-w-xs">
                Para ativar o controle remoto, inicie o ws-scrcpy na porta do emulador.
                Veja a documentação para configurar o Paper View.
              </p>
            </div>
            <div className="bg-farm-bg rounded-lg px-4 py-2 font-mono text-xs text-farm-muted border border-farm-border">
              npx @yume-chan/ws-scrcpy --port {instance.wsScrcpyPort || 8886}
            </div>
          </div>
        ) : (
          <iframe
            ref={iframeRef}
            src={scrcpyUrl}
            className="w-full h-full border-0"
            allow="clipboard-read; clipboard-write"
            onLoad={() => setStatus('ready')}
            title={`Tela remota — ${instance.name}`}
          />
        )}
      </div>

      {/* Instructions */}
      {status === 'ready' && (
        <p className="text-xs text-farm-muted mt-2 text-center">
          Clique na tela para interagir • Mouse simula toque • Teclado funciona normalmente
        </p>
      )}
    </div>
  )
}
