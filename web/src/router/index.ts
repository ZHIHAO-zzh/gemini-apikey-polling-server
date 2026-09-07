import { createRouter, createWebHistory } from 'vue-router';
import Overview from '../views/Overview.vue';
import Keys from '../views/Keys.vue';
import Logs from '../views/Logs.vue';
import Settings from '../views/Settings.vue';

const routes = [
  { path: '/', name: 'Overview', component: Overview },
  { path: '/keys', name: 'Keys', component: Keys },
  { path: '/logs', name: 'Logs', component: Logs },
  { path: '/settings', name: 'Settings', component: Settings },
];

export const router = createRouter({
  history: createWebHistory(),
  routes,
});
