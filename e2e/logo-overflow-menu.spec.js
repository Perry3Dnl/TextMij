import {test,expect} from 'playwright/test';
test.beforeEach(async({request})=>{await request.post('/__test/reset');});
test('logo editing stays directly accessible while conversation actions use overflow menu',async({page})=>{
  await page.setViewportSize({width:320,height:700});
  await page.goto('/');
  await page.getByLabel('Bedrijfsnaam',{exact:true}).fill('Logo Garage');
  await page.getByRole('button',{name:/Start je bedrijf/}).click();
  await page.getByRole('button',{name:'Instellingen',exact:true}).click();
  await page.getByRole('link',{name:'Bedrijfsprofiel bekijken'}).click();
  await page.getByRole('button',{name:'Profiel bewerken'}).click();
  await expect(page.locator('.logo-change-button')).toBeVisible();
  await expect(page.locator('.logo-delete-button')).toBeHidden();
  await expect(page.locator('.logo-actions')).toHaveCount(0);
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
});