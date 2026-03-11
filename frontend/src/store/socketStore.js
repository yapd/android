import { create } from 'zustand'
import { io } from 'socket.io-client'
import toast from 'react-hot-toast'

const SOCKET_URL = import.meta.env.VITE_API_URL || ''

export const useSocketStore = create((set, get) => ({
  socket: null,
  connected: false,
  instances: [],
  systemMetrics: null,

  connect() {
    if (get().socket) return

    const socket = io(SOCKET_URL, {
      transports: ['websocket', 'polling'],
      reconnectionDelay: 2000,
    })

    socket.on('connect', () => {
      set({ connected: true })
      toast.success('Conectado ao servidor', { id: 'ws-connect', duration: 2000 })
    })

    socket.on('disconnect', () => {
      set({ connected: false })
      toast.error('Conexão perdida. Reconectando...', { id: 'ws-disconnect' })
    })

    socket.on('instances:list', (data) => {
      set({ instances: data })
    })

    socket.on('instance:update', (update) => {
      set((state) => ({
        instances: state.instances.map((inst) =>
          inst.id === update.id ? { ...inst, ...update } : inst
        ),
      }))
    })

    socket.on('system:metrics', (metrics) => {
      set({ systemMetrics: metrics })
    })

    set({ socket })
  },

  disconnect() {
    const { socket } = get()
    if (socket) {
      socket.disconnect()
      set({ socket: null, connected: false })
    }
  },
}))
