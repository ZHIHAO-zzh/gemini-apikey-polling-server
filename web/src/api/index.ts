export interface ApiKeyItem {
  id: number;
  name: string;
  key: string;
  masked_key: string;
  status: 'active' | 'disabled' | 'cooldown';
  cooldown_until: number | null;
  total_requests: number;
  success_requests: number;
  failed_requests: number;
  consecutive_errors: number;
  last_used_at: number | null;
  last_error: string | null;
  avg_latency: number;
  created_at: number;
}

export interface RequestLogItem {
  id: number;
  key_id: number | null;
  key_name: string | null;
  model: string;
  endpoint: string;
  method: string;
  status_code: number;
  is_stream: number;
  ttft_latency: number;
  total_latency: number;
  retry_count: number;
  client_ip: string;
  error_message: string | null;
  created_at: number;
}

export interface StatsOverviewData {
  totalRequests: number;
  successRequests: number;
  failedRequests: number;
  successRate: number;
  activeKeys: number;
  totalKeys: number;
  cooldownKeys: number;
  avgLatency: number;
  avgTtft: number;
}

export interface SystemSettingsData {
  max_retries: number;
  cooldown_duration: number;
  error_threshold: number;
  proxy_url: string;
  gateway_token: string;
  admin_password?: string;
  log_retention_days: number;
  strict_persistent_cursor: boolean;
  last_key_id: number | null;
  key_usage_count_per_turn?: number;
  current_key_used_count?: number;
  current_cursor_key?: {
    id: number;
    name: string;
    masked_key: string;
  } | null;
}

const getToken = () => localStorage.getItem('admin_token') || '';

async function request<T = any>(url: string, options: RequestInit = {}): Promise<T> {
  const headers = new Headers(options.headers || {});
  const token = getToken();
  if (token) {
    headers.set('x-admin-token', token);
  }
  if (!headers.has('Content-Type') && options.body && typeof options.body === 'string') {
    headers.set('Content-Type', 'application/json');
  }

  const res = await fetch(url, { ...options, headers });
  
  if (res.status === 401) {
    if (!url.includes('/api/admin/auth/login')) {
      window.dispatchEvent(new CustomEvent('auth-required'));
    }
  }

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data.message || data.error?.message || `HTTP ${res.status}`);
  }
  return data;
}

export const api = {
  // Auth
  checkAuthStatus: () => request<{ code: number; data: { authRequired: boolean } }>('/api/admin/auth/status'),
  login: (password: string) => request<{ code: number; token: string }>('/api/admin/auth/login', {
    method: 'POST',
    body: JSON.stringify({ password })
  }),

  // Stats
  getStatsOverview: () => request<{ code: number; data: StatsOverviewData }>('/api/admin/stats/overview'),
  getStatsTimeSeries: (hours = 24) => request<{ code: number; data: { time: string; success: number; failed: number }[] }>(`/api/admin/stats/timeseries?hours=${hours}`),
  getStatsModels: () => request<{ code: number; data: { model: string; count: number }[] }>('/api/admin/stats/models'),

  // Keys
  getKeys: () => request<{ code: number; data: ApiKeyItem[] }>('/api/admin/keys'),
  addKey: (data: { name?: string; key: string }) => request('/api/admin/keys', {
    method: 'POST',
    body: JSON.stringify(data)
  }),
  batchAddKeys: (text: string) => request('/api/admin/keys/batch', {
    method: 'POST',
    body: JSON.stringify({ text })
  }),
  updateKey: (id: number, data: Partial<ApiKeyItem>) => request(`/api/admin/keys/${id}`, {
    method: 'PUT',
    body: JSON.stringify(data)
  }),
  deleteKey: (id: number) => request(`/api/admin/keys/${id}`, {
    method: 'DELETE'
  }),
  resetAllStatus: () => request('/api/admin/keys/reset-all-status', {
    method: 'POST'
  }),
  testKey: (id: number) => request<{ code: number; data: { success: boolean; latency: number; error?: string } }>(`/api/admin/keys/${id}/test`, {
    method: 'POST'
  }),

  // Logs
  getLogs: (params: { page?: number; pageSize?: number; model?: string; keyId?: number; statusFilter?: string }) => {
    const q = new URLSearchParams();
    if (params.page) q.set('page', String(params.page));
    if (params.pageSize) q.set('pageSize', String(params.pageSize));
    if (params.model) q.set('model', params.model);
    if (params.keyId) q.set('keyId', String(params.keyId));
    if (params.statusFilter) q.set('statusFilter', params.statusFilter);
    return request<{ code: number; data: { list: RequestLogItem[]; total: number; page: number; pageSize: number } }>(`/api/admin/logs?${q.toString()}`);
  },
  clearLogs: () => request('/api/admin/logs', { method: 'DELETE' }),
  cleanLogs: (days: number) => request('/api/admin/logs/clean', {
    method: 'POST',
    body: JSON.stringify({ days })
  }),

  // Settings
  getSettings: () => request<{ code: number; data: SystemSettingsData }>('/api/admin/settings'),
  saveSettings: (settings: Partial<SystemSettingsData>) => request('/api/admin/settings', {
    method: 'PUT',
    body: JSON.stringify(settings)
  }),
  testProxy: (proxy_url: string) => request<{ code: number; data: { success: boolean; latency: number; error?: string } }>('/api/admin/settings/test-proxy', {
    method: 'POST',
    body: JSON.stringify({ proxy_url })
  })
};
