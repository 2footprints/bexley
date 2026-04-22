function getHomeBaseDate(){
  const today=new Date();
  today.setHours(0,0,0,0);
  return today;
}

let homeTodayScheduleExpanded=false;

function formatHomeShortDate(dateLike){
  const d=typeof dateLike==='string'?toDate(dateLike):new Date(dateLike);
  return (d.getMonth()+1)+'/'+d.getDate();
}

function inferHomeTodayCategory(text=''){
  const raw=String(text||'');
  if(/자료|서류|업로드|전달|회신|요청|수집/i.test(raw))return '자료';
  if(/미팅|회의|콜|인터뷰|미팅|상담/i.test(raw))return '미팅';
  return '검토';
}

function buildHomeTodayDashboardRows(){
  if(!currentMember?.name)return [];
  const today=getHomeBaseDate();
  const rows=[];
  (projects||[])
    .filter(p=>Array.isArray(p.members)&&p.members.includes(currentMember.name)&&p.status!=='완료')
    .forEach(p=>{
      const end=toDate(p.end);
      const start=toDate(p.start);
      const activeToday=start<=today&&end>=today;
      const overdue=end<today;
      if(!activeToday&&!overdue)return;
      const client=clients.find(c=>c.id===p.client_id);
      const category=inferHomeTodayCategory([p.name,p.memo,p.result_summary,p.work_summary,p.issue_note,p.type].filter(Boolean).join(' '));
      const dueToday=end.getTime()===today.getTime();
      const priority=p.priority||'medium';
      const group=overdue||priority==='high'||category==='미팅'?'priority':(dueToday?'due':'backlog');
      rows.push({
        id:p.id,
        kind:'project',
        title:(client?client.name+' · ':'')+p.name,
        category,
        typeLabel:p.type||'프로젝트',
        dueText:overdue?'지연 '+formatHomeShortDate(p.end):dueToday?'오늘 마감':'',
        group,
        priority,
        overdue,
        dueToday,
        action:"openProjModal('"+p.id+"')"
      });
    });
  (schedules||[])
    .filter(s=>scheduleHasMember(s,currentMember.name)&&s.schedule_type!=='leave'&&toDate(s.start)<=today&&toDate(s.end)>=today)
    .forEach(s=>{
      const typeLabel=scheduleLabel(s.schedule_type);
      const category=inferHomeTodayCategory([s.title,typeLabel,s.location,s.memo].filter(Boolean).join(' '));
      const group=category==='미팅'?'priority':'backlog';
      rows.push({
        id:s.id,
        kind:'schedule',
        title:s.title||typeLabel,
        category,
        typeLabel,
        dueText:'',
        group,
        priority:'medium',
        overdue:false,
        dueToday:false,
        action:"openScheduleModal('"+s.id+"')"
      });
    });
  return rows;
}

function getWeeklySchedules(offsetWeeks=0){
  const {start,end}=getWeekBounds(offsetWeeks);
  const inWeek=s=>toDate(s.start)<=end && toDate(s.end)>=start;
  const sortFn=(a,b)=>toDate(a.start)-toDate(b.start)||getScheduleMemberLabel(a).localeCompare(getScheduleMemberLabel(b),'ko');
  return {
    leave:schedules.filter(s=>s.schedule_type==='leave'&&inWeek(s)).sort(sortFn),
    fieldwork:schedules.filter(s=>s.schedule_type==='fieldwork'&&inWeek(s)).sort(sortFn)
  };
}

function renderWeeklyScheduleSummary(){
  const el=document.getElementById('memberScheduleWrap');
  if(!el)return;
  const thisWeek=getWeeklySchedules(0);
  const nextWeek=getWeeklySchedules(1);
  const {start:ts}=getWeekBounds(0);
  const {start:ns}=getWeekBounds(1);
  const tsEnd=new Date(ts);tsEnd.setDate(ts.getDate()+4);
  const nsEnd=new Date(ns);nsEnd.setDate(ns.getDate()+4);
  const fmtWR=(s,e)=>(s.getMonth()+1)+'.'+s.getDate()+' ~ '+(e.getMonth()+1)+'.'+e.getDate();
  const hasNext=nextWeek.leave.length||nextWeek.fieldwork.length;
  const sRow=s=>'<div style="display:flex;align-items:center;gap:8px;padding:7px 0;border-bottom:1px solid var(--border)">'
      +'<div style="width:7px;height:7px;border-radius:50%;background:'+(s.schedule_type==='leave'?'#C8B28A':'#9AA7B6')+';flex-shrink:0"></div>'
    +'<div style="flex:1"><div style="font-size:13px;font-weight:600;color:var(--navy)">'+esc(getScheduleMemberLabel(s))+'</div>'
    +'<div style="font-size:11px;color:var(--text3)">'+formatRangeShort(s.start,s.end)+(s.location?' · '+esc(s.location):'')+'</div></div>'
      +'<span style="font-size:10px;font-weight:700;padding:2px 8px;border-radius:10px;background:'+(s.schedule_type==='leave'?'#F6F1E8':'#EDF1F5')+';color:'+(s.schedule_type==='leave'?'#8C7351':'#5F6E7E')+'">'+scheduleLabel(s.schedule_type)+'</span>'
    +'</div>';
  const col=(label,items)=>'<div>'
      +'<div style="font-size:11px;font-weight:700;color:var(--text3);margin-bottom:6px">'+(label==='휴가'?'휴가':'필드웍')+'</div>'
    +(items.length?items.map(sRow).join(''):'<div style="font-size:12px;color:var(--text3);padding:8px 0">없음</div>')
    +'</div>';
  el.innerHTML='<div class="card home-card">'
    +'<div class="home-section-title">팀 일정</div>'
    +'<div style="background:var(--blue-light);border-radius:var(--radius-sm);padding:8px 12px;margin-bottom:12px;display:flex;align-items:center;gap:8px">'
    +'<span style="font-size:11px;font-weight:800;color:var(--blue)">이번 주</span>'
    +'<span style="font-size:11px;color:var(--text3)">'+fmtWR(ts,tsEnd)+'</span>'
    +'</div>'
    +'<div class="team-schedule-grid" style="margin-bottom:'+(hasNext?'20':'4')+'px">'
    +col('휴가',thisWeek.leave)+col('필드웍',thisWeek.fieldwork)
    +'</div>'
    +(hasNext?'<div style="border-top:1px solid var(--border);padding-top:16px">'
      +'<div style="background:var(--bg2);border-radius:var(--radius-sm);padding:8px 12px;margin-bottom:12px;display:flex;align-items:center;gap:8px">'
      +'<span style="font-size:11px;font-weight:800;color:var(--text2)">다음 주</span>'
      +'<span style="font-size:11px;color:var(--text3)">'+fmtWR(ns,nsEnd)+'</span>'
      +'</div>'
      +'<div class="team-schedule-grid">'
      +col('휴가',nextWeek.leave)+col('필드웍',nextWeek.fieldwork)
      +'</div></div>':'')
    +'</div>';
}

function renderMyWeek(){
  renderHomeDailyWorkSection([],{
    loading:!!currentMember
  });
}

function getHomeAssignedProjectMembers(project){
  const linkedMembers=(projectMemberLinks||[])
    .filter(link=>String(link.project_id)===String(project.id))
    .map(link=>{
      if(link.member_id!=null){
        return members.find(member=>String(member.id)===String(link.member_id))||null;
      }
      if(link.members?.name){
        return members.find(member=>member.name===link.members.name)||{id:link.members.name,name:link.members.name};
      }
      return null;
    })
    .filter(Boolean);
  if(linkedMembers.length)return linkedMembers;
  const namedMembers=(Array.isArray(project?.members)?project.members:[])
    .map(name=>members.find(member=>member.name===name)||{id:name,name})
    .filter(Boolean);
  if(namedMembers.length)return namedMembers;
  const directIds=[project?.assignee_id,project?.assignee_member_id,project?.member_id].filter(Boolean);
  if(directIds.length){
    return directIds
      .map(id=>members.find(member=>String(member.id)===String(id))||null)
      .filter(Boolean);
  }
  return [];
}

function isHomeProjectAssignedToCurrentMember(project){
  if(!currentMember)return false;
  const assignedMembers=getHomeAssignedProjectMembers(project);
  if(assignedMembers.length){
    return assignedMembers.some(member=>String(member.id)===String(currentMember.id)||member.name===currentMember.name);
  }
  return Array.isArray(project?.members)&&project.members.includes(currentMember.name);
}

function isHomeCompletedProject(project){
  const normalizedStatus=String(project?.status||'').trim().toLowerCase();
  return project?.status==='완료'||normalizedStatus==='completed';
}

function getHomeDailyWorkDateLabel(date){
  const weekdayLabels=['일요일','월요일','화요일','수요일','목요일','금요일','토요일'];
  return (date.getMonth()+1)+'월 '+date.getDate()+'일 '+weekdayLabels[date.getDay()];
}

function getHomeDailyWorkDueMeta(endValue,today){
  if(!endValue)return {label:'',tone:'normal',hasDue:false,sortTime:null,diff:null};
  const endDate=toDate(endValue);
  endDate.setHours(0,0,0,0);
  const diff=Math.round((endDate.getTime()-today.getTime())/86400000);
  const tone=diff<=1?'urgent':(diff>=2&&diff<=3?'warn':'normal');
  let label='';
  if(diff>=0&&diff<=3)label='D-'+diff;
  else if(diff<0)label=formatHomeShortDate(endDate)+' 마감';
  else label=formatHomeShortDate(endDate);
  return {
    label,
    tone,
    hasDue:true,
    sortTime:endDate.getTime(),
    diff
  };
}

function getHomeDailyWorkUrgency(kind,priority,endValue,today){
  const normalizedPriority=String(priority||'').trim().toLowerCase();
  const dueMeta=getHomeDailyWorkDueMeta(endValue,today);
  if(kind==='issue'){
    if(normalizedPriority==='high'||normalizedPriority==='urgent'||(dueMeta.hasDue&&dueMeta.diff!=null&&dueMeta.diff<=1)){
      return {rank:0,color:'#EF4444'};
    }
    if(normalizedPriority==='medium'||(dueMeta.hasDue&&dueMeta.diff!=null&&dueMeta.diff>=2&&dueMeta.diff<=3)){
      return {rank:1,color:'#F59E0B'};
    }
    return {rank:2,color:'#94A3B8'};
  }
  if(dueMeta.hasDue&&dueMeta.diff!=null&&dueMeta.diff<=1)return {rank:0,color:'#EF4444'};
  if(dueMeta.hasDue&&dueMeta.diff!=null&&dueMeta.diff>=2&&dueMeta.diff<=3)return {rank:1,color:'#F59E0B'};
  return {rank:2,color:'#94A3B8'};
}

function toggleHomeTodayScheduleExpanded(){
  homeTodayScheduleExpanded=!homeTodayScheduleExpanded;
  renderHomeDashboardIssues();
}

