import { randomUUID } from 'node:crypto';
import { httpError,readJson,responseJson } from './http-json.js';
import { validateReport } from '../public/report-options.js';

const uuid=/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i;
const accountId=/^[a-f0-9]{64}$/;

export class ReportsApi {
  constructor(pool,authenticate) { this.pool=pool;this.authenticate=authenticate; }
  async handle(request,response,path) {
    if(path!=='/api/v1/business-reports') return false;
    if(request.method!=='POST') {
      response.setHeader('Allow','POST');
      responseJson(response,405,{error:'Method not allowed'});
      return true;
    }
    const reporter=await this.authenticate(request);
    if(reporter.kind!=='personal') throw httpError(403,'Meld een bedrijf vanuit je persoonlijke profiel.');
    const input=await readJson(request);
    if(typeof input.businessId!=='string' || typeof input.requestId!=='string' || !accountId.test(input.businessId) || !uuid.test(input.requestId))
      throw httpError(400,'Ongeldige melding. Open het formulier opnieuw.');
    if(typeof input.details!=='string') throw httpError(400,'Ongeldige toelichting.');
    const details=input.details.trim(),reason=input.reason,requestId=input.requestId.toLowerCase();
    const validation=validateReport(reason,input.details);
    if(validation) throw httpError(400,validation);
    const connection=await this.pool.getConnection();
    let result,created=false;
    try {
      await connection.beginTransaction();
      // Serialize reports per account across all API replicas; the budget is persisted in MySQL.
      await connection.execute('SELECT id FROM accounts WHERE id = ? FOR UPDATE',[reporter.id]);
      const [existing]=await connection.execute(
        'SELECT id,business_id,reason,details FROM business_reports WHERE reporter_id = ? AND request_id = ?',
        [reporter.id,requestId]);
      if(existing.length) {
        const previous=existing[0];
        if(previous.business_id!==input.businessId || previous.reason!==reason || previous.details!==details)
          throw httpError(409,'Deze aanvraagcode hoort bij een andere melding. Open het formulier opnieuw.');
        result=previous.id;
      } else {
        const [targets]=await connection.execute(
          "SELECT a.display_name FROM accounts a JOIN connections c ON c.business_id = a.id WHERE a.id = ? AND a.kind = 'business' AND c.customer_id = ? LIMIT 1",
          [input.businessId,reporter.id]);
        if(!targets.length) throw httpError(404,'Je kunt alleen een gekoppeld bedrijf melden.');
        const [[budget]]=await connection.execute(
          'SELECT COUNT(*) AS total FROM business_reports WHERE reporter_id = ? AND created_at > UTC_TIMESTAMP() - INTERVAL 1 DAY',
          [reporter.id]);
        if(Number(budget.total)>=10) throw httpError(429,'Je hebt vandaag al tien meldingen verstuurd. Probeer het later opnieuw.');
        result=randomUUID();
        await connection.execute(
          'INSERT INTO business_reports (id,reporter_id,business_id,request_id,business_name,reason,details) VALUES (?,?,?,?,?,?,?)',
          [result,reporter.id,input.businessId,requestId,targets[0].display_name,reason,details]);
        created=true;
      }
      await connection.commit();
    } catch(error) {
      await connection.rollback();
      throw error;
    } finally { connection.release(); }
    responseJson(response,created?201:200,{reportId:result,status:'received'});
    return true;
  }
}
