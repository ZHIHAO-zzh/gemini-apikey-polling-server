export interface ApiKey {
  id: number;
  name: string;
  key: string;
  status: 'active' | 'disabled' | 'cooldown';
  cooldown_until: number | null; // unix timestamp ms
  total_requests: number;
  success_requests: number;
  failed_requests: number;
  consecutive_errors: number;
  last_used_at: number | null; // unix timestamp ms
  last_error: string | null;
  avg_latency: number; // ms
  created_at: number;
  updated_at: number;
}

export interface RequestLog {
  id: number;
  key_id: number | null;
  key_name: string | null;
  model: string;
  endpoint: string;
  method: string;
  status_code: number;
  is_stream: number; // 0 or 1
  ttft_latency: number; // ms
  total_latency: number; // ms
  retry_count: number;
  client_ip: string;
  error_message: string | null;
  created_at: number; // unix timestamp ms
}

export interface SystemSettings {
  max_retries: number;
  cooldown_duration: number; // seconds
  error_threshold: number;
  proxy_url: string;
  gateway_token: string;
  admin_password: string;
  log_retention_days: number;
  strict_persistent_cursor: boolean;
  last_key_id: number | null;
  key_usage_count_per_turn: number; // 单 Key 轮询停留期间要求达到的正常成功调用次数，默认 1
  current_key_used_count: number; // 当前 Key 在本轮停留中已成功使用的次数
}

export interface StatsOverview {
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
