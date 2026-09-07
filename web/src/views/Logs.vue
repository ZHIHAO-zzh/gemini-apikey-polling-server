<script setup lang="ts">
import { ref, onMounted, onUnmounted, watch } from 'vue';
import { api, type RequestLogItem } from '../api';
import {
  RefreshCw,
  Trash2,
  Clock,
  Radio,
  Eye,
  Info
} from 'lucide-vue-next';

const logs = ref<RequestLogItem[]>([]);
const total = ref(0);
const page = ref(1);
const pageSize = ref(15);
const loading = ref(false);

const modelFilter = ref('');
const statusFilter = ref<'all' | 'success' | 'failed' | '429'>('all');
const autoRefresh = ref(true);

// 详情弹窗
const selectedLog = ref<RequestLogItem | null>(null);

async function loadLogs() {
  loading.value = true;
  try {
    const res = await api.getLogs({
      page: page.value,
      pageSize: pageSize.value,
      model: modelFilter.value || undefined,
      statusFilter: statusFilter.value !== 'all' ? statusFilter.value : undefined
    });
    logs.value = res.data.list;
    total.value = res.data.total;
  } catch (err) {
    console.error('Failed to load request logs:', err);
  } finally {
    loading.value = false;
  }
}

async function handleClearLogs() {
  if (!confirm('确定要清空所有历史请求日志吗？')) return;
  try {
    await api.clearLogs();
    await loadLogs();
  } catch (err: any) {
    alert(`清空失败: ${err.message}`);
  }
}

function formatTime(timestamp: number) {
  const d = new Date(timestamp);
  const Y = d.getFullYear();
  const M = String(d.getMonth() + 1).padStart(2, '0');
  const D = String(d.getDate()).padStart(2, '0');
  const h = String(d.getHours()).padStart(2, '0');
  const m = String(d.getMinutes()).padStart(2, '0');
  const s = String(d.getSeconds()).padStart(2, '0');
  return `${Y}-${M}-${D} ${h}:${m}:${s}`;
}

let timer: any = null;
watch(autoRefresh, (val) => {
  if (val) {
    timer = setInterval(loadLogs, 3000);
  } else if (timer) {
    clearInterval(timer);
  }
}, { immediate: true });

watch([page, statusFilter, modelFilter], () => {
  loadLogs();
});

onMounted(() => {
  loadLogs();
});

onUnmounted(() => {
  if (timer) clearInterval(timer);
});
</script>

