<script setup lang="ts">
import { ref, onMounted, computed } from 'vue';
import { api, type SystemSettingsData } from '../api';
import {
  Sliders,
  Shield,
  Globe,
  RotateCw,
  Save,
  CheckCircle2,
  Code2,
  Copy,
  Check
} from 'lucide-vue-next';

const form = ref<SystemSettingsData>({
  max_retries: 3,
  cooldown_duration: 60,
  error_threshold: 3,
  proxy_url: '',
  gateway_token: '',
  admin_password: '',
  log_retention_days: 30,
  strict_persistent_cursor: true,
  last_key_id: 0,
  key_usage_count_per_turn: 1,
  current_key_used_count: 0,
  current_cursor_key: null
});

const loading = ref(true);
const saving = ref(false);
const saveSuccess = ref(false);

// 代理测试
const testingProxy = ref(false);
const proxyTestResult = ref<{ success: boolean; latency: number; error?: string } | null>(null);

// 代码复制
const copiedTab = ref<string | null>(null);
const currentOrigin = window.location.origin;

const curlExample = computed(() => {
  const token = form.value.gateway_token || 'YOUR_MASTER_TOKEN';
  return `curl ${currentOrigin}/v1beta/models/gemini-2.0-flash:generateContent \\
  -H "Content-Type: application/json" \\
  -H "x-goog-api-key: ${token}" \\
  -d '{
    "contents": [{"parts": [{"text": "Hello, Gemini!"}]}]
  }'`;
});

