import Database from 'better-sqlite3';
import { config } from '../config.js';
import type { SystemSettings, ApiKey, RequestLog, StatsOverview } from '../types/index.js';

export const db = new Database(config.dbPath);

// 开启 WAL 模式以获得极高的并发读写性能
db.pragma('journal_mode = WAL');
db.pragma('synchronous = NORMAL');

export function initDatabase() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS api_keys (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      key TEXT NOT NULL UNIQUE,
      status TEXT NOT NULL DEFAULT 'active', -- 'active', 'disabled', 'cooldown'
      cooldown_until INTEGER,
      total_requests INTEGER NOT NULL DEFAULT 0,
      success_requests INTEGER NOT NULL DEFAULT 0,
      failed_requests INTEGER NOT NULL DEFAULT 0,
      consecutive_errors INTEGER NOT NULL DEFAULT 0,
      last_used_at INTEGER,
      last_error TEXT,
      avg_latency REAL NOT NULL DEFAULT 0,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_api_keys_status ON api_keys(status);

    CREATE TABLE IF NOT EXISTS request_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      key_id INTEGER,
      key_name TEXT,
      model TEXT NOT NULL,
      endpoint TEXT NOT NULL,
      method TEXT NOT NULL,
      status_code INTEGER NOT NULL,
      is_stream INTEGER NOT NULL DEFAULT 0,
      ttft_latency REAL NOT NULL DEFAULT 0,
      total_latency REAL NOT NULL DEFAULT 0,
      retry_count INTEGER NOT NULL DEFAULT 0,
      client_ip TEXT NOT NULL,
      error_message TEXT,
      created_at INTEGER NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_logs_created_at ON request_logs(created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_logs_model ON request_logs(model);
    CREATE INDEX IF NOT EXISTS idx_logs_status ON request_logs(status_code);

    CREATE TABLE IF NOT EXISTS system_settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );
  `);

  // 初始化默认配置
  const defaultSettings: Record<string, string> = {
    max_retries: '3',
    cooldown_duration: '60', // 默认冷却 60 秒
    error_threshold: '3',   // 连续 3 次错误自动冷却
    proxy_url: config.defaultProxyUrl,
    gateway_token: config.defaultGatewayToken,
    admin_password: config.defaultAdminPassword,
    log_retention_days: '30',
    strict_persistent_cursor: 'true',
    last_key_id: '0',
    key_usage_count_per_turn: '1',
    current_key_used_count: '0'
  };

  const getStmt = db.prepare('SELECT value FROM system_settings WHERE key = ?');
  const insertStmt = db.prepare('INSERT OR IGNORE INTO system_settings (key, value) VALUES (?, ?)');

  for (const [k, v] of Object.entries(defaultSettings)) {
    const row = getStmt.get(k);
    if (!row) {
      insertStmt.run(k, v);
    }
  }
}

// 系统设置服务
export const SettingsRepo = {
  getAll(): SystemSettings {
    const rows = db.prepare('SELECT key, value FROM system_settings').all() as { key: string; value: string }[];
    const map = new Map<string, string>();
    for (const r of rows) {
      map.set(r.key, r.value);
    }

    return {
      max_retries: parseInt(map.get('max_retries') || '3', 10),
      cooldown_duration: parseInt(map.get('cooldown_duration') || '60', 10),
      error_threshold: parseInt(map.get('error_threshold') || '3', 10),
      proxy_url: map.get('proxy_url') || '',
      gateway_token: map.get('gateway_token') || '',
      admin_password: map.get('admin_password') || '',
      log_retention_days: parseInt(map.get('log_retention_days') || '30', 10),
      strict_persistent_cursor: map.get('strict_persistent_cursor') !== 'false',
      last_key_id: map.get('last_key_id') ? parseInt(map.get('last_key_id')!, 10) : 0,
      key_usage_count_per_turn: Math.max(1, parseInt(map.get('key_usage_count_per_turn') || '1', 10)),
      current_key_used_count: parseInt(map.get('current_key_used_count') || '0', 10),
    };
  },

  get(key: string): string | null {
    const row = db.prepare('SELECT value FROM system_settings WHERE key = ?').get(key) as { value: string } | undefined;
    return row ? row.value : null;
  },

  set(key: string, value: string): void {
    db.prepare('INSERT INTO system_settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value').run(key, value);
  },

  setMany(settings: Partial<SystemSettings>): void {
    const setTx = db.transaction((data: Partial<SystemSettings>) => {
      const stmt = db.prepare('INSERT INTO system_settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value');
      for (const [k, v] of Object.entries(data)) {
        if (v !== undefined) {
          stmt.run(k, String(v));
        }
      }
    });
    setTx(settings);
  },

  getLastKeyId(): number {
    const val = this.get('last_key_id');
    return val ? parseInt(val, 10) : 0;
  },

  setLastKeyId(id: number): void {
    this.set('last_key_id', String(id));
  }
};

// API Key 管理 Repository
export const ApiKeysRepo = {
  getAll(): ApiKey[] {
    // 自动检查解除到期的 cooldown 状态
    this.checkAndUpdateCooldowns();
    return db.prepare('SELECT * FROM api_keys ORDER BY id ASC').all() as ApiKey[];
  },

  getById(id: number): ApiKey | undefined {
    return db.prepare('SELECT * FROM api_keys WHERE id = ?').get(id) as ApiKey | undefined;
  },

  getByKey(key: string): ApiKey | undefined {
    return db.prepare('SELECT * FROM api_keys WHERE key = ?').get(key) as ApiKey | undefined;
  },

  checkAndUpdateCooldowns(): void {
    const now = Date.now();
    db.prepare(`
      UPDATE api_keys 
      SET status = 'active', cooldown_until = NULL, consecutive_errors = 0 
      WHERE status = 'cooldown' AND cooldown_until IS NOT NULL AND cooldown_until <= ?
    `).run(now);
  },

  // 获取所有可用于轮询的活跃 Key（已过滤 cooldown 和 disabled）
  getAvailableKeys(): ApiKey[] {
    this.checkAndUpdateCooldowns();
    return db.prepare(`
      SELECT * FROM api_keys 
      WHERE status = 'active'
      ORDER BY id ASC
    `).all() as ApiKey[];
  },

  add(name: string, key: string): ApiKey {
    const now = Date.now();
    const result = db.prepare(`
      INSERT INTO api_keys (name, key, status, created_at, updated_at)
      VALUES (?, ?, 'active', ?, ?)
    `).run(name.trim(), key.trim(), now, now);

    const insertedId = Number(result.lastInsertRowid);
    if (!name.trim()) {
      db.prepare('UPDATE api_keys SET name = ? WHERE id = ?').run(`Key #${insertedId}`, insertedId);
    }

    return this.getById(insertedId)!;
  },

  addBatch(items: { name?: string; key: string }[]): { added: number; skipped: number } {
    let added = 0;
    let skipped = 0;
    const now = Date.now();

    const stmt = db.prepare(`
      INSERT OR IGNORE INTO api_keys (name, key, status, created_at, updated_at)
      VALUES (?, ?, 'active', ?, ?)
    `);

    const updateNameStmt = db.prepare('UPDATE api_keys SET name = ? WHERE id = ?');

    const insertTx = db.transaction((list: { name?: string; key: string }[]) => {
      for (const item of list) {
        const trimmedKey = item.key.trim();
        if (!trimmedKey) continue;
        const customName = item.name ? item.name.trim() : '';
        const res = stmt.run(customName, trimmedKey, now, now);
        if (res.changes > 0) {
          added++;
          const newId = Number(res.lastInsertRowid);
          if (!customName) {
            updateNameStmt.run(`Key #${newId}`, newId);
          }
        } else {
          skipped++;
        }
      }
    });

    insertTx(items);
    return { added, skipped };
  },

  update(id: number, data: Partial<ApiKey>): void {
    const fields: string[] = [];
    const values: any[] = [];

    for (const [k, v] of Object.entries(data)) {
      if (k !== 'id' && v !== undefined) {
        fields.push(`${k} = ?`);
        values.push(v);
      }
    }

    if (fields.length === 0) return;

    fields.push('updated_at = ?');
    values.push(Date.now());
    values.push(id);

    db.prepare(`UPDATE api_keys SET ${fields.join(', ')} WHERE id = ?`).run(...values);
  },

  delete(id: number): void {
    db.prepare('DELETE FROM api_keys WHERE id = ?').run(id);
  },

  deleteAll(): void {
    db.prepare('DELETE FROM api_keys').run();
  },

  resetAllStatus(): void {
    db.prepare(`
      UPDATE api_keys 
      SET status = 'active', cooldown_until = NULL, consecutive_errors = 0, last_error = NULL
    `).run();
  },

  recordSuccess(id: number, latency: number): void {
    const now = Date.now();
    db.prepare(`
      UPDATE api_keys
      SET total_requests = total_requests + 1,
          success_requests = success_requests + 1,
          consecutive_errors = 0,
          last_used_at = ?,
          avg_latency = CASE 
            WHEN avg_latency = 0 THEN ? 
            ELSE (avg_latency * 0.8 + ? * 0.2) 
          END,
          updated_at = ?
      WHERE id = ?
    `).run(now, latency, latency, now, id);
  },

  recordFailure(id: number, errorMsg: string, cooldownDurationSec: number, errorThreshold: number, isRateLimit: boolean): void {
    const now = Date.now();
    const key = this.getById(id);
    if (!key) return;

    const consecutive = (key.consecutive_errors || 0) + 1;
    let newStatus = key.status;
    let cooldownUntil: number | null = key.cooldown_until;

    // 如果是 429 速率限制或者连续错误达到阈值，进入冷却模式
    if (isRateLimit || consecutive >= errorThreshold) {
      newStatus = 'cooldown';
      cooldownUntil = now + cooldownDurationSec * 1000;
    }

    db.prepare(`
      UPDATE api_keys
      SET total_requests = total_requests + 1,
          failed_requests = failed_requests + 1,
          consecutive_errors = ?,
          status = ?,
          cooldown_until = ?,
          last_error = ?,
          last_used_at = ?,
          updated_at = ?
      WHERE id = ?
    `).run(consecutive, newStatus, cooldownUntil, errorMsg.slice(0, 500), now, now, id);
  }
};