function buildHomeDailyProjectItem(project,kind,today){
  const client=clients.find(item=>item.id===project.client_id)||null;
  const endValue=project.end||project.end_date||'';
  const dueMeta=getHomeDailyWorkDueMeta(endValue,today);
  const urgencyMeta=getHomeDailyWorkUrgency(kind,project.priority,endValue,today);
  const summary=kind==='deadline'
    ?(project.work_summary||project.memo||project.type||'마감이 임박한 프로젝트입니다')
    :(project.work_summary||project.memo||project.type||'오늘 확인할 프로젝트입니다');
  return {
    key:kind+':'+project.id,
    sourceType:'project',
    sourceId:String(project.id),
    kind,
    badgeLabel:'프로젝트',
    badgeClass:'project',
    context:(client?.name||'거래처 없음')+' — '+(project.name||'프로젝트 없음'),
    summary,
    dueMeta,
    dueSortTime:dueMeta.sortTime,
    hasDue:dueMeta.hasDue,
    createdTime:new Date(project.created_at||project.updated_at||project.start||0).getTime()||0,
    priorityRaw:String(project.priority||'').trim().toLowerCase(),
    urgencyRank:urgencyMeta.rank,
    urgencyColor:urgencyMeta.color,
    action:"openProjModal('"+project.id+"')"
  };
}

function buildHomeDailyIssueItem(issue,today){
  const project=projects.find(item=>item.id===issue.project_id)||null;
  const client=project?clients.find(item=>item.id===project.client_id)||null:null;
  const endValue=project?(project.end||project.end_date||''):'';
  const dueMeta=getHomeDailyWorkDueMeta(endValue,today);
  const urgencyMeta=getHomeDailyWorkUrgency('issue',issue.priority,endValue,today);
  return {
    key:'issue:'+issue.id,
    sourceType:'issue',
    sourceId:String(issue.id),
    kind:'issue',
    badgeLabel:'이슈',
    badgeClass:'issue',
    context:(client?.name||'거래처 없음')+' — '+(project?.name||'프로젝트 없음'),
    summary:[issue.title,issue.content].filter(Boolean).join(' · ')||'미해결 이슈',
    dueMeta,
    dueSortTime:dueMeta.sortTime,
    hasDue:dueMeta.hasDue,
    createdTime:new Date(issue.created_at||0).getTime()||0,
    priorityRaw:String(issue.priority||'').trim().toLowerCase(),
    urgencyRank:urgencyMeta.rank,
    urgencyColor:urgencyMeta.color,
    action:"openIssueModal('"+(issue.project_id||'')+"','"+issue.id+"')"
  };
}

function buildHomeDailyScheduleItem(schedule,today){
  const endValue=schedule.end||schedule.end_date||schedule.start||schedule.start_date||'';
  const dueMeta=getHomeDailyWorkDueMeta(endValue,today);
  const urgencyMeta=getHomeDailyWorkUrgency('schedule','',endValue,today);
  const typeLabel=scheduleLabel(schedule.schedule_type);
  const memberLabel=getScheduleMemberLabel(schedule);
  const normalizedType=String(schedule.schedule_type||'').trim().toLowerCase();
  const badgeClass=normalizedType==='leave'
    ?'leave'
    :(normalizedType==='fieldwork'
      ?'fieldwork'
      :(normalizedType==='internal'?'internal':'schedule'));
  return {
    key:'schedule:'+schedule.id,
    sourceType:'schedule',
    sourceId:String(schedule.id),
    kind:'schedule',
    badgeLabel:typeLabel||'일정',
    badgeClass,
    context:[memberLabel,typeLabel].filter(Boolean).join(' \u00B7 ')||(typeLabel||'\uC77C\uC815'),
    summary:schedule.title||schedule.memo||typeLabel||'\uC624\uB298 \uD655\uC778\uD560 \uC77C\uC815\uC785\uB2C8\uB2E4.',
    dueMeta,
    dueSortTime:dueMeta.sortTime,
    hasDue:dueMeta.hasDue,
    createdTime:new Date(schedule.created_at||schedule.updated_at||schedule.start||0).getTime()||0,
    priorityRaw:'',
    urgencyRank:urgencyMeta.rank,
    urgencyColor:urgencyMeta.color,
    action:"openScheduleModal('"+schedule.id+"')"
  };
}

function buildHomeDailyWorkProjectItems(today){
  const dueLimit=new Date(today);
  dueLimit.setDate(today.getDate()+3);
  const assignedProjects=(projects||[]).filter(project=>isHomeProjectAssignedToCurrentMember(project)&&!isHomeCompletedProject(project));
  const scheduleProjects=assignedProjects.filter(project=>{
    const startValue=project.start||project.start_date;
    if(!startValue)return false;
    const startDate=toDate(startValue);
    startDate.setHours(0,0,0,0);
    return startDate<=today;
  });
  const deadlineProjects=assignedProjects.filter(project=>{
    const endValue=project.end||project.end_date;
    if(!endValue)return false;
    const endDate=toDate(endValue);
    endDate.setHours(0,0,0,0);
    return endDate>=today&&endDate<=dueLimit;
  });
  const deadlineProjectIds=new Set(deadlineProjects.map(project=>String(project.id)));
  const scheduleItems=scheduleProjects
    .filter(project=>!deadlineProjectIds.has(String(project.id)))
    .map(project=>buildHomeDailyProjectItem(project,'schedule',today));
  const deadlineItems=deadlineProjects.map(project=>buildHomeDailyProjectItem(project,'deadline',today));
  return [...scheduleItems,...deadlineItems];
}

function sortHomeDailyWorkItems(items){
  return [...items].sort((a,b)=>{
    if(a.urgencyRank!==b.urgencyRank)return a.urgencyRank-b.urgencyRank;
    if(a.hasDue&&b.hasDue&&a.dueSortTime!==b.dueSortTime)return a.dueSortTime-b.dueSortTime;
    if(a.hasDue!==b.hasDue)return a.hasDue?-1:1;
    return (b.createdTime||0)-(a.createdTime||0);
  });
}

function isHomeDateInRange(startValue,endValue,today){
  if(!startValue||!endValue)return false;
  const startDate=toDate(startValue);
  const endDate=toDate(endValue);
  startDate.setHours(0,0,0,0);
  endDate.setHours(0,0,0,0);
  return startDate<=today&&endDate>=today;
}

function getHomeTodayScheduleItems(today){
  if(!currentMember?.name)return [];
  const projectItems=(projects||[])
    .filter(project=>isHomeProjectAssignedToCurrentMember(project)&&!isHomeCompletedProject(project))
    .filter(project=>isHomeDateInRange(project.start||project.start_date,project.end||project.end_date,today))
    .map(project=>{
      const item=buildHomeDailyProjectItem(project,'schedule',today);
      return {...item,todaySortGroup:item.dueMeta?.diff===0?0:1};
    });
  const scheduleItems=(schedules||[])
    .filter(schedule=>scheduleHasMember(schedule,currentMember.name))
    .filter(schedule=>isHomeDateInRange(schedule.start||schedule.start_date,schedule.end||schedule.end_date,today))
    .map(schedule=>({...buildHomeDailyScheduleItem(schedule,today),todaySortGroup:2}));
  return [...projectItems,...scheduleItems];
}

function sortHomeTodayScheduleItems(items){
  return [...items].sort((a,b)=>{
    if((a.todaySortGroup||0)!==(b.todaySortGroup||0))return (a.todaySortGroup||0)-(b.todaySortGroup||0);
    if(a.hasDue&&b.hasDue&&a.dueSortTime!==b.dueSortTime)return a.dueSortTime-b.dueSortTime;
    if(a.hasDue!==b.hasDue)return a.hasDue?-1:1;
    return (b.createdTime||0)-(a.createdTime||0);
  });
}

function getHomeAttentionMeta(item){
  if(item.kind==='deadline'){
    const diff=item.dueMeta?.diff;
    if(diff===0||diff===1)return {group:0,color:'#EF4444'};
    if(diff===2||diff===3)return {group:2,color:'#F59E0B'};
    return {group:4,color:'#94A3B8'};
  }
  const priority=String(item.priorityRaw||'').trim().toLowerCase();
  if(priority==='high'||priority==='urgent')return {group:1,color:'#EF4444'};
  if(priority==='medium')return {group:3,color:'#F59E0B'};
  return {group:4,color:'#94A3B8'};
}

function sortHomeAttentionItems(items){
  return [...items].sort((a,b)=>{
    if((a.attentionGroup||4)!==(b.attentionGroup||4))return (a.attentionGroup||4)-(b.attentionGroup||4);
    if(a.kind==='deadline'&&b.kind==='deadline'&&a.dueSortTime!==b.dueSortTime)return a.dueSortTime-b.dueSortTime;
    if(a.kind==='issue'&&b.kind==='issue')return (b.createdTime||0)-(a.createdTime||0);
    if(a.hasDue&&b.hasDue&&a.dueSortTime!==b.dueSortTime)return a.dueSortTime-b.dueSortTime;
    return (b.createdTime||0)-(a.createdTime||0);
  });
}

function getHomeAttentionItems(today,todayScheduleItems,issueRows){
  const dueLimit=new Date(today);
  dueLimit.setDate(today.getDate()+3);
  const todayProjectIds=new Set(
    (todayScheduleItems||[])
      .filter(item=>item.sourceType==='project')
      .map(item=>String(item.sourceId))
  );
  const deadlineItems=(projects||[])
    .filter(project=>isHomeProjectAssignedToCurrentMember(project)&&!isHomeCompletedProject(project))
    .filter(project=>!todayProjectIds.has(String(project.id)))
    .filter(project=>{
      const endValue=project.end||project.end_date;
      if(!endValue)return false;
      const endDate=toDate(endValue);
      endDate.setHours(0,0,0,0);
      return endDate>=today&&endDate<=dueLimit;
    })
    .map(project=>{
      const item=buildHomeDailyProjectItem(project,'deadline',today);
      const meta=getHomeAttentionMeta(item);
      return {...item,attentionGroup:meta.group,urgencyColor:meta.color};
    });
  const issueItems=(issueRows||[]).map(issue=>{
    const item=buildHomeDailyIssueItem(issue,today);
    const meta=getHomeAttentionMeta(item);
    return {...item,attentionGroup:meta.group,urgencyColor:meta.color};
  });
  return sortHomeAttentionItems([...deadlineItems,...issueItems]);
}

function renderHomeDailyWorkCard(item){
  const badgeLabel=item.kind==='issue'?'이슈':(item.kind==='deadline'?'마감':'일정');
  const badgeClass=item.kind==='issue'?'issue':(item.kind==='deadline'?'deadline':'schedule');
  const dueClass=item.dueMeta?.tone==='urgent'?' urgent':(item.dueMeta?.tone==='warn'?' warn':'');
  return '<button type="button" class="home-daily-work-card" style="border-left-color:'+item.urgencyColor+'" onclick="'+item.action+'">'
    +'<span class="home-daily-work-badge '+badgeClass+'">'+badgeLabel+'</span>'
    +'<span class="home-daily-work-context">'+esc(item.context)+'</span>'
    +'<span class="home-daily-work-divider">—</span>'
    +'<span class="home-daily-work-summary">'+esc(item.summary)+'</span>'
    +'<span class="home-daily-work-due'+dueClass+'">'+esc(item.dueMeta?.label||'')+'</span>'
    +'</button>';
}

