import { defineConfig } from 'playwright/test'

const browsers = ['chromium', 'firefox', 'webkit']

const profiles = [
  {
    name: 'desktop',
    testIgnore: '**/layout.benchmark.spec.js',
    use: { viewport: { width: 1024, height: 720 } },
  },
  {
    name: 'phone',
    testIgnore: '**/layout.benchmark.spec.js',
    use: { viewport: { width: 360, height: 800 }, hasTouch: true },
  },
  {
    name: 'tablet',
    testIgnore: '**/layout.benchmark.spec.js',
    use: { viewport: { width: 768, height: 1024 }, hasTouch: true },
  },
  {
    name: 'visual-desktop',
    grep: /@visual/,
    use: { viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 },
  },
  {
    name: 'visual-mobile',
    grep: /@visual/,
    use: {
      viewport: { width: 390, height: 844 },
      deviceScaleFactor: 3,
      hasTouch: true,
    },
  },
]

export default defineConfig({
  timeout: 60000,
  testDir: './tests',
  outputDir: 'test-results',
  reporter: [
    ['list'],
    ['html', { outputFolder: 'playwright-report', open: 'never' }],
  ],
  use: {
    baseURL: 'http://127.0.0.1:4173/HexagonalWorld/',
  },
  projects: [
    ...profiles.flatMap(({ name, use, ...profile }) =>
      browsers.map((browserName) => ({
        ...profile,
        name: `${name}-${browserName}`,
        use: { ...use, browserName },
      })),
    ),
    {
      name: 'benchmark-chromium',
      testMatch: '**/layout.benchmark.spec.js',
      use: {
        browserName: 'chromium',
        viewport: { width: 1440, height: 900 },
        deviceScaleFactor: 1,
      },
    },
  ],
  webServer: {
    command: 'npm run dev -- --host 127.0.0.1 --port 4173 --strictPort',
    url: 'http://127.0.0.1:4173/HexagonalWorld/',
    reuseExistingServer: true,
  },
})