const pythonExample = computed(() => {
  const token = form.value.gateway_token || 'YOUR_MASTER_TOKEN';
  const endpoint = currentOrigin.replace(/^https?:\/\//, '');
  return `import google.generativeai as genai

# 配置网关地址及 Master Token
genai.configure(
    api_key='${token}',
    client_options={'api_endpoint': '${endpoint}'}
)

model = genai.GenerativeModel('gemini-2.0-flash')
response = model.generate_content('讲一个简短的笑话')
print(response.text)`;
});

async function loadSettings() {
  loading.value = true;
  try {
    const res = await api.getSettings();
    form.value = res.data;
  } catch (err: any) {
    alert(`加载设置失败: ${err.message}`);
  } finally {
    loading.value = false;
  }
}

async function handleSave() {
  saving.value = true;
  saveSuccess.value = false;
  try {
    await api.saveSettings({
      max_retries: Number(form.value.max_retries),
      cooldown_duration: Number(form.value.cooldown_duration),
      error_threshold: Number(form.value.error_threshold),
      proxy_url: form.value.proxy_url,
      gateway_token: form.value.gateway_token,
      admin_password: form.value.admin_password,
      log_retention_days: Number(form.value.log_retention_days),
      strict_persistent_cursor: form.value.strict_persistent_cursor,
      key_usage_count_per_turn: Math.max(1, Number(form.value.key_usage_count_per_turn || 1)),
    });
    saveSuccess.value = true;
    setTimeout(() => {
      saveSuccess.value = false;
    }, 3000);
    await loadSettings();
  } catch (err: any) {
    alert(`保存失败: ${err.message}`);
  } finally {
    saving.value = false;
  }
}

async function testProxy() {
  if (!form.value.proxy_url) {
    alert('请先输入代理 URL');
    return;
  }
  testingProxy.value = true;
  proxyTestResult.value = null;
  try {
    const res = await api.testProxy(form.value.proxy_url);
    proxyTestResult.value = res.data;
  } catch (err: any) {
    proxyTestResult.value = { success: false, latency: 0, error: err.message };
  } finally {
    testingProxy.value = false;
  }
}

function copyCode(text: string, tab: string) {
  navigator.clipboard.writeText(text);
  copiedTab.value = tab;
  setTimeout(() => {
    copiedTab.value = null;
  }, 2000);
}

onMounted(() => {
  loadSettings();
});
</script>

<template>
  <div class="space-y-6 max-w-5xl mx-auto">
    <!-- 头部 -->
    <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
      <div>
        <h1 class="text-2xl font-bold text-slate-900 tracking-tight flex items-center gap-2">
          系统设置
        </h1>
        <p class="text-sm text-slate-500 mt-0.5">
          配置严格持久化轮询、重试策略、冷却时长与网络代理
        </p>
      </div>
      <button
        @click="handleSave"
        :disabled="saving"
        class="inline-flex items-center gap-2 px-5 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-xs font-semibold rounded-full shadow-xs transition"
      >
        <Save class="w-4 h-4" />
        {{ saving ? '保存中...' : '保存更改' }}
      </button>
    </div>

    <!-- 成功提示 -->
    <div v-if="saveSuccess" class="bg-emerald-50 border border-emerald-200 rounded-2xl p-4 flex items-center gap-3 text-emerald-700 text-xs font-medium">
      <CheckCircle2 class="w-4 h-4 flex-shrink-0 text-emerald-600" />
      <span>系统设置已成功保存并立即生效！</span>
    </div>

    <div class="grid grid-cols-1 md:grid-cols-2 gap-5">
      <!-- 轮询与持久化状态 -->
      <div class="bg-white border border-slate-200/80 rounded-2xl p-5 shadow-xs space-y-4">
        <div class="flex items-center gap-2 pb-2 border-b border-slate-100">
          <div class="w-7 h-7 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center">
            <RotateCw class="w-4 h-4" />
          </div>
          <h2 class="text-sm font-bold text-slate-800">严格持久化轮询机制</h2>
        </div>

        <div class="flex items-start justify-between gap-4">
          <div>
            <label class="text-xs font-semibold text-slate-800 block">严格持久化轮询 (Strict Persistent)</label>
            <p class="text-[11px] text-slate-500 mt-0.5 leading-relaxed">
              每次调用均将游标持久化写入 SQLite 数据库。即使长期无请求或服务重启，下次请求依旧接续上一次的下一个 Key。
            </p>
          </div>
          <input
            type="checkbox"
            v-model="form.strict_persistent_cursor"
            class="mt-1 w-4 h-4 rounded text-blue-600 focus:ring-0"
          />
        </div>

        <!-- 连续使用次数设置 -->
        <div>
          <label class="block text-xs font-semibold text-slate-800 mb-1">
            单 Key 停留成功调用次数 (每次轮询停留配额)
          </label>
          <input
            v-model.number="form.key_usage_count_per_turn"
            type="number"
            min="1"
            max="1000"
            class="w-full px-3.5 py-1.5 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-800 focus:outline-none focus:bg-white focus:border-blue-500 transition"
          />
          <p class="text-[11px] text-slate-400 mt-1">
            轮询到某个 Key 时，该 Key 必须累计正常成功调用 N 次后才会切换至下一个 Key（中间若有客户端 400 等错误不浪费配额）
          </p>
        </div>

        <!-- 当前游标信息 -->
        <div class="p-3 bg-slate-50 border border-slate-200/60 rounded-xl text-xs space-y-1">
          <span class="text-slate-500 block font-medium">当前数据库记录的轮询游标：</span>
          <div class="flex items-center justify-between text-slate-700 font-mono pt-0.5">
            <span>当前使用的 Key: <span class="text-blue-600 font-bold">Key #{{ form.last_key_id || 0 }}</span></span>
            <span class="text-slate-500 text-[11px]">
              (本轮已成功调用 <span class="text-blue-600 font-semibold">{{ form.current_key_used_count || 0 }}</span> / {{ form.key_usage_count_per_turn || 1 }} 次)
            </span>
          </div>
        </div>
      </div>

      <!-- 容错与重试策略 -->
      <div class="bg-white border border-slate-200/80 rounded-2xl p-5 shadow-xs space-y-4">
        <div class="flex items-center gap-2 pb-2 border-b border-slate-100">
          <div class="w-7 h-7 rounded-lg bg-amber-50 text-amber-600 flex items-center justify-center">
            <Shield class="w-4 h-4" />
          </div>
          <h2 class="text-sm font-bold text-slate-800">容错重试与冷却策略</h2>
        </div>

        <div>
          <label class="block text-xs font-semibold text-slate-700 mb-1">
            单次请求最大重试次数 (Max Retries)
          </label>
          <input
            v-model.number="form.max_retries"
            type="number"
            min="0"
            max="10"
            class="w-full px-3.5 py-1.5 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-800 focus:outline-none focus:bg-white focus:border-blue-500 transition"
          />
          <p class="text-[11px] text-slate-400 mt-1">遇到 429 或服务异常时自动轮询下一个 Key 重试的最大次数</p>
        </div>

        <div>
          <label class="block text-xs font-semibold text-slate-700 mb-1">
            限流后自动冷却时长 (秒, Cooldown Duration)
          </label>
          <input
            v-model.number="form.cooldown_duration"
            type="number"
            min="5"
            class="w-full px-3.5 py-1.5 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-800 focus:outline-none focus:bg-white focus:border-blue-500 transition"
          />
          <p class="text-[11px] text-slate-400 mt-1">当 Key 返回 429 时冻结冷却的秒数</p>
        </div>

        <div>
          <label class="block text-xs font-semibold text-slate-700 mb-1">
            连续错误熔断阈值 (Error Threshold)
          </label>
          <input
            v-model.number="form.error_threshold"
            type="number"
            min="1"
            class="w-full px-3.5 py-1.5 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-800 focus:outline-none focus:bg-white focus:border-blue-500 transition"
          />
          <p class="text-[11px] text-slate-400 mt-1">连续失败达到该次数后自动进入冷却</p>
        </div>
      </div>

      <!-- 网络与代理配置 -->
      <div class="bg-white border border-slate-200/80 rounded-2xl p-5 shadow-xs space-y-4">
        <div class="flex items-center gap-2 pb-2 border-b border-slate-100">
          <div class="w-7 h-7 rounded-lg bg-sky-50 text-sky-600 flex items-center justify-center">
            <Globe class="w-4 h-4" />
          </div>
          <h2 class="text-sm font-bold text-slate-800">网络代理 (Proxy) 设置</h2>
        </div>

        <div>
          <label class="block text-xs font-semibold text-slate-700 mb-1">
            上游代理 URL (HTTP / HTTPS / SOCKS5)
          </label>
          <div class="flex gap-2">
            <input
              v-model="form.proxy_url"
              type="text"
              placeholder="例如: http://127.0.0.1:7890"
              class="flex-1 px-3.5 py-1.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-mono text-slate-800 focus:outline-none focus:bg-white focus:border-blue-500 transition"
            />
            <button
              @click="testProxy"
              :disabled="testingProxy || !form.proxy_url"
              class="px-3.5 py-1.5 bg-slate-100 hover:bg-slate-200 disabled:opacity-50 text-slate-700 text-xs font-medium rounded-xl transition"
            >
              {{ testingProxy ? '测试中...' : '测试代理' }}
            </button>
          </div>
          <p class="text-[11px] text-slate-400 mt-1">留空表示直连。适用于国内服务器需通过代理访问 Google API 的场景</p>

          <!-- 代理测试结果 -->
          <div v-if="proxyTestResult" class="mt-2 text-xs p-2.5 rounded-xl" :class="proxyTestResult.success ? 'bg-emerald-50 text-emerald-700 border border-emerald-100' : 'bg-red-50 text-red-600 border border-red-100'">
            <span v-if="proxyTestResult.success">✓ 代理连接正常！延迟: {{ proxyTestResult.latency }}ms</span>
            <span v-else>✕ 代理异常: {{ proxyTestResult.error }}</span>
          </div>
        </div>
      </div>

      <!-- 安全与数据管理 -->
      <div class="bg-white border border-slate-200/80 rounded-2xl p-5 shadow-xs space-y-4">
        <div class="flex items-center gap-2 pb-2 border-b border-slate-100">
          <div class="w-7 h-7 rounded-lg bg-indigo-50 text-indigo-600 flex items-center justify-center">
            <Shield class="w-4 h-4" />
          </div>
          <h2 class="text-sm font-bold text-slate-800">安全与审计存储</h2>
        </div>

        <div>
          <label class="block text-xs font-semibold text-slate-700 mb-1">
            网关访问 Master API Token (可选)
          </label>
          <input
            v-model="form.gateway_token"
            type="password"
            placeholder="留空表示公开无鉴权网关"
            class="w-full px-3.5 py-1.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-mono text-slate-800 focus:outline-none focus:bg-white focus:border-blue-500 transition"
          />
          <p class="text-[11px] text-slate-400 mt-1">设置后，客户端调用网关须带上此 Token 进行身份验证</p>
        </div>

        <div>
          <label class="block text-xs font-semibold text-slate-700 mb-1">
            Web 管理后台密码 (可选)
          </label>
          <input
            v-model="form.admin_password"
            type="password"
            placeholder="留空表示免密控制台"
            class="w-full px-3.5 py-1.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-mono text-slate-800 focus:outline-none focus:bg-white focus:border-blue-500 transition"
          />
        </div>

        <div>
          <label class="block text-xs font-semibold text-slate-700 mb-1">
            请求审计日志保留天数
          </label>
          <input
            v-model.number="form.log_retention_days"
            type="number"
            min="1"
            max="365"
            class="w-full px-3.5 py-1.5 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-800 focus:outline-none focus:bg-white focus:border-blue-500 transition"
          />
        </div>
      </div>
    </div>

    <!-- 客户端接入代码示例 (Material 风格) -->
    <div class="bg-white border border-slate-200/80 rounded-2xl p-5 shadow-xs space-y-4">
      <div class="flex items-center gap-2 pb-2 border-b border-slate-100">
        <div class="w-7 h-7 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center">
          <Code2 class="w-4 h-4" />
        </div>
        <h2 class="text-sm font-bold text-slate-800">客户端接入代码示例</h2>
      </div>

      <div class="space-y-4 text-xs">
        <!-- cURL -->
        <div class="space-y-1.5">
          <div class="flex items-center justify-between text-slate-500 font-medium">
            <span>cURL 快速测试:</span>
            <button
              @click="copyCode(curlExample, 'curl')"
              class="flex items-center gap-1 text-[11px] text-blue-600 hover:text-blue-700 font-medium"
            >
              <Check v-if="copiedTab === 'curl'" class="w-3.5 h-3.5 text-emerald-600" />
              <Copy v-else class="w-3.5 h-3.5" />
              {{ copiedTab === 'curl' ? '已复制' : '复制命令' }}
            </button>
          </div>
          <pre class="p-3 bg-slate-50 border border-slate-200 rounded-xl font-mono text-slate-800 text-[11px] overflow-x-auto">{{ curlExample }}</pre>
        </div>

        <!-- Python -->
        <div class="space-y-1.5">
          <div class="flex items-center justify-between text-slate-500 font-medium">
            <span>Python SDK 接入:</span>
            <button
              @click="copyCode(pythonExample, 'python')"
              class="flex items-center gap-1 text-[11px] text-blue-600 hover:text-blue-700 font-medium"
            >
              <Check v-if="copiedTab === 'python'" class="w-3.5 h-3.5 text-emerald-600" />
              <Copy v-else class="w-3.5 h-3.5" />
              {{ copiedTab === 'python' ? '已复制' : '复制代码' }}
            </button>
          </div>
          <pre class="p-3 bg-slate-50 border border-slate-200 rounded-xl font-mono text-slate-800 text-[11px] overflow-x-auto">{{ pythonExample }}</pre>
        </div>
      </div>
    </div>
  </div>
</template>
