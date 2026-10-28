import { httpError,readJson,responseJson } from './http-json.js';
import { REPORT_REASONS } from '../public/report-options.js';

const accountId=/^[a-f0-9]{64}$/;
export class ReputationApi {
  constructor(pool,authenticate){this.pool=pool;this.authenticate=authenticate;}
  async handle(request,response,path){
    if(path!=='/api/v1/business-reputation')return false;
    if(!['GET','PUT'].includes(request.method)){
      response.setHeader('Allow','GET, PUT');responseJson(response,405,{error:'Method not allowed'});return true;
    }
    const viewer=await this.authenticate(request);
    // Never expose reputation or reporting metadata to company-side sessions.
    if(viewer.kind!=='personal')throw httpError(403,'Alleen persoonlijke profielen kunnen beoordelingen bekijken.');
    const input=request.method==='PUT'?await readJson(request):null;
    const id=request.method==='PUT'?input?.businessId:new URL(request.url,'http://localhost').searchParams.get('businessId');
    if(typeof id!=='string'||!accountId.test(id))throw httpError(400,'Ongeldig bedrijf.');
    const [connections]=await this.pool.execute(
      "SELECT a.display_name FROM accounts a JOIN connections c ON c.business_id = a.id WHERE a.id = ? AND a.kind = 'business' AND c.customer_id = ? LIMIT 1",
      [id,viewer.id]);
    if(!connections.length)throw httpError(404,'Dit bedrijf is niet gekoppeld.');
    if(request.method==='PUT'){
      if(!Number.isInteger(input.stars)||input.stars<1||input.stars>5)throw httpError(400,'Kies 1 tot 5 sterren.');
      await this.pool.execute(
        'INSERT INTO business_ratings (business_id,rater_id,stars) VALUES (?,?,?) ON DUPLICATE KEY UPDATE stars = VALUES(stars)',
        [id,viewer.id,input.stars]);
    }
    const [[rating]]=await this.pool.execute(
      'SELECT COUNT(*) AS total, AVG(stars) AS average FROM business_ratings WHERE business_id = ?',[id]);
    const [mine]=await this.pool.execute(
      'SELECT stars FROM business_ratings WHERE business_id = ? AND rater_id = ?',[id,viewer.id]);
    const [[flags]]=await this.pool.execute(
      'SELECT COUNT(*) AS total FROM business_reports WHERE business_id = ?',[id]);
    const [reasons]=await this.pool.execute(
      'SELECT reason,COUNT(*) AS total FROM business_reports WHERE business_id = ? GROUP BY reason',[id]);
    const categories=reasons.filter(row=>REPORT_REASONS.some(r=>r.id===row.reason)).map(row=>({
      reason:row.reason,label:REPORT_REASONS.find(r=>r.id===row.reason).label,count:Number(row.total)
    }));
    responseJson(response,200,{
      businessId:id,average:rating.average===null?null:Number(Number(rating.average).toFixed(1)),
      ratingCount:Number(rating.total),yourStars:mine[0]?.stars||null,redFlags:Number(flags.total),
      warning:Number(flags.total)>10?categories:[],
    });return true;
  }
}
