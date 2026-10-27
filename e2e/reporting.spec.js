import {test,expect} from 'playwright/test';

test.beforeEach(async({request})=>{await request.post('/__test/reset');});

test('two devices connect by a real QR scan, exchange messages, and report privately with safe retry',async({browser,request},testInfo)=>{
  const customerContext=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true});
  const businessContext=await browser.newContext({viewport:{width:1200,height:850}});
  const customer=await customerContext.newPage(),business=await businessContext.newPage();
  const errors=[];
  for(const page of [customer,business])page.on('pageerror',error=>errors.push(error.message));
  await customer.goto('/');
  await customer.getByRole('button',{name:'Maak mijn code',exact:false}).click();
  await customer.getByRole('button',{name:'Toon QR-code',exact:true}).click();
  await expect(customer.locator('#contact-qr')).toBeVisible();
  const image=await customer.locator('#contact-qr').evaluate(canvas=>canvas.toDataURL());

  await business.goto('/');
  await business.getByLabel('Bedrijfsnaam',{exact:true}).fill('Garage Testbedrijf');
  await business.getByRole('button',{name:'Start je bedrijf',exact:false}).click();
  await expect(business.getByRole('heading',{name:'Garage Testbedrijf',exact:true})).toBeVisible();
  await business.getByRole('button',{name:'Kies bedrijfstemplate',exact:true}).click();
  await business.getByLabel('Zoek een bedrijfstemplate').fill('garage');
  await business.getByRole('button',{name:/Autogarage/}).click();

  await business.evaluate(async image=>{
    const canvas=document.createElement('canvas');canvas.width=canvas.height=640;
    const img=new Image();img.src=image;await img.decode();
    const context=canvas.getContext('2d');context.fillStyle='white';context.fillRect(0,0,640,640);context.drawImage(img,80,80,480,480);
    const stream=canvas.captureStream(10);
    window.__cameraStream=stream;
    navigator.mediaDevices.getUserMedia=async()=>stream;
  },image);
  await business.getByRole('button',{name:'Klant verbinden',exact:true}).click();
  await business.getByRole('button',{name:'Scan QR-code',exact:true}).click();
  await expect(business.locator('.chat-panel')).toBeVisible();
  await expect.poll(()=>business.evaluate(()=>window.__cameraStream.getTracks().every(track=>track.readyState==='ended'))).toBe(true);
  await expect(business.locator('#message-title')).toHaveCount(0);
  await business.getByRole('button',{name:'Auto klaar',exact:true}).click();

  await customer.getByRole('button',{name:'Sluiten',exact:true}).click();
  await customer.getByRole('link',{name:/Garage Testbedrijf/}).click();
  await expect(customer.locator('#message-thread')).toContainText('Je auto staat klaar');
  await customer.locator('#reply').fill('Dank je, ik kom vanmiddag langs.');
  await customer.getByRole('button',{name:'Bericht versturen',exact:true}).click();
  await expect(business.locator('#message-thread')).toContainText('Dank je, ik kom vanmiddag langs.');

  await customer.getByRole('link',{name:'Garage Testbedrijf',exact:true}).click();
  await customer.getByRole('button',{name:'Bedrijf melden',exact:true}).click();
  await customer.getByLabel('Doet zich voor als een ander bedrijf',{exact:true}).check();
  await customer.getByLabel('Toelichting',{exact:false}).fill('Dit is een privacyveilige testmelding.');
  await customer.screenshot({path:testInfo.outputPath('report-mobile.png'),fullPage:true});
  await customer.route('**/api/v1/business-reports',route=>route.abort());
  await customer.getByRole('button',{name:'Melding versturen',exact:true}).click();
  await expect(customer.locator('#report-form [data-error]')).toContainText('Geen verbinding');
  await expect(customer.locator('#report-details')).toHaveValue('Dit is een privacyveilige testmelding.');
  expect(await(await request.get('/__test/reports')).json()).toHaveLength(0);
  await customer.unroute('**/api/v1/business-reports');
  await customer.getByRole('button',{name:'Melding versturen',exact:true}).click();
  await expect(customer.getByRole('heading',{name:'Melding ontvangen',exact:true})).toBeVisible();
  const reports=await(await request.get('/__test/reports')).json();
  expect(reports).toHaveLength(1);
  expect(reports[0]).toMatchObject({business_name:'Garage Testbedrijf',reason:'impersonation',status:'open',details:'Dit is een privacyveilige testmelding.'});
  await customer.getByRole('button',{name:'Klaar',exact:true}).click();
  await customer.reload();
  await expect(customer.getByRole('heading',{name:'Garage Testbedrijf',exact:true})).toBeVisible();
  await business.reload();
  await expect(business.locator('#message-thread')).toContainText('Dank je, ik kom vanmiddag langs.');
  expect(errors).toEqual([]);
  await customerContext.close();await businessContext.close();
});

test('denied camera falls back to manual linking and other reports require an explanation',async({browser,request})=>{
  const customerContext=await browser.newContext({viewport:{width:390,height:844}});
  const businessContext=await browser.newContext({viewport:{width:390,height:844}});
  const customer=await customerContext.newPage(),business=await businessContext.newPage();
  await customer.goto('/');await customer.getByRole('button',{name:'Maak mijn code',exact:false}).click();
  await expect(customer.locator('.live-device-code')).toBeVisible();
  const code=(await customer.locator('.live-device-code').innerText()).trim();
  await business.goto('/');await business.getByLabel('Bedrijfsnaam',{exact:true}).fill('Fiets Testbedrijf');
  await business.getByRole('button',{name:'Start je bedrijf',exact:false}).click();
  await expect(business.getByRole('heading',{name:'Fiets Testbedrijf',exact:true})).toBeVisible();
  await business.evaluate(()=>navigator.mediaDevices.getUserMedia=async()=>{throw new DOMException('Camera denied','NotAllowedError');});
  await business.getByRole('button',{name:'Klant verbinden',exact:true}).click();
  await business.getByRole('button',{name:'Scan QR-code',exact:true}).click();
  await expect(business.locator('#scanner-status')).toContainText('Geen cameratoegang');
  await business.getByLabel('Conappt-code',{exact:true}).fill(code);
  await business.getByRole('button',{name:'Verbinden',exact:true}).click();
  await expect(business.locator('.chat-panel')).toBeVisible();
  await customer.getByRole('link',{name:/Fiets Testbedrijf/}).click();
  await customer.getByRole('button',{name:'Bedrijf melden',exact:true}).click();
  await customer.getByLabel('Iets anders',{exact:true}).check();
  await expect(customer.locator('#report-details')).toHaveAttribute('required','');
  await customer.getByRole('button',{name:'Melding versturen',exact:true}).click();
  expect(await(await request.get('/__test/reports')).json()).toHaveLength(0);
  await customer.locator('#report-details').fill('Een andere testreden.');
  await customer.getByRole('button',{name:'Melding versturen',exact:true}).click();
  await expect(customer.getByRole('heading',{name:'Melding ontvangen',exact:true})).toBeVisible();
  await customerContext.close();await businessContext.close();
});
