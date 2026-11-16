import { defineConfig } from '@playwright/test';

/** A separate in-memory backend avoids modifying accounts/content in the developer's database. */
export default defineConfig({
  testDir: './e2e',
  timeout: 90000,
  expect: { timeout: 15000 },
  workers: 1,
  use: { actionTimeout: 15000, baseURL: 'http://127.0.0.1:4201', channel: 'chrome', headless: true, trace: 'retain-on-failure' },
  webServer: [
    {
      command: 'java -jar ../sikai-backend/target/sikai-backend-1.0.0.jar --server.port=18081 --spring.datasource.url=jdbc:h2:mem:sikai-e2e --sikai.upload-directory=../sikai-backend/target/e2e-uploads --sikai.admin-email=admin@e2e.example --sikai.admin-password=E2eAdminPassword123! --sikai.email-enabled=false --logging.level.root=WARN',
      url: 'http://127.0.0.1:18081/actuator/health',
      timeout: 90000,
      reuseExistingServer: false
    },
    {
      command: 'npx ng serve --host 127.0.0.1 --port 4201 --proxy-config proxy.e2e.json',
      url: 'http://127.0.0.1:4201',
      timeout: 90000,
      reuseExistingServer: false
    }
  ]
});
