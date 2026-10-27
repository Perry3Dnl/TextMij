// Industry starter packs: content only. They do not book appointments or take payments.
const entries = [
  ['garage','Autogarage','Auto & vervoer','auto garage car automotive apk onderhoud reparatie','repair','auto'],
  ['bandenservice','Bandenservice','Auto & vervoer','banden tyres wheels winterbanden','repair','auto'],
  ['autoschade','Autoschadeherstel','Auto & vervoer','schade carrosserie deuk lak','repair','auto'],
  ['autopoets','Autopoetsbedrijf','Auto & vervoer','detailing carwash wassen','service','auto'],
  ['motorzaak','Motorzaak','Auto & vervoer','motor scooter motorcycle','repair','motor'],
  ['fietsenmaker','Fietsenmaker','Auto & vervoer','fiets bike bicycle ebike e-bike','repair','fiets'],
  ['rijschool','Rijschool','Auto & vervoer','rijles driving school','lesson','rijles'],
  ['taxi','Taxibedrijf','Auto & vervoer','taxi vervoer ophalen chauffeur','appointment','rit'],
  ['autoverhuur','Autoverhuur','Auto & vervoer','huurauto rental','order','huurauto'],
  ['bootservice','Bootservice','Auto & vervoer','boot watersport jacht','repair','boot'],
  ['kapper','Kapper','Uiterlijk & verzorging','hair barber kapsalon','appointment','afspraak'],
  ['barbier','Barbier','Uiterlijk & verzorging','baard beard barber','appointment','afspraak'],
  ['schoonheidssalon','Schoonheidssalon','Uiterlijk & verzorging','beauty gezichtsbehandeling','appointment','behandeling'],
  ['nagelstudio','Nagelstudio','Uiterlijk & verzorging','nagels nails manicure','appointment','behandeling'],
  ['pedicure','Pedicure','Uiterlijk & verzorging','voeten voetverzorging','appointment','behandeling'],
  ['massage','Massagesalon','Uiterlijk & verzorging','massage ontspanning','appointment','massage'],
  ['tattoo','Tattoo- en piercingstudio','Uiterlijk & verzorging','tattoo piercing tatoeage','appointment','afspraak'],
  ['visagist','Visagist','Uiterlijk & verzorging','makeup make-up bruid','appointment','afspraak'],
  ['kledingreparatie','Kledingreparatie','Reparatie & maatwerk','kleermaker kleding verstellen tailor','repair','kleding'],
  ['schoenmaker','Schoenmaker','Reparatie & maatwerk','schoenen shoe repair','repair','schoenen'],
  ['telefoonreparatie','Telefoonreparatie','Reparatie & maatwerk','phone smartphone scherm iphone android','repair','telefoon'],
  ['computerreparatie','Computerreparatie','Reparatie & maatwerk','laptop computer pc it repair','repair','computer'],
  ['witgoed','Witgoedreparatie','Reparatie & maatwerk','wasmachine koelkast vaatwasser','repair','apparaat'],
  ['elektronica','Elektronicareparatie','Reparatie & maatwerk','tv televisie elektronica audio','repair','apparaat'],
  ['juwelier','Juwelier en horlogemaker','Reparatie & maatwerk','sieraden horloge ring jewelry','repair','sieraad of horloge'],
  ['meubelmaker','Meubelmaker','Reparatie & maatwerk','meubels hout tafel maatwerk','order','meubel'],
  ['stoffeerder','Stoffeerder','Reparatie & maatwerk','bank stoel bekleding upholstery','repair','meubel'],
  ['slotenmaker','Slotenmaker','Huis & onderhoud','sleutel slot lock','service','klus'],
  ['loodgieter','Loodgieter','Huis & onderhoud','plumber lekkage kraan sanitair','service','klus'],
  ['elektricien','Elektricien','Huis & onderhoud','electrician elektra meterkast','service','klus'],
  ['installateur','Installatiebedrijf','Huis & onderhoud','cv ketel warmtepomp airco installatie','service','installatie'],
  ['schilder','Schilder','Huis & onderhoud','verf painting schilderwerk','service','schilderwerk'],
  ['stukadoor','Stukadoor','Huis & onderhoud','stuc plaster wanden','service','werkzaamheden'],
  ['tegelzetter','Tegelzetter','Huis & onderhoud','tegels badkamer vloer','service','tegelwerk'],
  ['dakdekker','Dakdekker','Huis & onderhoud','dak roof dakpannen','service','dakwerk'],
  ['timmerman','Timmerbedrijf','Huis & onderhoud','timmerman hout carpenter','service','timmerwerk'],
  ['aannemer','Aannemer','Huis & onderhoud','verbouwing bouw construction','service','verbouwing'],
  ['klusbedrijf','Klusbedrijf','Huis & onderhoud','handyman klus onderhoud','service','klus'],
  ['hovenier','Hovenier','Huis & onderhoud','tuin garden groen','service','tuinwerk'],
  ['schoonmaak','Schoonmaakbedrijf','Huis & onderhoud','cleaning poetsen schoonmaker','service','schoonmaak'],
  ['glazenwasser','Glazenwasser','Huis & onderhoud','ramen windows wassen','service','werkzaamheden'],
  ['verhuizer','Verhuisbedrijf','Huis & onderhoud','verhuizen moving verhuizing','service','verhuizing'],
  ['ongedierte','Ongediertebestrijding','Huis & onderhoud','wespen muizen pest','service','behandeling'],
  ['bakker','Bakkerij','Eten & winkels','brood banket bakery','order','bestelling'],
  ['taarten','Taartenmaker','Eten & winkels','taart cake bruidstaart','order','taart'],
  ['catering','Cateringbedrijf','Eten & winkels','cateraar buffet hapjes','order','cateringbestelling'],
  ['restaurant','Restaurant','Eten & winkels','horeca tafel diner eten','appointment','reservering'],
  ['afhaal','Afhaalrestaurant','Eten & winkels','takeaway pizza sushi afhalen','order','bestelling'],
  ['koffiebar','Koffiebar','Eten & winkels','coffee cafe koffie','order','bestelling'],
  ['bloemist','Bloemist','Eten & winkels','bloemen flowers boeket','order','boeket'],
  ['groenteboer','Groenteboer','Eten & winkels','groente fruit winkel','order','bestelling'],
  ['slager','Slagerij','Eten & winkels','vlees butcher barbecue','order','bestelling'],
  ['delicatessen','Delicatessenzaak','Eten & winkels','kaas delicatessen borrel','order','bestelling'],
  ['kledingwinkel','Kledingwinkel','Eten & winkels','kleding fashion boutique','order','bestelling'],
  ['cadeauwinkel','Cadeauwinkel','Eten & winkels','cadeau gift personalisatie','order','bestelling'],
  ['webwinkel','Webwinkel','Eten & winkels','webshop online ecommerce e-commerce','order','bestelling'],
  ['dierenwinkel','Dierenwinkel','Eten & winkels','pet dieren voer','order','bestelling'],
  ['fotograaf','Fotograaf','Creatief & zakelijk','foto photography fotoshoot','creative','foto-opdracht'],
  ['videograaf','Videograaf','Creatief & zakelijk','video film videomaker','creative','video-opdracht'],
  ['ontwerper','Grafisch ontwerper','Creatief & zakelijk','design logo vormgeving','creative','ontwerp'],
  ['webbouwer','Webbouwer','Creatief & zakelijk','website developer programmeur','creative','website'],
  ['drukker','Drukkerij','Creatief & zakelijk','print drukwerk flyers','order','drukwerk'],
  ['reclame','Reclame- en signbedrijf','Creatief & zakelijk','sign sticker belettering reclame','creative','opdracht'],
  ['boekhouder','Boekhouder','Creatief & zakelijk','administratie accountant boekhouding','service','opdracht'],
  ['adviseur','Adviesbureau','Creatief & zakelijk','consultant advies consulting','appointment','gesprek'],
  ['virtual-assistant','Virtual assistant','Creatief & zakelijk','va ondersteuning assistent','service','opdracht'],
  ['makelaar','Makelaar','Creatief & zakelijk','woning bezichtiging vastgoed','appointment','bezichtiging'],
  ['personal-trainer','Personal trainer','Sport & lessen','fitness gym training pt','lesson','training'],
  ['yogastudio','Yogastudio','Sport & lessen','yoga pilates studio','lesson','les'],
  ['sportcoach','Sportcoach','Sport & lessen','sport coaching trainer','lesson','training'],
  ['muziekles','Muziekdocent','Sport & lessen','piano gitaar zang muziek music','lesson','muziekles'],
  ['bijles','Bijlesdocent','Sport & lessen','tutor huiswerk bijles onderwijs','lesson','bijles'],
  ['taalles','Taaldocent','Sport & lessen','taal language nederlands engels','lesson','taalles'],
  ['dansschool','Dansschool','Sport & lessen','dans dance ballet','lesson','dansles'],
  ['workshops','Workshopaanbieder','Sport & lessen','workshop cursus training','lesson','workshop'],
  ['trimsalon','Trimsalon','Dieren & verblijf','hond kat grooming trimmen','appointment','trimafspraak'],
  ['hondenuitlaat','Hondenuitlaatservice','Dieren & verblijf','hond uitlaten dog walking','service','wandeling'],
  ['dierenpension','Dierenpension','Dieren & verblijf','dierenopvang pet boarding','appointment','verblijf'],
  ['hondentrainer','Hondentrainer','Dieren & verblijf','puppy hond training gedrag','lesson','training'],
  ['bed-breakfast','Bed & breakfast','Dieren & verblijf','bnb b&b guesthouse overnachten','appointment','verblijf'],
  ['vakantieverhuur','Vakantieverhuur','Dieren & verblijf','vakantiewoning chalet holiday rental','appointment','verblijf'],
  ['camping','Camping','Dieren & verblijf','kamperen camping staanplaats','appointment','verblijf'],
  ['evenement','Evenementenorganisator','Evenementen','event feest organisator','appointment','evenement'],
  ['feestverhuur','Feestverhuur','Evenementen','party tent springkussen verhuur','order','huurmaterialen'],
  ['dj','DJ en entertainment','Evenementen','dj muziek entertainment feest','appointment','boeking'],
  ['trouwplanner','Trouwplanner','Evenementen','wedding bruiloft planner','appointment','gesprek'],
  ['algemeen','Ander bedrijf','Algemeen','overig algemeen general bedrijf','service','opdracht'],
];

