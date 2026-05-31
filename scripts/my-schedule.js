let myScheduleTypeFilter='all';
let myScheduleRangeFilter='week';

function getMyScheduleTypeOptions(){
  return [
    {value:'meeting',label:'회의'},
    {value:'fieldwork',label:'필드워크'},
    {value:'leave',label:'휴가'},
    {value:'personal',label:'개인'},
    {value:'external',label:'외근'},
    {value:'review',label:'검토'},
    {value:'internal',label:'기타'}
  ];
}

function getMyScheduleDateValue(schedule,kind='start'){
  if(!schedule)return '';
  const keys=kind==='end'
    ?['end_at','end_date','end']
    :['start_at','start_date','start'];
  return keys.map(key=>schedule[key]).find(Boolean)||'';
}

function getMyScheduleDate(dateValue){
  if(!dateValue)return null;
  const raw=String(dateValue);
  const date=new Date(raw.includes('T')?raw:(raw+'T00:00:00'));
  return Number.isNaN(date.getTime())?null:date;
}

function getMyScheduleDateKey(dateValue){
  if(!dateValue)return '';
  const raw=String(dateValue);
  if(/^\d{4}-\d{2}-\d{2}/.test(raw))return raw.slice(0,10);
  const date=getMyScheduleDate(raw);
  if(!date)return '';
  return date.getFullYear()+'-'+String(date.getMonth()+1).padStart(2,'0')+'-'+String(date.getDate()).padStart(2,'0');
}

function getMyScheduleDateTimeInputValue(dateValue,fallbackDate=null){
  const source=dateValue||fallbackDate||new Date();
  const date=getMyScheduleDate(source)||new Date();
  return date.getFullYear()+'-'+String(date.getMonth()+1).padStart(2,'0')+'-'+String(date.getDate()).padStart(2,'0')+'T'+String(date.getHours()).padStart(2,'0')+':'+String(date.getMinutes()).padStart(2,'0');
}

function formatMyScheduleDateRange(schedule){
  const start=getMyScheduleDateValue(schedule,'start');
  const end=getMyScheduleDateValue(schedule,'end')||start;
  const allDay=!!schedule?.all_day;
  const startKey=getMyScheduleDateKey(start);
  const endKey=getMyScheduleDateKey(end)||startKey;
  if(allDay||(!String(start).includes('T')&&!String(end).includes('T'))){
    return startKey===endKey?startKey:(startKey+' ~ '+endKey);
  }
  const startDate=getMyScheduleDate(start);
  const endDate=getMyScheduleDate(end);
  const fmt=date=>date?String(date.getMonth()+1).padStart(2,'0')+'/'+String(date.getDate()).padStart(2,'0')+' '+String(date.getHours()).padStart(2,'0')+':'+String(date.getMinutes()).padStart(2,'0'):'';
  return fmt(startDate)+(endDate?' ~ '+fmt(endDate):'');
}

function getMyScheduleTypeMeta(type){
  const value=String(type||'personal').trim()||'personal';
  const fromGlobal=(typeof SCHEDULE_META!=='undefined'&&SCHEDULE_META[value])?SCHEDULE_META[value]:null;
  const option=getMyScheduleTypeOptions().find(item=>item.value===value);
  return {
    value,
    label:option?.label||fromGlobal?.label||value||'일정',
    color:fromGlobal?.color||'#8B9BB4'
  };
}

function getMyScheduleMemberIds(schedule){
  const ids=(scheduleMemberLinks||[])
    .filter(link=>String(link.schedule_id)===String(schedule?.id||''))
    .map(link=>String(link.member_id||''))
    .filter(Boolean);
  if(schedule?.member_id)ids.push(String(schedule.member_id));
  return [...new Set(ids)];
}

function getMyScheduleMemberNames(schedule){
  const ids=getMyScheduleMemberIds(schedule);
  const names=ids.map(id=>(members||[]).find(member=>String(member.id)===id)?.name||'').filter(Boolean);
  if(!names.length&&schedule?.member_name){
    names.push(...String(schedule.member_name).split(',').map(name=>name.trim()).filter(Boolean));
  }
  return [...new Set(names)];
}

function isMyScheduleMine(schedule){
  const myMemberId=String(currentMember?.id||'');
  const myUserId=String(currentUser?.id||'');
  if(myUserId&&String(schedule?.created_by||'')===myUserId)return true;
  if(myMemberId&&String(schedule?.member_id||'')===myMemberId)return true;
  return !!(myMemberId&&getMyScheduleMemberIds(schedule).includes(myMemberId));
}

