import {test,expect} from 'playwright/test';

test.beforeEach(async({request})=>{await request.post('/__test/reset');});

test('mobile logo ellipsis slides open, closes outside, and only offers delete for a selected logo',async({browser})=>{
  const context=await browser.newContext({viewport:{width:320,height:700}});
  const page=await context.newPage();
  await page.goto('/');
  await page.getByLabel('Bedrijfsnaam',{exact:true}).fill('Logo Garage');
  await page.getByRole('button',{name:/Start je bedrijf/}).click();
  await page.getByRole('button',{name:'Instellingen',exact:true}).click();
  await page.getByRole('link',{name:'Bedrijfsprofiel bekijken'}).click();
  await page.getByRole('button',{name:'Profiel bewerken'}).click();

  const menu=page.locator('.logo-actions');
  const trigger=menu.getByText('⋯');
  const change=menu.getByText('Logo wijzigen');
  const remove=menu.getByRole('button',{name:'Logo verwijderen'});
  await expect(menu).not.toHaveAttribute('open','');
  await expect(change).toBeHidden();
  await expect(remove).toBeHidden();

  await trigger.click();
  await expect(menu).toHaveAttribute('open','');
  await expect(change).toBeVisible();
  await expect(remove).toBeHidden();
  await expect(menu.locator('.logo-actions-panel')).toHaveCSS('animation-name','logo-actions-reveal');
  await page.getByLabel('Bedrijfsnaam',{exact:true}).click();
  await expect(menu).not.toHaveAttribute('open','');
  await expect(change).toBeHidden();

  await trigger.click();
  await page.keyboard.press('Escape');
  await expect(menu).not.toHaveAttribute('open','');

  const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAgAAAAICAIAAABLbSncAAAAFElEQVR4nGPUqLBhwAaYsIoOWgkAsRwA7P2qqMgAAAAASUVORK5CYII=','base64');
  await page.locator('#company-logo').setInputFiles({name:'logo.png',mimeType:'image/png',buffer:png});
  await expect(page.locator('#logo-feedback')).toContainText('Logo gekozen.');
  await trigger.click();
  await expect(remove).toBeVisible();
  await remove.click();
  await expect(menu).not.toHaveAttribute('open','');
  await trigger.click();
  await expect(remove).toBeHidden();
  await expect(change).toBeVisible();
  const overflow=await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth);
  expect(overflow).toBe(false);
  await context.close();
});
