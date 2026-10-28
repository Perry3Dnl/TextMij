// Account closure is server controlled. Archived profiles remain visible to existing
// contacts for exactly 90 days; no new communication is accepted after closure.
export const CLOSURE_DAYS=90;
export const closureLimit=closedAt=>Date.parse(closedAt)+CLOSURE_DAYS*86400000;
export function parseClosure(profile){
  try{
    const data=typeof profile==='string'?JSON.parse(profile):profile;
    const value=data?.closedAt;
    return typeof value==='string'&&Number.isFinite(Date.parse(value))?value:null;
  }catch{return null;}
}
export function expiredClosure(closedAt,now=Date.now()){
  return Boolean(closedAt)&&now>=closureLimit(closedAt);
}
export function closurePublic(profile,now=Date.now()){
  const closedAt=parseClosure(profile);
  return {closedAt,closed:Boolean(closedAt),expired:expiredClosure(closedAt,now)};
}
export async function assertOpenBusiness(pool,businessId){
  const [rows]=await pool.execute('SELECT profile_json FROM business_profiles WHERE account_id = ? LIMIT 1',[businessId]);
  if(parseClosure(rows[0]?.profile_json)){
    const error=new Error('Dit bedrijf heeft zijn account gesloten. Nieuwe berichten zijn niet mogelijk.');
    error.status=403;throw error;
  }
}
