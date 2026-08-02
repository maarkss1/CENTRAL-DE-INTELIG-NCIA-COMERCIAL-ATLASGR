import { test, expect } from '@playwright/test';

test.describe('CRM Operations - End-to-End', () => {
  test.beforeEach(async ({ page }) => {
    // Navigate to the CRM route via the actual App layout
    await page.goto('/app/crm');
  });

  test('should render the CRM dashboard', async ({ page }) => {
    await expect(page).toHaveTitle(/AtlasGR | Commercial Intelligence OS/);
  });
});
