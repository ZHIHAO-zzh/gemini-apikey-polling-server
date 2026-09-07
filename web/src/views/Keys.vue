<script setup lang="ts">
import { ref, onMounted, computed } from 'vue';
import { api, type ApiKeyItem } from '../api';
import {
  Key,
  Plus,
  Upload,
  RefreshCw,
  Trash2,
  RotateCcw,
  CheckCircle2,
  AlertTriangle,
  Flame,
  Search,
  Check,
  X
} from 'lucide-vue-next';

const keys = ref<ApiKeyItem[]>([]);
const loading = ref(true);
const search = ref('');
const statusFilter = ref<'all' | 'active' | 'cooldown' | 'disabled'>('all');

// 模态框状态
const showAddModal = ref(false);
const showBatchModal = ref(false);
const singleKeyForm = ref({ name: '', key: '' });
const batchKeyText = ref('');
const submitting = ref(false);

// 单个 Key 测试状态
const testingKeyId = ref<number | null>(null);
const testResults = ref<Record<number, { success: boolean; latency: number; error?: string }>>({});

const filteredKeys = computed(() => {
  return keys.value.filter(k => {
    const matchSearch =
      k.name.toLowerCase().includes(search.value.toLowerCase()) ||
      k.masked_key.toLowerCase().includes(search.value.toLowerCase());
    const matchStatus = statusFilter.value === 'all' || k.status === statusFilter.value;
    return matchSearch && matchStatus;
  });
});

async function loadKeys() {
  loading.value = true;
  try {
    const res = await api.getKeys();
    keys.value = res.data;
  } catch (err: any) {
    alert(`加载 Key 列表失败: ${err.message}`);
  } finally {
    loading.value = false;
  }
}

async function handleAddSingle() {
  if (!singleKeyForm.value.key.trim()) return;
  submitting.value = true;
  try {
    await api.addKey(singleKeyForm.value);
    showAddModal.value = false;
    singleKeyForm.value = { name: '', key: '' };
    await loadKeys();
  } catch (err: any) {
    alert(`添加失败: ${err.message}`);
  } finally {
    submitting.value = false;
  }
}

async function handleBatchAdd() {
  if (!batchKeyText.value.trim()) return;
  submitting.value = true;
  try {
    const res = await api.batchAddKeys(batchKeyText.value);
    alert(res.message || '批量导入成功');
    showBatchModal.value = false;
    batchKeyText.value = '';
    await loadKeys();
  } catch (err: any) {
    alert(`批量导入失败: ${err.message}`);
  } finally {
    submitting.value = false;
  }
}

async function toggleKeyStatus(item: ApiKeyItem) {
  const nextStatus = item.status === 'disabled' ? 'active' : 'disabled';
  try {
    await api.updateKey(item.id, { status: nextStatus });
    await loadKeys();
  } catch (err: any) {
    alert(`切换状态失败: ${err.message}`);
  }
}

async function handleDelete(id: number, name: string) {
  if (!confirm(`确定要删除 API Key [${name}] 吗？`)) return;
  try {
    await api.deleteKey(id);
    await loadKeys();
  } catch (err: any) {
    alert(`删除失败: ${err.message}`);
  }
}

async function handleResetAll() {
  if (!confirm('确定要解除所有 Key 的冷却状态并将错误计数清零吗？')) return;
  try {
    await api.resetAllStatus();
    await loadKeys();
  } catch (err: any) {
    alert(`重置失败: ${err.message}`);
  }
}

async function testSingleKey(id: number) {
  testingKeyId.value = id;
  try {
    const res = await api.testKey(id);
    testResults.value[id] = res.data;
  } catch (err: any) {
    testResults.value[id] = { success: false, latency: 0, error: err.message };
  } finally {
    testingKeyId.value = null;
  }
}

