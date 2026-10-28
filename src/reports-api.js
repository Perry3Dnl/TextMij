import { randomUUID } from 'node:crypto';
import { httpError,readJson,responseJson } from './http-json.js';
import { validateReport,USER_REPORT_REASONS } from '../public/report-options.js';

const uuid=/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i;
const accountId=/^[a-f0-9]{64}$/;

export class ReportsApi {
  constructor(pool,authenticate) { this.pool=pool;this.authenticate=authenticate; }
  async handle(request,response,path) {
    if(!['/api/v1/business-reports','/api/v1/user-reports'].includes(path)) return false;
    const userReport=path==='/api/v1/user-reports';
    const table=userReport?'user_reports':'business_reports',column=userReport?'user_id':'business_id',nameColumn=userReport?'user_name':'business_name';
    if(request.method!=='POST') {
      response.setHeader('Allow','POST');
      responseJson(response,405,{error:'Method not allowed'});
      return true;
    }
    const reporter=await this.authenticate(request);
    if(reporter.kind!==(userReport?'business':'personal')) throw httpError(403,'Gebruik het juiste profiel om dit contact te melden.');
    const input=await readJson(request);
    const targetId=userReport?input.userId:input.businessId;
    if(typeof targetId!=='string' || typeof input.requestId!=='string' || !accountId.test(targetId) || !uuid.test(input.requestId))
      throw httpError(400,'Ongeldige melding. Open het formulier opnieuw.');
    if(typeof input.details!=='string') throw httpError(400,'Ongeldige toelichting.');
    const details=input.details.trim(),reason=input.reason,requestId=input.requestId.toLowerCase();
    const validation=validateReport(reason,input.details);
    if(userReport&&!USER_REPORT_REASONS.some(r=>r.id===reason))throw httpError(400,'Kies een reden voor je melding.');
    if(validation) throw httpError(400,validation);
    const connection=await this.pool.getConnection();
    let result,created=false;
    try {
      await connection.beginTransaction();
      // Serialize reports per account across all API replicas; the budget is persisted in MySQL.
      await connection.execute('SELECT id FROM accounts WHERE id = ? FOR UPDATE',[reporter.id]);
      const [existing]=await connection.execute(
        `SELECT id,${column} AS target_id,reason,details FROM ${table} WHERE reporter_id = ? AND request_id = ?`,
        [reporter.id,requestId]);
      if(existing.length) {
        const previous=existing[0];
        if(previous.target_id!==targetId || previous.reason!==reason || previous.details!==details)
          throw httpError(409,'Deze aanvraagcode hoort bij een andere melding. Open het formulier opnieuw.');
        result=previous.id;
      } else {
        const [targets]=await connection.execute(userReport?
          "SELECT a.display_name FROM accounts a JOIN connections c ON c.customer_id = a.id WHERE a.id = ? AND a.kind = 'personal' AND c.business_id = ? LIMIT 1":
          "SELECT a.display_name FROM accounts a JOIN connections c ON c.business_id = a.id WHERE a.id = ? AND a.kind = 'business' AND c.customer_id = ? LIMIT 1",
          [targetId,reporter.id]);
        if(!targets.length) throw httpError(404,'Je kunt alleen een gekoppeld contact melden.');
        const [[budget]]=await connection.execute(
          `SELECT COUNT(*) AS total FROM ${table} WHERE reporter_id = ? AND created_at > UTC_TIMESTAMP() - INTERVAL 1 DAY`,
          [reporter.id]);
        if(Number(budget.total)>=10) throw httpError(429,'Je hebt vandaag al tien meldingen verstuurd. Probeer het later opnieuw.');
        result=randomUUID();
        await connection.execute(
          `INSERT INTO ${table} (id,reporter_id,${column},request_id,${nameColumn},reason,details) VALUES (?,?,?,?,?,?,?)`,
          [result,reporter.id,targetId,requestId,targets[0].display_name,reason,details]);
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