function getMyScheduleRangeBounds(){
  const today=new Date();
  today.setHours(0,0,0,0);
  if(myScheduleRangeFilter==='all')return null;
  if(myScheduleRangeFilter==='month'){
    const start=new Date(today.getFullYear(),today.getMonth(),1);
    const end=new Date(today.getFullYear(),today.getMonth()+1,0,23,59,59,999);
    return {start,end};
  }
  const day=today.getDay();
  const diff=day===0?-6:1-day;
  const start=new Date(today);
  start.setDate(today.getDate()+diff);
  const end=new Date(start);
  end.setDate(start.getDate()+6);
  end.setHours(23,59,59,999);
  return {start,end};
}

function getMyScheduleRows(){
  const bounds=getMyScheduleRangeBounds();
  return (schedules||[])
    .filter(isMyScheduleMine)
    .filter(schedule=>myScheduleTypeFilter==='all'||String(schedule?.schedule_type||'')===myScheduleTypeFilter)
    .filter(schedule=>{
      if(!bounds)return true;
      const start=getMyScheduleDate(getMyScheduleDateValue(schedule,'start'));
      const end=getMyScheduleDate(getMyScheduleDateValue(schedule,'end')||getMyScheduleDateValue(schedule,'start'))||start;
      return !!start&&!!end&&start<=bounds.end&&end>=bounds.start;
    })
    .sort((a,b)=>(getMyScheduleDate(getMyScheduleDateValue(a,'start'))?.getTime()||0)-(getMyScheduleDate(getMyScheduleDateValue(b,'start'))?.getTime()||0));
}

function getMyScheduleProject(schedule){
  return (projects||[]).find(project=>String(project?.id||'')===String(schedule?.project_id||''))||null;
}

function renderMySchedulePage(){
  const el=document.getElementById('pageMySchedule');
  if(!el)return;
  const rows=getMyScheduleRows();
  const typeOptions='<option value="all">유형 전체</option>'+getMyScheduleTypeOptions().map(type=>'<option value="'+type.value+'" '+(myScheduleTypeFilter===type.value?'selected':'')+'>'+esc(type.label)+'</option>').join('');
  el.innerHTML=''
    +'<div class="my-schedule-shell">'
      +'<div class="my-schedule-head">'
        +'<div><div class="my-schedule-title">내 일정</div><div class="my-schedule-sub">개인 일정, 휴가, 필드워크와 회의 일정을 한 곳에서 관리합니다.</div></div>'
        +'<button type="button" class="btn primary sm" onclick="openMyScheduleModal()">일정 추가</button>'
      +'</div>'
      +'<div class="card my-schedule-toolbar">'
        +'<div class="my-schedule-filters">'
          +'<select onchange="setMyScheduleTypeFilter(this.value)">'+typeOptions+'</select>'
          +'<select onchange="setMyScheduleRangeFilter(this.value)">'
            +'<option value="week" '+(myScheduleRangeFilter==='week'?'selected':'')+'>이번 주</option>'
            +'<option value="month" '+(myScheduleRangeFilter==='month'?'selected':'')+'>이번 달</option>'
            +'<option value="all" '+(myScheduleRangeFilter==='all'?'selected':'')+'>전체</option>'
          +'</select>'
        +'</div>'
        +'<span class="my-schedule-badge">'+rows.length+'건</span>'
      +'</div>'
      +'<div class="my-schedule-list">'+(rows.length?rows.map(renderMyScheduleCard).join(''):'<div class="my-schedule-empty">조건에 맞는 일정이 없습니다.</div>')+'</div>'
    +'</div>';
}

function renderMyScheduleCard(schedule){
  const meta=getMyScheduleTypeMeta(schedule?.schedule_type);
  const project=getMyScheduleProject(schedule);
  const names=getMyScheduleMemberNames(schedule);
  return '<article class="my-schedule-card">'
    +'<div class="my-schedule-main">'
      +'<div class="my-schedule-card-title">'+esc(schedule?.title||meta.label)+'</div>'
      +'<div class="my-schedule-meta">'
        +'<span class="my-schedule-badge" style="border-color:'+meta.color+';color:'+meta.color+'">'+esc(meta.label)+'</span>'
        +'<span>'+esc(formatMyScheduleDateRange(schedule))+'</span>'
        +(schedule?.location?'<span>'+esc(schedule.location)+'</span>':'')
        +(project?'<span>'+esc(project.name||'연결 프로젝트')+'</span>':'')
      +'</div>'
      +(names.length?'<div class="my-schedule-participants">'+names.map(name=>'<span>'+esc(name)+'</span>').join('')+'</div>':'')
      +(schedule?.memo?'<div class="my-schedule-note">'+esc(schedule.memo)+'</div>':'')
    +'</div>'
    +'<div class="my-schedule-actions">'
      +'<button type="button" class="btn ghost sm" onclick="openMyScheduleModal(\''+esc(String(schedule.id||''))+'\')">수정</button>'
      +'<button type="button" class="btn danger sm" onclick="deleteMySchedule(\''+esc(String(schedule.id||''))+'\')">삭제</button>'
    +'</div>'
  +'</article>';
}

