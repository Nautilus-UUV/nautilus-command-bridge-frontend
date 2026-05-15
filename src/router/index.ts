// Composables
import { createRouter, createWebHashHistory } from 'vue-router'

const routes = [
  {
    path: '/',
    component: () => import('@/layouts/default/Default.vue'),
    children: [
      {
        path: '',
        name: 'Charts',
        component: () => import('@/views/Charts.vue'),
      },
      {
        path: 'commands',
        name: 'Commands',
        component: () => import('@/views/Commands.vue'),
      },
      {
        path: 'simulations',
        name: 'Simulations',
        component: () => import('@/views/Simulations.vue'),
      },
      {
        path: 'debug',
        name: 'Debug',
        component: () => import('@/views/Debug.vue'),
      },
    ],
  },
]

const router = createRouter({
  history: createWebHashHistory(import.meta.env.BASE_URL),
  routes,
})

export default router