function renderHomeDailyWorkSection(payload,options={}){
  const el=document.getElementById('myWeekWrap');
  if(!el)return;
  const today=getHomeBaseDate();
  const todayItems=Array.isArray(payload)?payload:(payload?.todayItems||[]);
  const attentionItems=Array.isArray(payload)?[]:(payload?.attentionItems||[]);
  const nextContentHtml=options.loading
    ?'<div class="weekly-empty">\uBD88\uB7EC\uC624\uB294 \uC911..</div>'
    :'<div class="home-daily-work-section">'
      +'<div class="home-daily-work-section-head">'
        +'<div class="home-daily-work-section-title">\uC624\uB298 \uC77C\uC815</div>'
      +'</div>'
      +(todayItems.length
        ?'<div class="home-daily-work-list">'+todayItems.map(renderHomeDailyWorkCard).join('')+'</div>'
        :'<div class="home-daily-work-empty is-compact">\uC624\uB298 \uC608\uC815\uB41C \uC77C\uC815\uC774 \uC5C6\uC2B5\uB2C8\uB2E4</div>')
      +'</div>'
      +'<div class="home-daily-work-section-divider"></div>'
      +'<div class="home-daily-work-section">'
        +'<div class="home-daily-work-section-head">'
          +'<div class="home-daily-work-section-title">\uC8FC\uC758 \uD544\uC694</div>'
          +'<div class="home-daily-work-section-count">'+attentionItems.length+'\uAC74</div>'
        +'</div>'
        +(attentionItems.length
          ?'<div class="home-daily-work-list">'+attentionItems.map(renderHomeDailyWorkCard).join('')+'</div>'
          :'<div class="home-daily-work-empty is-compact is-success">\uC8FC\uC758\uAC00 \uD544\uC694\uD55C \uD56D\uBAA9\uC774 \uC5C6\uC2B5\uB2C8\uB2E4 \u2713</div>')
      +'</div>';
  el.innerHTML='<div class="card home-card">'
    +'<div class="home-daily-work-head">'
      +'<div class="home-daily-work-title">\uC624\uB298 \uD655\uC778\uD560 \uD56D\uBAA9</div>'
      +'<div class="home-daily-work-date">'+getHomeDailyWorkDateLabel(today)+'</div>'
    +'</div>'
    +nextContentHtml
  +'</div>';
  return;
  const contentHtml=options.loading
    ?'<div class="weekly-empty">불러오는 중...</div>'
    :(items.length
      ?'<div class="home-daily-work-list">'+items.map(renderHomeDailyWorkCard).join('')+'</div>'
      :'<div class="home-daily-work-empty">오늘 예정된 업무가 없습니다 ✓</div>');
  el.innerHTML='<div class="card home-card">'
    +'<div class="home-daily-work-head">'
      +'<div class="home-daily-work-title">오늘의 내 업무</div>'
      +'<div class="home-daily-work-date">'+getHomeDailyWorkDateLabel(today)+'</div>'
    +'</div>'
    +contentHtml
  +'</div>';
}

function renderHomeDailyWorkCard(item){
  const badgeLabel=item.badgeLabel||(item.kind==='issue'?'이슈':(item.kind==='deadline'?'마감':'일정'));
  const badgeClass=item.badgeClass||(item.kind==='issue'?'issue':(item.kind==='deadline'?'deadline':'schedule'));
  const dueClass=item.dueMeta?.tone==='urgent'?' urgent':(item.dueMeta?.tone==='warn'?' warn':'');
  const dueLabel=item.dueMeta?.diff===0?'오늘 마감':(item.dueMeta?.label||'');
  return '<button type="button" class="home-daily-work-card" style="border-left-color:'+item.urgencyColor+'" onclick="'+item.action+'">'
    +'<span class="home-daily-work-badge '+badgeClass+'">'+badgeLabel+'</span>'
    +'<span class="home-daily-work-context">'+esc(item.context)+'</span>'
    +'<span class="home-daily-work-divider">·</span>'
    +'<span class="home-daily-work-summary">'+esc(item.summary)+'</span>'
    +'<span class="home-daily-work-due'+dueClass+'">'+esc(dueLabel)+'</span>'
    +'</button>';
}

function renderHomeDailyWorkSection(payload,options={}){
  const el=document.getElementById('myWeekWrap');
  if(!el)return;
  const today=getHomeBaseDate();
  const todayItems=Array.isArray(payload)?payload:(payload?.todayItems||[]);
  const attentionItems=Array.isArray(payload)?[]:(payload?.attentionItems||[]);
  const hiddenTodayCount=Math.max(todayItems.length-8,0);
  const visibleTodayItems=homeTodayScheduleExpanded?todayItems:todayItems.slice(0,8);
  const nextContentHtml=options.loading
    ?'<div class="weekly-empty">불러오는 중..</div>'
    :'<div class="home-daily-work-section">'
      +'<div class="home-daily-work-section-head">'
        +'<div class="home-daily-work-section-title">오늘 일정</div>'
      +'</div>'
      +(todayItems.length
        ?'<div class="home-daily-work-list">'+visibleTodayItems.map(renderHomeDailyWorkCard).join('')+'</div>'
        :'<div class="home-daily-work-empty is-compact">오늘 예정된 일정이 없습니다</div>')
      +(hiddenTodayCount
        ?'<button type="button" class="home-daily-work-more" onclick="toggleHomeTodayScheduleExpanded()">'+(homeTodayScheduleExpanded?'접기':hiddenTodayCount+'건 더 보기')+'</button>'
        :'')
      +'</div>'
      +'<div class="home-daily-work-section-divider"></div>'
      +'<div class="home-daily-work-section">'
        +'<div class="home-daily-work-section-head">'
          +'<div class="home-daily-work-section-title">주의 필요</div>'
          +'<div class="home-daily-work-section-count">'+attentionItems.length+'건</div>'
        +'</div>'
        +(attentionItems.length
          ?'<div class="home-daily-work-list">'+attentionItems.map(renderHomeDailyWorkCard).join('')+'</div>'
          :'<div class="home-daily-work-empty is-compact is-success">주의가 필요한 항목이 없습니다 ✓</div>')
      +'</div>';
  el.innerHTML='<div class="card home-card">'
    +'<div class="home-daily-work-head">'
      +'<div class="home-daily-work-title">오늘 확인할 항목</div>'
      +'<div class="home-daily-work-date">'+getHomeDailyWorkDateLabel(today)+'</div>'
    +'</div>'
    +nextContentHtml
  +'</div>';
}

async function renderHomeDashboardIssues(){
  const today=getHomeBaseDate();
  const todayScheduleItems=sortHomeTodayScheduleItems(getHomeTodayScheduleItems(today));
  if(!currentMember){
    renderHomeDailyWorkSection({todayItems:todayScheduleItems,attentionItems:[]});
    return;
  }
  try{
    const rows=await api('GET','project_issues?'+getIssueActiveStatusFilter()+'&select=*')||[];
    const issueRows=(rows||[]).filter(issue=>
      String(issue.assignee_member_id||issue.assignee_id||'')===String(currentMember.id||'')
      || (!!currentMember.name&&issue.assignee_name===currentMember.name)
    );
    renderHomeDailyWorkSection({
      todayItems:todayScheduleItems,
      attentionItems:getHomeAttentionItems(today,todayScheduleItems,issueRows)
    });
  }catch(e){
    renderHomeDailyWorkSection({
      todayItems:todayScheduleItems,
      attentionItems:getHomeAttentionItems(today,todayScheduleItems,[])
    });
  }
  return;
  const projectItems=buildHomeDailyWorkProjectItems(today);
  if(!currentMember){
    renderHomeDailyWorkSection(sortHomeDailyWorkItems(projectItems));
    return;
  }
  try{
    const rows=await api('GET','project_issues?status=eq.open&select=*')||[];
    const issueItems=(rows||[])
      .filter(issue=>issue.assignee_member_id===currentMember.id||issue.owner_member_id===currentMember.id)
      .map(issue=>buildHomeDailyIssueItem(issue,today));
    renderHomeDailyWorkSection(sortHomeDailyWorkItems([...projectItems,...issueItems]));
  }catch(e){
    renderHomeDailyWorkSection(sortHomeDailyWorkItems(projectItems));
  }
}

