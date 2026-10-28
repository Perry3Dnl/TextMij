import {test,expect} from 'playwright/test';

test.beforeEach(async({request})=>{await request.post('/__test/reset');});

async function noOverflow(page) {
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
}
async function fullScreenChat(page) {
  const box=await page.locator('.chat-panel').boundingBox();
  const width=page.viewportSize().width;
  expect(box.x).toBe(0);expect(box.y).toBe(0);expect(box.width).toBe(width);
  await expect(page.getByRole('button',{name:'Bericht versturen',exact:true})).toBeInViewport();
  await noOverflow(page);
}
for(const width of [320,390,1200]) {
  test(`live sessions, settings, drafts and role switching at ${width}px`,async({browser},testInfo)=>{
    const customerContext=await browser.newContext({viewport:{width,height:844}});
    const businessContext=await browser.newContext({viewport:{width,height:844}});
    const customer=await customerContext.newPage(),business=await businessContext.newPage();
    const errors=[];
    for(const page of [customer,business])page.on('pageerror',error=>errors.push(error.message));
    await customer.goto('/');await customer.getByRole('button',{name:/Maak mijn code/}).click();
    await expect(customer.getByRole('heading',{name:'Gesprekken',exact:true})).toBeVisible();
    await expect(customer.locator('.home-grid')).toHaveCount(0);
    await expect(customer.getByRole('link',{name:'Home',exact:true})).toHaveCount(0);
    const code=(await customer.locator('.live-device-code').innerText()).trim();
    await customer.getByRole('button',{name:'Instellingen',exact:true}).click();
    await customer.getByLabel('Naam of bijnaam').fill('Sam');
    await customer.locator('#personal-profile').getByRole('button',{name:'Opslaan'}).click();
    await customer.getByRole('button',{name:'Instellingen sluiten'}).click();

    await business.goto('/');await business.getByLabel('Bedrijfsnaam',{exact:true}).fill('Garage <Test>');
    await business.getByRole('button',{name:/Start je bedrijf/}).click();
    await expect(business.getByRole('heading',{name:'Klantgesprekken',exact:true})).toBeVisible();
    await business.getByRole('button',{name:'Klant verbinden',exact:true}).click();
    await business.getByLabel('Conappt-code',{exact:true}).fill(code);
    await business.getByRole('button',{name:'Verbinden',exact:true}).click();
    await fullScreenChat(business);
    await business.locator('#reply').fill('Een conceptbericht');
    await business.getByRole('button',{name:'Gespreksinstellingen'}).click();
    await expect(business.getByRole('dialog',{name:'Gespreksinstellingen',exact:true})).toBeVisible();
    await noOverflow(business);
    await business.getByRole('button',{name:'Zwart (dark mode)',exact:true}).click();
    await expect(business.getByRole('button',{name:'Zwart (dark mode)',exact:true})).toHaveAttribute('aria-pressed','true');
    await business.getByRole('button',{name:'Instellingen sluiten'}).click();
    await expect(business.locator('#reply')).toHaveValue('Een conceptbericht');
    await business.getByRole('link',{name:'Terug naar gesprekken'}).click();
    await business.locator('.session-row [data-action="settings"]').click();
    await expect(business.locator('#settings-dialog .session-context')).toContainText('Sam');
    await business.getByRole('link',{name:'Open gesprek',exact:true}).click();
    await expect(business.locator('#settings-dialog')).not.toBeVisible();
    await expect(business.locator('#reply')).toHaveValue('Een conceptbericht');
    await business.getByRole('button',{name:'Bericht versturen'}).click();

    await expect(customer.locator('.session-row')).toHaveCount(1);
    await customer.screenshot({path:testInfo.outputPath('customer-inbox.png'),fullPage:true});
    await customer.locator('.session-row [data-action="settings"]').click();
    await expect(customer.locator('#settings-dialog .session-context')).toContainText('Garage <Test>');
    await expect(customer.locator('.chat-panel')).toHaveCount(0);
    await customer.keyboard.press('Escape');
    await expect(customer.locator('#settings-dialog')).not.toBeVisible();
    await customer.locator('.conversation-row').click();
    await expect(customer.locator('#message-thread')).toContainText('Een conceptbericht');
    await fullScreenChat(customer);
    await customer.locator('#reply').fill('Mijn concept');
    await customer.getByRole('button',{name:'Gespreksinstellingen'}).click();
    await customer.screenshot({path:testInfo.outputPath('customer-settings.png')});
    await customer.getByRole('link',{name:'Open gesprek',exact:true}).click();
    await expect(customer.locator('#settings-dialog')).not.toBeVisible();
    await expect(customer.locator('#reply')).toHaveValue('Mijn concept');
    await customer.screenshot({path:testInfo.outputPath('customer-chat.png')});
    await customer.getByRole('link',{name:'Terug naar gesprekken'}).click();
    await customer.getByLabel('Zoek een gesprek').fill('missing');
    await expect(customer.getByRole('heading',{name:'Geen gesprekken gevonden'})).toBeVisible();
    await customer.getByLabel('Zoek een gesprek').fill('Garage');
    await expect(customer.locator('.session-row')).toHaveCount(1);
    await customer.reload();
    await expect(customer.getByRole('heading',{name:'Gesprekken',exact:true})).toBeVisible();
    await noOverflow(customer);

    // Switch profiles from the overlay, including starting a business on the same device.
    await customer.getByRole('button',{name:'Instellingen',exact:true}).click();
    await expect(customer.locator('#settings-dialog .session-context')).toHaveCount(0);
    await customer.getByRole('button',{name:'Wissel van profiel',exact:true}).click();
    await customer.locator('[data-action="choose-role"][data-id="business"]').click();
    await customer.getByLabel('Bedrijfsnaam',{exact:true}).fill('Tweede bedrijf');
    await customer.getByRole('button',{name:'Bedrijf aanmaken',exact:true}).click();
    await expect(customer.getByRole('heading',{name:'Klantgesprekken',exact:true})).toBeVisible();
    await expect(customer.locator('#settings-dialog')).not.toBeVisible();
    expect(errors).toEqual([]);
    await customerContext.close();await businessContext.close();
  });
}

