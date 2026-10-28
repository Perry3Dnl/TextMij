import {test,expect} from 'playwright/test';

test.beforeEach(async({request})=>{await request.post('/__test/reset');});

test('business profile editor uses narrow mobile gutters without overflow',async({browser})=>{
  const context=await browser.newContext({viewport:{width:390,height:844}});
  const page=await context.newPage();
  await page.goto('/');
  await page.getByLabel('Bedrijfsnaam',{exact:true}).fill('Bob Garage');
  await page.getByRole('button',{name:/Start je bedrijf/}).click();
  await page.getByRole('button',{name:'Instellingen',exact:true}).click();
  await page.getByRole('link',{name:'Bedrijfsprofiel bekijken'}).click();
  await page.getByRole('button',{name:'Profiel bewerken'}).click();
  for(const width of [320,390,530]){
    await page.setViewportSize({width,height:844});
    const geometry=await page.evaluate(()=>{
      const main=document.querySelector('main').getBoundingClientRect();
      const form=document.querySelector('.company-profile-form').getBoundingClientRect();
      const card=document.querySelector('.company-editor-panel').getBoundingClientRect();
      const field=document.querySelector('#company-name').getBoundingClientRect();
      return {mainLeft:main.left,cardLeft:card.left,cardRight:card.right,
        fieldRight:field.right,formLeft:form.left,scrollWidth:document.documentElement.scrollWidth,
        viewport:innerWidth};
    });
    expect(geometry.mainLeft).toBeLessThanOrEqual(12);
    expect(geometry.cardLeft).toBeLessThanOrEqual(12);
    expect(geometry.cardRight).toBeGreaterThanOrEqual(width-12);
    expect(geometry.fieldRight).toBeLessThanOrEqual(width-12);
    expect(geometry.scrollWidth).toBeLessThanOrEqual(width);
  }
  await context.close();
});