function renderTeamWorkload(){
  const el=document.getElementById('teamWorkloadWrap');
  if(!el)return;
  const capacity=40;
  const {start:weekStart,end:weekEnd}=getWeekBounds(0);
  const normalizeStatus=value=>String(value||'').trim().toLowerCase().replace(/[\s-]+/g,'_');
  const activeStatuses=new Set(['in_progress','active','진행중','진행_중']);
  const activeMembers=(members||[]).filter(member=>{
    const isActive=member?.is_active===undefined?true:!!member.is_active;
    const identity=[member?.name,member?.email,member?.auth_user_id].filter(Boolean).join(' ').toLowerCase();
    const isSystemAccount=/projectschedule|system|test/.test(identity);
    return isActive&&!isSystemAccount;
  });
  const activeProjects=(projects||[]).filter(project=>{
    const statusRaw=String(project?.status||'').trim();
    const statusKey=normalizeStatus(statusRaw);
    if(!(activeStatuses.has(statusRaw)||activeStatuses.has(statusKey)))return false;
    const startDate=project?.start?toDate(project.start):null;
    const endDate=project?.end?toDate(project.end):null;
    if(startDate&&startDate>weekEnd)return false;
    if(endDate&&endDate<weekStart)return false;
    return true;
  });
  const getProjectAssignedMembers=project=>{
    const linkedMembers=(projectMemberLinks||[])
      .filter(link=>String(link.project_id)===String(project.id))
      .map(link=>{
        if(link.member_id!=null){
          return activeMembers.find(member=>String(member.id)===String(link.member_id))||null;
        }
        if(link.members?.name){
          return activeMembers.find(member=>member.name===link.members.name)||null;
        }
        return null;
      })
      .filter(Boolean);
    if(linkedMembers.length)return linkedMembers;
    const namedMembers=(project.members||[])
      .map(name=>activeMembers.find(member=>member.name===name))
      .filter(Boolean);
    if(namedMembers.length)return [...new Set(namedMembers)];
    const directIds=[project.assignee_id,project.assignee_member_id,project.member_id].filter(Boolean);
    if(directIds.length){
      return [...new Set(directIds
        .map(id=>activeMembers.find(member=>String(member.id)===String(id)))
        .filter(Boolean))];
    }
    return [];
  };
  const getProjectBaseHours=project=>{
    const explicitHours=Number(project?.estimated_hours);
    if(explicitHours>0)return explicitHours;
    const startValue=project?.start||project?.start_date;
    const endValue=project?.end||project?.end_date||startValue;
    if(!startValue||!endValue)return 0;
    const startDate=toDate(startValue);
    const endDate=toDate(endValue);
    startDate.setHours(0,0,0,0);
    endDate.setHours(0,0,0,0);
    const durationDays=Math.max(1,Math.round((endDate.getTime()-startDate.getTime())/86400000)+1);
    return durationDays*8;
  };
  const formatHours=value=>{
    const rounded=Math.round((Number(value)||0)*10)/10;
    return Number.isInteger(rounded)?String(rounded):rounded.toFixed(1);
  };
  const rows=activeMembers.map(member=>{
    const totalHours=activeProjects.reduce((sum,project)=>{
      const assignedMembers=getProjectAssignedMembers(project);
      if(!assignedMembers.some(assigned=>String(assigned.id)===String(member.id)||assigned.name===member.name))return sum;
      const projectHours=getProjectBaseHours(project);
      if(projectHours<=0)return sum;
      const individualHours=Number(project?.individual_hours);
      if(individualHours>0)return sum+individualHours;
      const assignedCount=Math.max(assignedMembers.length,1);
      return sum+(projectHours/assignedCount);
    },0);
    const percent=Math.round((totalHours/capacity)*100);
    const color=percent>=86?'#EF4444':percent>=61?'#F59E0B':'#10B981';
    return {
      name:member.name,
      totalHours:Math.round(totalHours*10)/10,
      capacity,
      percent,
      color
    };
  }).sort((a,b)=>b.percent-a.percent||b.totalHours-a.totalHours||a.name.localeCompare(b.name,'ko'));
  const allZero=rows.length&&rows.every(row=>row.totalHours===0);
  el.innerHTML='<div class="card home-card"><div class="home-section-title">팀 워크로드</div>'
    +(allZero
      ?'<div class="weekly-empty" style="font-size:var(--font-size-sm);color:var(--color-text-muted)">이번 주 진행중 프로젝트의 예상 시간이 아직 배정되지 않았습니다</div>'
      :(rows.length
      ?'<div class="team-workload-list">'+rows.map(row=>
        '<div class="team-workload-row">'
          +'<div class="team-workload-name">'+esc(row.name)+'</div>'
          +'<div class="team-workload-bar"><div class="team-workload-fill" style="width:'+Math.min(row.percent,100)+'%;background:'+row.color+'"></div></div>'
          +'<div class="team-workload-meta">'+formatHours(row.totalHours)+'/'+row.capacity+'h ('+row.percent+'%)</div>'
        +'</div>'
      ).join('')+'</div>'
      :'<div class="weekly-empty">표시할 워크로드 데이터가 없습니다.</div>'))
    +'</div>';
}

function toggleLadderMember(el){
  el.classList.toggle('active');
  el.style.background=el.classList.contains('active')?'var(--navy)':'';
  el.style.color=el.classList.contains('active')?'#fff':'';
  el.style.borderColor=el.classList.contains('active')?'var(--navy)':'var(--border)';
}

async function openLunchPicker(){
  document.getElementById('modalArea').innerHTML=
    '<div class="overlay" onclick="if(event.target===this)closeModal()">'
    +'<div class="modal" style="width:460px">'
    +'<div class="modal-title">🍱 오늘 점심 뭐 먹지?</div>'
    +'<div style="font-size:12px;color:var(--text3);margin-bottom:16px">카테고리를 선택하면 랜덤으로 추천해드려요</div>'
    +'<div style="display:flex;flex-wrap:wrap;gap:8px;margin-bottom:20px" id="lunchCatWrap">'
    +['한식','중식','일식','양식','분식','기타'].map(c=>'<button class="btn sm lunch-cat '+(c==='한식'?'active':'')+'" data-cat="'+c+'" onclick="toggleLunchCat(this)" style="border-radius:20px">'+c+'</button>').join('')
    +'</div>'
    +'<div id="lunchResult" style="min-height:80px;display:flex;align-items:center;justify-content:center"></div>'
    +'<div class="modal-footer">'
    +'<button class="btn ghost sm" onclick="openRestaurantManager()">식당 관리</button>'
    +'<div class="modal-footer-right"><button class="btn ghost" onclick="closeModal()">닫기</button><button class="btn primary" onclick="pickLunch()">추천받기 🎲</button></div>'
    +'</div></div></div>';
}

function toggleLunchCat(btn){btn.classList.toggle('active');}

async function pickLunch(){
  const activeCats=[...document.querySelectorAll('.lunch-cat.active')].map(b=>b.dataset.cat);
  const el=document.getElementById('lunchResult');
  el.innerHTML='<div style="color:var(--text3);font-size:13px">고르는 중...</div>';
  try{
    let q='restaurants?select=*';
    if(activeCats.length) q+='&category=in.('+activeCats.map(c=>'"'+c+'"').join(',')+')';
    const list=await api('GET',q);
    if(!list||!list.length){el.innerHTML='<div style="color:var(--text3);font-size:13px;text-align:center">선택한 카테고리의 식당이 없어요.<br>식당을 먼저 추가해주세요!</div>';return;}
    const pick=list[Math.floor(Math.random()*list.length)];
    el.innerHTML='<div style="text-align:center;width:100%">'
      +'<div style="font-size:32px;margin-bottom:8px">🎉</div>'
      +'<div style="font-size:22px;font-weight:800;color:var(--navy);letter-spacing:-.5px">'+esc(pick.name)+'</div>'
      +'<div style="margin-top:6px;display:flex;gap:6px;justify-content:center">'
      +'<span class="badge badge-blue">'+esc(pick.category)+'</span>'
      +(pick.distance?'<span class="badge" style="background:var(--bg);color:var(--text2)">🚶 '+esc(pick.distance)+'</span>':'')
      +'</div>'
      +(pick.memo?'<div style="font-size:12px;color:var(--text3);margin-top:8px">'+esc(pick.memo)+'</div>':'')
      +'</div>';
  }catch(e){el.innerHTML='<div style="color:var(--red);font-size:12px">오류: '+esc(e.message)+'</div>';}
}

async function openRestaurantManager(){
  closeModal();
  let list=[];
  try{list=await api('GET','restaurants?select=*&order=category,name');}catch(e){}
  const catColors={'한식':'#e03131','중식':'#e67700','일식':'#1971c2','양식':'#6741d9','분식':'#2f9e44','기타':'#495057'};
  const rows=list.map(r=>'<div style="display:flex;align-items:center;gap:10px;padding:9px 0;border-bottom:1px solid var(--border)">'
    +'<span class="badge" style="background:'+( catColors[r.category]||'#495057')+';color:#fff;flex-shrink:0">'+esc(r.category)+'</span>'
    +'<div style="flex:1;min-width:0"><div style="font-size:13px;font-weight:600;color:var(--navy)">'+esc(r.name)+'</div>'
    +(r.distance||r.memo?'<div style="font-size:11px;color:var(--text3)">'+[r.distance,r.memo].filter(Boolean).map(esc).join(' · ')+'</div>':'')
    +'</div>'
    +((isAdmin||r.created_by===currentUser?.id)?'<button class="btn danger sm" style="flex-shrink:0" data-id="'+r.id+'" onclick="deleteRestaurant(this.dataset.id)">삭제</button>':'')
    +'</div>').join('');
  const catOpts=['한식','중식','일식','양식','분식','기타'].map(c=>'<option>'+c+'</option>').join('');
  document.getElementById('modalArea').innerHTML=
    '<div class="overlay" onclick="if(event.target===this)closeModal()">'
    +'<div class="modal" style="width:480px"><div class="modal-title">🍽️ 식당 관리</div>'
    +'<div style="max-height:260px;overflow-y:auto;margin-bottom:16px">'+(rows||'<div style="color:var(--text3);text-align:center;padding:20px">등록된 식당이 없습니다</div>')+'</div>'
    +'<div style="font-size:11px;font-weight:700;color:var(--text3);letter-spacing:.3px;text-transform:uppercase;margin-bottom:10px">식당 추가</div>'
    +'<div class="form-half"><div class="form-row"><label class="form-label">식당명</label><input id="rName" placeholder="예) 진미식당"/></div>'
    +'<div class="form-row"><label class="form-label">카테고리</label><select id="rCat">'+catOpts+'</select></div></div>'
    +'<div class="form-half"><div class="form-row"><label class="form-label">거리</label><input id="rDist" placeholder="예) 도보 5분"/></div>'
    +'<div class="form-row"><label class="form-label">메모</label><input id="rMemo" placeholder="예) 김치찌개 맛있음"/></div></div>'
    +'<div class="modal-footer"><div></div><div class="modal-footer-right"><button class="btn ghost" onclick="closeModal()">닫기</button><button class="btn primary" onclick="addRestaurant()">추가</button></div></div>'
    +'</div></div>';
  document.getElementById('rName')?.focus();
}

async function addRestaurant(){
  const name=document.getElementById('rName')?.value.trim();
  if(!name){alert('식당명을 입력해주세요.');return;}
  const body={name,category:document.getElementById('rCat').value,distance:document.getElementById('rDist').value.trim()||null,memo:document.getElementById('rMemo').value.trim()||null,created_by:currentUser?.id};
  try{await api('POST','restaurants',body);await openRestaurantManager();}
  catch(e){alert('오류: '+e.message);}
}

async function deleteRestaurant(id){
  if(!confirm('식당을 삭제할까요?'))return;
  try{await api('DELETE','restaurants?id=eq.'+id);await openRestaurantManager();}
  catch(e){alert('오류: '+e.message);}
}

