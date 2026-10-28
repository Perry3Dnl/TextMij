import {test,expect} from 'playwright/test';

test.beforeEach(async({request})=>{await request.post('/__test/reset');});

test('business closure is confirmed, visible to customers and blocks further writes',async({browser})=>{
  const ownerContext=await browser.newContext({viewport:{width:390,height:844}});
  const customerContext=await browser.newContext({viewport:{width:390,height:844}});
  const owner=await ownerContext.newPage(),customer=await customerContext.newPage();
  await customer.goto('/');await customer.getByRole('button',{name:'Maak mijn code',exact:false}).click();
  const code=(await customer.locator('.live-device-code').innerText()).trim();
  await owner.goto('/');
  await owner.getByLabel('Bedrijfsnaam',{exact:true}).fill('Garage Gesloten');
  await owner.getByRole('button',{name:/Start je bedrijf/}).click();
  await owner.getByRole('button',{name:'Klant verbinden'}).click();
  await owner.getByLabel('Conappt-code').fill(code);
  await owner.getByRole('button',{name:'Verbinden',exact:true}).click();
  await expect(owner.locator('.chat-panel')).toBeVisible();
  await owner.getByRole('link',{name:'Terug naar gesprekken'}).click();
  await expect(owner.locator('.sessions-header')).toBeVisible();
  await owner.getByRole('button',{name:'Instellingen',exact:true}).click();
  await owner.getByRole('button',{name:'Bedrijfsaccount sluiten'}).click();
  await expect(owner.getByRole('heading',{name:'Bedrijfsaccount sluiten?'})).toBeVisible();
  await owner.getByLabel('Typ SLUITEN om te bevestigen').fill('SLUITEN');
  await owner.getByRole('button',{name:'Account definitief sluiten'}).click();
  await owner.goto('/#bedrijf/'+(await owner.evaluate(async()=>{const r=await fetch('/api/v1/session',{headers:{'x-conappt-role':'business'}});return (await r.json()).accountId;})));
  await expect(owner.locator('.business-closed-notice')).toContainText('Dit bedrijf heeft zijn account gesloten.');
  await expect(owner.getByRole('button',{name:'Profiel bewerken'})).toHaveCount(0);
  const results=await owner.evaluate(async()=>{
    const headers={'content-type':'application/json','x-conappt-role':'business'};
    const profile=await fetch('/api/v1/profile',{method:'PUT',headers,body:JSON.stringify({name:'Wijziging'})});
    const link=await fetch('/api/v1/connections',{method:'POST',headers,body:JSON.stringify({code:'0000-AAA-BBB'})});
    return [profile.status,link.status];
  });
  expect(results).toEqual([403,403]);
  await customer.reload();
  await customer.locator('.conversation-row').first().click();
  await expect(customer.locator('#reply')).toBeDisabled();
  await customer.goto('/#bedrijf/'+(await owner.evaluate(async()=>{const r=await fetch('/api/v1/session',{headers:{'x-conappt-role':'business'}});return (await r.json()).accountId;})));
  await expect(customer.locator('.business-closed-notice')).toContainText('Dit bedrijf heeft zijn account gesloten.');
  await ownerContext.close();await customerContext.close();
});
