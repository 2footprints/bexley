function inferNameFromEmail(email){
  const local=String(email||'').split('@')[0]||'';
  if(!local)return '';
  return local
    .replace(/[._-]+/g,' ')
    .replace(/\b\w/g,s=>s.toUpperCase())
    .trim();
}

const MEMBER_PERMISSION_OPTIONS=['admin','manager','member','observer'];
const MEMBER_TEAM_OPTIONS=['CPA Team','BPO Team','Management','System'];
const MEMBER_RANK_OPTIONS=['Staff','Senior','Manager','Director','Partner','N/A'];

window.MEMBER_PERMISSION_OPTIONS=MEMBER_PERMISSION_OPTIONS;
window.MEMBER_TEAM_OPTIONS=MEMBER_TEAM_OPTIONS;
window.MEMBER_RANK_OPTIONS=MEMBER_RANK_OPTIONS;

function normalizeMemberPermissionLevel(role){
  const normalized=String(role||'').trim().toLowerCase();
  return MEMBER_PERMISSION_OPTIONS.includes(normalized)?normalized:'observer';
}

function getMemberPermissionLabel(role){
  const normalized=normalizeMemberPermissionLevel(role);
  if(normalized==='admin')return '관리자';
  if(normalized==='manager')return '매니저';
  if(normalized==='member')return '멤버';
  return 'Observer';
}

function normalizeMemberTeam(team){
  const normalized=String(team||'').trim();
  if(!normalized||normalized.toLowerCase()==='unassigned')return '';
  return normalized;
}

function getMemberTeamLabel(team){
  const normalized=normalizeMemberTeam(team);
  return normalized||'미지정';
}

function normalizeMemberRank(rank){
  const normalized=String(rank||'').trim();
  return normalized||'';
}

function getMemberRankLabel(rank){
  const normalized=normalizeMemberRank(rank);
  return normalized||'미지정';
}

function isMemberActive(member){
  return member?.is_active===undefined?true:!!member?.is_active;
}

function getActiveMembers(options={}){
  const sort=options.sort!==false;
  const rows=(members||[]).filter(member=>String(member?.name||'').trim()&&isMemberActive(member));
  if(sort){
    rows.sort((a,b)=>String(a?.name||'').localeCompare(String(b?.name||''),'ko'));
  }
  return rows;
}

function isMemberOperationallyIncluded(member,options={}){
  if(!member)return false;
  const activeOnly=options.activeOnly===undefined?false:!!options.activeOnly;
  if(activeOnly&&!isMemberActive(member))return false;
  return member?.include_in_operational_dashboards===undefined
    ? true
    : !!member?.include_in_operational_dashboards;
}

function getOperationalMembers(options={}){
  const activeOnly=options.activeOnly===undefined?true:!!options.activeOnly;
  const sort=options.sort!==false;
  const rows=(members||[]).filter(member=>{
    if(!String(member?.name||'').trim())return false;
    return isMemberOperationallyIncluded(member,{activeOnly});
  });
  if(sort){
    rows.sort((a,b)=>String(a?.name||'').localeCompare(String(b?.name||''),'ko'));
  }
  return rows;
}

function getOperationalMemberNameSet(options={}){
  return new Set(getOperationalMembers(options).map(member=>String(member?.name||'').trim()).filter(Boolean));
}

function getOperationalScheduleMemberNames(schedule,options={}){
  const allowedNames=getOperationalMemberNameSet(options);
  return getScheduleMemberNames(schedule).filter(name=>allowedNames.has(name));
}

function scheduleHasOperationalMember(schedule,options={}){
  return getOperationalScheduleMemberNames(schedule,options).length>0;
}

