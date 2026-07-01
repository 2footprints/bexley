let myScheduleTypeFilter = 'all';
let myScheduleRangeFilter = 'month';
let myScheduleScopeFilter = 'all';
let myScheduleMemberFilter = 'all';
let myScheduleViewMode = 'calendar';
let myScheduleCalendarDate = new Date();

function getMyScheduleTypeOptions(){
  return [
    {value:'leave',label:'휴가',color:'#16A34A'},
    {value:'fieldwork',label:'필드워크',color:'#F97316'},
    {value:'meeting',label:'회의',color:'#2563EB'},
    {value:'internal',label:'내부',color:'#64748B'},
    {value:'external',label:'외근',color:'#FDBA74'}
  ];
}

function getMyScheduleDateValue(schedule,kind='start'){
  if(!schedule)return '';
  return kind==='end'
    ?(schedule.end_date||schedule.end||'')
    :(schedule.start_date||schedule.start||'');
}

function getMyScheduleDate(dateValue){
  if(!dateValue)return null;
  if(dateValue instanceof Date){
    const date=new Date(dateValue);
    date.setHours(0,0,0,0);
    return Number.isNaN(date.getTime())?null:date;
  }
  const raw=String(dateValue).slice(0,10);
  const date=new Date(raw+'T00:00:00');
  return Number.isNaN(date.getTime())?null:date;
}

function getMyScheduleDateKey(dateValue){
  if(!dateValue)return '';
  if(dateValue instanceof Date){
    return dateValue.getFullYear()+'-'+String(dateValue.getMonth()+1).padStart(2,'0')+'-'+String(dateValue.getDate()).padStart(2,'0');
  }
  const raw=String(dateValue);
  if(/^\d{4}-\d{2}-\d{2}/.test(raw))return raw.slice(0,10);
  const date=getMyScheduleDate(raw);
  if(!date)return '';
  return date.getFullYear()+'-'+String(date.getMonth()+1).padStart(2,'0')+'-'+String(date.getDate()).padStart(2,'0');
}

function getMyScheduleToday(){
  const today=new Date();
  today.setHours(0,0,0,0);
  return today;
}

function getMyScheduleWeekBounds(baseDate=getMyScheduleToday()){
  const base=new Date(baseDate);
  base.setHours(0,0,0,0);
  const day=base.getDay();
  const diff=day===0?-6:1-day;
  const start=new Date(base);
  start.setDate(base.getDate()+diff);
  const end=new Date(start);
  end.setDate(start.getDate()+6);
  end.setHours(23,59,59,999);
  return {start,end};
}

function getMyScheduleMonthBounds(baseDate=getMyScheduleToday()){
  const start=new Date(baseDate.getFullYear(),baseDate.getMonth(),1);
  const end=new Date(baseDate.getFullYear(),baseDate.getMonth()+1,0,23,59,59,999);
  return {start,end};
}

function getMyScheduleRangeBounds(){
  if(myScheduleRangeFilter==='all')return null;
  if(myScheduleRangeFilter==='week')return getMyScheduleWeekBounds();
  return getMyScheduleMonthBounds();
}

function getMyScheduleDateInputValue(dateValue,fallbackDate=null){
  const key=getMyScheduleDateKey(dateValue);
  if(key)return key;
  const date=fallbackDate||getMyScheduleToday();
  return date.getFullYear()+'-'+String(date.getMonth()+1).padStart(2,'0')+'-'+String(date.getDate()).padStart(2,'0');
}

function formatMyScheduleDateRange(schedule){
  const startKey=getMyScheduleDateKey(getMyScheduleDateValue(schedule,'start'));
  const endKey=getMyScheduleDateKey(getMyScheduleDateValue(schedule,'end'))||startKey;
  if(!startKey)return '-';
  return startKey===endKey?startKey:(startKey+' ~ '+endKey);
}

