import axios from 'axios'

const API_URL = import.meta.env.VITE_API_URL || ''

const api = axios.create({ baseURL: API_URL })

api.interceptors.request.use(cfg => {
  const token = localStorage.getItem('token')
  if (token) cfg.headers.Authorization = `Bearer ${token}`
  return cfg
})

api.interceptors.response.use(
  r => r,
  err => {
    if (err.response?.status === 401) {
      localStorage.removeItem('token')
      window.location.href = '/login'
    }
    return Promise.reject(err)
  }
)

export const authApi = {
  login: (username, password) => {
    const form = new FormData()
    form.append('username', username)
    form.append('password', password)
    return api.post('/api/auth/login', form)
  },
  me: () => api.get('/api/auth/me'),
  changePassword: (data) => api.post('/api/auth/change-password', data),
  getUsers: () => api.get('/api/auth/users'),
  createUser: (data) => api.post('/api/auth/users', data),
  updateUser: (id, data) => api.patch(`/api/auth/users/${id}`, data),
  deleteUser: (id) => api.delete(`/api/auth/users/${id}`),
}

export const productApi = {
  list: (params) => api.get('/api/products', { params }),
  get: (id) => api.get(`/api/products/${id}`),
  create: (data) => api.post('/api/products', data),
  update: (id, data) => api.patch(`/api/products/${id}`, data),
  delete: (id) => api.delete(`/api/products/${id}`),
  inbound: (data) => api.post('/api/products/inbound', data),
  inboundBulk: (data) => api.post('/api/products/inbound-bulk', data),
  outboundBulk: (data) => api.post('/api/products/outbound-bulk', data),
  importDb: (form) => api.post('/api/products/import-db', form),
  history: (params) => api.get('/api/products/history/all', { params }),
  updateHistory: (id, data) => api.patch(`/api/products/history/${id}`, data),
}

export const saleApi = {
  create: (data) => api.post('/api/sales', data),
  list: (params) => api.get('/api/sales', { params }),
  delete: (id) => api.delete(`/api/sales/${id}`),
  summary: (params) => api.get('/api/sales/summary', { params }),
}

export const wholesaleApi = {
  create: (data) => api.post('/api/wholesale-outbounds', data),
  list: (params) => api.get('/api/wholesale-outbounds', { params }),
  update: (id, data) => api.patch(`/api/wholesale-outbounds/${id}`, data),
  delete: (id) => api.delete(`/api/wholesale-outbounds/${id}`),
}

export const deliveryApi = {
  list: (params) => api.get('/api/deliveries', { params }),
  create: (data) => api.post('/api/deliveries', data),
  update: (id, data) => api.patch(`/api/deliveries/${id}`, data),
  delete: (id) => api.delete(`/api/deliveries/${id}`),
}

export const handoverApi = {
  list: () => api.get('/api/handover-notes'),
  create: (data) => api.post('/api/handover-notes', data),
  update: (id, data) => api.patch(`/api/handover-notes/${id}`, data),
  delete: (id) => api.delete(`/api/handover-notes/${id}`),
}

export const docApi = {
  list: (params) => api.get('/api/documents', { params }),
  get: (id) => api.get(`/api/documents/${id}`),
  create: (data) => api.post('/api/documents', data),
  delete: (id) => api.delete(`/api/documents/${id}`),
}

export default api