renderKudos = async function(offset){
  if(offset!==undefined) kudosWeekOffset=offset;
  const el=document.getElementById('kudosWrap');
  if(!el) return;
  const ws=getWeekStart(kudosWeekOffset);
  const {start}=getWeekBounds(kudosWeekOffset);
  const weekLabel=kudosWeekOffset===0?'\uC774\uBC88 \uC8FC':kudosWeekOffset===-1?'\uC9C0\uB09C \uC8FC':`${start.getMonth()+1}/${start.getDate()} \uC8FC`;
  try{
    const [votes,myVoteArr]=await Promise.all([
      api('GET','kudos_votes?week_start=eq.'+ws+'&select=*'),
      api('GET','kudos_votes?week_start=eq.'+ws+'&voter_id=eq.'+(currentUser?.id||'null')+'&select=*').catch(()=>[])
    ]);
    const tally={};
    (votes||[]).forEach(v=>{tally[v.target_member_name]=(tally[v.target_member_name]||0)+1;});
    const sorted=Object.entries(tally).sort((a,b)=>b[1]-a[1]);
    const myVote=myVoteArr&&myVoteArr[0];
    const hasVotes=sorted.length>0;
    const isCurrentWeek=kudosWeekOffset===0;
    const prevBtn=`<button class="home-inline-btn" onclick="renderKudos(${kudosWeekOffset-1})">&lt;</button>`;
    const nextBtn=kudosWeekOffset<0
      ? `<button class="home-inline-btn" onclick="renderKudos(${kudosWeekOffset+1})">&gt;</button>`
      : '<div style="width:58px"></div>';
    const voteBtn=isCurrentWeek
      ? `<button class="home-inline-btn" onclick="openKudosModal()">${myVote?'\uD22C\uD45C \uBCC0\uACBD':'\uD22C\uD45C\uD558\uAE30'}</button>`
      : '';
    const body=hasVotes
      ? `
        <div style="display:flex;flex-direction:column;gap:10px">
          ${sorted.map(([name,cnt],index)=>`
            <div style="display:flex;gap:12px;padding:14px;background:#F8FAFC;border:1px solid #E2E8F0;border-radius:8px">
              <div class="home-avatar">${esc(name.charAt(0))}</div>
              <div style="flex:1;min-width:0">
                <div class="home-person-name" style="margin-bottom:4px">${esc(name)}</div>
                <div class="home-meta-text" style="color:#334155;white-space:pre-wrap;word-break:break-word">${index===0?'\uC774\uBC88 \uC8FC \uCD5C\uB2E4 \uB4DD\uD45C \u00B7 ':'\uB4DD\uD45C \uD604\uD669 \u00B7 '}${cnt}\uD45C${myVote&&isCurrentWeek&&myVote.target_member_name===name?' \u00B7 \uB0B4 \uD22C\uD45C':''}</div>
              </div>
            </div>
          `).join('')}
        </div>
      `
      : `
        <div class="home-meta-text" style="text-align:center;padding:20px 0">
          ${isCurrentWeek?'\uC544\uC9C1 \uD22C\uD45C\uAC00 \uC5C6\uC2B5\uB2C8\uB2E4. \uC774\uBC88 \uC8FC \uACE0\uC0DD\uD55C \uB3D9\uB8CC\uB97C \uCE6D\uCC2C\uD574\uBCF4\uC138\uC694.<br><br><button class="home-inline-btn" onclick="openKudosModal()">\uCCAB \uD22C\uD45C\uD558\uAE30</button>':'\uC774 \uC8FC\uC758 \uD22C\uD45C \uAE30\uB85D\uC774 \uC5C6\uC2B5\uB2C8\uB2E4.'}
        </div>
      `;
    el.innerHTML=`
      <div class="home-subcard">
        <div class="home-subcard-header">
          <div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap">
            <div class="home-subsection-title">\uCE6D\uCC2C\uC0AC\uC6D0</div>
            <div style="display:flex;align-items:center;gap:6px">
              ${prevBtn}
              <span class="home-meta-text" style="min-width:62px;text-align:center">${weekLabel}</span>
              ${nextBtn}
            </div>
          </div>
          ${voteBtn}
        </div>
        ${body}
      </div>
    `;
  }catch(e){
    console.error('renderKudos failed',e);
    el.innerHTML='';
  }
};

async function renderWeeklyReviews(offset){
  if(offset!==undefined)reviewWeekOffset=offset;
  const el=document.getElementById('weeklyReviewWrap');if(!el)return;
  const ws=getWeekStart(reviewWeekOffset);
  const {start}=getWeekBounds(reviewWeekOffset);
  const weekLabel=reviewWeekOffset===0?'이번 주':reviewWeekOffset===-1?'지난 주':`${start.getMonth()+1}/${start.getDate()} 주`;
  const isCurrentWeek=reviewWeekOffset===0;
  try{
    const reviews=await api('GET','weekly_reviews?week_start=eq.'+ws+'&select=*&order=created_at.desc');
    const myReview=isCurrentWeek?reviews?.find(r=>r.created_by===currentUser?.id):null;
    el.innerHTML='<div class="home-subcard">'
      +'<div class="home-subcard-header">'
      +'<div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap">'
      +'<div class="home-subsection-title">업무 후기</div>'
      +'<div style="display:flex;align-items:center;gap:6px">'
      +'<button class="home-inline-btn" onclick="renderWeeklyReviews('+(reviewWeekOffset-1)+')">←</button>'
      +'<span class="home-meta-text" style="min-width:62px;text-align:center">'+weekLabel+'</span>'
      +(reviewWeekOffset<0?'<button class="home-inline-btn" onclick="renderWeeklyReviews('+(reviewWeekOffset+1)+')">→</button>':'<div style="width:58px"></div>')
      +'</div></div>'
      +(isCurrentWeek?(myReview
        ?'<button class="home-inline-btn" data-id="'+myReview.id+'" onclick="openReviewModal(this.dataset.id)">내 후기 수정</button>'
        :'<button class="home-inline-btn" onclick="openReviewModal()">+ 후기 작성</button>')
      :'')
      +'</div>'
      +(!reviews||!reviews.length
        ?'<div class="home-meta-text" style="text-align:center;padding:20px 0">'+(isCurrentWeek?'아직 후기가 없습니다. 첫 번째 후기를 남겨보세요.<br><br><button class="home-inline-btn" onclick="openReviewModal()">첫 번째 후기 작성</button>':'이 주의 후기 기록이 없습니다.')+'</div>'
        :'<div style="display:flex;flex-direction:column;gap:10px">'
          +reviews.map(r=>'<div style="display:flex;gap:12px;padding:14px;background:#F8FAFC;border:1px solid #E2E8F0;border-radius:8px">'
            +'<div class="home-avatar">'+esc((r.member_name||'?').charAt(0))+'</div>'
            +'<div style="flex:1;min-width:0">'
            +'<div class="home-person-name" style="margin-bottom:4px">'+esc(r.member_name||'익명')+'</div>'
            +'<div class="home-meta-text" style="color:#334155;white-space:pre-wrap;word-break:break-word">'+esc(r.content)+'</div>'
            +'</div>'
            +(isCurrentWeek&&r.created_by===currentUser?.id?'<button class="home-inline-btn" style="flex-shrink:0" data-id="'+r.id+'" onclick="openReviewModal(this.dataset.id)">수정</button>':'')
            +'</div>').join('')
          +'</div>')
      +'</div>';
  }catch(e){el.innerHTML='';}
}

async function openKudosModal(){
  const ws=getWeekStart(0);
  const myVote=await api('GET','kudos_votes?week_start=eq.'+ws+'&voter_id=eq.'+currentUser?.id+'&select=*').catch(()=>null);
  const hasVoted=myVote&&myVote.length>0;
  const mOpts=members.filter(m=>m.id!==currentMember?.id).map(m=>'<option value="'+m.id+'" data-name="'+esc(m.name)+'">'+esc(m.name)+'</option>').join('');
  document.getElementById('modalArea').innerHTML=
    '<div class="overlay" onclick="if(event.target===this)closeModal()">'
    +'<div class="modal" style="width:420px"><div class="modal-title">✨ 이번 주 칭찬사원 투표</div>'
    +(hasVoted?'<div style="background:var(--blue-light);border-radius:var(--radius-sm);padding:10px 14px;font-size:13px;color:var(--blue);margin-bottom:14px">이미 투표했습니다. <strong>'+esc(myVote[0].target_member_name)+'</strong></div>':'')
    +'<div class="form-row"><label class="form-label">이번 주 가장 고생한 동료</label><select id="kudosMember"><option value="">선택하세요</option>'+mOpts+'</select></div>'
    +'<div class="form-row"><label class="form-label">칭찬 한마디(선택)</label><input id="kudosReason" placeholder="예) 마감 직전까지 꼼꼼히 챙겨줘서 감사해요"/></div>'
    +'<div class="modal-footer"><div></div><div class="modal-footer-right"><button class="btn ghost" onclick="closeModal()">취소</button>'
    +(hasVoted?'<button class="btn primary" onclick="submitKudos(true)">다시 투표</button>':'<button class="btn primary" onclick="submitKudos(false)">투표하기</button>')
    +'</div></div></div></div>';
}

async function submitKudos(isUpdate){
  const sel=document.getElementById('kudosMember');
  const targetId=sel?.value;
  const targetName=sel?.options[sel.selectedIndex]?.dataset?.name;
  const reason=document.getElementById('kudosReason')?.value.trim()||null;
  if(!targetId){alert('투표할 동료를 선택해주세요.');return;}
  const ws=getWeekStart(0);
  try{
    if(isUpdate){
      await api('PATCH','kudos_votes?week_start=eq.'+ws+'&voter_id=eq.'+currentUser?.id,{target_member_id:targetId,target_member_name:targetName,reason});
    }else{
      await api('POST','kudos_votes',{week_start:ws,voter_id:currentUser?.id,target_member_id:targetId,target_member_name:targetName,reason});
    }
    closeModal();
    await renderKudos();
  }catch(e){alert('투표 오류: '+e.message);}
}

async function openReviewModal(editId){
  let existingContent='';
  if(editId){
    try{const r=await api('GET','weekly_reviews?id=eq.'+editId+'&select=*');existingContent=r?.[0]?.content||'';}catch(e){}
  }
  document.getElementById('modalArea').innerHTML=
    '<div class="overlay" onclick="if(event.target===this)closeModal()">'
    +'<div class="modal" style="width:480px"><div class="modal-title">'+(editId?'후기 수정':'이번 주 업무 후기 작성')+'</div>'
    +'<div style="font-size:12px;color:var(--text3);margin-bottom:14px">이번 주 어땠는지 팀과 공유해보세요 ✍️</div>'
    +'<div class="form-row"><label class="form-label">후기</label><textarea id="reviewContent" rows="6" style="resize:vertical" placeholder="이번 주 업무 내용, 느낀 점, 다음 주 계획 등을 자유롭게 적어보세요">'+esc(existingContent)+'</textarea></div>'
    +'<div class="modal-footer"><div></div><div class="modal-footer-right"><button class="btn ghost" onclick="closeModal()">취소</button>'
    +'<button class="btn primary" data-id="'+(editId||'')+'" onclick="saveWeeklyReview(this.dataset.id)">저장</button>'
    +'</div></div></div></div>';
  document.getElementById('reviewContent')?.focus();
}

async function saveWeeklyReview(editId){
  const content=document.getElementById('reviewContent')?.value.trim();
  if(!content){alert('내용을 입력해주세요.');return;}
  const ws=getWeekStart(0);
  try{
    if(editId){
      await api('PATCH','weekly_reviews?id=eq.'+editId,{content,updated_at:new Date().toISOString()});
    }else{
      await api('POST','weekly_reviews',{
        week_start:ws,
        member_id:currentMember?.id||null,
        member_name:currentMember?.name||currentUser?.email,
        content,
        created_by:currentUser?.id
      });
    }
    closeModal();
    await renderWeeklyReviews();
  }catch(e){alert('저장 오류: '+e.message);}
}

