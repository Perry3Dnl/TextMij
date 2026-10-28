import {test,expect} from 'playwright/test';
import {readFile} from 'node:fs/promises';

test.beforeEach(async({request})=>{await request.post('/__test/reset');});
for(const role of ['personal','business']) {
  test(`${role} can pin, keep a private note, export, report, block and unblock`,async({browser,request},testInfo)=>{
    const contexts=await Promise.all([browser.newContext({viewport:{width:320,height:844},acceptDownloads:true}),browser.newContext({viewport:{width:390,height:844},acceptDownloads:true})]);
    const [user,business]=await Promise.all(contexts.map(c=>c.newPage()));
    const errors=[];for(const page of [user,business])page.on('pageerror',e=>errors.push(e.message));
    await user.goto('/');await user.getByRole('button',{name:/Maak mijn code/}).click();
    const code=(await user.locator('.live-device-code').innerText()).trim();
    await business.goto('/');await business.getByLabel('Bedrijfsnaam',{exact:true}).fill('Actie Testbedrijf');await business.getByRole('button',{name:/Start je bedrijf/}).click();
    await business.getByRole('button',{name:'Klant verbinden',exact:true}).click();
    await business.getByLabel('Conappt-code',{exact:true}).fill(code);await business.getByRole('button',{name:'Verbinden',exact:true}).click();
    await business.locator('#reply').fill('Hallo 😀');await business.getByRole('button',{name:'Bericht versturen'}).click();
    await expect(user.locator('.conversation-row')).toHaveCount(1);await user.locator('.conversation-row').click();
    await expect(user.locator('#message-thread')).toContainText('Hallo 😀');
    await user.locator('#reply').fill('Dank je');await user.getByRole('button',{name:'Bericht versturen'}).click();
    await expect(business.locator('#message-thread')).toContainText('Dank je');
    const owner=role==='personal'?user:business,peer=role==='personal'?business:user;
    const target=role==='personal'?'Bedrijf':'Gebruiker';
    const note='Privé <notitie> 😀\\nBel vrijdag terug.';
    await owner.locator('#reply').fill('Mijn concept');
    await owner.getByRole('link',{name:'Terug naar gesprekken'}).click();
    const bar=owner.locator('.conversation-bar').first();
    await expect(bar.locator('summary')).toBeVisible();
    await expect(bar.locator('.conversation-menu-action')).toHaveCount(5);
    await expect(bar.locator('.conversation-menu-panel')).toBeHidden();
    const layout=await owner.locator('.session-row').first().evaluate(row=>{
      const chat=row.querySelector('.conversation-row').getBoundingClientRect();
      const menu=row.querySelector('.conversation-bar>summary').getBoundingClientRect();
      return {sameRow:chat.top<menu.bottom&&menu.top<chat.bottom,
        fits:menu.right<=innerWidth,overflow:document.documentElement.scrollWidth>innerWidth};
    });
    expect(layout.sameRow).toBe(true);
    expect(layout.fits).toBe(true);
    expect(layout.overflow).toBe(false);
    await bar.locator('summary').click();
    await expect(bar.locator('.conversation-menu-panel')).toBeVisible();
    // The actions now expand as part of the row and shrink the preview, not overlap it.
    await expect(bar.locator('.conversation-menu-panel')).toHaveCSS('position','relative');
    // The five icon buttons slide toward the chat text, aligned with the row,
    // without creating a vertical dropdown or increasing the row's height.
    await expect.poll(async()=>owner.locator('.session-row').first().evaluate(row=>{
      const trigger=row.querySelector('.conversation-bar>summary').getBoundingClientRect();
      const panel=row.querySelector('.conversation-menu-panel').getBoundingClientRect();
      return panel.right<=trigger.left+1;
    })).toBe(true);
    await expect.poll(()=>bar.locator('.conversation-menu-panel').evaluate(el=>el.getBoundingClientRect().width)).toBeGreaterThan(150);
    const inline=await owner.locator('.session-row').first().evaluate(row=>{
      const summary=row.querySelector('.conversation-bar>summary').getBoundingClientRect();
      const panel=row.querySelector('.conversation-menu-panel').getBoundingClientRect();
      const buttons=[...row.querySelectorAll('.conversation-menu-action')].map(el=>el.getBoundingClientRect());
      return {leftOfTrigger:panel.right<=summary.left+1,
        sameLine:panel.top<summary.bottom&&panel.bottom>summary.top,
        allButtonsInLine:buttons.every(b=>b.top<summary.bottom&&b.bottom>summary.top),
        noHorizontalOverflow:document.documentElement.scrollWidth<=innerWidth,
        panelWidth:panel.width, panelHeight:panel.height,
        noOverlap:row.querySelector('.conversation-row').getBoundingClientRect().right<=panel.left+1,
        triggerAligned:Math.abs(summary.top-panel.top)<5,
        rowHeight:row.getBoundingClientRect().height};
    });
    expect(inline.leftOfTrigger).toBe(true);
    expect(inline.noOverlap).toBe(true);
    expect(inline.triggerAligned).toBe(true);
    expect(inline.rowHeight).toBeLessThanOrEqual(70);
    expect(inline.sameLine).toBe(true);
    expect(inline.allButtonsInLine).toBe(true);
    expect(inline.noHorizontalOverflow).toBe(true);
    expect(inline.panelHeight).toBeLessThanOrEqual(47);
    expect(inline.panelWidth).toBeGreaterThan(150);
    await owner.locator('.sessions-header h1').click();
    await expect(bar.locator('.conversation-menu-panel')).toBeHidden();
    await bar.locator('summary').click();
    await owner.keyboard.press('Escape');
    await expect(bar.locator('.conversation-menu-panel')).toBeHidden();
    const openMenu=async(menu=bar)=>{if(!await menu.evaluate(el=>el.open))await menu.locator('summary').click();};
    await openMenu();
    await bar.getByRole('button',{name:'Privénotitie'}).click();
    await owner.getByLabel('Notitie bij', {exact:false}).fill(note);
    await owner.getByRole('button',{name:'Notitie opslaan'}).click();
    await expect(bar.locator('[data-action="edit-note"]')).toHaveAttribute('data-has-note','true');
    await openMenu(bar);
    await bar.getByRole('button',{name:'Gesprek vastzetten'}).click();
    await expect(bar.locator('[data-action="pin-chat"]')).toHaveAttribute('aria-pressed','true');
    const downloading=owner.waitForEvent('download');
    await openMenu(bar);
    await bar.getByRole('button',{name:'Chat opslaan'}).click();
    const download=await downloading;expect(download.suggestedFilename()).toMatch(/\.txt$/);
    const exported=await readFile(await download.path(),'utf8');
    expect(exported).toContain('Hallo 😀');expect(exported).toContain('Dank je');expect(exported).not.toContain('Bel vrijdag terug.');
    await openMenu(bar);
    await bar.getByRole('button',{name:target+' melden'}).click();
    await owner.getByLabel('Belediging, intimidatie of bedreiging',{exact:true}).check();
    await owner.getByLabel('Toelichting',{exact:false}).fill('Synthetische testmelding.');
    const endpoint=role==='business'?'user-reports':'business-reports';
    await owner.route('**/api/v1/'+endpoint,route=>route.abort());
    await owner.getByRole('button',{name:'Melding versturen'}).click();
    await expect(owner.locator('#report-form [data-error]')).toContainText('Geen verbinding');
    await owner.unroute('**/api/v1/'+endpoint);
    await owner.getByRole('button',{name:'Melding versturen'}).click();
    await expect(owner.getByRole('heading',{name:'Melding ontvangen'})).toBeVisible();
    expect(await(await request.get(role==='business'?'/__test/user-reports':'/__test/reports')).json()).toHaveLength(1);
    await owner.getByRole('button',{name:'Klaar'}).click();
    await openMenu(bar);
    await bar.getByRole('button',{name:target+' blokkeren'}).click();
    await owner.getByRole('button',{name:'Blokkeren',exact:true}).click();
    await expect(bar.locator('[data-action="block-chat"]')).toHaveAttribute('aria-label',target+' deblokkeren');
    expect(await owner.locator('.session-row').evaluate(el=>el.scrollWidth<=el.clientWidth+1)).toBe(true);
    await owner.locator('.conversation-row').first().click();
    await expect(owner.locator('#reply')).toBeDisabled();
    await expect(owner.locator('#reply')).toHaveValue('Mijn concept');
    await expect(peer.locator('#reply')).toBeDisabled();
    await owner.getByRole('link',{name:'Terug naar gesprekken'}).click();
    await owner.reload();
    const reloaded=owner.locator('.conversation-bar').first();
    await openMenu(reloaded);
    await reloaded.getByRole('button',{name:'Privénotitie'}).click();
    await expect(owner.getByLabel('Notitie bij',{exact:false})).toHaveValue(note);
    await owner.getByRole('button',{name:'Annuleren'}).click();
    await openMenu(reloaded);
    await expect(reloaded.getByRole('button',{name:'Gesprek losmaken'})).toBeVisible();
    await openMenu(reloaded);
    await reloaded.getByRole('button',{name:target+' deblokkeren'}).click();
    await owner.getByRole('button',{name:'Deblokkeren',exact:true}).click();
    await owner.locator('.conversation-row').first().click();
    await expect(owner.locator('#reply')).toBeEnabled();
    await expect(peer.locator('#reply')).toBeEnabled();
    await owner.getByRole('link',{name:'Terug naar gesprekken'}).click();
    await expect(owner.locator('.conversation-pin')).toHaveCount(1);
    expect(errors).toEqual([]);await Promise.all(contexts.map(c=>c.close()));
  });
}

