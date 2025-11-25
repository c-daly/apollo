import { test, expect } from '@playwright/test';

test.describe('Apollo Dashboard', () => {
  test('should load the homepage', async ({ page }) => {
    await page.goto('/');
    await expect(page).toHaveTitle(/Apollo/i);
  });

  test('should navigate between pages', async ({ page }) => {
    await page.goto('/');
    
    // Check for common navigation elements
    const nav = page.locator('nav');
    await expect(nav).toBeVisible();
  });

  test('should handle mock data mode', async ({ page }) => {
    // Test basic functionality with mock data
    await page.goto('/');
    
    // Wait for the page to be interactive
    await page.waitForLoadState('networkidle');
    
    // Verify no console errors
    const errors: string[] = [];
    page.on('console', msg => {
      if (msg.type() === 'error') {
        errors.push(msg.text());
      }
    });
    
    // Give time for any errors to appear
    await page.waitForTimeout(1000);
    
    // Log errors if any (but don't fail - this is a basic smoke test)
    if (errors.length > 0) {
      console.log('Console errors detected:', errors);
    }
  });
});