function renderTeamKudosAndReviews(){
  const el=document.getElementById('teamKudosReviewWrap');
  if(!el)return;
  el.innerHTML='<div class="card home-card"><div class="home-section-title">이번 주 팀 한마디</div><div class="team-extra-grid"><div id="kudosWrap"></div><div id="weeklyReviewWrap"></div></div></div>';
  renderKudos();
  renderWeeklyReviews();
}

let ladderResultTimer=null;
let ladderAnimationFrame=null;

function buildLadderTrace(startIndex,xPositions,rungs,topY,bottomY){
  let currentCol=startIndex;
  let currentX=xPositions[currentCol];
  const points=[[currentX,topY]];
  rungs.forEach(rung=>{
    points.push([currentX,rung.y]);
    if(rung.col===currentCol){
      currentCol+=1;
      currentX=xPositions[currentCol];
      points.push([currentX,rung.y]);
    }else if(rung.col===currentCol-1){
      currentCol-=1;
      currentX=xPositions[currentCol];
      points.push([currentX,rung.y]);
    }
  });
  points.push([currentX,bottomY]);
  return { points, finalCol:currentCol };
}

function buildLadderGameData(names){
  const n=names.length;
  const width=Math.max(320,Math.min(620,120+(n-1)*92));
  const height=336;
  const topY=44;
  const bottomY=258;
  const left=36;
  const usableWidth=width-left*2;
  const xPositions=Array.from({length:n},(_,idx)=>left+(n===1?usableWidth/2:(usableWidth/(n-1))*idx));
  const rowPool=[];
  for(let y=84;y<=220;y+=24) rowPool.push(y);
  const targetRungs=Math.min(rowPool.length,Math.max(n+1,n*2));
  const rowCols={};
  const rungs=[];
  let guard=0;
  while(rungs.length<targetRungs && guard<500){
    guard+=1;
    const y=rowPool[Math.floor(Math.random()*rowPool.length)];
    const col=Math.floor(Math.random()*Math.max(1,n-1));
    const used=rowCols[y]||[];
    if(used.includes(col) || used.includes(col-1) || used.includes(col+1)) continue;
    used.push(col);
    rowCols[y]=used;
    rungs.push({ y, col });
  }
  rungs.sort((a,b)=>a.y-b.y);
  const traces=names.map((_,idx)=>buildLadderTrace(idx,xPositions,rungs,topY,bottomY));
  const winnerIndex=Math.floor(Math.random()*names.length);
  const prizeIndex=traces[winnerIndex].finalCol;
  return { names, width, height, topY, bottomY, xPositions, rungs, traces, winnerIndex, prizeIndex };
}

function ladderPointsToPath(points){
  return points.map((point,index)=>(index?'L':'M')+point[0]+' '+point[1]).join(' ');
}

function renderLadderSvg(data){
  const { names, width, height, topY, bottomY, xPositions, rungs, traces, winnerIndex, prizeIndex }=data;
  const prizeLabels=names.map((_,idx)=>idx===prizeIndex?'\uB2F9\uCCA8':'\uC544\uC27D');
  const baseLines=xPositions.map(x=>'<line x1="'+x+'" y1="'+topY+'" x2="'+x+'" y2="'+bottomY+'" stroke="#CBD5E1" stroke-width="3" stroke-linecap="round"/>').join('');
  const rungLines=rungs.map(rung=>'<line x1="'+xPositions[rung.col]+'" y1="'+rung.y+'" x2="'+xPositions[rung.col+1]+'" y2="'+rung.y+'" stroke="#8FB7D9" stroke-width="5" stroke-linecap="round"/>').join('');
  const topLabels=names.map((name,idx)=>{
    const x=xPositions[idx];
    const active=idx===winnerIndex;
    return '<g>'
      +'<circle cx="'+x+'" cy="24" r="'+(active?11:9)+'" fill="'+(active?'#0F172A':'#E2E8F0')+'"/>'
      +'<text x="'+x+'" y="28" text-anchor="middle" font-size="11" font-weight="800" fill="'+(active?'#FFFFFF':'#334155')+'">'+(idx+1)+'</text>'
      +'<text x="'+x+'" y="12" text-anchor="middle" font-size="11" font-weight="700" fill="#475569">'+esc(name)+'</text>'
      +'</g>';
  }).join('');
  const bottomLabels=prizeLabels.map((label,idx)=>{
    const x=xPositions[idx];
    const isPrize=idx===prizeIndex;
    return '<g>'
      +'<rect x="'+(x-26)+'" y="'+(bottomY+12)+'" rx="12" ry="12" width="52" height="26" fill="'+(isPrize?'#F59E0B':'#E2E8F0')+'" stroke="'+(isPrize?'#D97706':'#CBD5E1')+'"/>'
      +'<text x="'+x+'" y="'+(bottomY+29)+'" text-anchor="middle" font-size="11" font-weight="800" fill="'+(isPrize?'#FFFFFF':'#334155')+'">'+label+'</text>'
      +'</g>';
  }).join('');
  const pathData=ladderPointsToPath(traces[winnerIndex].points);
  return '<svg id="ladderSvg" width="'+width+'" height="'+height+'" viewBox="0 0 '+width+' '+height+'" style="width:100%;height:auto;display:block">'
    +'<defs><filter id="ladderGlow" x="-20%" y="-20%" width="140%" height="140%"><feDropShadow dx="0" dy="2" stdDeviation="3" flood-color="#0F172A" flood-opacity=".22"/></filter></defs>'
    +baseLines+rungLines+topLabels+bottomLabels
    +'<path id="ladderTracePath" d="'+pathData+'" fill="none" stroke="#111827" stroke-width="6" stroke-linecap="round" stroke-linejoin="round" filter="url(#ladderGlow)"/>'
    +'<circle id="ladderTraceDot" cx="'+traces[winnerIndex].points[0][0]+'" cy="'+traces[winnerIndex].points[0][1]+'" r="7" fill="#F59E0B" stroke="#FFFFFF" stroke-width="3" filter="url(#ladderGlow)"/>'
    +'</svg>';
}

function animateLadderTrace(data){
  const path=document.getElementById('ladderTracePath');
  const dot=document.getElementById('ladderTraceDot');
  const resultWrap=document.getElementById('ladderResult');
  if(!path || !dot || !resultWrap) return;
  if(ladderResultTimer) clearTimeout(ladderResultTimer);
  if(ladderAnimationFrame) cancelAnimationFrame(ladderAnimationFrame);
  const total=path.getTotalLength();
  path.style.strokeDasharray=String(total);
  path.style.strokeDashoffset=String(total);
  resultWrap.innerHTML='<div class="ladder-status-note">\uC0AC\uB2E4\uB9AC\uB97C \uD0C0\uB294 \uC911...</div>';
  const start=performance.now();
  const duration=1900;
  const tick=(now)=>{
    const progress=Math.min((now-start)/duration,1);
    const eased=1-Math.pow(1-progress,3);
    const drawLength=total*eased;
    path.style.strokeDashoffset=String(total-drawLength);
    const point=path.getPointAtLength(drawLength);
    dot.setAttribute('cx',point.x);
    dot.setAttribute('cy',point.y);
    if(progress<1){
      ladderAnimationFrame=requestAnimationFrame(tick);
    }else{
      const winnerName=data.names[data.winnerIndex];
      resultWrap.innerHTML='<div style="text-align:center">'
        +'<div style="font-size:13px;color:var(--text3);margin-bottom:6px">\uACB0\uACFC</div>'
        +'<div style="font-size:26px;font-weight:900;color:var(--navy);letter-spacing:-.4px">'+esc(winnerName)+'</div>'
        +'<div style="font-size:13px;color:var(--text2);margin-top:6px">\uC624\uB298 \uCEE4\uD53C \uB2F4\uB2F9\uC740 \uC774 \uBD84\uC785\uB2C8\uB2E4.</div>'
        +'<button class="btn sm" style="margin-top:12px" onclick="runLadder()">\uB2E4\uC2DC \uD0C0\uAE30</button>'
        +'</div>';
    }
  };
  ladderAnimationFrame=requestAnimationFrame(tick);
}

openLadderGame = function(){
  const memberOpts=members.map(m=>'<div class="ladder-member" onclick="toggleLadderMember(this)" data-name="'+esc(m.name)+'" style="padding:8px 16px;border:1px solid var(--border);border-radius:20px;cursor:pointer;font-size:13px;font-weight:600;transition:all .15s">'+esc(m.name)+'</div>').join('');
  document.getElementById('modalArea').innerHTML=
    '<div class="overlay" onclick="if(event.target===this)closeModal()">'
    +'<div class="modal" style="width:min(700px,calc(100vw - 24px))">'
    +'<div class="modal-title">\uCEE4\uD53C \uC0AC\uB2E4\uB9AC\uD0C0\uAE30</div>'
    +'<div style="font-size:12px;color:var(--text3);margin-bottom:14px">\uBA64\uBC84\uB97C \uACE0\uB974\uBA74 \uC2DC\uC791\uC810\uC5D0\uC11C \uC544\uB798\uB85C \uD0C0\uACE0 \uB0B4\uB824\uAC00 \uB2F9\uCCA8\uC790\uB97C \uBCF4\uC5EC\uC90D\uB2C8\uB2E4.</div>'
    +'<div id="ladderMembers" style="display:flex;flex-wrap:wrap;gap:8px;margin-bottom:20px">'+memberOpts+'</div>'
    +'<div id="ladderCanvas" class="ladder-stage" style="display:none;margin-bottom:16px"></div>'
    +'<div id="ladderResult" style="min-height:70px;display:flex;align-items:center;justify-content:center"></div>'
    +'<div class="modal-footer"><div></div><div class="modal-footer-right"><button class="btn ghost" onclick="closeModal()">\uB2EB\uAE30</button><button class="btn primary" onclick="runLadder()">\uC0AC\uB2E4\uB9AC \uD0C0\uAE30</button></div></div>'
    +'</div></div>';
};

runLadder = function(){
  const selected=[...document.querySelectorAll('.ladder-member.active')].map(el=>el.dataset.name);
  if(selected.length<2){
    alert('\uCD5C\uC18C 2\uBA85 \uC774\uC0C1 \uC120\uD0DD\uD574\uC8FC\uC138\uC694.');
    return;
  }
  const canvas=document.getElementById('ladderCanvas');
  const resultWrap=document.getElementById('ladderResult');
  if(!canvas || !resultWrap) return;
  const ladderData=buildLadderGameData(selected);
  canvas.style.display='block';
  canvas.innerHTML=renderLadderSvg(ladderData);
  animateLadderTrace(ladderData);
};

function renderHomeRiskSummaryCard(card){
  return '<button type="button" class="home-risk-card" onclick="'+card.action+'">'
    +'<div class="home-risk-label">'+esc(card.label)+'</div>'
    +'<div class="home-risk-value '+(card.tone?'is-'+card.tone:'')+'">'+esc(card.value)+'</div>'
    +(card.meta?'<div class="home-risk-meta">'+esc(card.meta)+'</div>':'')
    +'</button>';
}
function getHomeProjectBillingAmount(project){
  const directAmount=Number(project?.billing_amount||0);
  if(directAmount>0)return directAmount;
  const linkedContract=(contracts||[]).find(contract=>String(contract.id)===String(project?.contract_id||''));
  const contractAmount=Number(linkedContract?.contract_amount||0);
  return contractAmount>0?contractAmount:0;
}

