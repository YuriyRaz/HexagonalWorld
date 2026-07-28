import { defineConfig } from 'vite'

export default defineConfig({
  base: '/HexagonalWorld/',
  test: {
    exclude: ['tests/**', '**/node_modules/**'],
  },
})
