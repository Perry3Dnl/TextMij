export const NOTE_LIMIT=2000;

export function conversationPreference(store,id) {
  const value=Object.hasOwn(store||{},id)?store[id]:null;
  return {pinned:value?.pinned===true,blocked:value?.blocked===true,note:typeof value?.note==='string'?Array.from(value.note).slice(0,NOTE_LIMIT).join(''):''};
}
export function cleanConversationPreferences(store,ids) {
  return Object.fromEntries((ids||Object.keys(store||{})).filter(id=>Object.hasOwn(store||{},id)).map(id=>[id,conversationPreference(store,id)]));
}
export function previewConversationBlocked(state,id,role=state.mode) {
  return conversationPreference(state.conversationPrefs?.[role],id).blocked ||
    (id==='studio-noord'&&conversationPreference(state.conversationPrefs?.[role==='business'?'personal':'business'],id).blocked);
}
export function conversationExport({ownName,contactName,messages}) {
  const lines=['Conappt · gesprek met '+contactName,'Opgeslagen op '+new Date().toISOString(),
    'Alleen de gespreksgeschiedenis die op dit apparaat beschikbaar is.',''];
  for(const message of messages) {
    const time=new Date(message.at);
    lines.push((Number.isNaN(time.getTime())?'':time.toISOString())+' · '+(message.own?ownName:contactName)+(message.pending?' · niet bevestigd':''));
    if(message.title)lines.push(message.title);
    lines.push(message.text||'','');
  }
  return lines.join('\n');
}
export function downloadConversation(id,content) {
  const url=URL.createObjectURL(new Blob([content],{type:'text/plain;charset=utf-8'}));
  const anchor=document.createElement('a');
  anchor.href=url;anchor.download='conappt-gesprek-'+id.replace(/[^a-z0-9-]/gi,'').slice(0,64)+'.txt';
  document.body.append(anchor);anchor.click();anchor.remove();
  setTimeout(()=>URL.revokeObjectURL(url),1000);
}