async function renderHomeRiskSummary(){
  const el=document.getElementById('homeRiskWrap');
  if(!el)return;
  el.innerHTML='<div class="home-risk-grid">'
    +['오늘 마감','지연중','내 이슈','미청구','자료 대기','팀 가용성'].map(label=>
      '<div class="home-risk-card"><div class="home-risk-label">'+label+'</div><div class="home-risk-value">—</div><div class="home-risk-meta">불러오는 중...</div></div>'
    ).join('')
    +'</div>';
  try{
    const today=getHomeBaseDate();
    const dueLimit=new Date(today);
    dueLimit.setDate(today.getDate()+3);
    const isCompletedProject=project=>{
      const statusRaw=String(project?.status||'').trim();
      const statusKey=statusRaw.toLowerCase().replace(/[\s-]+/g,'_');
      return statusRaw==='완료'||statusKey==='completed'||statusKey==='done';
    };
    const todayDueProjects=(projects||[]).filter(project=>{
      const endDateRaw=project.end||project.end_date;
      if(!endDateRaw)return false;
      if(isCompletedProject(project))return false;
      const endDate=toDate(endDateRaw);
      return endDate.getTime()===today.getTime();
    }).sort((a,b)=>String(a?.name||'').localeCompare(String(b?.name||''),'ko'));
    const overdueProjects=(projects||[]).filter(project=>{
      const endDateRaw=project.end||project.end_date;
      if(!endDateRaw)return false;
      if(isCompletedProject(project))return false;
      const endDate=toDate(endDateRaw);
      return endDate<today;
    }).sort((a,b)=>{
      const diff=toDate(a.end||a.end_date)-toDate(b.end||b.end_date);
      if(diff)return diff;
      return String(a?.name||'').localeCompare(String(b?.name||''),'ko');
    });

    const [issueRows,pendingDocs]=await Promise.all([
      (currentMember?.id||currentMember?.name)
        ?api('GET','project_issues?select=id,status,is_pinned,priority,assignee_member_id,assignee_name').catch(()=>[])
        :Promise.resolve([]),
      api('GET','document_requests?status=eq.pending&select=id,project_id,title,due_date').catch(()=>[])
    ]);

    const myOpenIssues=(issueRows||[]).filter(issue=>{
      const matchesAssignee=(currentMember?.id&&String(issue?.assignee_member_id||'')===String(currentMember.id))
        ||(currentMember?.name&&issue?.assignee_name===currentMember.name);
      return matchesAssignee&&isIssueActiveStatus(issue?.status);
    });
    const myHighPriorityIssues=myOpenIssues.filter(issue=>String(issue?.priority||'').trim().toLowerCase()==='high');

    const unbilledProjects=(projects||[]).filter(project=>
      isCompletedProject(project)
      &&project?.is_billable
      &&String(project?.billing_status||'').trim()==='미청구'
    );
    const pendingBillingAmount=unbilledProjects.reduce((sum,project)=>sum+getHomeProjectBillingAmount(project),0);

    const pendingDocRows=(pendingDocs||[]).filter(row=>{
      if(!row?.due_date)return false;
      const dueDate=toDate(row.due_date);
      return dueDate<=dueLimit;
    }).sort((a,b)=>{
      const diff=toDate(a.due_date)-toDate(b.due_date);
      if(diff)return diff;
      return String(a?.title||'').localeCompare(String(b?.title||''),'ko');
    });
    const firstPendingDoc=pendingDocRows[0]||null;
    const firstPendingProjectId=firstPendingDoc?.project_id||'';

    const activeMembers=(members||[]).filter(member=>{
      const isActive=member?.is_active===undefined?true:!!member.is_active;
      const identity=[member?.name,member?.email,member?.auth_user_id].filter(Boolean).join(' ').toLowerCase();
      const isSystemAccount=/projectschedule|system|test/.test(identity);
      return isActive&&!isSystemAccount;
    });
    const todayLeaveNames=[...new Set((schedules||[])
      .filter(schedule=>{
        const type=String(schedule?.schedule_type||'').trim();
        if(type!=='leave')return false;
        const startDate=toDate(schedule.start||schedule.start_date);
        const endDate=toDate(schedule.end||schedule.end_date||schedule.start||schedule.start_date);
        return startDate<=today&&endDate>=today;
      })
      .flatMap(schedule=>getScheduleMemberNames(schedule))
      .filter(Boolean))];
    const todayLeaveCount=todayLeaveNames.length;
    const activeMemberCount=activeMembers.length;
    const leaveRatio=activeMemberCount?todayLeaveCount/activeMemberCount:0;
    const oldestOverdue=overdueProjects[0]||null;
    const oldestOverdueDiff=oldestOverdue?Math.max(1,Math.round((today.getTime()-toDate(oldestOverdue.end||oldestOverdue.end_date).getTime())/86400000)):0;

    const cards=[
      {
        label:'오늘 마감',
        value:todayDueProjects.length?todayDueProjects.length+'건':'없음 ✓',
        tone:todayDueProjects.length?'warning':'success',
        meta:todayDueProjects.length?(todayDueProjects[0]?.name||'프로젝트명 없음'):'오늘 마감 프로젝트 없음',
        action:"setPage('projects')"
      },
      {
        label:'지연중',
        value:overdueProjects.length?overdueProjects.length+'건':'없음 ✓',
        tone:overdueProjects.length?'danger':'success',
        meta:oldestOverdue?(oldestOverdue.name+' · D+'+oldestOverdueDiff):'지연 프로젝트 없음',
        action:"setPage('projects')"
      },
      {
        label:'내 이슈',
        value:myOpenIssues.length?myOpenIssues.length+'건':'없음 ✓',
        tone:myOpenIssues.length?'warning':'success',
        meta:myOpenIssues.length?(myHighPriorityIssues.length?('긴급 '+myHighPriorityIssues.length+'건 포함'):'열린 이슈 진행중'):(currentMember?.name?'내 담당 열린 이슈 없음':'담당자 정보 없음'),
        action:"setPage('issues')"
      },
      {
        label:'미청구',
        value:pendingBillingAmount?pendingBillingAmount.toLocaleString()+'원':'없음 ✓',
        tone:pendingBillingAmount?'danger':'success',
        meta:unbilledProjects.length?('완료 후 미청구 '+unbilledProjects.length+'건'):'미청구 프로젝트 없음',
        action:"setPage('contracts')"
      },
      {
        label:'자료 대기',
        value:pendingDocRows.length?pendingDocRows.length+'건':'없음 ✓',
        tone:pendingDocRows.length?'warning':'success',
        meta:pendingDocRows.length?((firstPendingDoc?.title||'자료 요청')+(firstPendingDoc?.due_date?' · '+firstPendingDoc.due_date:'')):'급한 자료 요청 없음',
        action:pendingDocRows.length&&firstPendingProjectId
          ?"openProjModal('"+firstPendingProjectId+"',null,null,'documents')"
          :"alert('급한 자료 요청이 없습니다 ✓')"
      },
      {
        label:'팀 가용성',
        value:activeMemberCount?(todayLeaveCount+'/'+activeMemberCount+'명'):'0명',
        tone:leaveRatio>=0.3?'warning':'success',
        meta:todayLeaveCount?(formatHomeShortDate(today)+' 휴가 '+todayLeaveNames[0]+(todayLeaveNames.length>1?' 외 '+(todayLeaveNames.length-1)+'명':'')):'오늘 휴가 없음',
        action:"openDashDrilldown('leave')"
      }
    ];

    el.innerHTML='<div class="home-risk-grid">'+cards.map(renderHomeRiskSummaryCard).join('')+'</div>';
  }catch(e){
    el.innerHTML='<div class="home-risk-grid">'
      +['오늘 마감','지연중','내 이슈','미청구','자료 대기','팀 가용성'].map(label=>
        '<div class="home-risk-card"><div class="home-risk-label">'+label+'</div><div class="home-risk-value">—</div><div class="home-risk-meta">상단 요약을 불러오지 못했습니다.</div></div>'
      ).join('')
      +'</div>';
  }
}

function getHomeNoticeHeadlines(limit=5){
  return [...(notices||[])]
    .sort((a,b)=>{
      const pinDiff=Number(!!b.is_pinned)-Number(!!a.is_pinned);
      if(pinDiff) return pinDiff;
      return new Date(b.created_at)-new Date(a.created_at);
    })
    .slice(0,limit);
}

function getHomeTodayDueProjects(){
  const today=getHomeBaseDate();
  return (projects||[]).filter(p=>p.status!=='완료'&&toDate(p.end).getTime()===today.getTime());
}

function getHomeTodayItems(limit=4){
  if(!currentMember?.name) return [];
  const today=getHomeBaseDate();
  const items=[];
  (projects||[])
    .filter(p=>Array.isArray(p.members)&&p.members.includes(currentMember.name)&&p.status!=='완료'&&toDate(p.start)<=today&&toDate(p.end)>=today)
    .forEach(p=>{
      const client=clients.find(c=>c.id===p.client_id);
      const dueToday=toDate(p.end).getTime()===today.getTime();
      items.push({
        title:p.name,
        meta:(client?client.name+' · ':'')+(dueToday?'오늘 마감':'진행 중 프로젝트'),
        badges:[dueToday?'<span class="badge badge-orange">오늘 마감</span>':'<span class="badge badge-blue">프로젝트</span>'],
        action:'openProjModal(\''+p.id+'\')',
        sortKey:dueToday?0:1
      });
    });
  (schedules||[])
    .filter(s=>scheduleHasMember(s,currentMember.name)&&toDate(s.start)<=today&&toDate(s.end)>=today)
    .forEach(s=>{
      const meta=SCHEDULE_META[s.schedule_type]?.label||s.schedule_type||'일정';
      items.push({
        title:s.title||meta,
        meta:getScheduleMemberLabel(s)+' · '+meta,
        badges:['<span class="badge badge-gray">'+esc(meta)+'</span>'],
        action:'openScheduleModal(\''+s.id+'\')',
        sortKey:2
      });
    });
  return items
    .sort((a,b)=>a.sortKey-b.sortKey||a.title.localeCompare(b.title,'ko'))
    .slice(0,limit);
}

