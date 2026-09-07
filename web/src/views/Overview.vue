<script setup lang="ts">
import { ref, onMounted, onUnmounted, computed } from 'vue';
import { api, type StatsOverviewData } from '../api';
import {
  Activity,
  Key,
  Clock,
  Zap,
  CheckCircle2,
  XCircle,
  RefreshCw,
  Cpu,
  Flame,
  ArrowRight
} from 'lucide-vue-next';
import {
  Chart as ChartJS,
  Title,
  Tooltip,
  Legend,
  BarElement,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  ArcElement,
  Filler
} from 'chart.js';
import { Line, Doughnut } from 'vue-chartjs';

ChartJS.register(
  Title,
  Tooltip,
  Legend,
  BarElement,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  ArcElement,
  Filler
);

const loading = ref(true);
const overview = ref<StatsOverviewData>({
  totalRequests: 0,
  successRequests: 0,
  failedRequests: 0,
  successRate: 100,
  activeKeys: 0,
  totalKeys: 0,
  cooldownKeys: 0,
  avgLatency: 0,
  avgTtft: 0
});

const timeSeries = ref<{ time: string; success: number; failed: number }[]>([]);
const modelDistribution = ref<{ model: string; count: number }[]>([]);

const lineChartData = computed(() => {
  const labels = timeSeries.value.map(t => {
    const parts = t.time.split(' ');
    return parts[1] || t.time;
  });

  return {
    labels,
    datasets: [
      {
        label: '成功请求',
        backgroundColor: 'rgba(37, 99, 235, 0.08)',
        borderColor: '#2563eb',
        borderWidth: 2,
        fill: true,
        tension: 0.35,
        pointRadius: 2,
        pointHoverRadius: 5,
        data: timeSeries.value.map(t => t.success)
      },
      {
        label: '失败请求',
        backgroundColor: 'rgba(239, 68, 68, 0.08)',
        borderColor: '#ef4444',
        borderWidth: 2,
        fill: true,
        tension: 0.35,
        pointRadius: 2,
        pointHoverRadius: 5,
        data: timeSeries.value.map(t => t.failed)
      }
    ]
  };
});

const doughnutChartData = computed(() => {
  const labels = modelDistribution.value.map(m => m.model);
  const data = modelDistribution.value.map(m => m.count);
  const colors = [
    '#2563eb',
    '#0ea5e9',
    '#10b981',
    '#f59e0b',
    '#8b5cf6',
    '#ec4899',
    '#64748b'
  ];

  return {
    labels: labels.length > 0 ? labels : ['暂无请求'],
    datasets: [
      {
        backgroundColor: labels.length > 0 ? colors.slice(0, labels.length) : ['#e2e8f0'],
        borderWidth: 0,
        data: data.length > 0 ? data : [1]
      }
    ]
  };
});

const chartOptions = {
  responsive: true,
  maintainAspectRatio: false,
  plugins: {
    legend: {
      position: 'top' as const,
      labels: {
        color: '#64748b',
        boxWidth: 10,
        font: { size: 12 }
      }
    }
  },
  scales: {
    x: {
      grid: { color: '#f1f5f9' },
      ticks: { color: '#94a3b8', font: { size: 11 } }
    },
    y: {
      grid: { color: '#f1f5f9' },
      ticks: { color: '#94a3b8', font: { size: 11 } }
    }
  }
};

const doughnutOptions = {
  responsive: true,
  maintainAspectRatio: false,
  plugins: {
    legend: {
      position: 'right' as const,
      labels: {
        color: '#64748b',
        boxWidth: 10,
        font: { size: 12 }
      }
    }
  }
};

async function fetchData() {
  loading.value = true;
  try {
    const [ovRes, tsRes, moRes] = await Promise.all([
      api.getStatsOverview(),
      api.getStatsTimeSeries(24),
      api.getStatsModels()
    ]);
    overview.value = ovRes.data;
    timeSeries.value = tsRes.data;
    modelDistribution.value = moRes.data;
  } catch (err) {
    console.error('Failed to load stats overview:', err);
  } finally {
    loading.value = false;
  }
}

