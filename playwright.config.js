// @ts-check
const { defineConfig, devices } = require('@playwright/test');

const PORT = 4173;

module.exports = defineConfig({
  testDir: './tests',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: [['list']],
  use: {
    baseURL: `http://localhost:${PORT}`,
    trace: 'retain-on-failure',
  },

  // 앱이 빌드 스텝 없는 단일 HTML(20260801.html)이고 /top_1200_universities.json 같은
  // 루트-상대 에셋을 참조하므로, 서브디렉터리가 아니라 저장소 루트 자체를 정적으로 서빙해야 한다.
  webServer: {
    command: 'node ./tests/static-server.js',
    port: PORT,
    reuseExistingServer: !process.env.CI,
    env: { PORT: String(PORT) },
  },

  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
  ],
});