function getHomeIssueItems(limit=4){
  const mine=currentMember?.name
    ?(projects||[]).filter(p=>Array.isArray(p.members)&&p.members.includes(currentMember.name)&&(openIssuesByProject[p.id]||0)>0)
    :[];
  const source=mine.length?mine:(projects||[]).filter(p=>(openIssuesByProject[p.id]||0)>0);
  return source
    .sort((a,b)=>{
      const issueDiff=(openIssuesByProject[b.id]||0)-(openIssuesByProject[a.id]||0);
      if(issueDiff) return issueDiff;
      return toDate(a.end)-toDate(b.end);
    })
    .slice(0,limit)
    .map(p=>{
      const client=clients.find(c=>c.id===p.client_id);
      const issueCount=openIssuesByProject[p.id]||0;
      const overdue=toDate(p.end)<getHomeBaseDate()&&p.status!=='완료';
      return {
        title:p.name,
        meta:(client?client.name+' · ':'')+'열린 이슈 '+issueCount+'건',
        badges:[overdue?'<span class="badge badge-red">기한 주의</span>':'<span class="badge badge-blue">이슈 '+issueCount+'건</span>'],
        action:'openProjModal(\''+p.id+'\',null,null,\'issue\')'
      };
    });
}

function renderHomeInfoList(items,emptyText){
  if(!items.length){
    return '<div class="main-home-empty">'+esc(emptyText)+'</div>';
  }
  return '<div class="main-home-list">'+items.map(item=>{
    const badges=(item.badges||[]).length?'<div class="main-inline-badges">'+item.badges.join('')+'</div>':'';
    return '<div class="main-home-item"'+(item.action?' onclick="'+item.action+'"':' style="cursor:default"')+'>'
      +'<div class="main-home-item-row">'
      +'<div class="main-home-item-title">'+esc(item.title)+'</div>'
      +badges
      +'</div>'
      +(item.meta?'<div class="main-home-item-meta">'+esc(item.meta)+'</div>':'')
      +'</div>';
  }).join('')+'</div>';
}

function getTeamExceptionItems(limit=4){
  const {overdue=[],unbilled=[],followups=[]}=getAlerts()||{};
  const items=[];
  overdue.forEach(p=>{
    items.push({
      title:p.name,
      meta:'기간 초과 프로젝트',
      badges:['<span class="badge badge-red">기한 초과</span>'],
      action:'openProjModal(\''+p.id+'\')'
    });
  });
  unbilled.forEach(p=>{
    items.push({
      title:p.name,
      meta:'완료 후 청구 확인 필요',
      badges:['<span class="badge badge-orange">빌링 필요</span>'],
      action:'openProjModal(\''+p.id+'\',null,null,\'completion\')'
    });
  });
  followups.forEach(p=>{
    items.push({
      title:p.name,
      meta:truncateText(p.note||'후속 액션을 확인해주세요.',32),
      badges:['<span class="badge badge-orange">후속 필요</span>'],
      action:'openProjModal(\''+p.id+'\',null,null,\'completion\')'
    });
  });
  return items.slice(0,limit);
}

renderTeamNotices = function(){
  const el=document.getElementById('teamNoticeWrap');
  if(!el) return;
  const list=[...(notices||[])].sort((a,b)=>{
    const pinDiff=Number(!!b.is_pinned)-Number(!!a.is_pinned);
    if(pinDiff) return pinDiff;
    return new Date(b.created_at)-new Date(a.created_at);
  });
  const visible=teamNoticeExpanded?list:list.slice(0,3);
  el.innerHTML='<div class="card team-notice-panel home-card" style="margin-bottom:0">'
    +'<div class="team-notice-head">'
    +'<div><div class="home-section-title" style="margin:0">공지사항</div><div style="font-size:12px;color:var(--text3);margin-top:4px">중요한 공지는 제목과 날짜만 먼저 보여주고, 필요하면 펼쳐서 더 확인합니다.</div></div>'
    +(isAdmin?'<button class="btn primary sm" onclick="openNoticeWrite()">+ 공지 작성</button>':'')
    +'</div>'
    +(!list.length
      ?'<div class="notice-empty" style="padding:26px 16px">등록된 공지가 없습니다.</div>'
      :'<div class="team-notice-list" style="display:flex;flex-direction:column;gap:0;max-height:none;overflow:visible;padding-right:0">'
        +visible.map(n=>'<div class="team-notice-row" onclick="openNoticeDetail(this.dataset.id)" data-id="'+n.id+'">'
          +'<div style="min-width:0;display:flex;align-items:center;gap:6px;overflow:hidden">'
          +(n.is_pinned?'<span class="badge badge-blue" style="flex-shrink:0">📌</span>':'')
          +(n.require_confirm?'<span class="badge badge-red" style="flex-shrink:0">필독</span>':'')
          +'<span class="team-notice-row-title">'+esc(n.title)+'</span>'
          +'</div>'
          +'<div class="team-notice-row-date">'+formatDate(n.created_at)+'</div>'
          +'</div>').join('')
        +'</div>'
        +(list.length>3?'<div style="display:flex;justify-content:flex-end;margin-top:10px"><button class="btn sm" onclick="teamNoticeExpanded='+(!teamNoticeExpanded)+';renderTeamNotices()">'+(teamNoticeExpanded?'접기':'더보기')+'</button></div>':''))
    +'</div>';
};

function getTeamDashboardAvailabilityItemsFinal(){
  const today=getHomeBaseDate();
  const todayLeave=(schedules||[]).filter(s=>s.schedule_type==='leave'&&toDate(s.start)<=today&&toDate(s.end)>=today).length;
  const todayFieldwork=(schedules||[]).filter(s=>s.schedule_type==='fieldwork'&&toDate(s.start)<=today&&toDate(s.end)>=today).length;
  return [
    {
      title:'오늘 휴가',
      meta:todayLeave?`${todayLeave}건의 휴가 일정이 있습니다.`:'오늘 등록된 휴가 일정이 없습니다.',
      badges:[`<span class="badge ${todayLeave?'badge-orange':'badge-gray'}">${todayLeave}건</span>`],
      action:"document.getElementById('memberScheduleWrap')?.scrollIntoView({behavior:'smooth',block:'start'})"
    },
    {
      title:'오늘 필드웍',
      meta:todayFieldwork?`${todayFieldwork}건의 현장 일정이 있습니다.`:'오늘 등록된 필드웍 일정이 없습니다.',
      badges:[`<span class="badge ${todayFieldwork?'badge-blue':'badge-gray'}">${todayFieldwork}건</span>`],
      action:"document.getElementById('memberScheduleWrap')?.scrollIntoView({behavior:'smooth',block:'start'})"
    },
    {
      title:'이번 주 일정',
      meta:currentMember?.name?`${currentMember.name}님의 일정과 팀 스케줄을 아래에서 확인하세요.`:'아래 일정 섹션에서 팀 스케줄을 확인하세요.',
      badges:['<span class="badge badge-gray">바로가기</span>'],
      action:"document.getElementById('myWeekWrap')?.scrollIntoView({behavior:'smooth',block:'start'})"
    }
  ];
}

renderTeamMainDashboard = function(){
  const el=document.getElementById('teamMainDashboardWrap');
  if(!el) return;
  const todayItems=getHomeTodayItems(4);
  const todayDue=getHomeTodayDueProjects();
  const issueItems=getHomeIssueItems(4);
  const unreadRequired=getUnreadRequiredNotices().length;
  const myIssueTotal=(currentMember?.name
    ?(projects||[])
      .filter(p=>Array.isArray(p.members)&&p.members.includes(currentMember.name))
      .reduce((sum,p)=>sum+(openIssuesByProject[p.id]||0),0)
    :0);
  const availabilityItems=getTeamDashboardAvailabilityItemsFinal();
  const cards=[
    {label:'오늘 일정',value:todayItems.length,sub:todayItems.length?'오늘 처리할 일정과 프로젝트가 있습니다.':'오늘 바로 처리할 일정이 없습니다.',className:'info',action:"document.getElementById('myWeekWrap')?.scrollIntoView({behavior:'smooth',block:'start'})"},
    {label:'오늘 마감',value:todayDue.length,sub:todayDue.length?truncateText(todayDue.map(p=>p.name).join(', '),28):'오늘 마감 프로젝트 없음',className:'today',action:"setPage('gantt')"},
    {label:'내 담당 이슈',value:myIssueTotal,sub:myIssueTotal?'내가 확인할 열린 이슈가 있습니다.':'열린 담당 이슈 없음',className:'info',action:"document.getElementById('issueFeedWrap')?.scrollIntoView({behavior:'smooth',block:'start'})"},
    {label:'필독 공지',value:unreadRequired,sub:unreadRequired?'확인하지 않은 필독 공지가 있습니다.':'미확인 필독 공지 없음',className:unreadRequired?'warn':'info',action:"document.getElementById('teamNoticeWrap')?.scrollIntoView({behavior:'smooth',block:'start'})"}
  ];
  el.innerHTML=
    '<div class="main-focus-grid">'+cards.map(card=>
      '<div class="main-focus-card clickable '+(card.className||'')+'" onclick="'+card.action+'">'
        +'<div class="main-focus-label">'+esc(card.label)+'</div>'
        +'<div class="main-focus-value">'+card.value+'</div>'
        +'<div class="main-focus-sub">'+esc(card.sub)+'</div>'
      +'</div>'
    ).join('')+'</div>'
    +'<div class="main-home-grid">'
      +'<div class="main-home-card">'
        +'<div class="main-home-head">'
          +'<div><div class="main-home-title">오늘 해야 할 일</div><div class="main-home-sub">'+(currentMember?.name?esc(currentMember.name)+'님 기준으로 오늘 바로 확인해야 할 항목입니다.':'오늘 체크해야 할 항목입니다.')+'</div></div>'
          +'<button class="btn ghost sm" onclick="setPage(\'gantt\')">프로젝트 관리</button>'
        +'</div>'
        +renderHomeInfoList(todayItems,currentMember?.name?'오늘 바로 처리할 일정이 없습니다.':'로그인 정보가 없어 개인 일정 요약을 표시하지 못했습니다.')
      +'</div>'
      +'<div class="main-home-stack">'
        +'<div class="main-home-card">'
          +'<div class="main-home-head">'
            +'<div><div class="main-home-title">내 담당 이슈</div><div class="main-home-sub">열린 이슈가 있는 프로젝트를 우선순위대로 보여줍니다.</div></div>'
            +'<button class="btn ghost sm" onclick="document.getElementById(\'issueFeedWrap\')?.scrollIntoView({behavior:\'smooth\',block:\'start\'})">아래 이슈 보기</button>'
          +'</div>'
          +renderHomeInfoList(issueItems,'현재 열려 있는 담당 이슈가 없습니다.')
        +'</div>'
        +'<div class="main-home-card">'
          +'<div class="main-home-head">'
            +'<div><div class="main-home-title">팀 일정 요약</div><div class="main-home-sub">휴가, 필드웍, 개인 일정을 빠르게 확인하고 아래 상세 섹션으로 이동합니다.</div></div>'
            +'<button class="btn ghost sm" onclick="document.getElementById(\'memberScheduleWrap\')?.scrollIntoView({behavior:\'smooth\',block:\'start\'})">일정 보기</button>'
          +'</div>'
          +renderHomeInfoList(availabilityItems,'팀 일정 요약이 없습니다.')
        +'</div>'
      +'</div>'
    +'</div>';
};
