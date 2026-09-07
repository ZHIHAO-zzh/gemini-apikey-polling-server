<script setup lang="ts">
import { ref, onMounted } from 'vue';
import { useRoute } from 'vue-router';
import { api } from './api';
import {
  LayoutDashboard,
  KeyRound,
  FileText,
  Settings as SettingsIcon,
  Lock,
  LogOut,
  Layers,
  CheckCircle2
} from 'lucide-vue-next';

const route = useRoute();

const navItems = [
  { path: '/', name: '概览监控', icon: LayoutDashboard },
  { path: '/keys', name: 'Key 池管理', icon: KeyRound },
  { path: '/logs', name: '调用日志', icon: FileText },
  { path: '/settings', name: '系统设置', icon: SettingsIcon },
];

const showLoginModal = ref(false);
const loginPassword = ref('');
const loginError = ref('');
const loginSubmitting = ref(false);
const isAuthenticated = ref(false);

async function checkAuth() {
  try {
    const res = await api.checkAuthStatus();
    if (res.data.authRequired) {
      const token = localStorage.getItem('admin_token');
      if (!token) {
        showLoginModal.value = true;
        isAuthenticated.value = false;
      } else {
        isAuthenticated.value = true;
      }
    } else {
      isAuthenticated.value = true;
    }
  } catch (err) {
    console.error('Check auth status error:', err);
  }
}

async function handleLogin() {
  if (!loginPassword.value) return;
  loginSubmitting.value = true;
  loginError.value = '';
  try {
    const res = await api.login(loginPassword.value);
    localStorage.setItem('admin_token', res.token);
    showLoginModal.value = false;
    loginPassword.value = '';
    isAuthenticated.value = true;
    window.location.reload();
  } catch (err: any) {
    loginError.value = err.message || '密码错误';
  } finally {
    loginSubmitting.value = false;
  }
}

function handleLogout() {
  localStorage.removeItem('admin_token');
  window.location.reload();
}

onMounted(() => {
  checkAuth();
  window.addEventListener('auth-required', () => {
    showLoginModal.value = true;
  });
});
</script>

<template>
  <div class="min-h-screen bg-[#f8fafc] text-slate-800 flex flex-col md:flex-row">
    <!-- 侧边导航栏 (Material 风格) -->
    <aside class="w-full md:w-64 bg-white border-b md:border-b-0 md:border-r border-slate-200/80 flex flex-col justify-between p-5 shrink-0">
      <div class="space-y-6">
        <!-- Logo -->
        <div class="flex items-center gap-3 px-2 py-1">
          <div class="w-9 h-9 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center border border-blue-100">
            <Layers class="w-5 h-5" />
          </div>
          <div>
            <h1 class="font-bold text-slate-900 text-sm tracking-tight">Gemini Gateway</h1>
            <p class="text-[11px] text-slate-400 font-medium">持久化轮询网关</p>
          </div>
        </div>

        <!-- 导航菜单项 (Material Pill 药丸风格) -->
        <nav class="space-y-1">
          <router-link
            v-for="item in navItems"
            :key="item.path"
            :to="item.path"
            class="flex items-center gap-3 px-4 py-2.5 rounded-full text-sm font-medium transition-colors"
            :class="route.path === item.path
              ? 'bg-blue-50 text-blue-700 font-semibold'
              : 'text-slate-600 hover:bg-slate-100/80 hover:text-slate-900'"
          >
            <component :is="item.icon" class="w-4 h-4" :class="route.path === item.path ? 'text-blue-600' : 'text-slate-400'" />
            {{ item.name }}
          </router-link>
        </nav>
      </div>

      <!-- 底部状态 -->
      <div class="pt-5 border-t border-slate-100 space-y-3">
        <div class="flex items-center justify-between px-2 text-xs text-slate-500">
          <span class="flex items-center gap-1.5 font-medium text-emerald-600">
            <span class="w-2 h-2 rounded-full bg-emerald-500"></span>
            运行正常
          </span>
          <span class="font-mono text-slate-400 text-[11px]">v1.0.0</span>
        </div>

        <button
          v-if="isAuthenticated"
          @click="handleLogout"
          class="w-full flex items-center justify-center gap-2 px-3 py-2 rounded-lg text-xs text-slate-500 hover:bg-slate-100 hover:text-slate-800 transition"
        >
          <LogOut class="w-3.5 h-3.5" />
          退出登录
        </button>
      </div>
    </aside>

    <!-- 主体内容区 -->
    <main class="flex-1 p-6 md:p-8 overflow-y-auto max-h-screen">
      <div class="max-w-6xl mx-auto">
        <router-view />
      </div>
    </main>

    <!-- Material 对话框: 密码登录 -->
    <div v-if="showLoginModal" class="fixed inset-0 z-50 bg-slate-900/30 backdrop-blur-xs flex items-center justify-center p-4">
      <div class="bg-white border border-slate-200 rounded-3xl max-w-sm w-full p-6 shadow-xl space-y-4">
        <div class="text-center space-y-2">
          <div class="w-12 h-12 rounded-full bg-blue-50 text-blue-600 flex items-center justify-center mx-auto border border-blue-100">
            <Lock class="w-6 h-6" />
          </div>
          <h3 class="text-lg font-bold text-slate-900">管理员验证</h3>
          <p class="text-xs text-slate-500">此控制台已设置密码保护，请输入密码访问</p>
        </div>

        <form @submit.prevent="handleLogin" class="space-y-4">
          <div>
            <input
              v-model="loginPassword"
              type="password"
              placeholder="请输入管理密码"
              class="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm text-slate-800 placeholder-slate-400 focus:outline-none focus:bg-white focus:border-blue-500 focus:ring-2 focus:ring-blue-100 transition"
              autofocus
            />
            <p v-if="loginError" class="text-xs text-red-500 mt-1.5">{{ loginError }}</p>
          </div>

          <button
            type="submit"
            :disabled="loginSubmitting || !loginPassword"
            class="w-full py-2.5 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white rounded-full text-sm font-semibold transition shadow-sm"
          >
            {{ loginSubmitting ? '验证中...' : '进入控制台' }}
          </button>
        </form>
      </div>
    </div>
  </div>
</template>
