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
  history: (params) => api.get('/api/products/history/all', { params }),
}

export const saleApi = {
  create: (data) => api.post('/api/sales', data),
  list: (params) => api.get('/api/sales', { params }),
  delete: (id) => api.delete(`/api/sales/${id}`),
  summary: (params) => api.get('/api/sales/summary', { params }),
}

export const deliveryApi = {
  list: (params) => api.get('/api/deliveries', { params }),
  create: (data) => api.post('/api/deliveries', data),
  update: (id, data) => api.patch(`/api/deliveries/${id}`, data),
  delete: (id) => api.delete(`/api/deliveries/${id}`),
}

export const docApi = {
  list: (params) => api.get('/api/documents', { params }),
  get: (id) => api.get(`/api/documents/${id}`),
  create: (data) => api.post('/api/documents', data),
  delete: (id) => api.delete(`/api/documents/${id}`),
}

export default api
