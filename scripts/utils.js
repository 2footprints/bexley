function inferNameFromEmail(email){
  const local=String(email||'').split('@')[0]||'';
  if(!local)return '';
  return local
    .replace(/[._-]+/g,' ')
    .replace(/\b\w/g,s=>s.toUpperCase())
    .trim();
}

function setElementDisplay(id,visible,display='inline-block'){
  const el=document.getElementById(id);
  if(el)el.style.display=visible?display:'none';
}

function formatPendingDate(ts){
  return formatCommentDate(ts);
}

function truncateText(text,max=42){
  const raw=String(text||'').replace(/\s+/g,' ').trim();
  return raw.length>max?raw.slice(0,max-1)+'\u2026':raw;
}

function esc(s){
  return String(s??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
}

async function copyText(text){
  try{
    await navigator.clipboard.writeText(text);
    alert('\uBA54\uC77C \uBB38\uC548\uC774 \uBCF5\uC0AC\uB418\uC5C8\uC2B5\uB2C8\uB2E4.');
  }catch(e){
    const ta=document.createElement('textarea');
    ta.value=text;
    document.body.appendChild(ta);
    ta.select();
    document.execCommand('copy');
    document.body.removeChild(ta);
    alert('\uBA54\uC77C \uBB38\uC548\uC774 \uBCF5\uC0AC\uB418\uC5C8\uC2B5\uB2C8\uB2E4.');
  }
}

function formatBillingDate(value){
  if(!value) return '';
  if(/^\d{4}-\d{2}-\d{2}$/.test(value)){
    const d=toDate(value);
    return (d.getMonth()+1)+'\uC6D4 '+d.getDate()+'\uC77C';
  }
  return value;
}

function formatCommentDate(ts){
  if(!ts)return '';
  const d=new Date(ts);
  const yy=d.getFullYear();
  const mm=String(d.getMonth()+1).padStart(2,'0');
  const dd=String(d.getDate()).padStart(2,'0');
  const hh=String(d.getHours()).padStart(2,'0');
  const mi=String(d.getMinutes()).padStart(2,'0');
  return `${yy}.${mm}.${dd} ${hh}:${mi}`;
}

function formatIssueDateInput(value){
  return formatBillingDate(String(value||'').trim());
}

function getWeekBounds(offsetWeeks=0){
  const base=new Date();
  base.setHours(0,0,0,0);
  const day=base.getDay();
  const diffToMonday=(day+6)%7;
  const start=new Date(base);
  start.setDate(base.getDate()-diffToMonday+(offsetWeeks*7));
  const end=new Date(start);
  end.setDate(start.getDate()+6);
  end.setHours(23,59,59,999);
  return {start,end};
}

function getWeekStart(offsetWeeks=0){
  const {start}=getWeekBounds(offsetWeeks);
  return start.getFullYear()+'-'+pad(start.getMonth()+1)+'-'+pad(start.getDate());
}

function formatRangeShort(start,end){
  const s=toDate(start),e=toDate(end);
  const sm=s.getMonth()+1, sd=s.getDate(), em=e.getMonth()+1, ed=e.getDate();
  return sm===em && sd===ed ? `${sm}.${sd}` : `${sm}.${sd} ~ ${em}.${ed}`;
}

function pad(n){
  return String(n).padStart(2,'0');
}

function daysInMonth(y,m){
  return new Date(y,m,0).getDate();
}

function toDate(s){
  if(!s)return new Date(0);
  const [y,mo,d]=s.split('-').map(Number);
  return new Date(y,mo-1,d);
}

function isWeekend(y,m,d){
  const w=new Date(y,m-1,d).getDay();
  return w===0||w===6;
}

function isToday(y,m,d){
  const t=new Date();
  return t.getFullYear()===y&&t.getMonth()+1===m&&t.getDate()===d;
}

function getScheduleMemberNames(s){
  if(Array.isArray(s?.member_names)&&s.member_names.length)return [...new Set(s.member_names.filter(Boolean))];
  const linkedNames=(scheduleMemberLinks||[])
    .filter(link=>String(link.schedule_id)===String(s?.id))
    .map(link=>link.members?.name||members.find(m=>String(m.id)===String(link.member_id))?.name||'')
    .filter(Boolean);
  if(linkedNames.length)return [...new Set(linkedNames)];
  if(s?.member_name)return [...new Set(String(s.member_name).split(',').map(name=>name.trim()).filter(Boolean))];
  const singleMember=members.find(m=>String(m.id)===String(s?.member_id));
  return singleMember?[singleMember.name]:[];
}

function getScheduleMemberLabel(s){
  const names=getScheduleMemberNames(s);
  return names.join(', ')||'\uBBF8\uBC30\uC815';
}

function scheduleHasMember(s,name){
  if(!name)return false;
  return getScheduleMemberNames(s).includes(name);
}

function scheduleHasAnyProjectMember(s,projectMembers){
  const membersInSchedule=getScheduleMemberNames(s);
  return membersInSchedule.some(name=>(projectMembers||[]).includes(name));
}

function formatDate(ts){
  const d=new Date(ts);
  return d.getFullYear()+'.'+(d.getMonth()+1).toString().padStart(2,'0')+'.'+d.getDate().toString().padStart(2,'0');
}

function withAlpha(color,alphaHex){
  if(/^#[0-9A-Fa-f]{6}$/.test(color||'')) return color+alphaHex;
  return color||'#94A3B8';
}