// 请求日志 Repository
export const LogsRepo = {
  add(log: Omit<RequestLog, 'id'>): void {
    db.prepare(`
      INSERT INTO request_logs (
        key_id, key_name, model, endpoint, method, 
        status_code, is_stream, ttft_latency, total_latency, 
        retry_count, client_ip, error_message, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      log.key_id,
      log.key_name,
      log.model,
      log.endpoint,
      log.method,
      log.status_code,
      log.is_stream,
      log.ttft_latency,
      log.total_latency,
      log.retry_count,
      log.client_ip,
      log.error_message,
      log.created_at
    );
  },

  query(params: {
    page?: number;
    pageSize?: number;
    model?: string;
    keyId?: number;
    statusCode?: number;
    statusFilter?: 'all' | 'success' | 'failed' | '429';
    startTime?: number;
    endTime?: number;
  }): { list: RequestLog[]; total: number } {
    const page = Math.max(1, params.page || 1);
    const pageSize = Math.min(100, Math.max(1, params.pageSize || 20));
    const offset = (page - 1) * pageSize;

    const conditions: string[] = [];
    const values: any[] = [];

    if (params.model) {
      conditions.push('model LIKE ?');
      values.push(`%${params.model}%`);
    }

    if (params.keyId) {
      conditions.push('key_id = ?');
      values.push(params.keyId);
    }

    if (params.statusCode) {
      conditions.push('status_code = ?');
      values.push(params.statusCode);
    } else if (params.statusFilter) {
      if (params.statusFilter === 'success') {
        conditions.push('status_code >= 200 AND status_code < 300');
      } else if (params.statusFilter === 'failed') {
        conditions.push('(status_code < 200 OR status_code >= 300)');
      } else if (params.statusFilter === '429') {
        conditions.push('status_code = 429');
      }
    }

    if (params.startTime) {
      conditions.push('created_at >= ?');
      values.push(params.startTime);
    }

    if (params.endTime) {
      conditions.push('created_at <= ?');
      values.push(params.endTime);
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    const countRow = db.prepare(`SELECT COUNT(*) as count FROM request_logs ${whereClause}`).get(...values) as { count: number };
    const total = countRow ? countRow.count : 0;

    const list = db.prepare(`
      SELECT * FROM request_logs 
      ${whereClause} 
      ORDER BY created_at DESC 
      LIMIT ? OFFSET ?
    `).all(...values, pageSize, offset) as RequestLog[];

    return { list, total };
  },

  cleanOldLogs(retentionDays: number): number {
    const cutoffTime = Date.now() - retentionDays * 24 * 60 * 60 * 1000;
    const result = db.prepare('DELETE FROM request_logs WHERE created_at < ?').run(cutoffTime);
    return result.changes;
  },

  clearAll(): void {
    db.prepare('DELETE FROM request_logs').run();
  }
};

// 统计分析 Repository
export const StatsRepo = {
  getOverview(): StatsOverview {
    ApiKeysRepo.checkAndUpdateCooldowns();

    const keys = db.prepare('SELECT status FROM api_keys').all() as { status: string }[];
    const totalKeys = keys.length;
    const activeKeys = keys.filter(k => k.status === 'active').length;
    const cooldownKeys = keys.filter(k => k.status === 'cooldown').length;

    const logStats = db.prepare(`
      SELECT 
        COUNT(*) as totalRequests,
        SUM(CASE WHEN status_code >= 200 AND status_code < 300 THEN 1 ELSE 0 END) as successRequests,
        SUM(CASE WHEN status_code < 200 OR status_code >= 300 THEN 1 ELSE 0 END) as failedRequests,
        AVG(CASE WHEN status_code >= 200 AND status_code < 300 THEN total_latency ELSE NULL END) as avgLatency,
        AVG(CASE WHEN status_code >= 200 AND status_code < 300 THEN ttft_latency ELSE NULL END) as avgTtft
      FROM request_logs
    `).get() as any;

    const totalRequests = logStats?.totalRequests || 0;
    const successRequests = logStats?.successRequests || 0;
    const failedRequests = logStats?.failedRequests || 0;
    const successRate = totalRequests > 0 ? Number(((successRequests / totalRequests) * 100).toFixed(2)) : 100;
    const avgLatency = Number((logStats?.avgLatency || 0).toFixed(1));
    const avgTtft = Number((logStats?.avgTtft || 0).toFixed(1));

    return {
      totalRequests,
      successRequests,
      failedRequests,
      successRate,
      activeKeys,
      totalKeys,
      cooldownKeys,
      avgLatency,
      avgTtft,
    };
  },

  // 获取最近 24 小时或最近 7 天的时序数据
  getTimeSeries(hours = 24): { time: string; success: number; failed: number }[] {
    const since = Date.now() - hours * 60 * 60 * 1000;
    const logs = db.prepare(`
      SELECT 
        strftime('%Y-%m-%d %H:00', created_at / 1000, 'unixepoch', 'localtime') as hour_slot,
        SUM(CASE WHEN status_code >= 200 AND status_code < 300 THEN 1 ELSE 0 END) as success,
        SUM(CASE WHEN status_code < 200 OR status_code >= 300 THEN 1 ELSE 0 END) as failed
      FROM request_logs
      WHERE created_at >= ?
      GROUP BY hour_slot
      ORDER BY hour_slot ASC
    `).all(since) as { hour_slot: string; success: number; failed: number }[];

    return logs.map(l => ({
      time: l.hour_slot,
      success: l.success || 0,
      failed: l.failed || 0
    }));
  },

  // 获取按模型分布
  getModelDistribution(): { model: string; count: number }[] {
    return db.prepare(`
      SELECT model, COUNT(*) as count 
      FROM request_logs 
      GROUP BY model 
      ORDER BY count DESC 
      LIMIT 10
    `).all() as { model: string; count: number }[];
  }
};
