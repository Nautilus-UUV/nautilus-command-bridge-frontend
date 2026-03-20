/**
 * plugins/vuetify.ts
 *
 * Framework documentation: https://vuetifyjs.com`
 */

// Styles
import '@mdi/font/css/materialdesignicons.css'
import 'vuetify/styles'

// Composables
import { createVuetify } from 'vuetify'

// https://vuetifyjs.com/en/introduction/why-vuetify/#feature-guides
export default createVuetify({
  theme: {
    defaultTheme: 'nautilus',
    themes: {
      nautilus: {
        dark: false,
        colors: {
          primary:    '#4a7fcb',
          secondary:  '#6b6b6b',
          background: '#e8e8e8',
          surface:    '#ffffff',
          error:      '#c0392b',
          warning:    '#c87f0a',
          success:    '#2e7d32',
          info:       '#4a7fcb',
        },
      },
    },
  },
})
