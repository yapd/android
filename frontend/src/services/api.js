import axios from 'axios'
import toast from 'react-hot-toast'

const api = axios.create({
  baseURL: (import.meta.env.VITE_API_URL || '') + '/api',
  timeout: 30000,
})

api.interceptors.response.use(
  (res) => res,
  (err) => {
    const msg = err.response?.data?.message || err.message || 'Erro desconhecido'
    toast.error(msg)
    return Promise.reject(err)
  }
)

// ── Instances ─────────────────────────────────────────────────────────────────
export const instancesApi = {
  list:    ()        => api.get('/instances').then((r) => r.data.data),
  get:     (id)      => api.get(`/instances/${id}`).then((r) => r.data.data),
  create:  (body)    => api.post('/instances', body).then((r) => r.data),
  start:   (id)      => api.post(`/instances/${id}/start`).then((r) => r.data),
  stop:    (id)      => api.post(`/instances/${id}/stop`).then((r) => r.data),
  reboot:  (id)      => api.post(`/instances/${id}/reboot`).then((r) => r.data),
  wipe:    (id)      => api.post(`/instances/${id}/wipe`).then((r) => r.data),
  delete:  (id)      => api.delete(`/instances/${id}`).then((r) => r.data),
  setGPS:  (id, b)   => api.patch(`/instances/${id}/gps`, b).then((r) => r.data),
  setBat:  (id, b)   => api.patch(`/instances/${id}/battery`, b).then((r) => r.data),
  setGSM:  (id, b)   => api.patch(`/instances/${id}/gsm`, b).then((r) => r.data),
  sendSMS: (id, b)   => api.post(`/instances/${id}/sms`, b).then((r) => r.data),
}

// ── Profiles ──────────────────────────────────────────────────────────────────
export const profilesApi = {
  list: () => api.get('/profiles').then((r) => r.data.data),
  get:  (id) => api.get(`/profiles/${id}`).then((r) => r.data.data),
}

// ── System ────────────────────────────────────────────────────────────────────
export const systemApi = {
  metrics: () => api.get('/system/metrics').then((r) => r.data.data),
  devices: () => api.get('/system/devices').then((r) => r.data.data),
}

export default api