let timer: any = null;
onMounted(() => {
  fetchData();
  timer = setInterval(fetchData, 10000);
});

onUnmounted(() => {
  if (timer) clearInterval(timer);
});
</script>

<template>
  <div class="space-y-6">
    <!-- 顶部状态栏 -->
    <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
      <div>
        <h1 class="text-2xl font-bold text-slate-900 tracking-tight">系统概览</h1>
        <p class="text-sm text-slate-500 mt-0.5">监控 Google Gemini 轮询负载、Key 池可用度与响应延迟</p>
      </div>
      <button
        @click="fetchData"
        :disabled="loading"
        class="inline-flex items-center gap-2 px-4 py-2 bg-white hover:bg-slate-50 text-slate-700 text-sm font-medium rounded-full border border-slate-200 shadow-xs transition"
      >
        <RefreshCw class="w-3.5 h-3.5 text-slate-500" :class="{ 'animate-spin': loading }" />
        刷新
      </button>
    </div>

    <!-- 统计卡片 (Material 简约卡片) -->
    <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
      <!-- 总请求 -->
      <div class="bg-white border border-slate-200/80 rounded-2xl p-5 shadow-xs flex flex-col justify-between">
        <div class="flex items-center justify-between">
          <span class="text-xs font-semibold text-slate-500">总请求量</span>
          <div class="w-8 h-8 rounded-full bg-blue-50 text-blue-600 flex items-center justify-center">
            <Activity class="w-4 h-4" />
          </div>
        </div>
        <div class="mt-3">
          <span class="text-2xl font-bold text-slate-900">{{ overview.totalRequests.toLocaleString() }}</span>
        </div>
        <div class="mt-2 flex items-center text-xs text-slate-500 gap-2">
          <span class="text-emerald-600 font-medium flex items-center gap-1">
            <CheckCircle2 class="w-3.5 h-3.5" />
            {{ overview.successRequests }} 成功
          </span>
          <span>•</span>
          <span class="text-red-500 font-medium flex items-center gap-1">
            <XCircle class="w-3.5 h-3.5" />
            {{ overview.failedRequests }} 失败
          </span>
        </div>
      </div>

      <!-- 成功率 -->
      <div class="bg-white border border-slate-200/80 rounded-2xl p-5 shadow-xs flex flex-col justify-between">
        <div class="flex items-center justify-between">
          <span class="text-xs font-semibold text-slate-500">请求成功率</span>
          <div class="w-8 h-8 rounded-full bg-emerald-50 text-emerald-600 flex items-center justify-center">
            <Zap class="w-4 h-4" />
          </div>
        </div>
        <div class="mt-3 flex items-baseline gap-2">
          <span class="text-2xl font-bold text-slate-900">{{ overview.successRate }}%</span>
          <span class="text-xs text-emerald-600 font-medium">智能轮询</span>
        </div>
        <div class="mt-2 w-full bg-slate-100 rounded-full h-1.5 overflow-hidden">
          <div
            class="bg-emerald-500 h-full rounded-full transition-all duration-500"
            :style="{ width: `${overview.successRate}%` }"
          ></div>
        </div>
      </div>

      <!-- Key 池可用度 -->
      <div class="bg-white border border-slate-200/80 rounded-2xl p-5 shadow-xs flex flex-col justify-between">
        <div class="flex items-center justify-between">
          <span class="text-xs font-semibold text-slate-500">Key 池健康度</span>
          <div class="w-8 h-8 rounded-full bg-amber-50 text-amber-600 flex items-center justify-center">
            <Key class="w-4 h-4" />
          </div>
        </div>
        <div class="mt-3 flex items-baseline gap-1.5">
          <span class="text-2xl font-bold text-slate-900">{{ overview.activeKeys }}</span>
          <span class="text-xs text-slate-400">/ {{ overview.totalKeys }} 可用</span>
        </div>
        <div class="mt-2 text-xs text-slate-500 flex items-center gap-1">
          <span v-if="overview.cooldownKeys > 0" class="text-amber-600 font-medium flex items-center gap-1">
            <Flame class="w-3.5 h-3.5" />
            {{ overview.cooldownKeys }} 个冷却中
          </span>
          <span v-else class="text-emerald-600 font-medium">状态全部正常</span>
        </div>
      </div>

      <!-- 响应延迟 -->
      <div class="bg-white border border-slate-200/80 rounded-2xl p-5 shadow-xs flex flex-col justify-between">
        <div class="flex items-center justify-between">
          <span class="text-xs font-semibold text-slate-500">平均延迟 / 首字</span>
          <div class="w-8 h-8 rounded-full bg-indigo-50 text-indigo-600 flex items-center justify-center">
            <Clock class="w-4 h-4" />
          </div>
        </div>
        <div class="mt-3 flex items-baseline gap-1">
          <span class="text-2xl font-bold text-slate-900">{{ overview.avgLatency }}</span>
          <span class="text-xs text-slate-500 font-medium">ms</span>
        </div>
        <div class="mt-2 text-xs text-slate-500">
          首字平均延迟 (TTFT): <span class="text-blue-600 font-semibold">{{ overview.avgTtft }} ms</span>
        </div>
      </div>
    </div>

    <!-- 图表展示区 (Material 卡片) -->
    <div class="grid grid-cols-1 lg:grid-cols-3 gap-5">
      <!-- 24小时请求趋势折线图 -->
      <div class="lg:col-span-2 bg-white border border-slate-200/80 rounded-2xl p-5 shadow-xs flex flex-col">
        <div class="flex items-center justify-between mb-4">
          <div class="flex items-center gap-2">
            <div class="w-2 h-2 rounded-full bg-blue-600"></div>
            <h3 class="text-sm font-semibold text-slate-800">24 小时请求趋势</h3>
          </div>
          <span class="text-xs text-slate-400">按小时汇总</span>
        </div>
        <div class="h-64 w-full relative">
          <Line v-if="timeSeries.length > 0" :data="lineChartData" :options="chartOptions" />
          <div v-else class="h-full flex items-center justify-center text-slate-400 text-xs">
            暂无历史请求数据
          </div>
        </div>
      </div>

      <!-- 模型分布饼图 -->
      <div class="bg-white border border-slate-200/80 rounded-2xl p-5 shadow-xs flex flex-col">
        <div class="flex items-center justify-between mb-4">
          <div class="flex items-center gap-2">
            <div class="w-2 h-2 rounded-full bg-indigo-600"></div>
            <h3 class="text-sm font-semibold text-slate-800">模型调用分布</h3>
          </div>
        </div>
        <div class="h-64 w-full relative flex items-center justify-center">
          <Doughnut v-if="modelDistribution.length > 0" :data="doughnutChartData" :options="doughnutOptions" />
          <div v-else class="h-full flex items-center justify-center text-slate-400 text-xs">
            暂无模型调用数据
          </div>
        </div>
      </div>
    </div>

    <!-- 底部简约指引卡片 -->
    <div class="bg-blue-50/70 border border-blue-100 rounded-2xl p-5 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
      <div>
        <h4 class="text-sm font-semibold text-blue-950">快速接入网关</h4>
        <p class="text-xs text-blue-700/80 mt-0.5">
          将现有 Gemini SDK 中的 baseUrl / api_endpoint 替换为本服务器地址即可享受严格轮询与故障转移
        </p>
      </div>
      <router-link
        to="/settings"
        class="inline-flex items-center gap-1.5 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold rounded-full transition shadow-xs"
      >
        查看接入指引
        <ArrowRight class="w-3.5 h-3.5" />
      </router-link>
    </div>
  </div>
</template>