function setMyScheduleTypeFilter(value){
  myScheduleTypeFilter=value||'all';
  renderMySchedulePage();
}

function setMyScheduleRangeFilter(value){
  myScheduleRangeFilter=value||'week';
  renderMySchedulePage();
}

function renderMyScheduleProjectOptions(selectedId=''){
  return '<option value="">연결 프로젝트 없음</option>'
    +(projects||[]).map(project=>{
      const client=(clients||[]).find(row=>String(row?.id||'')===String(project?.client_id||''))||null;
      const label=(client?client.name+' · ':'')+(project?.name||'프로젝트');
      return '<option value="'+esc(String(project.id||''))+'" '+(String(project.id)===String(selectedId)?'selected':'')+'>'+esc(label)+'</option>';
    }).join('');
}

function renderMyScheduleMemberOptions(selectedIds=[]){
  const selected=new Set((selectedIds||[]).map(String));
  return (members||[]).map(member=>'<option value="'+esc(String(member.id||''))+'" '+(selected.has(String(member.id||''))?'selected':'')+'>'+esc(member.name||member.email||'멤버')+'</option>').join('');
}

function openMyScheduleModal(scheduleId=''){
  if(!canManageCore()){alert('멤버 이상 권한이 필요합니다.');return;}
  const schedule=scheduleId?(schedules||[]).find(row=>String(row?.id||'')===String(scheduleId)):null;
  const now=new Date();
  now.setMinutes(0,0,0);
  const defaultEnd=new Date(now.getTime()+60*60*1000);
  const selectedMemberIds=getMyScheduleMemberIds(schedule);
  if(!selectedMemberIds.length&&currentMember?.id)selectedMemberIds.push(String(currentMember.id));
  const typeOptions=getMyScheduleTypeOptions().map(type=>'<option value="'+type.value+'" '+(String(schedule?.schedule_type||'personal')===type.value?'selected':'')+'>'+esc(type.label)+'</option>').join('');
  document.getElementById('modalArea').innerHTML=''
    +getInputModalOverlayHtml()
    +'<div class="modal my-schedule-modal" style="width:620px">'
      +'<div class="modal-title">'+(schedule?'일정 수정':'일정 추가')+'</div>'
      +'<div class="form-row"><label class="form-label">제목</label><input id="myScheduleTitle" value="'+esc(schedule?.title||'')+'" placeholder="예) 고객 미팅, 휴가, 검토 시간"></div>'
      +'<div class="form-half"><div class="form-row"><label class="form-label">일정 유형</label><select id="myScheduleType">'+typeOptions+'</select></div>'
      +'<div class="checkbox-row" style="margin-top:28px"><input type="checkbox" id="myScheduleAllDay" '+(schedule?.all_day?'checked':'')+'><label for="myScheduleAllDay">종일</label></div></div>'
      +'<div class="form-half"><div class="form-row"><label class="form-label">시작일시</label><input type="datetime-local" id="myScheduleStart" value="'+esc(getMyScheduleDateTimeInputValue(getMyScheduleDateValue(schedule,'start'),now))+'"></div>'
      +'<div class="form-row"><label class="form-label">종료일시</label><input type="datetime-local" id="myScheduleEnd" value="'+esc(getMyScheduleDateTimeInputValue(getMyScheduleDateValue(schedule,'end'),defaultEnd))+'"></div></div>'
      +'<div class="form-row"><label class="form-label">위치</label><input id="myScheduleLocation" value="'+esc(schedule?.location||'')+'" placeholder="선택"></div>'
      +'<div class="form-row"><label class="form-label">연결 프로젝트</label><select id="myScheduleProject">'+renderMyScheduleProjectOptions(schedule?.project_id||'')+'</select></div>'
      +'<div class="form-row"><label class="form-label">참여자</label><select id="myScheduleMembers" class="my-schedule-member-select" multiple>'+renderMyScheduleMemberOptions(selectedMemberIds)+'</select></div>'
      +'<div class="form-row"><label class="form-label">메모</label><textarea id="myScheduleMemo" rows="3" style="resize:vertical" placeholder="선택">'+esc(schedule?.memo||'')+'</textarea></div>'
      +'<div class="modal-footer">'
        +(schedule?'<button type="button" class="btn danger" onclick="deleteMySchedule(\''+esc(String(schedule.id||''))+'\')">삭제</button>':'<div></div>')
        +'<div class="modal-footer-right"><button type="button" class="btn ghost" onclick="closeModal()">취소</button><button type="button" class="btn primary" onclick="saveMySchedule(\''+esc(String(schedule?.id||''))+'\')">저장</button></div>'
      +'</div>'
    +'</div></div>';
  lockBodyScroll();
  bindModalEscapeHandler();
  document.getElementById('myScheduleTitle')?.focus();
}

