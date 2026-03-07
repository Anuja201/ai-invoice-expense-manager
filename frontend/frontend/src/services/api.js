/**
 * services/api.js
 * Axios instance with JWT interceptors for all API calls
 */

import axios from 'axios';

const api = axios.create({
  baseURL: '/api',
  headers: { 'Content-Type': 'application/json' },
});

// Attach JWT token to every request
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// Handle 401 globally - redirect to login
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      localStorage.removeItem('token');
      localStorage.removeItem('user');
      window.location.href = '/login';
    }
    return Promise.reject(error);
  }
);

// Auth
export const authService = {
  register: (data) => api.post('/auth/register', data),
  login: (data) => api.post('/auth/login', data),
  logout: () => api.post('/auth/logout'),
  getMe: () => api.get('/auth/me'),
  googleLogin: (token) => api.post('/auth/google', { token }),
};

// Dashboard
export const dashboardService = {
  getSummary: () => api.get('/dashboard/summary'),
  getMonthlyChart: () => api.get('/dashboard/chart/monthly'),
  getCategoryChart: () => api.get('/dashboard/chart/categories'),
  getRecentTransactions: () => api.get('/dashboard/recent'),
};

// Invoices
export const invoiceService = {
  list: (params) => api.get('/invoices/', { params }),
  create: (data) => api.post('/invoices/', data),
  get: (id) => api.get(`/invoices/${id}`),
  update: (id, data) => api.put(`/invoices/${id}`, data),
  delete: (id) => api.delete(`/invoices/${id}`),
  upload: (file) => {
    const form = new FormData();
    form.append('file', file);
    return api.post('/invoices/upload', form, {
      headers: { 'Content-Type': 'multipart/form-data' }
    });
  },
};

// Expenses
export const expenseService = {
  list: (params) => api.get('/expenses/', { params }),
  create: (data) => api.post('/expenses/', data),
  get: (id) => api.get(`/expenses/${id}`),
  update: (id, data) => api.put(`/expenses/${id}`, data),
  delete: (id) => api.delete(`/expenses/${id}`),
};

// Categories
export const categoryService = {
  list: () => api.get('/categories/'),
};

// OCR
export const ocrService = {
  extract: (file) => {
    const form = new FormData();
    form.append('file', file);
    return api.post('/ocr/extract', form, {
      headers: { 'Content-Type': 'multipart/form-data' }
    });
  },
  test: () => api.get('/ocr/test'),
};

// Predictions
export const predictionsService = {
  nextMonth: () => api.get('/predictions/next-month'),
  anomalies: () => api.get('/predictions/anomalies'),
  duplicates: () => api.get('/predictions/duplicates'),
  budgetRecommendation: () => api.get('/predictions/budget-recommendation'),
};

// Insights
export const insightsService = {
  get: () => api.get('/insights/'),
};

export default api;
