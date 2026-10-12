import { devices, PlaywrightTestConfig } from "@playwright/test";
import { screenReaderConfig } from "@guidepup/playwright";

// WebKit is the engine behind Safari, which is what Mac VoiceOver users browse with.
const config: PlaywrightTestConfig = {
  ...screenReaderConfig,
  testDir: "./tests",
  reportSlowTests: null,
  timeout: 20 * 60 * 1000,
  retries: process.env.CI ? 1 : 0,
  outputDir: "./test-results",
  reporter: process.env.CI ? [["github"], ["html", { open: "never" }]] : "list",
  use: {
    headless: false,
    trace: "retain-on-failure",
    video: "on",
  },
  projects: [
    {
      name: "webkit",
      use: { ...devices["Desktop Safari"], headless: false },
    },
  ],
};

export default config;