function formatTime(timestamp: number | null) {
  if (!timestamp) return '-';
  const d = new Date(timestamp);
  return `${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

function getCooldownRemaining(until: number | null) {
  if (!until) return null;
  const rem = Math.max(0, Math.ceil((until - Date.now()) / 1000));
  return rem > 0 ? `${rem}s` : '即将恢复';
}

onMounted(() => {
  loadKeys();
});
</script>

<template>
  <div class="space-y-6">
    <!-- 头部操作栏 -->
    <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
      <div>
        <h1 class="text-2xl font-bold text-slate-900 tracking-tight flex items-center gap-2">
          Key 池管理
        </h1>
        <p class="text-sm text-slate-500 mt-0.5">
          共 <span class="text-blue-600 font-semibold">{{ keys.length }}</span> 个 API Key，按持久化游标严格轮询
        </p>
      </div>
      <div class="flex flex-wrap items-center gap-2.5">
        <button
          @click="handleResetAll"
          class="inline-flex items-center gap-1.5 px-3.5 py-2 bg-white hover:bg-slate-50 text-slate-700 text-xs font-medium rounded-full border border-slate-200 shadow-xs transition"
        >
          <RotateCcw class="w-3.5 h-3.5 text-amber-500" />
          解冻全部 Key
        </button>
        <button
          @click="showBatchModal = true"
          class="inline-flex items-center gap-1.5 px-4 py-2 bg-white hover:bg-slate-50 text-slate-700 text-xs font-medium rounded-full border border-slate-200 shadow-xs transition"
        >
          <Upload class="w-3.5 h-3.5 text-blue-600" />
          批量导入
        </button>
        <button
          @click="showAddModal = true"
          class="inline-flex items-center gap-1.5 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold rounded-full shadow-xs transition"
        >
          <Plus class="w-3.5 h-3.5" />
          添加 Key
        </button>
      </div>
    </div>

    <!-- 搜索与筛选 (Material Filter Bar) -->
    <div class="bg-white border border-slate-200/80 rounded-2xl p-3.5 flex flex-col sm:flex-row items-center justify-between gap-3 shadow-xs">
      <div class="relative w-full sm:w-72">
        <Search class="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
        <input
          v-model="search"
          type="text"
          placeholder="搜索名称或 Key..."
          class="w-full pl-9 pr-4 py-1.5 bg-slate-50 border border-slate-200 rounded-full text-xs text-slate-800 placeholder-slate-400 focus:outline-none focus:bg-white focus:border-blue-500 transition"
        />
      </div>

      <div class="flex items-center gap-1.5 w-full sm:w-auto">
        <button
          v-for="st in ['all', 'active', 'cooldown', 'disabled'] as const"
          :key="st"
          @click="statusFilter = st"
          class="px-3 py-1.5 rounded-full text-xs font-medium transition"
          :class="statusFilter === st ? 'bg-blue-50 text-blue-700 font-semibold' : 'text-slate-500 hover:bg-slate-100'"
        >
          {{ st === 'all' ? '全部' : st === 'active' ? '正常就绪' : st === 'cooldown' ? '冷却中' : '已禁用' }}
        </button>
      </div>
    </div>

    <!-- Key 表格 (Material 风格) -->
    <div class="bg-white border border-slate-200/80 rounded-2xl overflow-hidden shadow-xs">
      <div class="overflow-x-auto">
        <table class="w-full text-left text-xs">
          <thead class="bg-slate-50/80 text-slate-500 font-medium border-b border-slate-200/80">
            <tr>
              <th class="px-5 py-3 font-semibold">Key ID</th>
              <th class="px-4 py-3 font-semibold">API Key (脱敏)</th>
              <th class="px-4 py-3 font-semibold">状态</th>
              <th class="px-4 py-3 font-semibold">成功 / 失败</th>
              <th class="px-4 py-3 font-semibold">平均延迟</th>
              <th class="px-4 py-3 font-semibold">最后调用</th>
              <th class="px-5 py-3 font-semibold text-right">操作</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-slate-100 text-slate-600">
            <tr v-if="filteredKeys.length === 0">
              <td colspan="7" class="px-5 py-8 text-center text-slate-400 text-xs">
                暂无匹配的 API Key
              </td>
            </tr>
            <tr
              v-for="item in filteredKeys"
              :key="item.id"
              class="hover:bg-slate-50/60 transition"
            >
              <!-- Key ID -->
              <td class="px-5 py-3.5">
                <div class="flex items-center gap-2">
                  <span class="inline-flex items-center justify-center px-2.5 py-0.5 rounded-full text-xs font-bold bg-blue-50 text-blue-700 border border-blue-100">
                    #{{ item.id }}
                  </span>
                  <span v-if="item.name && item.name !== `Key #${item.id}` && !item.name.startsWith('Key-AIza')" class="text-xs text-slate-700 font-medium">
                    {{ item.name }}
                  </span>
                </div>
                <div v-if="item.consecutive_errors > 0" class="text-[11px] text-red-500 mt-0.5">
                  连续错误: {{ item.consecutive_errors }} 次
                </div>
              </td>

              <!-- 脱敏 Key -->
              <td class="px-4 py-3.5 font-mono text-slate-500">
                {{ item.masked_key }}
              </td>

              <!-- 状态 Chip -->
              <td class="px-4 py-3.5">
                <span
                  v-if="item.status === 'active'"
                  class="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-medium bg-emerald-50 text-emerald-700 border border-emerald-100"
                >
                  <CheckCircle2 class="w-3 h-3" />
                  正常
                </span>
                <span
                  v-else-if="item.status === 'cooldown'"
                  class="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-medium bg-amber-50 text-amber-700 border border-amber-100"
                >
                  <Flame class="w-3 h-3" />
                  冷却中 ({{ getCooldownRemaining(item.cooldown_until) }})
                </span>
                <span
                  v-else
                  class="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-medium bg-slate-100 text-slate-500"
                >
                  <AlertTriangle class="w-3 h-3" />
                  已禁用
                </span>
              </td>

              <!-- 统计 -->
              <td class="px-4 py-3.5">
                <div>
                  <span class="text-emerald-600 font-medium">{{ item.success_requests }} 成功</span>
                  <span class="text-slate-300 mx-1">/</span>
                  <span :class="item.failed_requests > 0 ? 'text-red-500 font-medium' : 'text-slate-400'">{{ item.failed_requests }} 失败</span>
                </div>
                <div class="text-[10px] text-slate-400 mt-0.5">共 {{ item.total_requests }} 次</div>
              </td>

              <!-- 延迟 -->
              <td class="px-4 py-3.5 font-medium">
                <span v-if="item.avg_latency > 0" class="text-slate-700">{{ Math.round(item.avg_latency) }} ms</span>
                <span v-else class="text-slate-400">-</span>
              </td>

              <!-- 最后使用 -->
              <td class="px-4 py-3.5 text-slate-500">
                {{ formatTime(item.last_used_at) }}
              </td>

              <!-- 操作按钮 -->
              <td class="px-5 py-3.5 text-right">
                <div class="flex items-center justify-end gap-1.5">
                  <!-- 测试 -->
                  <button
                    @click="testSingleKey(item.id)"
                    :disabled="testingKeyId === item.id"
                    title="测试连通性"
                    class="p-1.5 hover:bg-slate-100 rounded-lg text-slate-500 hover:text-blue-600 transition"
                  >
                    <RefreshCw class="w-3.5 h-3.5" :class="{ 'animate-spin text-blue-600': testingKeyId === item.id }" />
                  </button>

                  <!-- 禁用/启用 -->
                  <button
                    @click="toggleKeyStatus(item)"
                    :title="item.status === 'disabled' ? '启用' : '禁用'"
                    class="p-1.5 hover:bg-slate-100 rounded-lg transition"
                    :class="item.status === 'disabled' ? 'text-slate-400 hover:text-emerald-600' : 'text-emerald-600 hover:text-amber-600'"
                  >
                    <Check v-if="item.status !== 'disabled'" class="w-3.5 h-3.5" />
                    <X v-else class="w-3.5 h-3.5" />
                  </button>

                  <!-- 删除 -->
                  <button
                    @click="handleDelete(item.id, item.name)"
                    title="删除 Key"
                    class="p-1.5 hover:bg-red-50 text-slate-400 hover:text-red-600 rounded-lg transition"
                  >
                    <Trash2 class="w-3.5 h-3.5" />
                  </button>
                </div>

                <!-- 测试反馈 -->
                <div v-if="testResults[item.id]" class="text-[11px] mt-1 text-right">
                  <span v-if="testResults[item.id].success" class="text-emerald-600 font-medium">
                    ✓ 可用 ({{ testResults[item.id].latency }}ms)
                  </span>
                  <span v-else class="text-red-500" :title="testResults[item.id].error">
                    ✕ 异常: {{ testResults[item.id].error?.slice(0, 18) }}...
                  </span>
                </div>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>

    <!-- 添加单个 Key 对话框 -->
    <div v-if="showAddModal" class="fixed inset-0 z-50 bg-slate-900/30 backdrop-blur-xs flex items-center justify-center p-4">
      <div class="bg-white border border-slate-200 rounded-3xl max-w-md w-full p-6 shadow-xl space-y-4">
        <h3 class="text-base font-bold text-slate-900 flex items-center gap-2">
          <Plus class="w-4 h-4 text-blue-600" />
          添加 Google Gemini API Key
        </h3>

        <div class="space-y-3">
          <div>
            <label class="block text-xs font-semibold text-slate-600 mb-1">Key 别名 (可选)</label>
            <input
              v-model="singleKeyForm.name"
              type="text"
              placeholder="例如：主账号-01"
              class="w-full px-3.5 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-800 focus:outline-none focus:bg-white focus:border-blue-500 transition"
            />
          </div>
          <div>
            <label class="block text-xs font-semibold text-slate-600 mb-1">API Key *</label>
            <input
              v-model="singleKeyForm.key"
              type="password"
              placeholder="AIzaSy..."
              class="w-full px-3.5 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-800 font-mono focus:outline-none focus:bg-white focus:border-blue-500 transition"
            />
          </div>
        </div>

        <div class="flex items-center justify-end gap-2.5 pt-2">
          <button
            @click="showAddModal = false"
            class="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-full text-xs font-medium transition"
          >
            取消
          </button>
          <button
            @click="handleAddSingle"
            :disabled="submitting || !singleKeyForm.key.trim()"
            class="px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white rounded-full text-xs font-semibold transition"
          >
            {{ submitting ? '添加中...' : '确认添加' }}
          </button>
        </div>
      </div>
    </div>

    <!-- 批量导入对话框 -->
    <div v-if="showBatchModal" class="fixed inset-0 z-50 bg-slate-900/30 backdrop-blur-xs flex items-center justify-center p-4">
      <div class="bg-white border border-slate-200 rounded-3xl max-w-lg w-full p-6 shadow-xl space-y-4">
        <h3 class="text-base font-bold text-slate-900 flex items-center gap-2">
          <Upload class="w-4 h-4 text-blue-600" />
          批量导入 API Keys
        </h3>

        <p class="text-xs text-slate-500">
          直接粘贴多个 API Key，每行一个（系统会自动按数字 ID 编号）：
        </p>

        <div>
          <textarea
            v-model="batchKeyText"
            rows="8"
            placeholder="AIzaSyA1xxxxxxxxxxxx
AIzaSyB2xxxxxxxxxxxx
AIzaSyC3xxxxxxxxxxxx"
            class="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl text-xs font-mono text-slate-800 focus:outline-none focus:bg-white focus:border-blue-500 leading-relaxed"
          ></textarea>
        </div>

        <div class="flex items-center justify-end gap-2.5 pt-2">
          <button
            @click="showBatchModal = false"
            class="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-full text-xs font-medium transition"
          >
            取消
          </button>
          <button
            @click="handleBatchAdd"
            :disabled="submitting || !batchKeyText.trim()"
            class="px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white rounded-full text-xs font-semibold transition"
          >
            {{ submitting ? '导入中...' : '开始导入' }}
          </button>
        </div>
      </div>
    </div>
  </div>
</template>