export const INDUSTRIES = Object.freeze(entries.map(([id,label,category,aliases,pack,subject]) =>
  Object.freeze({ id,label,category,aliases,pack,subject })));
export const industryFor = id => INDUSTRIES.find(industry => industry.id === id);
const searchable = value => value.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLocaleLowerCase('nl');
export function searchIndustries(query = '') {
  const words = searchable(String(query)).trim().split(/\s+/).filter(Boolean);
  return INDUSTRIES.filter(item => words.every(word => searchable([item.label,item.category,item.aliases].join(' ')).includes(word)));
}

const action = (id,label,title,text,fields=[]) => ({ id,label,title,text,fields });
const appointment = subject => action('appointment','Afspraak bevestigen','Afspraak bevestigd',
  'Je ' + subject + ' staat gepland op {date} om {time}. Komt er iets tussen? Laat het ons hier weten.',
  [{name:'date',label:'Datum',type:'date'},{name:'time',label:'Tijd',type:'time'}]);

export function quickActionsFor(industryId) {
  const industry = industryFor(industryId);
  if (!industry) return [];
  const subject = industry.subject;
  if (industry.id === 'garage') return [
    action('ready','Auto klaar','Je auto staat klaar','Goed nieuws: je auto staat klaar om opgehaald te worden. Laat hier gerust weten wanneer je langskomt.'),
    action('working','In de werkplaats','We zijn bezig met je auto','Je auto staat in de werkplaats. We houden je hier op de hoogte van de voortgang.'),
    action('approval','Goedkeuring vragen','Goedkeuring nodig',
      'Tijdens het nakijken vonden we het volgende: {details}\n\nDe extra kosten zijn €{amount}. Wil je hier laten weten of je akkoord gaat voordat we verdergaan?',
      [{name:'details',label:'Wat moet er gebeuren?',type:'text'},{name:'amount',label:'Bedrag in euro',type:'number'}]),
    action('parts','Wachten op onderdelen','Onderdelen besteld','We wachten op onderdelen voor je auto. Zodra we verder kunnen, krijg je hier een update.'),
    appointment('afspraak'),
    action('delay','Vertraging melden','Update over je auto','Het werk aan je auto duurt langer dan verwacht. We laten je hier weten zodra we een nieuwe planning hebben.'),
  ];
  if (industry.pack === 'repair') return [
    action('ready','Klaar om op te halen','Klaar om op te halen','Je ' + subject + ' is klaar om opgehaald te worden. Laat hier weten wanneer je langskomt.'),
    action('working','We zijn bezig','We zijn aan de slag','We zijn bezig met je ' + subject + '. Zodra er nieuws is, hoor je het hier.'),
    action('parts','Onderdelen besteld','We wachten op onderdelen','De onderdelen zijn besteld. We sturen je een update zodra we verder kunnen.'),
    appointment('afspraak'),
  ];
  if (industry.pack === 'order') return [
    action('received','Bestelling ontvangen','Bestelling ontvangen','Bedankt! We hebben je ' + subject + ' ontvangen en houden je hier op de hoogte.'),
    action('ready','Klaar voor afhalen','Klaar voor afhalen','Je ' + subject + ' staat klaar om opgehaald te worden. Heb je een vraag? Stuur ons hier een bericht.'),
    action('sent','Onderweg','Je bestelling is onderweg','Je ' + subject + ' is onderweg. We houden je op de hoogte als er iets verandert.'),
    action('question','Even overleggen','Vraag over je bestelling','We willen graag iets met je overleggen over je ' + subject + '. Kun je hier reageren wanneer het uitkomt?'),
  ];
  if (industry.pack === 'creative') return [
    action('started','Opdracht gestart','We zijn gestart','We zijn gestart met je ' + subject + '. Je krijgt hier een update zodra er iets te bekijken is.'),
    action('review','Feedback vragen','Klaar voor je feedback','Er staat een nieuwe versie voor je klaar. Laat ons hier weten wat je ervan vindt.'),
    action('ready','Opdracht afgerond','Je opdracht is afgerond','Je ' + subject + ' is afgerond. Bedankt voor de fijne samenwerking!'),
    appointment('gesprek'),
  ];
  return [
    appointment(subject),
    action('reminder','Herinnering sturen','Een kleine herinnering','Een herinnering aan je ' + subject + '. Heb je nog een vraag of wil je iets wijzigen? Laat het hier weten.'),
    action('update','Voortgang melden','Even een update','We zijn bezig met je ' + subject + '. Zodra er nieuws is, laten we het hier weten.'),
    action('finished','Afronding sturen','Bedankt!','Je ' + subject + ' is afgerond. Bedankt voor je vertrouwen. Heb je nog vragen? Je kunt ons hier bereiken.'),
  ];
}

export function messageFromAction(action, values = {}) {
  if (!action || typeof action.text !== 'string') throw new TypeError('Unknown action');
  let text = action.text;
  for (const field of action.fields) {
    const value = String(values[field.name] ?? '').trim();
    if (!value || value.length > 200) throw new TypeError('Vul ' + field.label.toLocaleLowerCase('nl') + ' in.');
    if (field.type === 'number' && (!/^\d+(?:[.,]\d{1,2})?$/.test(value) || Number(value.replace(',','.')) > 1000000))
      throw new TypeError('Vul een geldig bedrag in.');
    const display = field.type === 'date' && /^\d{4}-\d{2}-\d{2}$/.test(value) ? value.split('-').reverse().join('-') : value;
    text = text.replaceAll('{' + field.name + '}',display);
  }
  return { title:action.title, text };
}
