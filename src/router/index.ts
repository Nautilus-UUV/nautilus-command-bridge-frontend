// Composables
import { createRouter, createWebHashHistory } from 'vue-router'

// Single-page mission-control dashboard. The old Telemetry / Commands /
// Simulations / Debug tabs were collapsed into one view -- there is only the
// dashboard now, wrapped in the default app shell.
const routes = [
  {
    path: '/',
    component: () => import('@/layouts/default/Default.vue'),
    children: [
      {
        path: '',
        name: 'Dashboard',
        component: () => import('@/views/Dashboard.vue'),
      },
    ],
  },
]

const router = createRouter({
  history: createWebHashHistory(import.meta.env.BASE_URL),
  routes,
})

export default router