test('example pins reorder sessions, notes persist, exports download, and blocking stays scoped',async({page})=>{
  await page.setViewportSize({width:390,height:844});await page.goto('/?preview=1');
  const last=page.locator('.session-row').last();const href=await last.locator('.conversation-row').getAttribute('href');
  await last.getByRole('button',{name:/Instellingen voor/}).click();
  await page.getByLabel('Privénotitie',{exact:true}).fill('Voorbeeldnotitie');await page.getByRole('button',{name:'Notitie opslaan',exact:true}).click();
  await page.getByRole('button',{name:'Gesprek vastzetten',exact:true}).click();await page.getByRole('button',{name:'Instellingen sluiten'}).click();
  await expect(page.locator('.conversation-row').first()).toHaveAttribute('href',href);
  await page.reload();await page.locator('.session-row [data-action="settings"]').first().click();await expect(page.getByLabel('Privénotitie',{exact:true})).toHaveValue('Voorbeeldnotitie');
  const downloading=page.waitForEvent('download');await page.getByRole('button',{name:'Chat opslaan',exact:true}).click();expect((await downloading).suggestedFilename()).toMatch(/\.txt$/);
  await page.getByRole('button',{name:'Bedrijf blokkeren',exact:true}).click();await page.getByRole('button',{name:'Blokkeren',exact:true}).click();
  await page.getByRole('link',{name:'Open gesprek',exact:true}).click();await expect(page.locator('#reply')).toBeDisabled();
  await page.getByRole('button',{name:'Gespreksinstellingen',exact:true}).click();await page.getByRole('button',{name:'Bedrijf deblokkeren',exact:true}).click();await page.getByRole('button',{name:'Deblokkeren',exact:true}).click();
  await page.getByRole('button',{name:'Bedrijf melden',exact:true}).click();await page.getByLabel('Spam of ongewenste reclame',{exact:true}).check();await page.getByRole('button',{name:'Voorbeeldmelding opslaan',exact:true}).click();
  await expect(page.locator('#toast')).toContainText('Er is niets verstuurd.');
});
