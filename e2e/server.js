import {createApp} from '../src/app.js';
import {MessagingApi} from '../src/messaging-api.js';
import {memoryDatabase} from '../support/memory-database.js';

const db=memoryDatabase(),api=new MessagingApi(db),server=createApp({messaging:api,revision:'browser-test'});
const handler=server.listeners('request')[0];
server.removeAllListeners('request');
server.on('request',(request,response)=>{
  if(request.url==='/__test/reports'){
    response.writeHead(200,{'Content-Type':'application/json'});response.end(JSON.stringify(db.reports));return;
  }
  if(request.url==='/__test/reset'&&request.method==='POST'){
    for(const value of Object.values(db))if(Array.isArray(value))value.length=0;
    api.registrationCounts.clear();
    response.writeHead(204);response.end();return;
  }
  handler(request,response);
});
server.listen(4317,'127.0.0.1');
