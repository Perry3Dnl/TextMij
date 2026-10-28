// Browser/HTTP test adapter. Real MySQL schema and transactions are separately exercised in Docker CI.
export function memoryDatabase() {
  const db={accounts:[],profiles:[],connections:[],messages:[],reports:[],userReports:[],blocks:[],failReportInsert:false};
  let lock=Promise.resolve();
  db.query=async()=>[[{ready:1}]];
  db.execute=async(sql,args=[])=>{
    const query=sql.replace(/\s+/g,' ').trim();
    const merged=account=>({...account,...db.profiles.find(p=>p.account_id===account.id)});
    if(query.startsWith('SELECT id FROM accounts WHERE id IN'))return [db.accounts.filter(a=>args.includes(a.id)).map(a=>({id:a.id}))];
    if(query.startsWith('SELECT business_id FROM connections'))return [db.connections.filter(c=>c.business_id===args[0]&&c.customer_id===args[1])];
    if(query.startsWith('SELECT blocker_id,blocked_id FROM account_blocks')) {
      return [db.blocks.filter(b=>args.length===4?((b.blocker_id===args[0]&&b.blocked_id===args[1])||(b.blocker_id===args[2]&&b.blocked_id===args[3])):b.blocker_id===args[0]||b.blocked_id===args[1])];
    }
    if(query.startsWith('INSERT IGNORE INTO account_blocks')) {
      if(!db.blocks.some(b=>b.blocker_id===args[0]&&b.blocked_id===args[1]))db.blocks.push({blocker_id:args[0],blocked_id:args[1]});
      return [{affectedRows:1}];
    }
    if(query.startsWith('DELETE FROM account_blocks')) {
      const index=db.blocks.findIndex(b=>b.blocker_id===args[0]&&b.blocked_id===args[1]);
      if(index>=0)db.blocks.splice(index,1);return [{affectedRows:index>=0?1:0}];
    }
    if(query.startsWith("UPDATE encrypted_messages SET status = 'failed'")) {
      for(const m of db.messages)if(m.status==='queued'&&((m.sender_business_id===args[0]&&m.recipient_device_id===args[1])||(m.sender_business_id===args[2]&&m.recipient_device_id===args[3])))m.status='failed';
      return [{affectedRows:1}];
    }
    if(query.startsWith('INSERT INTO accounts')) {
      const [id,kind,public_code,display_name,email,public_key,credential_hash]=args;
      if(db.accounts.some(a=>a.public_code===public_code))throw Object.assign(new Error('Duplicate code'),{code:'ER_DUP_ENTRY'});
      db.accounts.push({id,kind,public_code,display_name,email,public_key,credential_hash,tier:'standard',key_version:1});
      return [{affectedRows:1}];
    }
    if(query.includes('WHERE credential_hash = ?'))return [db.accounts.filter(a=>Buffer.from(a.credential_hash).equals(Buffer.from(args[0])))];
    if(query.includes('WHERE id = ? OR public_code = ?'))return [db.accounts.filter(a=>a.id===args[0]||a.public_code===args[1]).slice(0,1)];
    if(query.startsWith('SELECT a.*,')&&query.includes('FROM accounts a LEFT JOIN'))return [db.accounts.filter(a=>a.id===args[0]).map(merged)];
    if(query.startsWith('SELECT id,kind FROM accounts WHERE public_code'))return [db.accounts.filter(a=>a.public_code===args[0])];
    if(query.startsWith('SELECT id FROM accounts'))return [db.accounts.filter(a=>a.id===args[0]).map(a=>({id:a.id}))];
    if(query.startsWith('INSERT INTO business_profiles')) {
      const [account_id,industry_id,profile_json]=args;
      const existing=db.profiles.find(p=>p.account_id===account_id);
      if(existing)Object.assign(existing,{industry_id,profile_json});
      else db.profiles.push({account_id,industry_id,profile_json});
      return [{affectedRows:1}];
    }
    if(query.startsWith('UPDATE accounts SET display_name')) {
      const account=db.accounts.find(a=>a.id===args[1]);if(account)account.display_name=args[0];
      return [{affectedRows:account?1:0}];
    }
    if(query.startsWith('INSERT IGNORE INTO connections')) {
      const [business_id,customer_id,customer_alias]=args;
      if(db.connections.some(c=>c.business_id===business_id&&c.customer_id===customer_id))return [{affectedRows:0}];
      db.connections.push({business_id,customer_id,customer_alias,created_at:new Date()});return [{affectedRows:1}];
    }
    if(query.startsWith('UPDATE connections SET customer_alias')) {
      const item=db.connections.find(c=>c.business_id===args[1]&&c.customer_id===args[2]);
      if(item)item.customer_alias=args[0];return [{affectedRows:item?1:0}];
    }
    if(query.startsWith('SELECT a.*,')&&query.includes('FROM connections')) {
      const business=query.includes('WHERE c.business_id = ?');
      return [db.connections.filter(c=>(business?c.business_id:c.customer_id)===args[0]).map(c=>({
        ...merged(db.accounts.find(a=>a.id===(business?c.customer_id:c.business_id))),
        customer_alias:c.customer_alias,connected_at:c.created_at
      }))];
    }
    if(query.startsWith('SELECT a.display_name FROM accounts a JOIN connections')) {
      const user=query.includes("a.kind = 'personal'");
      return [db.accounts.filter(a=>a.id===args[0]&&a.kind===(user?'personal':'business')&&db.connections.some(c=>user?c.customer_id===a.id&&c.business_id===args[1]:c.business_id===a.id&&c.customer_id===args[1])).map(a=>({display_name:a.display_name}))];
    }
    if(query.startsWith('SELECT id,business_id AS target_id')||query.startsWith('SELECT id,user_id AS target_id')) {
      const user=query.includes('FROM user_reports');
      return [(user?db.userReports:db.reports).filter(r=>r.reporter_id===args[0]&&r.request_id===args[1]).map(r=>({...r,target_id:user?r.user_id:r.business_id}))];
    }
    if(query.startsWith('SELECT COUNT(*) AS total FROM business_reports')||query.startsWith('SELECT COUNT(*) AS total FROM user_reports'))return [[{total:(query.includes('user_reports')?db.userReports:db.reports).filter(r=>r.reporter_id===args[0]&&r.created_at>Date.now()-86400000).length}]];
    if(query.startsWith('INSERT INTO business_reports')||query.startsWith('INSERT INTO user_reports')) {
      if(db.failReportInsert)throw new Error('Synthetic database failure');
      const [id,reporter_id,business_id,request_id,business_name,reason,details]=args;
      const user=query.startsWith('INSERT INTO user_reports');
      (user?db.userReports:db.reports).push({id,reporter_id,...(user?{user_id:business_id,user_name:business_name}:{business_id,business_name}),request_id,reason,details,status:'open',created_at:new Date()});
      return [{affectedRows:1}];
    }
    if(query.startsWith('INSERT INTO encrypted_messages')) {
      const [idempotency_key,payload_hash,sender_business_id,recipient_device_id,message_type,ciphertext,nonce,image_ciphertext,image_nonce,wrapped_key,key_version,tier_at_acceptance]=args;
      if(!db.messages.some(m=>m.sender_business_id===sender_business_id&&m.idempotency_key===idempotency_key))db.messages.push({
        id:db.messages.length+1,idempotency_key,payload_hash,sender_business_id,recipient_device_id,message_type,ciphertext,nonce,image_ciphertext,image_nonce,wrapped_key,key_version,tier_at_acceptance,queued_at:new Date(),status:'dispatched'
      });
      return [{affectedRows:1}];
    }
    if(query.startsWith('SELECT id, payload_hash'))return [db.messages.filter(m=>m.sender_business_id===args[0]&&m.idempotency_key===args[1]).slice(-1)];
    if(query.includes("AND status = 'dispatched'"))return [db.messages.filter(m=>m.recipient_device_id===args[0]&&m.id>Number(args[1])&&m.status==='dispatched'&&!db.blocks.some(b=>(b.blocker_id===m.sender_business_id&&b.blocked_id===m.recipient_device_id)||(b.blocker_id===m.recipient_device_id&&b.blocked_id===m.sender_business_id))).slice(0,100)];
    throw new Error('Unsupported test query: '+query);
  };
  db.getConnection=async()=>{
    let unlock,backup;
    return {
      execute:db.execute,
      async beginTransaction() {
        const previous=lock;lock=new Promise(resolve=>{unlock=resolve;});await previous;
        backup=Object.fromEntries(['reports','userReports','blocks','messages'].map(key=>[key,db[key].map(item=>({...item}))]));
      },
      async commit(){unlock?.();unlock=null;},
      async rollback(){for(const [key,items] of Object.entries(backup||{}))db[key].splice(0,db[key].length,...items);unlock?.();unlock=null;},
      release(){unlock?.();unlock=null;}
    };
  };
  return db;
}