function getSelectedMyScheduleMemberIds(){
  return Array.from(document.getElementById('myScheduleMembers')?.selectedOptions||[])
    .map(option=>String(option.value||''))
    .filter(Boolean);
}

async function saveMySchedule(scheduleId=''){
  const title=String(document.getElementById('myScheduleTitle')?.value||'').trim();
  const scheduleType=String(document.getElementById('myScheduleType')?.value||'personal').trim()||'personal';
  const startAt=String(document.getElementById('myScheduleStart')?.value||'').trim();
  const endAt=String(document.getElementById('myScheduleEnd')?.value||'').trim();
  const allDay=!!document.getElementById('myScheduleAllDay')?.checked;
  const memberIds=getSelectedMyScheduleMemberIds();
  if(!title){alert('제목을 입력해주세요.');return;}
  if(!startAt||!endAt){alert('시작일시와 종료일시를 입력해주세요.');return;}
  if(startAt>endAt){alert('종료일시가 시작일시보다 빠릅니다.');return;}
  if(!memberIds.length){alert('참여자를 1명 이상 선택해주세요.');return;}
  const primaryMember=(members||[]).find(member=>String(member.id)===String(memberIds[0]))||null;
  const projectId=String(document.getElementById('myScheduleProject')?.value||'').trim();
  const project=projectId?(projects||[]).find(row=>String(row?.id||'')===projectId):null;
  const body={
    title,
    schedule_type:scheduleType,
    start_at:startAt,
    end_at:endAt,
    start_date:startAt.slice(0,10),
    end_date:endAt.slice(0,10),
    all_day:allDay,
    location:String(document.getElementById('myScheduleLocation')?.value||'').trim()||null,
    memo:String(document.getElementById('myScheduleMemo')?.value||'').trim()||null,
    project_id:projectId||null,
    client_id:project?.client_id||null,
    member_id:primaryMember?.id||null,
    member_name:primaryMember?.name||null
  };
  try{
    let savedId=scheduleId;
    if(scheduleId){
      await api('PATCH','schedules?id=eq.'+scheduleId,body);
      await logActivity('일정 수정','schedule',scheduleId,title);
    }else{
      body.created_by=currentUser?.id||null;
      const inserted=await api('POST','schedules',body);
      savedId=Array.isArray(inserted)?inserted[0]?.id:inserted?.id;
      await logActivity('일정 추가','schedule',savedId||null,title);
    }
    if(savedId){
      await api('DELETE','schedule_members?schedule_id=eq.'+savedId);
      const rows=memberIds.map(memberId=>({schedule_id:savedId,member_id:memberId}));
      if(rows.length)await api('POST','schedule_members',rows);
    }
    closeModal();
    await loadAll();
    renderMySchedulePage();
  }catch(error){
    alert('일정 저장 오류: '+(error?.message||error));
  }
}

async function deleteMySchedule(scheduleId){
  if(!scheduleId)return;
  const schedule=(schedules||[]).find(row=>String(row?.id||'')===String(scheduleId));
  if(!confirm('"'+(schedule?.title||'일정')+'"을 삭제할까요?'))return;
  try{
    await api('DELETE','schedule_members?schedule_id=eq.'+scheduleId).catch(()=>{});
    await api('DELETE','schedules?id=eq.'+scheduleId);
    await logActivity('일정 삭제','schedule',scheduleId,schedule?.title||'');
    closeModal();
    await loadAll();
    renderMySchedulePage();
  }catch(error){
    alert('일정 삭제 오류: '+(error?.message||error));
  }
}