function isSystemAccountMember(member){
  return normalizeMemberTeam(member?.team)==='System';
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

/*
Combobox usage example:
const clientBox=createCombobox({
  mount:document.getElementById('someContainer'),
  items:clients,
  getLabel:item=>item.name,
  getSubLabel:item=>item.assigned_team||'',
  getValue:item=>item.id,
  value:currentClientId,
  onSelect:item=>{ selectedClientId=item.id; }
});
*/
function createCombobox(options={}){
  const mount=options.mount||options.container;
  if(!mount)throw new Error('createCombobox requires a mount element.');
  const doc=mount.ownerDocument||document;
  const win=doc.defaultView||window;
  const getLabel=typeof options.getLabel==='function'?options.getLabel:item=>String(item?.label??item?.name??item??'');
  const getSubLabel=typeof options.getSubLabel==='function'?options.getSubLabel:()=> '';
  const getValue=typeof options.getValue==='function'?options.getValue:item=>String(item?.value??item?.id??getLabel(item));
  const getSearchText=typeof options.getSearchText==='function'?options.getSearchText:item=>[getLabel(item),getSubLabel(item)].join(' ');
  const onSelect=typeof options.onSelect==='function'?options.onSelect:()=>{};
  const onClear=typeof options.onClear==='function'?options.onClear:()=>{};
  const maxItems=Number.isFinite(Number(options.maxItems))?Math.max(1,Number(options.maxItems)):10;
  const allowClear=options.allowClear!==false;
  const required=!!options.required;
  const disabled=!!options.disabled;
  let items=Array.isArray(options.items)?options.items:[];
  let selectedItem=null;
  let selectedValue=options.value??options.selectedValue??'';
  let activeIndex=-1;
  let isOpen=false;
  let lastQuery='';

  mount.innerHTML='';
  mount.classList.add('bx-combobox');
  if(disabled)mount.classList.add('is-disabled');

  const input=doc.createElement('input');
  input.type='text';
  input.className='bx-combobox-input';
  input.placeholder=options.placeholder||'검색 후 선택';
  input.autocomplete='off';
  input.disabled=disabled;
  input.setAttribute('role','combobox');
  input.setAttribute('aria-autocomplete','list');
  input.setAttribute('aria-expanded','false');
  if(required)input.setAttribute('aria-required','true');

  const hidden=doc.createElement('input');
  hidden.type='hidden';
  hidden.className='bx-combobox-value';
  if(options.name)hidden.name=options.name;

  const clearBtn=doc.createElement('button');
  clearBtn.type='button';
  clearBtn.className='bx-combobox-clear';
  clearBtn.setAttribute('aria-label','선택 해제');
  clearBtn.textContent='×';
  clearBtn.hidden=!allowClear||disabled;

  const menu=doc.createElement('div');
  menu.className='bx-combobox-menu';
  menu.setAttribute('role','listbox');
  menu.hidden=true;
  doc.body.appendChild(menu);

  mount.appendChild(input);
  mount.appendChild(hidden);
  mount.appendChild(clearBtn);

  function normalize(value){
    return String(value??'').trim().toLowerCase();
  }
  function findItemByValue(value){
    const key=String(value??'');
    return items.find(item=>String(getValue(item))===key)||null;
  }
  function setSelected(item,notify=true){
    selectedItem=item||null;
    selectedValue=selectedItem?String(getValue(selectedItem)):'';
    hidden.value=selectedValue;
    input.value=selectedItem?String(getLabel(selectedItem)||''):'';
    lastQuery=input.value;
    clearBtn.hidden=!allowClear||disabled||!selectedValue;
    mount.classList.toggle('has-value',!!selectedValue);
    if(notify&&selectedItem)onSelect(selectedItem);
  }
  function getFilteredItems(){
    const query=normalize(input.value);
    if(!query)return items.slice(0,maxItems);
    return items.filter(item=>{
      const label=normalize(getLabel(item));
      const subLabel=normalize(getSubLabel(item));
      const searchText=normalize(getSearchText(item));
      return label.includes(query)||subLabel.includes(query)||searchText.includes(query);
    }).slice(0,maxItems);
  }
  function positionMenu(){
    if(!isOpen)return;
    const rect=mount.getBoundingClientRect();
    menu.style.left=Math.max(8,rect.left)+'px';
    menu.style.top=(rect.bottom+4)+'px';
    menu.style.width=Math.max(160,rect.width)+'px';
  }
  function renderMenu(){
    const rows=getFilteredItems();
    menu.innerHTML='';
    if(!rows.length){
      const empty=doc.createElement('div');
      empty.className='bx-combobox-empty';
      empty.textContent='검색 결과가 없습니다.';
      menu.appendChild(empty);
      activeIndex=-1;
      return;
    }
    if(activeIndex<0||activeIndex>=rows.length)activeIndex=0;
    rows.forEach((item,index)=>{
      const option=doc.createElement('button');
      option.type='button';
      option.className='bx-combobox-option'+(index===activeIndex?' bx-combobox-option-active':'');
      option.setAttribute('role','option');
      option.setAttribute('aria-selected',index===activeIndex?'true':'false');
      option.innerHTML='<span class="bx-combobox-option-label">'+esc(getLabel(item))+'</span>'
        +(getSubLabel(item)?'<span class="bx-combobox-option-sub">'+esc(getSubLabel(item))+'</span>':'');
      option.addEventListener('mousedown',event=>event.preventDefault());
      option.addEventListener('click',()=>{
        setSelected(item,true);
        closeMenu();
      });
      menu.appendChild(option);
    });
  }
  function openMenu(){
    if(disabled)return;
    isOpen=true;
    input.setAttribute('aria-expanded','true');
    menu.hidden=false;
    renderMenu();
    positionMenu();
  }
  function closeMenu(){
    isOpen=false;
    input.setAttribute('aria-expanded','false');
    menu.hidden=true;
  }
  function clearSelection(notify=true){
    selectedItem=null;
    selectedValue='';
    hidden.value='';
    input.value='';
    lastQuery='';
    clearBtn.hidden=!allowClear||disabled;
    mount.classList.remove('has-value');
    if(notify)onClear();
  }
  function selectActive(){
    const rows=getFilteredItems();
    if(activeIndex>=0&&rows[activeIndex]){
      setSelected(rows[activeIndex],true);
      closeMenu();
      return true;
    }
    return false;
  }
  function markTextAsUnselected(){
    if(input.value!==lastQuery||String(hidden.value||'')!==String(selectedValue||'')){
      selectedItem=null;
      selectedValue='';
      hidden.value='';
      mount.classList.remove('has-value');
      clearBtn.hidden=!allowClear||disabled||!input.value;
    }
  }

  input.addEventListener('focus',openMenu);
  input.addEventListener('input',()=>{
    markTextAsUnselected();
    activeIndex=0;
    openMenu();
  });
  input.addEventListener('keydown',event=>{
    if(event.key==='ArrowDown'){
      event.preventDefault();
      if(!isOpen)openMenu();
      const rows=getFilteredItems();
      if(rows.length){activeIndex=(activeIndex+1+rows.length)%rows.length;renderMenu();}
    }else if(event.key==='ArrowUp'){
      event.preventDefault();
      if(!isOpen)openMenu();
      const rows=getFilteredItems();
      if(rows.length){activeIndex=(activeIndex-1+rows.length)%rows.length;renderMenu();}
    }else if(event.key==='Enter'){
      if(isOpen&&selectActive())event.preventDefault();
    }else if(event.key==='Escape'){
      closeMenu();
    }
  });
  clearBtn.addEventListener('click',()=>{
    clearSelection(true);
    input.focus();
    openMenu();
  });
  function handleDocumentMouseDown(event){
    if(mount.contains(event.target)||menu.contains(event.target))return;
    closeMenu();
  }
  doc.addEventListener('mousedown',handleDocumentMouseDown);
  win.addEventListener('resize',positionMenu);
  win.addEventListener('scroll',positionMenu,true);

  setSelected(findItemByValue(selectedValue),false);
  if(selectedValue&&!selectedItem){
    hidden.value=String(selectedValue);
  }

  return {
    mount,
    input,
    hidden,
    menu,
    getValue:()=>hidden.value,
    getInputText:()=>input.value,
    getSelectedItem:()=>selectedItem,
    hasUncommittedText:()=>!hidden.value&&!!input.value.trim(),
    setValue(value,notify=false){
      setSelected(findItemByValue(value),notify);
      if(value&&!selectedItem)hidden.value=String(value);
    },
    setItems(nextItems=[]){
      items=Array.isArray(nextItems)?nextItems:[];
      const currentValue=hidden.value;
      setSelected(findItemByValue(currentValue),false);
      if(isOpen)renderMenu();
    },
    clear:clearSelection,
    open:openMenu,
    close:closeMenu,
    destroy(){
      closeMenu();
      menu.remove();
      doc.removeEventListener('mousedown',handleDocumentMouseDown);
      win.removeEventListener('resize',positionMenu);
      win.removeEventListener('scroll',positionMenu,true);
      mount.innerHTML='';
      mount.classList.remove('bx-combobox','is-disabled','has-value');
    }
  };
}

const mountCombobox=createCombobox;
const setupCombobox=createCombobox;
window.createCombobox=createCombobox;
window.mountCombobox=mountCombobox;
window.setupCombobox=setupCombobox;

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
  if(s instanceof Date)return new Date(s.getTime());
  if(typeof s==='number')return new Date(s);
  const raw=String(s).trim();
  if(!raw)return new Date(0);
  if(/^\d{4}-\d{2}-\d{2}$/.test(raw)){
    const [y,mo,d]=raw.split('-').map(Number);
    return new Date(y,mo-1,d);
  }
  const parsed=new Date(raw);
  if(!Number.isNaN(parsed.getTime()))return parsed;
  const dateMatch=raw.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if(dateMatch){
    const [,y,mo,d]=dateMatch;
    return new Date(Number(y),Number(mo)-1,Number(d));
  }
  return new Date(0);
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