function getMyScheduleTypeMeta(type){
  const value=String(type||'internal').trim()||'internal';
  const option=getMyScheduleTypeOptions().find(item=>item.value===value);
  const fromGlobal=(typeof SCHEDULE_META!=='undefined'&&SCHEDULE_META[value])?SCHEDULE_META[value]:null;
  return {
    value,
    label:option?.label||fromGlobal?.label||value||'일정',
    color:option?.color||fromGlobal?.color||'#64748B'
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

function getMyScheduleSpan(schedule){
  const start=getMyScheduleDate(getMyScheduleDateValue(schedule,'start'));
  const end=getMyScheduleDate(getMyScheduleDateValue(schedule,'end')||getMyScheduleDateValue(schedule,'start'))||start;
  if(!start||!end)return null;
  end.setHours(23,59,59,999);
  return {start,end};
}

function doesMyScheduleOverlapBounds(schedule,bounds){
  if(!bounds)return true;
  const span=getMyScheduleSpan(schedule);
  return !!span&&span.start<=bounds.end&&span.end>=bounds.start;
}

function getMyScheduleProject(schedule){
  return (projects||[]).find(project=>String(project?.id||'')===String(schedule?.project_id||''))||null;
}

function getMyScheduleRows(options={}){
  const bounds=options.ignoreRange?null:getMyScheduleRangeBounds();
  return (schedules||[])
    .filter(schedule=>String(schedule?.schedule_type||'')!=='project')
    .filter(schedule=>myScheduleScopeFilter==='all'||isMyScheduleMine(schedule))
    .filter(schedule=>myScheduleTypeFilter==='all'||String(schedule?.schedule_type||'')===myScheduleTypeFilter)
    .filter(schedule=>myScheduleMemberFilter==='all'||getMyScheduleMemberIds(schedule).includes(String(myScheduleMemberFilter)))
    .filter(schedule=>doesMyScheduleOverlapBounds(schedule,bounds))
    .sort((a,b)=>(getMyScheduleSpan(a)?.start.getTime()||0)-(getMyScheduleSpan(b)?.start.getTime()||0));
}

function getMyScheduleWeekSummary(){
  const bounds=getMyScheduleWeekBounds();
  const rows=(schedules||[])
    .filter(schedule=>String(schedule?.schedule_type||'')!=='project')
    .filter(schedule=>doesMyScheduleOverlapBounds(schedule,bounds));
  return {
    leave:rows.filter(row=>String(row?.schedule_type||'')==='leave').length,
    fieldwork:rows.filter(row=>String(row?.schedule_type||'')==='fieldwork').length,
    meeting:rows.filter(row=>String(row?.schedule_type||'')==='meeting').length
  };
}

function renderMySchedulePage(){
  const el=document.getElementById('pageMySchedule');
  if(!el)return;
  const rows=getMyScheduleRows();
  const summary=getMyScheduleWeekSummary();
  el.innerHTML=''
    +'<div class="my-schedule-shell">'
      +'<div class="my-schedule-head sc-header">'
        +'<div class="sc-header-copy"><div class="my-schedule-title sc-title">일정</div><div class="my-schedule-sub sc-sub">팀 전체의 휴가, 외근, 회의 등 프로젝트 외 일정을 관리합니다.</div></div>'
        +'<button type="button" class="btn primary sm sc-add-btn" onclick="openMyScheduleModal()">일정 추가</button>'
      +'</div>'
      +'<div class="my-schedule-summary-grid sc-stat-grid">'
        +renderMyScheduleSummaryCard('이번 주 휴가',summary.leave,'leave')
        +renderMyScheduleSummaryCard('이번 주 필드워크',summary.fieldwork,'fieldwork')
        +renderMyScheduleSummaryCard('이번 주 회의',summary.meeting,'meeting')
      +'</div>'
      +'<div class="card my-schedule-toolbar sc-toolbar">'
        +'<div class="my-schedule-toolbar-left sc-toolbar-left">'
          +'<div class="my-schedule-view-toggle sc-view-tabs" role="group" aria-label="일정 보기 전환">'
            +'<button type="button" class="'+(myScheduleViewMode==='calendar'?'active':'')+'" onclick="setMyScheduleViewMode(\'calendar\')">달력</button>'
            +'<button type="button" class="'+(myScheduleViewMode==='list'?'active':'')+'" onclick="setMyScheduleViewMode(\'list\')">리스트</button>'
          +'</div>'
          +(myScheduleViewMode==='calendar'?renderMyScheduleCalendarNav():'')
        +'</div>'
        +'<div class="my-schedule-filters sc-filters">'
          +renderMyScheduleScopeFilter()
          +renderMyScheduleTypeFilter()
          +renderMyScheduleMemberFilter()
          +renderMyScheduleRangeFilter()
          +'<span class="my-schedule-badge sc-count-chip">'+rows.length+'건</span>'
        +'</div>'
      +'</div>'
      +renderMyScheduleLegend()
      +(myScheduleViewMode==='calendar'?renderMyScheduleCalendar(rows):renderMyScheduleList(rows))
    +'</div>';
}

function renderMyScheduleSummaryCard(label,count,type){
  const meta=getMyScheduleTypeMeta(type);
  const value=Number(count||0);
  const toneClass=value?'sc-stat--'+meta.value:'sc-stat--ok';
  return '<div class="my-schedule-summary-card sc-stat '+toneClass+'" style="--sc-color:'+meta.color+'">'
    +'<span class="sc-stat-label">'+esc(label)+'</span>'
    +'<strong class="sc-stat-val">'+value+'건</strong>'
  +'</div>';
}

function renderMyScheduleLegend(){
  return '<div class="sc-legend" aria-label="일정 유형 범례">'
    +'<span class="sc-legend-label">일정 유형</span>'
    +getMyScheduleTypeOptions().map(type=>'<span class="sc-legend-item sc-legend-item--'+esc(type.value)+'"><span class="sc-legend-dot" style="background:'+type.color+'"></span>'+esc(type.label)+'</span>').join('')
  +'</div>';
}

function renderMyScheduleScopeFilter(){
  return '<select onchange="setMyScheduleScopeFilter(this.value)">'
    +'<option value="all" '+(myScheduleScopeFilter==='all'?'selected':'')+'>전체 일정</option>'
    +'<option value="mine" '+(myScheduleScopeFilter==='mine'?'selected':'')+'>내 일정</option>'
  +'</select>';
}

function renderMyScheduleTypeFilter(){
  return '<select onchange="setMyScheduleTypeFilter(this.value)">'
    +'<option value="all">유형 전체</option>'
    +getMyScheduleTypeOptions().map(type=>'<option value="'+type.value+'" '+(myScheduleTypeFilter===type.value?'selected':'')+'>'+esc(type.label)+'</option>').join('')
  +'</select>';
}

function renderMyScheduleMemberFilter(){
  return '<select onchange="setMyScheduleMemberFilter(this.value)">'
    +'<option value="all">멤버 전체</option>'
    +(members||[]).map(member=>'<option value="'+esc(String(member.id||''))+'" '+(String(myScheduleMemberFilter)===String(member.id||'')?'selected':'')+'>'+esc(member.name||member.email||'멤버')+'</option>').join('')
  +'</select>';
}

function renderMyScheduleRangeFilter(){
  return '<select onchange="setMyScheduleRangeFilter(this.value)">'
    +'<option value="week" '+(myScheduleRangeFilter==='week'?'selected':'')+'>이번 주</option>'
    +'<option value="month" '+(myScheduleRangeFilter==='month'?'selected':'')+'>이번 달</option>'
    +'<option value="all" '+(myScheduleRangeFilter==='all'?'selected':'')+'>전체</option>'
  +'</select>';
}

function renderMyScheduleCalendarNav(){
  const year=myScheduleCalendarDate.getFullYear();
  const month=myScheduleCalendarDate.getMonth()+1;
  return '<div class="my-schedule-calendar-nav">'
    +'<button type="button" class="btn ghost sm" onclick="moveMyScheduleMonth(-1)">이전달</button>'
    +'<strong>'+year+'년 '+month+'월</strong>'
    +'<button type="button" class="btn ghost sm" onclick="moveMyScheduleMonth(1)">다음달</button>'
  +'</div>';
}

function renderMyScheduleCalendar(rows){
  const monthStart=new Date(myScheduleCalendarDate.getFullYear(),myScheduleCalendarDate.getMonth(),1);
  const firstCell=new Date(monthStart);
  firstCell.setDate(monthStart.getDate()-monthStart.getDay());
  const todayKey=getMyScheduleDateKey(getMyScheduleToday());
  const dayLabels=['일','월','화','수','목','금','토'];
  const cells=[];
  for(let i=0;i<42;i++){
    const date=new Date(firstCell);
    date.setDate(firstCell.getDate()+i);
    const key=getMyScheduleDateKey(date);
    const inMonth=date.getMonth()===myScheduleCalendarDate.getMonth();
    const isWknd=date.getDay()===0||date.getDay()===6;
    const dayRows=rows.filter(schedule=>doesMyScheduleOccurOnDate(schedule,key));
    cells.push('<div class="my-schedule-day '+(inMonth?'':'is-outside')+' '+(key===todayKey?'is-today':'')+(isWknd?' is-weekend':'')+'">'
      +'<div class="my-schedule-day-number">'+date.getDate()+'</div>'
      +'<div class="my-schedule-calendar-items">'
        +(dayRows.length?dayRows.map(renderMyScheduleCalendarItem).join(''):'')
      +'</div>'
    +'</div>');
  }
  return '<div class="my-schedule-calendar">'
    +'<div class="my-schedule-calendar-head">'+dayLabels.map(label=>'<span>'+label+'</span>').join('')+'</div>'
    +'<div class="my-schedule-calendar-grid">'+cells.join('')+'</div>'
  +'</div>';
}

function doesMyScheduleOccurOnDate(schedule,dateKey){
  const date=getMyScheduleDate(dateKey);
  const span=getMyScheduleSpan(schedule);
  if(!date||!span)return false;
  return date>=span.start&&date<=span.end;
}

function renderMyScheduleCalendarItem(schedule){
  const meta=getMyScheduleTypeMeta(schedule?.schedule_type);
  const names=getMyScheduleMemberNames(schedule);
  return '<button type="button" class="my-schedule-calendar-item" style="border-left-color:'+meta.color+';--schedule-color:'+meta.color+'" onclick="openMyScheduleModal(\''+esc(String(schedule.id||''))+'\')">'
    +'<span>'+esc(schedule?.title||meta.label)+'</span>'
    +(names[0]?'<small>'+esc(names[0])+'</small>':'')
  +'</button>';
}

function renderMyScheduleList(rows){
  return '<div class="my-schedule-list">'+(rows.length?rows.map(renderMyScheduleCard).join(''):'<div class="my-schedule-empty">조건에 맞는 일정이 없습니다.</div>')+'</div>';
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

function setMyScheduleViewMode(value){
  myScheduleViewMode=value==='list'?'list':'calendar';
  renderMySchedulePage();
}

function moveMyScheduleMonth(offset){
  myScheduleCalendarDate=new Date(myScheduleCalendarDate.getFullYear(),myScheduleCalendarDate.getMonth()+Number(offset||0),1);
  renderMySchedulePage();
}

function setMyScheduleScopeFilter(value){
  myScheduleScopeFilter=value||'all';
  renderMySchedulePage();
}

function setMyScheduleTypeFilter(value){
  myScheduleTypeFilter=value||'all';
  renderMySchedulePage();
}

function setMyScheduleMemberFilter(value){
  myScheduleMemberFilter=value||'all';
  renderMySchedulePage();
}

function setMyScheduleRangeFilter(value){
  myScheduleRangeFilter=value||'month';
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
  const today=getMyScheduleToday();
  const selectedMemberIds=getMyScheduleMemberIds(schedule);
  if(!selectedMemberIds.length&&currentMember?.id)selectedMemberIds.push(String(currentMember.id));
  const selectedType=String(schedule?.schedule_type||'internal');
  const typeOptions=getMyScheduleTypeOptions().map(type=>'<option value="'+type.value+'" '+(selectedType===type.value?'selected':'')+'>'+esc(type.label)+'</option>').join('');
  document.getElementById('modalArea').innerHTML=''
    +getInputModalOverlayHtml()
    +'<div class="modal my-schedule-modal" style="width:620px">'
      +'<div class="modal-title">'+(schedule?'일정 수정':'일정 추가')+'</div>'
      +'<div class="form-row"><label class="form-label">제목</label><input id="myScheduleTitle" value="'+esc(schedule?.title||'')+'" placeholder="예) 고객 미팅, 휴가, 외근"></div>'
      +'<div class="form-half"><div class="form-row"><label class="form-label">일정 유형</label><select id="myScheduleType">'+typeOptions+'</select></div>'
      +'<div class="checkbox-row" style="margin-top:28px"><input type="checkbox" id="myScheduleAllDay" '+(schedule?.all_day?'checked':'')+'><label for="myScheduleAllDay">종일</label></div></div>'
      +'<div class="form-half"><div class="form-row"><label class="form-label">시작일</label><input type="date" id="myScheduleStart" value="'+esc(getMyScheduleDateInputValue(getMyScheduleDateValue(schedule,'start'),today))+'"></div>'
      +'<div class="form-row"><label class="form-label">종료일</label><input type="date" id="myScheduleEnd" value="'+esc(getMyScheduleDateInputValue(getMyScheduleDateValue(schedule,'end')||getMyScheduleDateValue(schedule,'start'),today))+'"></div></div>'
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
  const scheduleType=String(document.getElementById('myScheduleType')?.value||'internal').trim()||'internal';
  const startDate=String(document.getElementById('myScheduleStart')?.value||'').trim();
  const endDate=String(document.getElementById('myScheduleEnd')?.value||'').trim();
  const allDay=!!document.getElementById('myScheduleAllDay')?.checked;
  const memberIds=getSelectedMyScheduleMemberIds();
  if(!title){alert('제목을 입력해주세요.');return;}
  if(!startDate||!endDate){alert('시작일과 종료일을 입력해주세요.');return;}
  if(startDate>endDate){alert('종료일이 시작일보다 빠릅니다.');return;}
  if(!memberIds.length){alert('참여자를 1명 이상 선택해주세요.');return;}
  const primaryMember=(members||[]).find(member=>String(member.id)===String(memberIds[0]))||null;
  const projectId=String(document.getElementById('myScheduleProject')?.value||'').trim();
  const project=projectId?(projects||[]).find(row=>String(row?.id||'')===projectId):null;
  const body={
    title,
    schedule_type:scheduleType,
    start_date:startDate,
    end_date:endDate,
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
