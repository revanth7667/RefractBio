import { test, expect } from '@playwright/test';

test.describe('Settings tab triggers layout (§17.4)', () => {
  test('Settings tab triggers do not overlap at 390 x 844 px', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/#/');
    await page.getByRole('button', { name: 'Settings' }).click();
    await expect(page.getByRole('dialog')).toBeVisible();

    const dialog = page.getByRole('dialog');
    const tabList = dialog.getByRole('tablist');
    const triggers = await tabList.getByRole('tab').all();
    expect(triggers).toHaveLength(6);

    const boxes = await Promise.all(
      triggers.map(async (t) => {
        const box = await t.boundingBox();
        expect(box).not.toBeNull();
        return box!;
      })
    );

    for (let i = 0; i < boxes.length; i++) {
      for (let j = i + 1; j < boxes.length; j++) {
        const a = boxes[i];
        const b = boxes[j];
        const overlapsX = a.x < b.x + b.width - 0.5 && a.x + a.width > b.x + 0.5;
        const overlapsY = a.y < b.y + b.height - 0.5 && a.y + a.height > b.y + 0.5;
        expect(overlapsX && overlapsY, `Tabs ${i} and ${j} overlap`).toBe(false);
      }
    }
  });

  test('Settings tab triggers do not overlap at 1280 x 800 px', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto('/#/');
    await page.getByRole('button', { name: 'Settings' }).click();
    await expect(page.getByRole('dialog')).toBeVisible();

    const dialog = page.getByRole('dialog');
    const tabList = dialog.getByRole('tablist');
    const triggers = await tabList.getByRole('tab').all();
    expect(triggers).toHaveLength(6);

    const boxes = await Promise.all(
      triggers.map(async (t) => {
        const box = await t.boundingBox();
        expect(box).not.toBeNull();
        return box!;
      })
    );

    for (let i = 0; i < boxes.length; i++) {
      for (let j = i + 1; j < boxes.length; j++) {
        const a = boxes[i];
        const b = boxes[j];
        const overlapsX = a.x < b.x + b.width - 0.5 && a.x + a.width > b.x + 0.5;
        const overlapsY = a.y < b.y + b.height - 0.5 && a.y + a.height > b.y + 0.5;
        expect(overlapsX && overlapsY, `Tabs ${i} and ${j} overlap`).toBe(false);
      }
    }
  });
});
