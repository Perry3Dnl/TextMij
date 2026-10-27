import {defineConfig} from 'playwright/test';
export default defineConfig({
  testDir:'./e2e',testMatch:'**/*.spec.js',workers:1,timeout:60000,
  use:{baseURL:'http://127.0.0.1:4317',headless:true,trace:'retain-on-failure'},
  webServer:{command:'node e2e/server.js',url:'http://127.0.0.1:4317/api/health',reuseExistingServer:false,timeout:15000},
});