test('example uses the same session navigation for personal and business profiles',async({page},testInfo)=>{
  await page.setViewportSize({width:390,height:844});
  const errors=[];page.on('pageerror',error=>errors.push(error.message));
  await page.goto('/?preview=1#home');
  await expect(page.getByRole('heading',{name:'Gesprekken',exact:true})).toBeVisible();
  await page.locator('.session-row [data-action="settings"]').first().click();
  await expect(page.locator('#settings-dialog')).toBeVisible();
  await page.getByRole('button',{name:'Instellingen sluiten'}).click();
  await page.locator('.conversation-row').first().click();
  await expect(page.locator('.chat-panel')).toBeVisible();
  await page.locator('#reply').fill('Concept in voorbeeld');
  await page.getByRole('button',{name:'Gespreksinstellingen'}).click();
  await page.keyboard.press('Escape');
  await expect(page.locator('#reply')).toHaveValue('Concept in voorbeeld');
  await page.getByRole('button',{name:'Gespreksinstellingen'}).click();
  await page.getByRole('button',{name:'Wissel van account',exact:true}).click();
  await page.locator('[data-action="choose-account"][data-mode="business"]').click();
  await expect(page.getByRole('heading',{name:'Klantgesprekken',exact:true})).toBeVisible();
  await page.locator('.conversation-row').first().click();
  await page.getByRole('button',{name:'Gespreksinstellingen'}).click();
  await expect(page.locator('#settings-dialog')).toBeVisible();
  await noOverflow(page);
  await page.screenshot({path:testInfo.outputPath('example-business-settings.png')});
  expect(errors).toEqual([]);
});