<template>
  <div class="space-y-6">
    <!-- 头部 -->
    <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
      <div>
        <h1 class="text-2xl font-bold text-slate-900 tracking-tight flex items-center gap-2">
          请求审计日志
        </h1>
        <p class="text-sm text-slate-500 mt-0.5">
          累计记录 <span class="text-blue-600 font-semibold">{{ total }}</span> 条调用，追踪每次分配的 Key、耗时与状态
        </p>
      </div>
      <div class="flex items-center gap-2.5">
        <!-- 自动刷新 -->
        <label class="inline-flex items-center gap-2 cursor-pointer text-xs text-slate-600 bg-white border border-slate-200 px-3.5 py-2 rounded-full shadow-xs select-none">
          <input type="checkbox" v-model="autoRefresh" class="rounded text-blue-600 focus:ring-0" />
          <span class="flex items-center gap-1.5 font-medium">
            <Radio class="w-3.5 h-3.5" :class="autoRefresh ? 'text-emerald-500' : 'text-slate-400'" />
            自动刷新
          </span>
        </label>

        <button
          @click="loadLogs"
          :disabled="loading"
          class="inline-flex items-center gap-1.5 px-3.5 py-2 bg-white hover:bg-slate-50 text-slate-700 text-xs font-medium rounded-full border border-slate-200 shadow-xs transition"
        >
          <RefreshCw class="w-3.5 h-3.5 text-slate-500" :class="{ 'animate-spin': loading }" />
          刷新
        </button>

        <button
          @click="handleClearLogs"
          class="inline-flex items-center gap-1.5 px-3.5 py-2 bg-white hover:bg-red-50 text-slate-600 hover:text-red-600 text-xs font-medium rounded-full border border-slate-200 shadow-xs transition"
        >
          <Trash2 class="w-3.5 h-3.5" />
          清空
        </button>
      </div>
    </div>

    <!-- 过滤器 (Material Bar) -->
    <div class="bg-white border border-slate-200/80 rounded-2xl p-3.5 flex flex-col sm:flex-row items-center justify-between gap-3 shadow-xs">
      <div class="w-full sm:w-72">
        <input
          v-model="modelFilter"
          type="text"
          placeholder="按模型过滤 (例如 gemini-2.0)..."
          class="w-full px-3.5 py-1.5 bg-slate-50 border border-slate-200 rounded-full text-xs text-slate-800 placeholder-slate-400 focus:outline-none focus:bg-white focus:border-blue-500 transition"
        />
      </div>

      <div class="flex items-center gap-1.5 w-full sm:w-auto">
        <button
          v-for="st in ['all', 'success', '429', 'failed'] as const"
          :key="st"
          @click="statusFilter = st"
          class="px-3 py-1.5 rounded-full text-xs font-medium transition"
          :class="statusFilter === st ? 'bg-blue-50 text-blue-700 font-semibold' : 'text-slate-500 hover:bg-slate-100'"
        >
          {{ st === 'all' ? '全部状态' : st === 'success' ? '2xx 成功' : st === '429' ? '429 限流' : '异常错误' }}
        </button>
      </div>
    </div>

    <!-- 日志表格 (Material 风格) -->
    <div class="bg-white border border-slate-200/80 rounded-2xl overflow-hidden shadow-xs">
      <div class="overflow-x-auto">
        <table class="w-full text-left text-xs">
          <thead class="bg-slate-50/80 text-slate-500 font-medium border-b border-slate-200/80">
            <tr>
              <th class="px-4 py-3 font-semibold">请求时间</th>
              <th class="px-4 py-3 font-semibold">状态</th>
              <th class="px-4 py-3 font-semibold">模型</th>
              <th class="px-4 py-3 font-semibold">使用的 Key</th>
              <th class="px-3 py-3 font-semibold">首字 (TTFT)</th>
              <th class="px-3 py-3 font-semibold">总耗时</th>
              <th class="px-3 py-3 font-semibold">重试</th>
              <th class="px-4 py-3 font-semibold">客户端 IP</th>
              <th class="px-4 py-3 font-semibold text-right">详情</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-slate-100 text-slate-600">
            <tr v-if="logs.length === 0">
              <td colspan="9" class="px-4 py-8 text-center text-slate-400">
                暂无日志记录
              </td>
            </tr>
            <tr
              v-for="log in logs"
              :key="log.id"
              class="hover:bg-slate-50/60 transition cursor-pointer"
              @click="selectedLog = log"
            >
              <!-- 时间 -->
              <td class="px-4 py-3 whitespace-nowrap text-slate-500 font-mono text-[11px]">
                {{ formatTime(log.created_at) }}
              </td>

              <!-- 状态码 Chip -->
              <td class="px-4 py-3 whitespace-nowrap">
                <span
                  v-if="log.status_code >= 200 && log.status_code < 300"
                  class="inline-flex items-center px-2 py-0.5 rounded-md text-[11px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-100"
                >
                  {{ log.status_code }} OK
                </span>
                <span
                  v-else-if="log.status_code === 429"
                  class="inline-flex items-center px-2 py-0.5 rounded-md text-[11px] font-semibold bg-amber-50 text-amber-700 border border-amber-100"
                >
                  429 限流
                </span>
                <span
                  v-else
                  class="inline-flex items-center px-2 py-0.5 rounded-md text-[11px] font-semibold bg-red-50 text-red-600 border border-red-100"
                >
                  {{ log.status_code }}
                </span>
              </td>

              <!-- 模型 -->
              <td class="px-4 py-3 whitespace-nowrap">
                <div class="flex items-center gap-1.5 font-medium text-slate-800">
                  <span v-if="log.is_stream" class="px-1.5 py-0.5 bg-blue-50 text-blue-600 rounded text-[10px] font-semibold">Stream</span>
                  {{ log.model }}
                </div>
              </td>

              <!-- Key ID -->
              <td class="px-4 py-3 whitespace-nowrap">
                <span v-if="log.key_id" class="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold bg-blue-50 text-blue-700 border border-blue-100">
                  Key #{{ log.key_id }}
                </span>
                <span v-else class="text-slate-400">-</span>
              </td>

              <!-- TTFT -->
              <td class="px-3 py-3 whitespace-nowrap font-mono text-[11px] text-slate-700">
                {{ Math.round(log.ttft_latency) }}ms
              </td>

              <!-- 总耗时 -->
              <td class="px-3 py-3 whitespace-nowrap font-mono text-[11px] text-slate-700">
                {{ Math.round(log.total_latency) }}ms
              </td>

              <!-- 重试次数 -->
              <td class="px-3 py-3 whitespace-nowrap font-mono text-[11px]">
                <span v-if="log.retry_count > 0" class="text-amber-600 font-bold">
                  {{ log.retry_count }}
                </span>
                <span v-else class="text-slate-400">0</span>
              </td>

              <!-- IP -->
              <td class="px-4 py-3 whitespace-nowrap text-slate-500 font-mono text-[11px]">
                {{ log.client_ip }}
              </td>

              <!-- 查看 -->
              <td class="px-4 py-3 whitespace-nowrap text-right">
                <button
                  @click.stop="selectedLog = log"
                  class="p-1 hover:bg-slate-100 text-slate-400 hover:text-blue-600 rounded transition"
                >
                  <Eye class="w-3.5 h-3.5" />
                </button>
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <!-- 分页控制 -->
      <div class="bg-slate-50/60 px-4 py-3 border-t border-slate-100 flex items-center justify-between text-xs text-slate-500">
        <div>
          第 {{ (page - 1) * pageSize + 1 }} - {{ Math.min(page * pageSize, total) }} 条，共 {{ total }} 条
        </div>
        <div class="flex items-center gap-1.5">
          <button
            @click="page = Math.max(1, page - 1)"
            :disabled="page === 1"
            class="px-3 py-1 bg-white hover:bg-slate-50 disabled:opacity-40 rounded-full border border-slate-200 transition"
          >
            上一页
          </button>
          <span class="px-2">第 {{ page }} 页</span>
          <button
            @click="page = page + 1"
            :disabled="page * pageSize >= total"
            class="px-3 py-1 bg-white hover:bg-slate-50 disabled:opacity-40 rounded-full border border-slate-200 transition"
          >
            下一页
          </button>
        </div>
      </div>
    </div>

    <!-- 详情模态框 (Material Dialog) -->
    <div v-if="selectedLog" class="fixed inset-0 z-50 bg-slate-900/30 backdrop-blur-xs flex items-center justify-center p-4">
      <div class="bg-white border border-slate-200 rounded-3xl max-w-lg w-full p-6 shadow-xl space-y-4">
        <div class="flex items-center justify-between border-b border-slate-100 pb-3">
          <h3 class="text-base font-bold text-slate-900 flex items-center gap-2">
            <Info class="w-4 h-4 text-blue-600" />
            请求日志详情 #{{ selectedLog.id }}
          </h3>
          <button @click="selectedLog = null" class="text-slate-400 hover:text-slate-700">✕</button>
        </div>

        <div class="space-y-2 text-xs text-slate-600">
          <div class="flex justify-between py-1.5 border-b border-slate-100">
            <span class="text-slate-400">请求时间</span>
            <span class="font-mono">{{ formatTime(selectedLog.created_at) }}</span>
          </div>
          <div class="flex justify-between py-1.5 border-b border-slate-100">
            <span class="text-slate-400">HTTP 方法与路径</span>
            <span class="font-mono text-blue-600">{{ selectedLog.method }} {{ selectedLog.endpoint }}</span>
          </div>
          <div class="flex justify-between py-1.5 border-b border-slate-100">
            <span class="text-slate-400">模型名称</span>
            <span class="font-semibold text-slate-900">{{ selectedLog.model }}</span>
          </div>
          <div class="flex justify-between py-1.5 border-b border-slate-100">
            <span class="text-slate-400">分配的 Key ID</span>
            <span class="font-bold text-blue-600">Key #{{ selectedLog.key_id }}</span>
          </div>
          <div class="flex justify-between py-1.5 border-b border-slate-100">
            <span class="text-slate-400">首字延迟 (TTFT)</span>
            <span class="font-semibold text-slate-800">{{ selectedLog.ttft_latency }} ms</span>
          </div>
          <div class="flex justify-between py-1.5 border-b border-slate-100">
            <span class="text-slate-400">总响应耗时</span>
            <span class="font-semibold text-slate-800">{{ selectedLog.total_latency }} ms</span>
          </div>
          <div class="flex justify-between py-1.5 border-b border-slate-100">
            <span class="text-slate-400">故障重试次数</span>
            <span>{{ selectedLog.retry_count }} 次</span>
          </div>
          <div class="flex justify-between py-1.5 border-b border-slate-100">
            <span class="text-slate-400">客户端 IP</span>
            <span class="font-mono">{{ selectedLog.client_ip }}</span>
          </div>

          <div v-if="selectedLog.error_message" class="pt-2">
            <span class="text-red-500 font-semibold block mb-1">上游异常详情:</span>
            <div class="p-3 bg-red-50/60 border border-red-100 rounded-xl text-[11px] font-mono text-red-700 break-all max-h-40 overflow-y-auto">
              {{ selectedLog.error_message }}
            </div>
          </div>
        </div>

        <div class="flex justify-end pt-2">
          <button
            @click="selectedLog = null"
            class="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-full text-xs font-semibold transition"
          >
            关闭
          </button>
        </div>
      </div>
    </div>
  </div>
</template>
