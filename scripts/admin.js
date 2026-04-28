let adminUserRoleRows=[];
let adminManagementFilters={
  search:'',
  permission:'all',
  team:'all',
  rank:'all',
  inclusion:'all',
  status:'active'
};

const ADMIN_OPERATIONAL_INCLUSION_COLUMN='include_in_operational_dashboards';
const ADMIN_MEMBER_PROFILE_SCHEMA_SQL='sql/20260426_fix_members_management_columns.sql';
const ADMIN_MEMBER_PROFILE_COLUMNS=['is_active','role','team','rank',ADMIN_OPERATIONAL_INCLUSION_COLUMN,'note'];
const ADMIN_MEMBER_PROFILE_COLUMN_LABELS={
  is_active:'활성 상태',
  role:'권한',
  team:'팀',
  rank:'직급',
  include_in_operational_dashboards:'운영 집계 포함 여부',
  note:'비고'
};

function adminMemberSupportsColumn(member,column){
  return !!member&&Object.prototype.hasOwnProperty.call(member,column);
}

function adminMemberSupportsOperationalInclusion(member){
  return adminMemberSupportsColumn(member,ADMIN_OPERATIONAL_INCLUSION_COLUMN);
}

function getAdminStoredMemberRoleValue(role){
  const normalized=normalizeMemberPermissionLevel(role);
  if(normalized==='admin')return 'Admin';
  if(normalized==='manager')return 'Manager';
  if(normalized==='member')return 'Member';
  return 'Observer';
}

function applyAdminMemberLocalUpdate(memberId,memberPatch={},rolePatch=null){
  const targetId=String(memberId||'').trim();
  if(targetId&&Array.isArray(members)){
    members=members.map(member=>{
      if(String(member?.id||'').trim()!==targetId)return member;
      return {...member,...memberPatch};
    });
  }
  if(rolePatch&&Array.isArray(adminUserRoleRows)){
    const roleId=String(rolePatch?.id||'').trim();
    if(roleId){
      const nextRows=[...adminUserRoleRows];
      const rowIndex=nextRows.findIndex(row=>String(row?.id||'').trim()===roleId);
      if(rowIndex>=0){
        nextRows[rowIndex]={...nextRows[rowIndex],...rolePatch};
      }else{
        nextRows.push({...rolePatch});
      }
      adminUserRoleRows=nextRows;
    }
  }
}

function refreshAdminManagementViewSoon(){
  Promise.allSettled([
    loadAll(),
    loadAdminManagementData()
  ]).finally(()=>{
    renderAdminPageContent();
  });
}

function getAdminOperationalInclusionSchemaMessage(){
  return '운영 집계 포함 여부 컬럼이 아직 DB에 없습니다. sql/20260425_fix_operational_inclusion_column.sql을 적용한 뒤 다시 저장해 주세요.';
}

function isAdminOperationalInclusionSchemaError(error){
  const message=String(error?.message||error||'');
  return /include_in_operational_dashboards/i.test(message)&&/(schema cache|column)/i.test(message);
}

function getAdminMissingMemberColumns(member,columns=ADMIN_MEMBER_PROFILE_COLUMNS){
  return columns.filter(column=>!adminMemberSupportsColumn(member,column));
}

function getAdminMembersSchemaMessage(columns){
  const list=[...new Set((Array.isArray(columns)?columns:[columns]).filter(Boolean))];
  if(!list.length){
    return 'members 테이블 스키마와 Management 저장 필드가 맞지 않습니다. '+ADMIN_MEMBER_PROFILE_SCHEMA_SQL+'을 적용한 뒤 다시 저장해 주세요.';
  }
  const labels=list.map(column=>ADMIN_MEMBER_PROFILE_COLUMN_LABELS[column]||column).join(', ');
  return 'members 테이블에 필요한 컬럼이 없습니다. '+labels+' ('+list.join(', ')+'). '+ADMIN_MEMBER_PROFILE_SCHEMA_SQL+'을 적용하고 schema cache를 reload한 뒤 다시 저장해 주세요.';
}

function getAdminMissingMemberColumnsLabel(columns){
  return [...new Set((Array.isArray(columns)?columns:[columns]).filter(Boolean))]
    .map(column=>ADMIN_MEMBER_PROFILE_COLUMN_LABELS[column]||column)
    .join(', ');
}

function getAdminMembersSchemaColumnFromError(error){
  const message=String(error?.message||error||'');
  const match=message.match(/Could not find the '([^']+)' column of 'members'/i);
  return match?.[1]||'';
}

function isAdminMembersSchemaError(error){
  const message=String(error?.message||error||'');
  return /column of 'members' in the schema cache/i.test(message);
}

function accessStatusBadge(status){
  if(status==='approved')return '<span class="badge badge-green">승인</span>';
  if(status==='rejected')return '<span class="badge badge-gray">반려</span>';
  return '<span class="badge badge-orange">확인 대기</span>';
}

function accessRoleSelectOptions(selected){
  return ['observer','member','manager','admin']
    .map(role=>'<option value="'+role+'" '+(selected===role?'selected':'')+'>'+getRoleLabel(role)+'</option>')
    .join('');
}

async function openAccessRequestManager(targetRequestId=''){
  if(!roleIsAdmin())return;
  try{
    accessRequests=await api('GET','access_requests?select=*&order=status.asc,created_at.desc')||[];
  }catch(e){
    accessRequests=[];
  }
  const pending=accessRequests.filter(request=>request.status==='pending');
  const history=accessRequests.filter(request=>request.status!=='pending');
  document.getElementById('modalArea').innerHTML=''
    +'<div class="overlay" onclick="if(event.target===this)closeModal()">'
      +'<div class="modal" style="width:760px">'
        +'<div class="modal-title">접근 권한 요청</div>'
        +'<div style="font-size:12px;color:var(--text3);margin-bottom:16px">회원가입 이후 들어온 접근 요청을 승인하거나 반려할 수 있습니다.</div>'
        +'<div style="max-height:68vh;overflow-y:auto">'
          +'<div class="divider" style="margin-top:0">확인 대기 ('+pending.length+'건)</div>'
          +(pending.length?pending.map(request=>''
            +'<div id="access-request-'+request.id+'" class="card-sm" style="margin-bottom:10px">'
              +'<div style="display:flex;align-items:flex-start;justify-content:space-between;gap:10px;margin-bottom:10px">'
                +'<div>'
                  +'<div style="font-size:14px;font-weight:800;color:var(--navy)">'+esc(request.name||inferNameFromEmail(request.email)||'이름 미입력')+'</div>'
                  +'<div style="font-size:12px;color:var(--text3);margin-top:2px">'+esc(request.email||'')+'</div>'
                  +'<div style="font-size:11px;color:var(--text3);margin-top:5px">희망 권한: '+getRequestedRoleLabel(request.requested_role||'observer')+' · '+esc(formatPendingDate(request.created_at))+'</div>'
                +'</div>'
                +accessStatusBadge(request.status)
              +'</div>'
              +(request.note?'<div style="font-size:12px;color:var(--text2);line-height:1.6;background:var(--bg);border-radius:8px;padding:10px 12px;margin-bottom:10px">'+esc(request.note)+'</div>':'')
              +'<div style="display:grid;grid-template-columns:1fr 170px;gap:10px;margin-bottom:10px">'
                +'<input id="access-name-'+request.id+'" value="'+esc(request.name||inferNameFromEmail(request.email)||'')+'" placeholder="이름" style="padding:10px 12px;border:1px solid var(--border);border-radius:var(--radius-sm);font-family:inherit"/>'
                +'<select id="access-role-'+request.id+'" style="padding:10px 12px;border:1px solid var(--border);border-radius:var(--radius-sm);font-family:inherit">'+accessRoleSelectOptions(request.requested_role||'observer')+'</select>'
              +'</div>'
              +'<div style="display:flex;justify-content:flex-end;gap:8px">'
                +'<button class="btn ghost sm" onclick="rejectAccessRequest(\''+request.id+'\')">반려</button>'
                +'<button class="btn primary sm" onclick="approveAccessRequest(\''+request.id+'\')">승인</button>'
              +'</div>'
            +'</div>'
          ).join(''):'<div style="font-size:12px;color:var(--text3);padding:12px 0">확인 대기 중인 요청이 없습니다.</div>')
          +'<div class="divider">처리 이력 ('+history.length+'건)</div>'
          +(history.length?history.map(request=>''
            +'<div class="card-sm" style="margin-bottom:10px">'
              +'<div style="display:flex;align-items:flex-start;justify-content:space-between;gap:10px">'
                +'<div>'
                  +'<div style="font-size:13px;font-weight:700;color:var(--navy)">'+esc(request.name||inferNameFromEmail(request.email)||request.email||'')+'</div>'
                  +'<div style="font-size:11px;color:var(--text3);margin-top:3px">'+esc(request.email||'')+'</div>'
                  +'<div style="font-size:11px;color:var(--text3);margin-top:5px">처리 권한: '+getRoleLabel(request.reviewed_role||request.requested_role||'observer')+' · '+esc(formatPendingDate(request.reviewed_at||request.created_at))+'</div>'
                +'</div>'
                +accessStatusBadge(request.status)
              +'</div>'
              +(request.note?'<div style="font-size:12px;color:var(--text2);line-height:1.6;margin-top:8px">'+esc(request.note)+'</div>':'')
            +'</div>'
          ).join(''):'<div style="font-size:12px;color:var(--text3);padding:12px 0">처리 이력이 없습니다.</div>')
        +'</div>'
        +'<div class="modal-footer"><div></div><div class="modal-footer-right"><button class="btn ghost" onclick="closeModal()">닫기</button></div></div>'
      +'</div>'
    +'</div>';
  if(targetRequestId)focusTargetElement('access-request-'+targetRequestId);
}

async function approveAccessRequest(requestId){
  const request=accessRequests.find(row=>row.id===requestId);
  if(!request)return;
  const role=document.getElementById('access-role-'+requestId)?.value||'observer';
  const name=(document.getElementById('access-name-'+requestId)?.value||'').trim()||request.name||inferNameFromEmail(request.email);
  const reviewedAt=new Date().toISOString();
  try{
    const existingMembers=await api('GET','members?email=eq.'+encodeURIComponent(request.email)+'&select=id,email,name,auth_user_id').catch(()=>[]);
    if(existingMembers?.length){
      await api('PATCH','members?id=eq.'+existingMembers[0].id,{name,email:request.email,auth_user_id:request.user_id,role:getAdminStoredMemberRoleValue(role)});
    }else{
      await api('POST','members',{
        name,
        email:request.email,
        auth_user_id:request.user_id,
        role:getAdminStoredMemberRoleValue(role)
      });
    }
    const existingRoles=await api('GET','user_roles?id=eq.'+request.user_id+'&select=id').catch(()=>[]);
    const roleBody={
      id:request.user_id,
      role,
      is_admin:role==='admin',
      approved_by:currentUser.id,
      approved_at:reviewedAt
    };
    if(existingRoles?.length)await api('PATCH','user_roles?id=eq.'+request.user_id,roleBody);
    else await apiEx('POST','user_roles',roleBody,'return=representation');
    await api('PATCH','access_requests?id=eq.'+requestId,{
      name,
      status:'approved',
      reviewed_role:role,
      reviewed_by:currentUser.id,
      reviewed_at:reviewedAt,
      updated_at:reviewedAt
    });
    await createNotification(request.user_id,'access_approved','접근 권한 요청이 승인되었습니다. ('+getRoleLabel(role)+')','access_request',requestId);
    await loadAll();
    await loadAdminManagementData();
    await openAccessRequestManager(requestId);
  }catch(e){
    alert('승인 처리 오류: '+e.message);
  }
}

async function rejectAccessRequest(requestId){
  const request=accessRequests.find(row=>row.id===requestId);
  if(!request)return;
  if(!confirm('이 요청을 반려할까요?'))return;
  try{
    const reviewedAt=new Date().toISOString();
    await api('PATCH','access_requests?id=eq.'+requestId,{
      status:'rejected',
      reviewed_role:null,
      reviewed_by:currentUser.id,
      reviewed_at:reviewedAt,
      updated_at:reviewedAt
    });
    await createNotification(request.user_id,'access_rejected','접근 권한 요청이 반려되었습니다. 내용을 보완해 다시 요청해 주세요.','access_request',requestId);
    await loadAdminManagementData();
    await openAccessRequestManager(requestId);
  }catch(e){
    alert('반려 처리 오류: '+e.message);
  }
}

function getAdminRoleRowMap(){
  return new Map((adminUserRoleRows||[]).map(roleRow=>[String(roleRow?.id||''),roleRow]));
}

function getAdminMemberPermissionValue(member,roleRow){
  if(roleRow?.role)return normalizeMemberPermissionLevel(roleRow.role);
  if(roleRow?.is_admin===true)return 'admin';
  if(member?.role)return normalizeMemberPermissionLevel(member.role);
  if(member?.auth_user_id)return 'observer';
  return '';
}

function getAdminMemberPermissionLabel(member,roleRow){
  const permission=getAdminMemberPermissionValue(member,roleRow);
  return permission?getMemberPermissionLabel(permission):'미연결';
}

function getAdminManagedMembers(){
  const roleMap=getAdminRoleRowMap();
  return (members||[]).map(member=>{
    const authUserId=String(member?.auth_user_id||'').trim();
    const roleRow=authUserId?roleMap.get(authUserId)||null:null;
    const permission=getAdminMemberPermissionValue(member,roleRow);
    const isActiveNow=isMemberActive(member);
    const operationalIncluded=isMemberOperationallyIncluded(member,{activeOnly:false});
    const team=getMemberTeamLabel(member?.team);
    const rank=getMemberRankLabel(member?.rank);
    const note=String(member?.note||'').trim();
    const isSystemAccount=isSystemAccountMember(member);
    return {
      id:String(member?.id||''),
      name:String(member?.name||'').trim()||'이름 없음',
      email:String(member?.email||'').trim(),
      authUserId,
      isActive:isActiveNow,
      permission,
      permissionLabel:getAdminMemberPermissionLabel(member,roleRow),
      team,
      rank,
      operationalIncluded,
      note,
      isSystemAccount,
      roleRow
    };
  }).sort((a,b)=>{
    const inclusionDiff=Number(b.operationalIncluded)-Number(a.operationalIncluded);
    if(inclusionDiff)return inclusionDiff;
    const activeDiff=Number(b.isActive)-Number(a.isActive);
    if(activeDiff)return activeDiff;
    const systemDiff=Number(a.isSystemAccount)-Number(b.isSystemAccount);
    if(systemDiff)return systemDiff;
    return a.name.localeCompare(b.name,'ko');
  });
}

function getAdminTeamsInUse(users){
  return [...new Set((users||[]).map(user=>user.team).filter(label=>label&&label!=='미지정'))].sort((a,b)=>a.localeCompare(b,'ko'));
}

function getAdminRanksInUse(users){
  return [...new Set((users||[]).map(user=>user.rank).filter(label=>label&&label!=='미지정'))].sort((a,b)=>a.localeCompare(b,'ko'));
}

function getAdminFilteredMembers(users){
  const filters=adminManagementFilters||{};
  const query=String(filters.search||'').trim().toLowerCase();
  return (users||[]).filter(user=>{
    if(query){
      const haystack=[
        user.name,
        user.email,
        user.permissionLabel,
        user.team,
        user.rank,
        user.note
      ].join(' ').toLowerCase();
      if(!haystack.includes(query))return false;
    }
    if(filters.permission&&filters.permission!=='all'){
      if(filters.permission==='unlinked'){
        if(user.authUserId)return false;
      }else if(user.permission!==filters.permission){
        return false;
      }
    }
    if(filters.team&&filters.team!=='all'&&user.team!==filters.team)return false;
    if(filters.rank&&filters.rank!=='all'&&user.rank!==filters.rank)return false;
    if(filters.inclusion&&filters.inclusion!=='all'){
      if(filters.inclusion==='included'&&!user.operationalIncluded)return false;
      if(filters.inclusion==='excluded'&&user.operationalIncluded)return false;
    }
    if(filters.status&&filters.status!=='all'){
      if(filters.status==='active'&&!user.isActive)return false;
      if(filters.status==='inactive'&&user.isActive)return false;
    }
    return true;
  });
}

function setAdminManagementFilter(key,value){
  adminManagementFilters={
    ...adminManagementFilters,
    [key]:value
  };
  renderAdminPageContent();
}

function getAdminInitial(name){
  return String(name||'?').trim().charAt(0).toUpperCase()||'?';
}

function renderAdminSummaryCards(users){
  const totalCount=(users||[]).length;
  const activeCount=(users||[]).filter(user=>user.isActive).length;
  const includedCount=(users||[]).filter(user=>user.isActive&&user.operationalIncluded).length;
  const excludedCount=(users||[]).filter(user=>user.isSystemAccount||!user.operationalIncluded).length;
  const teamCount=getAdminTeamsInUse(users).length;
  return ''
    +'<div class="admin-summary-grid">'
      +'<div class="admin-summary-card"><div class="admin-summary-label">전체 사용자</div><div class="admin-summary-value">'+totalCount+'</div><div class="admin-summary-sub">멤버 테이블 기준</div></div>'
      +'<div class="admin-summary-card"><div class="admin-summary-label">활성 사용자</div><div class="admin-summary-value">'+activeCount+'</div><div class="admin-summary-sub">로그인/운영 대상 상태</div></div>'
      +'<div class="admin-summary-card"><div class="admin-summary-label">운영 집계 포함</div><div class="admin-summary-value">'+includedCount+'</div><div class="admin-summary-sub">Home · Weekly Review · 일정 집계 기준</div></div>'
      +'<div class="admin-summary-card is-attention"><div class="admin-summary-label">시스템/운영 제외</div><div class="admin-summary-value">'+excludedCount+'</div><div class="admin-summary-sub">집계 제외 또는 System 팀</div></div>'
      +'<div class="admin-summary-card"><div class="admin-summary-label">등록 팀</div><div class="admin-summary-value">'+teamCount+'</div><div class="admin-summary-sub">조직 구분 수</div></div>'
    +'</div>';
}

function renderAdminFilterToolbar(users){
  const teamOptions=[...new Set(MEMBER_TEAM_OPTIONS.concat(getAdminTeamsInUse(users)))];
  const rankOptions=[...new Set(MEMBER_RANK_OPTIONS.concat(getAdminRanksInUse(users)))];
  return ''
    +'<div class="card admin-toolbar-card">'
      +'<div class="admin-toolbar-head">'
        +'<div><div class="admin-toolbar-title">사용자 관리</div><div class="admin-toolbar-sub">권한, 팀, 직급, 운영 집계 포함 여부를 분리해 관리합니다.</div></div>'
        +'<div style="display:flex;gap:8px;flex-wrap:wrap">'
          +'<button class="btn sm" onclick="openAccessRequestManager()">권한 요청</button>'
          +'<button class="btn sm" onclick="openPortalManager()">포털 관리</button>'
        +'</div>'
      +'</div>'
      +'<div class="admin-filter-grid">'
        +'<input type="search" value="'+esc(adminManagementFilters.search||'')+'" placeholder="이름, 이메일, 팀, 직급, 비고 검색" oninput="setAdminManagementFilter(\'search\',this.value)">'
        +'<select onchange="setAdminManagementFilter(\'permission\',this.value)">'
          +'<option value="all"'+(adminManagementFilters.permission==='all'?' selected':'')+'>권한 전체</option>'
          +'<option value="admin"'+(adminManagementFilters.permission==='admin'?' selected':'')+'>관리자</option>'
          +'<option value="manager"'+(adminManagementFilters.permission==='manager'?' selected':'')+'>매니저</option>'
          +'<option value="member"'+(adminManagementFilters.permission==='member'?' selected':'')+'>멤버</option>'
          +'<option value="observer"'+(adminManagementFilters.permission==='observer'?' selected':'')+'>Observer</option>'
          +'<option value="unlinked"'+(adminManagementFilters.permission==='unlinked'?' selected':'')+'>권한 미연결</option>'
        +'</select>'
        +'<select onchange="setAdminManagementFilter(\'team\',this.value)">'
          +'<option value="all"'+(adminManagementFilters.team==='all'?' selected':'')+'>팀 전체</option>'
          +teamOptions.map(team=>'<option value="'+esc(team)+'"'+(adminManagementFilters.team===team?' selected':'')+'>'+esc(team)+'</option>').join('')
        +'</select>'
        +'<select onchange="setAdminManagementFilter(\'rank\',this.value)">'
          +'<option value="all"'+(adminManagementFilters.rank==='all'?' selected':'')+'>직급 전체</option>'
          +rankOptions.map(rank=>'<option value="'+esc(rank)+'"'+(adminManagementFilters.rank===rank?' selected':'')+'>'+esc(rank)+'</option>').join('')
        +'</select>'
        +'<select onchange="setAdminManagementFilter(\'inclusion\',this.value)">'
          +'<option value="all"'+(adminManagementFilters.inclusion==='all'?' selected':'')+'>운영 집계 전체</option>'
          +'<option value="included"'+(adminManagementFilters.inclusion==='included'?' selected':'')+'>운영 집계 포함</option>'
          +'<option value="excluded"'+(adminManagementFilters.inclusion==='excluded'?' selected':'')+'>운영 집계 제외</option>'
        +'</select>'
        +'<select onchange="setAdminManagementFilter(\'status\',this.value)">'
          +'<option value="all"'+(adminManagementFilters.status==='all'?' selected':'')+'>상태 전체</option>'
          +'<option value="active"'+(adminManagementFilters.status==='active'?' selected':'')+'>활성</option>'
          +'<option value="inactive"'+(adminManagementFilters.status==='inactive'?' selected':'')+'>비활성</option>'
        +'</select>'
      +'</div>'
    +'</div>';
}

function getAdminActiveBadge(isActiveNow){
  return isActiveNow
    ? '<span class="badge badge-green">활성</span>'
    : '<span class="badge badge-gray">비활성</span>';
}

function getAdminOperationalBadge(included){
  return included
    ? '<span class="badge badge-green">포함</span>'
    : '<span class="badge badge-gray">제외</span>';
}

function getAdminPermissionBadge(user){
  if(!user.authUserId)return '<span class="admin-meta-pill is-muted">계정 미연결</span>';
  return '<span class="admin-meta-pill">'+esc(user.permissionLabel)+'</span>';
}

function renderAdminUserRow(user){
  const noteText=user.note||'비고 없음';
  const identityMeta=[];
  if(user.isSystemAccount)identityMeta.push('<span class="admin-meta-pill is-muted">시스템 계정</span>');
  if(!user.operationalIncluded)identityMeta.push('<span class="admin-meta-pill is-muted">운영 집계 제외</span>');
  if(!user.authUserId)identityMeta.push('<span class="admin-meta-pill is-muted">로그인 계정 미연결</span>');
  return ''
    +'<div class="admin-table-row">'
      +'<div class="admin-user-cell">'
        +'<div class="admin-user-main">'
          +'<div class="admin-user-avatar">'+esc(getAdminInitial(user.name))+'</div>'
          +'<div class="admin-user-copy">'
            +'<div class="admin-user-name">'+esc(user.name)+'</div>'
            +'<div class="admin-user-email">'+esc(user.email||'이메일 미등록')+'</div>'
            +(identityMeta.length?'<div class="admin-user-meta">'+identityMeta.join('')+'</div>':'')
          +'</div>'
        +'</div>'
      +'</div>'
      +'<div data-label="상태">'+getAdminActiveBadge(user.isActive)+'</div>'
      +'<div data-label="권한">'+getAdminPermissionBadge(user)+'</div>'
      +'<div data-label="팀"><div class="admin-table-value">'+esc(user.team)+'</div></div>'
      +'<div data-label="직급"><div class="admin-table-value">'+esc(user.rank)+'</div></div>'
      +'<div data-label="운영 집계">'+getAdminOperationalBadge(user.operationalIncluded)+'</div>'
      +'<div data-label="비고"><div class="admin-note-text'+(user.note?'':' is-muted')+'">'+esc(noteText)+'</div></div>'
      +'<div data-label="관리"><button class="btn sm" onclick="openAdminUserEditor(\''+user.id+'\')">편집</button></div>'
    +'</div>';
}

function renderAdminUserTable(users){
  const filteredUsers=getAdminFilteredMembers(users);
  return ''
    +'<div class="card admin-table-card">'
      +'<div class="admin-toolbar-head" style="margin-bottom:14px">'
        +'<div><div class="admin-toolbar-title">사용자 관리 테이블</div><div class="admin-toolbar-sub">권한은 시스템 접근 기준, 팀/직급은 조직 기준, 운영 집계 포함은 대시보드 반영 기준입니다.</div></div>'
        +'<div class="admin-meta-pill">'+filteredUsers.length+'명 표시</div>'
      +'</div>'
      +'<div class="admin-table-head">'
        +'<div>사용자</div>'
        +'<div>상태</div>'
        +'<div>권한</div>'
        +'<div>팀</div>'
        +'<div>직급</div>'
        +'<div>운영 집계</div>'
        +'<div>비고</div>'
        +'<div>관리</div>'
      +'</div>'
      +(filteredUsers.length
        ? filteredUsers.map(renderAdminUserRow).join('')
        : '<div class="admin-table-empty">현재 필터 조건에 맞는 사용자가 없습니다.</div>')
    +'</div>';
}

function renderAdminSupportCards(users){
  const pending=(accessRequests||[]).filter(request=>request.status==='pending');
  const pendingPreview=pending.slice(0,4).map(request=>''
    +'<div class="admin-support-item">'
      +'<div class="admin-support-item-title">'+esc(request.name||inferNameFromEmail(request.email)||request.email||'요청자')+'</div>'
      +'<div class="admin-support-item-meta">'+getRequestedRoleLabel(request.requested_role||'observer')+' · '+esc(formatPendingDate(request.created_at))+'</div>'
    +'</div>'
  ).join('')||'<div class="ui-empty-copy">확인 대기 중인 요청이 없습니다.</div>';
  const activePortals=(clients||[]).filter(client=>client.portal_email);
  const portalPreview=activePortals.slice(0,4).map(client=>{
    const assigned=getAssignedMemberNames(client.id);
    return ''
      +'<div class="admin-support-item">'
        +'<div class="admin-support-item-title">'+esc(client.name)+'</div>'
        +'<div class="admin-support-item-meta">'+esc(client.portal_email||'포털 미설정')+(assigned.length?' · 담당 '+esc(assigned.join(', ')):' · 담당 미배정')+'</div>'
      +'</div>';
  }).join('')||'<div class="ui-empty-copy">활성 포털 계정이 없습니다.</div>';
  const operationalGuide=[
    '권한은 시스템에서 할 수 있는 행동을 의미합니다.',
    '팀과 직급은 내부 조직 구조를 의미합니다.',
    '운영 집계 포함 여부는 Home · Weekly Review · 팀 일정 집계에만 영향을 줍니다.',
    'System 팀 계정은 운영 집계 제외와 함께 관리하는 것이 안전합니다.'
  ].map(text=>'<div class="admin-support-item"><div class="admin-support-item-meta" style="margin-top:0">'+esc(text)+'</div></div>').join('');
  return ''
    +'<div class="admin-support-grid">'
      +'<div class="card admin-support-card">'
        +'<div class="admin-support-head">'
          +'<div><div class="admin-support-title">권한 요청</div><div class="admin-support-sub">신규 가입자의 접근 권한을 승인하거나 반려합니다.</div></div>'
          +accessStatusBadge(pending.length?'pending':'approved')
        +'</div>'
        +'<div class="admin-support-list">'+pendingPreview+'</div>'
        +'<div class="ui-card-actions"><button class="btn primary sm" onclick="openAccessRequestManager()">권한 요청 관리</button></div>'
      +'</div>'
      +'<div class="card admin-support-card">'
        +'<div class="admin-support-head">'
          +'<div><div class="admin-support-title">고객사 포털 관리</div><div class="admin-support-sub">포털 계정과 담당자 연결 상태를 함께 확인합니다.</div></div>'
          +'<span class="admin-meta-pill">'+activePortals.length+'개</span>'
        +'</div>'
        +'<div class="admin-support-list">'+portalPreview+'</div>'
        +'<div class="ui-card-actions-row"><button class="btn primary sm" onclick="openPortalManager()">포털 관리</button><button class="btn sm" onclick="openActivityLog()">활동 로그</button></div>'
      +'</div>'
      +'<div class="card admin-support-card">'
        +'<div class="admin-support-head">'
          +'<div><div class="admin-support-title">운영 구조 기준</div><div class="admin-support-sub">권한, 팀, 직급, 운영 집계 기준을 분리해 관리합니다.</div></div>'
          +'<span class="admin-meta-pill">'+users.filter(user=>!user.operationalIncluded).length+'명 제외</span>'
        +'</div>'
        +'<div class="admin-support-list">'+operationalGuide+'</div>'
      +'</div>'
    +'</div>';
}

function renderAdminPageContent(){
  const el=document.getElementById('pageAdmin');
  if(!el)return;
  if(!roleIsAdmin()){
    el.innerHTML='<div class="card"><div class="ui-admin-gate-title">관리자 전용</div><div class="ui-page-desc">이 화면은 관리자만 볼 수 있습니다.</div></div>';
    return;
  }
  const users=getAdminManagedMembers();
  el.innerHTML=''
    +'<div class="admin-page-head">'
      +'<div class="admin-page-title-wrap">'
        +'<div class="admin-page-title">Management</div>'
        +'<div class="admin-page-sub">사용자 권한, 팀, 직급, 운영 집계 포함 여부를 분리해 관리하는 내부 운영 기준 화면입니다.</div>'
      +'</div>'
    +'</div>'
    +renderAdminSummaryCards(users)
    +renderAdminFilterToolbar(users)
    +renderAdminUserTable(users)
    +renderAdminSupportCards(users);
}

async function loadAdminManagementData(){
  const [requests,assignments,roleRows]=await Promise.all([
    api('GET','access_requests?select=*&order=status.asc,created_at.desc').catch(()=>accessRequests||[]),
    api('GET','client_assignments?select=*').catch(()=>clientAssignments||[]),
    api('GET','user_roles?select=id,role,is_admin,approved_at,approved_by').catch(()=>adminUserRoleRows||[])
  ]);
  accessRequests=requests||[];
  clientAssignments=assignments||[];
  adminUserRoleRows=roleRows||[];
}

async function renderAdminPage(){
  const el=document.getElementById('pageAdmin');
  if(!el)return;
  if(!roleIsAdmin()){
    renderAdminPageContent();
    return;
  }
  el.innerHTML='<div class="card"><div class="ui-loading-card">불러오는 중...</div></div>';
  try{
    await loadAdminManagementData();
  }catch(e){}
  renderAdminPageContent();
}

function getAdminModalSelectOptions(options,selected,emptyLabel){
  const base=emptyLabel?'<option value="">'+esc(emptyLabel)+'</option>':'';
  return base+(options||[]).map(option=>'<option value="'+esc(option)+'"'+(selected===option?' selected':'')+'>'+esc(option)+'</option>').join('');
}

function openAdminUserEditor(memberId){
  if(!roleIsAdmin())return;
  const member=(members||[]).find(row=>String(row?.id||'')===String(memberId||''));
  if(!member)return;
  const roleRow=(adminUserRoleRows||[]).find(row=>String(row?.id||'')===String(member?.auth_user_id||''))||null;
  const permission=getAdminMemberPermissionValue(member,roleRow)||'observer';
  const authLinked=!!String(member?.auth_user_id||'').trim();
  const profileSupport={
    is_active:adminMemberSupportsColumn(member,'is_active'),
    team:adminMemberSupportsColumn(member,'team'),
    rank:adminMemberSupportsColumn(member,'rank'),
    include_in_operational_dashboards:adminMemberSupportsOperationalInclusion(member),
    note:adminMemberSupportsColumn(member,'note')
  };
  const missingProfileColumns=getAdminMissingMemberColumns(member);
  const missingProfileLabel=getAdminMissingMemberColumnsLabel(missingProfileColumns);
  const operationalInclusionSupported=adminMemberSupportsOperationalInclusion(member);
  const inclusionNote=!authLinked
    ?'로그인 계정이 연결되지 않은 멤버 행은 권한을 바로 부여할 수 없습니다. 먼저 회원가입/권한 요청을 통해 auth 계정을 연결해 주세요.'
    :missingProfileColumns.length
      ?getAdminMembersSchemaMessage(missingProfileColumns)
      :'권한은 시스템 접근 수준, 팀과 직급은 조직 구조, 운영 집계 포함 여부는 대시보드 반영 기준입니다.';
  document.getElementById('modalArea').innerHTML=''
    +getInputModalOverlayHtml()
    +'<div class="modal" style="width:560px">'
      +'<div class="modal-title">사용자 관리 수정</div>'
      +'<div class="form-half">'
        +'<div class="form-row"><label class="form-label">이름</label><input id="adminUserName" value="'+esc(member?.name||'')+'" placeholder="이름"></div>'
        +'<div class="form-row"><label class="form-label">이메일</label><input id="adminUserEmail" value="'+esc(member?.email||'')+'" placeholder="name@bexleyintl.com"></div>'
      +'</div>'
      +'<div class="form-half">'
        +'<div class="form-row"><label class="form-label">상태</label><select id="adminUserActive"'+(profileSupport.is_active?'':' disabled')+'><option value="true"'+(isMemberActive(member)?' selected':'')+'>활성</option><option value="false"'+(!isMemberActive(member)?' selected':'')+'>비활성</option></select></div>'
        +'<div class="form-row"><label class="form-label">권한</label><select id="adminUserPermission" '+(authLinked?'':'disabled')+'>'+accessRoleSelectOptions(permission)+'</select></div>'
      +'</div>'
      +'<div class="form-half">'
        +'<div class="form-row"><label class="form-label">팀</label><select id="adminUserTeam"'+(profileSupport.team?'':' disabled')+'>'+getAdminModalSelectOptions(MEMBER_TEAM_OPTIONS,normalizeMemberTeam(member?.team),'미지정')+'</select></div>'
        +'<div class="form-row"><label class="form-label">직급</label><select id="adminUserRank"'+(profileSupport.rank?'':' disabled')+'>'+getAdminModalSelectOptions(MEMBER_RANK_OPTIONS,normalizeMemberRank(member?.rank),'미지정')+'</select></div>'
      +'</div>'
      +'<div class="form-half">'
        +'<div class="form-row"><label class="form-label">운영 집계 포함 여부</label><select id="adminUserInclusion"'+(operationalInclusionSupported?'':' disabled')+'><option value="true"'+(isMemberOperationallyIncluded(member,{activeOnly:false})?' selected':'')+'>포함</option><option value="false"'+(!isMemberOperationallyIncluded(member,{activeOnly:false})?' selected':'')+'>제외</option></select></div>'
        +'<div class="form-row"><label class="form-label">비고</label><input id="adminUserNote" value="'+esc(member?.note||'')+'" placeholder="시스템 계정, 테스트 계정, 예외 사유 등을 기록"'+(profileSupport.note?'':' disabled')+'></div>'
      +'</div>'
      +'<div class="admin-user-modal-link">계정 연결: '+(authLinked?esc(member.auth_user_id):'로그인 계정 미연결')+'</div>'
      +'<div class="admin-user-modal-note">'+esc(inclusionNote)+'</div>'
      +(missingProfileColumns.length
        ?'<div class="admin-user-modal-note" style="margin-top:8px">현재 DB 스키마에서 바로 수정할 수 없는 항목: '+esc(missingProfileLabel)+'. Supabase에서 '+ADMIN_MEMBER_PROFILE_SCHEMA_SQL+' 적용이 필요합니다.</div>'
        :'')
      +'<div class="modal-footer"><div></div><div class="modal-footer-right"><button class="btn ghost" onclick="closeModal()">취소</button><button class="btn primary" onclick="saveAdminUserProfile(\''+member.id+'\')">저장</button></div></div>'
    +'</div>';
}

async function saveAdminUserProfile(memberId){
  if(!roleIsAdmin())return;
  const member=(members||[]).find(row=>String(row?.id||'')===String(memberId||''));
  if(!member)return;
  const roleRow=(adminUserRoleRows||[]).find(row=>String(row?.id||'')===String(member?.auth_user_id||''))||null;
  const name=(document.getElementById('adminUserName')?.value||'').trim();
  const email=(document.getElementById('adminUserEmail')?.value||'').trim();
  const isActiveNow=(document.getElementById('adminUserActive')?.value||'true')==='true';
  const permission=document.getElementById('adminUserPermission')?.value||getAdminMemberPermissionValue(member);
  const team=(document.getElementById('adminUserTeam')?.value||'').trim();
  const rank=(document.getElementById('adminUserRank')?.value||'').trim();
  const included=(document.getElementById('adminUserInclusion')?.value||'true')==='true';
  const note=(document.getElementById('adminUserNote')?.value||'').trim();
  const currentPermission=getAdminMemberPermissionValue(member,roleRow)||'observer';
  const permissionChanged=normalizeMemberPermissionLevel(permission)!==normalizeMemberPermissionLevel(currentPermission);
  const nameChanged=name!==String(member?.name||'').trim();
  const emailChanged=email!==String(member?.email||'').trim();
  const activeChanged=isActiveNow!==isMemberActive(member);
  const teamChanged=normalizeMemberTeam(team)!==normalizeMemberTeam(member?.team);
  const rankChanged=normalizeMemberRank(rank)!==normalizeMemberRank(member?.rank);
  const inclusionChanged=included!==isMemberOperationallyIncluded(member,{activeOnly:false});
  const noteChanged=note!==String(member?.note||'').trim();
  if(!name){
    alert('이름을 입력해 주세요.');
    return;
  }
  try{
    const missingColumnsToPersist=[];
    if(!adminMemberSupportsColumn(member,'is_active')&&activeChanged){
      missingColumnsToPersist.push('is_active');
    }
    if(!adminMemberSupportsColumn(member,'role')&&permissionChanged){
      missingColumnsToPersist.push('role');
    }
    if(!adminMemberSupportsColumn(member,'team')&&teamChanged){
      missingColumnsToPersist.push('team');
    }
    if(!adminMemberSupportsColumn(member,'rank')&&rankChanged){
      missingColumnsToPersist.push('rank');
    }
    if(!adminMemberSupportsOperationalInclusion(member)&&inclusionChanged){
      missingColumnsToPersist.push(ADMIN_OPERATIONAL_INCLUSION_COLUMN);
    }
    if(!adminMemberSupportsColumn(member,'note')&&noteChanged){
      missingColumnsToPersist.push('note');
    }
    if(missingColumnsToPersist.length){
      throw new Error(getAdminMembersSchemaMessage(missingColumnsToPersist));
    }
    const memberBody={};
    if(nameChanged){
      memberBody.name=name;
    }
    if(emailChanged){
      memberBody.email=email||null;
    }
    if(adminMemberSupportsColumn(member,'is_active')&&activeChanged){
      memberBody.is_active=isActiveNow;
    }
    if(adminMemberSupportsColumn(member,'role')&&permissionChanged){
      memberBody.role=getAdminStoredMemberRoleValue(permission);
    }
    if(adminMemberSupportsColumn(member,'team')&&teamChanged){
      memberBody.team=team||null;
    }
    if(adminMemberSupportsColumn(member,'rank')&&rankChanged){
      memberBody.rank=rank||null;
    }
    if(adminMemberSupportsColumn(member,'note')&&noteChanged){
      memberBody.note=note||null;
    }
    if(adminMemberSupportsOperationalInclusion(member)&&inclusionChanged){
      memberBody[ADMIN_OPERATIONAL_INCLUSION_COLUMN]=included;
    }
    if(Object.keys(memberBody).length){
      try{
        await api('PATCH','members?id=eq.'+memberId,memberBody);
      }catch(error){
        if(isAdminMembersSchemaError(error)){
          const missingColumn=getAdminMembersSchemaColumnFromError(error);
          throw new Error(getAdminMembersSchemaMessage(missingColumn?[missingColumn]:getAdminMissingMemberColumns(member)));
        }
        throw error;
      }
    }
    const authUserId=String(member?.auth_user_id||'').trim();
    if(authUserId&&permissionChanged){
      const body={
        id:authUserId,
        role:permission||'observer',
        is_admin:(permission||'observer')==='admin',
        approved_by:currentUser?.id||null,
        approved_at:roleRow?.approved_at||new Date().toISOString()
      };
      if(roleRow){
        await api('PATCH','user_roles?id=eq.'+authUserId,body);
      }else{
        await apiEx('POST','user_roles',body,'return=representation');
      }
    }
    const localMemberPatch={};
    if(nameChanged)localMemberPatch.name=name;
    if(emailChanged)localMemberPatch.email=email||null;
    if(adminMemberSupportsColumn(member,'is_active')&&activeChanged)localMemberPatch.is_active=isActiveNow;
    if(adminMemberSupportsColumn(member,'role')&&permissionChanged)localMemberPatch.role=getAdminStoredMemberRoleValue(permission);
    if(adminMemberSupportsColumn(member,'team')&&teamChanged)localMemberPatch.team=team||null;
    if(adminMemberSupportsColumn(member,'rank')&&rankChanged)localMemberPatch.rank=rank||null;
    if(adminMemberSupportsColumn(member,'note')&&noteChanged)localMemberPatch.note=note||null;
    if(adminMemberSupportsOperationalInclusion(member)&&inclusionChanged)localMemberPatch[ADMIN_OPERATIONAL_INCLUSION_COLUMN]=included;
    const localRolePatch=authUserId&&permissionChanged
      ?{
        id:authUserId,
        role:permission||'observer',
        is_admin:(permission||'observer')==='admin',
        approved_by:currentUser?.id||null,
        approved_at:roleRow?.approved_at||new Date().toISOString()
      }
      :null;
    applyAdminMemberLocalUpdate(memberId,localMemberPatch,localRolePatch);
    closeModal();
    renderAdminPageContent();
    refreshAdminManagementViewSoon();
  }catch(e){
    alert('저장 오류: '+e.message);
  }
}

async function openPortalManager(){
  if(!canManagePortalSettings())return;
  const el=document.getElementById('modalArea');
  el.innerHTML='<div class="overlay" onclick="if(event.target===this)closeModal()">'
    +'<div class="modal" style="width:680px"><div class="modal-title">고객사 포털 관리</div>'
    +'<div id="portalManagerBody"><div style="color:var(--text3);text-align:center;padding:20px">불러오는 중...</div></div>'
    +'<div class="modal-footer"><div></div><div class="modal-footer-right"><button class="btn ghost" onclick="closeModal()">닫기</button></div></div>'
    +'</div></div>';
  try{
    clientAssignments=await api('GET','client_assignments?select=*')||[];
  }catch(e){}
  renderPortalManagerBody();
}

function renderPortalManagerBody(){
  const el=document.getElementById('portalManagerBody');
  if(!el)return;
  const sorted=[...(clients||[])].sort((a,b)=>String(a?.name||'').localeCompare(String(b?.name||''),'ko'));
  const withPortal=sorted.filter(client=>client.portal_email);
  const withoutPortal=sorted.filter(client=>!client.portal_email);
  const activeMembers=getActiveMembers().filter(member=>!isSystemAccountMember(member));
  const assignedNames=clientId=>{
    const assigned=(clientAssignments||[]).filter(row=>row.client_id===clientId);
    return assigned.map(row=>members.find(member=>member.id===row.member_id)?.name||'?').filter(Boolean);
  };
  let html='<div style="font-size:12px;color:var(--text3);margin-bottom:12px">'
    +'고객사 포털 활성: <strong style="color:var(--green)">'+withPortal.length+'개사</strong> · 미설정 <strong>'+withoutPortal.length+'개사</strong>'
    +'</div>';
  if(withPortal.length){
    html+='<div style="font-size:11px;font-weight:700;color:var(--text3);letter-spacing:.3px;text-transform:uppercase;margin-bottom:8px">활성 계정</div>';
    html+=withPortal.map(client=>{
      const names=assignedNames(client.id);
      return ''
        +'<div style="padding:12px;background:var(--bg);border-radius:var(--radius-sm);margin-bottom:8px;border:1px solid var(--border)">'
          +'<div style="display:flex;align-items:center;gap:10px;margin-bottom:8px">'
            +'<div style="width:32px;height:32px;border-radius:8px;background:var(--navy);color:#fff;font-size:13px;font-weight:800;display:flex;align-items:center;justify-content:center;flex-shrink:0">'+esc(getAdminInitial(client.name))+'</div>'
            +'<div style="flex:1;min-width:0">'
              +'<div style="font-size:13px;font-weight:700;color:var(--navy)">'+esc(client.name)+'</div>'
              +'<div style="font-size:11px;color:var(--text3);margin-top:1px">'+esc(client.portal_email)+'</div>'
            +'</div>'
            +'<div style="display:flex;gap:6px;flex-shrink:0">'
              +'<button class="btn primary sm" style="font-size:11px" onclick="openPortalAsClient(\''+client.id+'\')">포털 보기</button>'
              +'<button class="btn sm" style="font-size:11px" onclick="openPortalAccountEdit(\''+client.id+'\')">수정</button>'
              +'<button class="btn ghost sm" style="font-size:11px" onclick="resetPortalAccount(\''+client.id+'\',\''+esc(client.name)+'\')">초기화</button>'
            +'</div>'
          +'</div>'
          +'<div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap">'
            +'<span style="font-size:11px;color:var(--text3);font-weight:600">담당</span>'
            +(names.length?names.map(name=>'<span style="font-size:11px;background:var(--bg2);color:var(--text2);padding:2px 8px;border-radius:10px;font-weight:600">'+esc(name)
              +'<button onclick="removeAssignment(\''+client.id+'\',\''+name+'\')" style="margin-left:4px;background:none;border:none;color:var(--text3);cursor:pointer;font-size:11px;padding:0">×</button></span>').join('')
              :'<span style="font-size:11px;color:var(--text3)">미배정</span>')
            +'<select id="assignSel-'+client.id+'" style="font-size:11px;padding:3px 6px;border:1px solid var(--border);border-radius:6px;font-family:inherit">'
              +'<option value="">+ 담당자 추가</option>'
              +activeMembers
                .filter(member=>!(clientAssignments||[]).find(row=>row.client_id===client.id&&row.member_id===member.id))
                .map(member=>'<option value="'+member.id+'">'+esc(member.name)+'</option>').join('')
            +'</select>'
            +'<button class="btn sm" style="font-size:11px" onclick="addAssignment(\''+client.id+'\')">추가</button>'
          +'</div>'
        +'</div>';
    }).join('');
  }
  if(withoutPortal.length){
    html+='<div style="font-size:11px;font-weight:700;color:var(--text3);letter-spacing:.3px;text-transform:uppercase;margin:16px 0 8px">미설정 고객사</div>';
    html+=withoutPortal.map(client=>{
      const names=assignedNames(client.id);
      return ''
        +'<div style="display:flex;align-items:center;gap:10px;padding:10px 12px;background:var(--bg);border-radius:var(--radius-sm);margin-bottom:4px">'
          +'<div style="width:32px;height:32px;border-radius:8px;background:var(--bg2);color:var(--text3);font-size:13px;font-weight:800;display:flex;align-items:center;justify-content:center;flex-shrink:0">'+esc(getAdminInitial(client.name))+'</div>'
          +'<div style="flex:1;min-width:0">'
            +'<div style="font-size:13px;color:var(--text2)">'+esc(client.name)+'</div>'
            +(names.length?'<div style="font-size:11px;color:var(--text3)">담당: '+esc(names.join(', '))+'</div>':'')
          +'</div>'
          +'<button class="btn primary sm" style="flex-shrink:0;font-size:11px" onclick="openPortalAccountEdit(\''+client.id+'\')">포털 설정</button>'
        +'</div>';
    }).join('');
  }
  el.innerHTML='<div style="max-height:65vh;overflow-y:auto;padding-right:4px">'+html+'</div>';
}

function openPortalAsClient(clientId){
  const client=(clients||[]).find(row=>row.id===clientId);
  if(!client||!client.portal_email)return;
  previewPortal(clientId);
  closeModal();
}

async function addAssignment(clientId){
  if(!canManagePortalSettings())return;
  const sel=document.getElementById('assignSel-'+clientId);
  const memberId=sel?.value;
  if(!memberId)return;
  try{
    await api('POST','client_assignments',{client_id:clientId,member_id:memberId,assigned_by:currentUser.id});
    clientAssignments=await api('GET','client_assignments?select=*')||[];
    renderPortalManagerBody();
  }catch(e){
    alert('오류: '+e.message);
  }
}

async function removeAssignment(clientId,memberName){
  if(!canManagePortalSettings())return;
  const member=(members||[]).find(row=>row.name===memberName);
  if(!member)return;
  const assignment=(clientAssignments||[]).find(row=>row.client_id===clientId&&row.member_id===member.id);
  if(!assignment)return;
  try{
    await api('DELETE','client_assignments?id=eq.'+assignment.id);
    clientAssignments=await api('GET','client_assignments?select=*')||[];
    renderPortalManagerBody();
  }catch(e){
    alert('오류: '+e.message);
  }
}

function openPortalAccountEdit(clientId){
  if(!canManagePortalSettings())return;
  const client=(clients||[]).find(row=>row.id===clientId);
  if(!client)return;
  document.getElementById('modalArea').innerHTML=''
    +getInputModalOverlayHtml()
    +'<div class="modal" style="width:440px">'
      +'<div class="modal-title">고객사 포털 설정 — '+esc(client.name)+'</div>'
      +'<div class="form-row"><label class="form-label">로그인 이메일</label><input id="peEmail" type="email" value="'+esc(client.portal_email||'')+'" placeholder="고객사 포털 로그인 이메일"></div>'
      +'<div class="form-row"><label class="form-label">비밀번호</label><input id="pePw" type="text" value="'+esc(client.portal_password||'')+'" placeholder="임시 비밀번호"></div>'
      +'<div class="form-row"><label class="form-label">OneDrive 문서함 URL</label><input id="peOnedrive" value="'+esc(client.onedrive_url||'')+'" placeholder="https://onedrive.live.com/..."></div>'
      +'<div class="modal-footer"><div></div><div class="modal-footer-right"><button class="btn ghost" onclick="openPortalManager()">취소</button><button class="btn primary" onclick="savePortalAccount(\''+client.id+'\')">저장</button></div></div>'
    +'</div>';
  document.getElementById('peEmail').focus();
}

async function savePortalAccount(clientId){
  if(!canManagePortalSettings())return;
  const email=(document.getElementById('peEmail')?.value||'').trim();
  const password=document.getElementById('pePw')?.value||'';
  const onedrive=(document.getElementById('peOnedrive')?.value||'').trim();
  if(!email||!password){
    alert('이메일과 비밀번호를 입력해 주세요.');
    return;
  }
  try{
    await api('PATCH','clients?id=eq.'+clientId,{
      portal_email:email,
      portal_password:password,
      onedrive_url:onedrive||null
    });
    const client=(clients||[]).find(row=>row.id===clientId);
    if(client){
      client.portal_email=email;
      client.portal_password=password;
      client.onedrive_url=onedrive||null;
    }
    openPortalManager();
  }catch(e){
    alert('저장 오류: '+e.message);
  }
}

async function resetPortalAccount(clientId,name){
  if(!canManagePortalSettings())return;
  if(!confirm(name+' 고객사 포털 계정을 초기화할까요?\n로그인이 불가능해집니다.'))return;
  try{
    await api('PATCH','clients?id=eq.'+clientId,{portal_email:null,portal_password:null});
    const client=(clients||[]).find(row=>row.id===clientId);
    if(client){
      client.portal_email=null;
      client.portal_password=null;
    }
    renderPortalManagerBody();
  }catch(e){
    alert('오류: '+e.message);
  }
}

async function openActivityLog(){
  if(!roleIsAdmin())return;
  const el=document.getElementById('modalArea');
  el.innerHTML='<div class="overlay" onclick="if(event.target===this)closeModal()"><div class="modal" style="width:600px"><div class="modal-title">활동 로그</div><div style="color:var(--text3);font-size:13px;padding:20px 0;text-align:center">불러오는 중...</div></div></div>';
  try{
    const logs=await api('GET','activity_logs?select=*&order=created_at.desc&limit=100');
    const rows=(logs||[]).map(log=>''
      +'<div style="display:flex;align-items:flex-start;gap:12px;padding:10px 0;border-bottom:1px solid var(--border)">'
        +'<div style="flex-shrink:0;width:28px;height:28px;border-radius:50%;background:var(--bg2);color:var(--navy);font-size:11px;font-weight:700;display:flex;align-items:center;justify-content:center">'+esc(String(log?.user_name||'?').charAt(0))+'</div>'
        +'<div style="flex:1;min-width:0">'
          +'<div style="font-size:13px;color:var(--navy)"><span style="font-weight:700">'+esc(log?.user_name||'unknown')+'</span> · '+esc(log?.action||'활동')+'</div>'
          +(log?.target_name?'<div style="font-size:12px;color:var(--text3);margin-top:2px">'+esc(log.target_type||'target')+' · '+esc(log.target_name)+'</div>':'')
        +'</div>'
        +'<div style="font-size:11px;color:var(--text3);flex-shrink:0">'+esc(formatCommentDate(log?.created_at||''))+'</div>'
      +'</div>'
    ).join('');
    el.innerHTML='<div class="overlay" onclick="if(event.target===this)closeModal()">'
      +'<div class="modal" style="width:600px"><div class="modal-title">활동 로그</div>'
      +'<div style="max-height:60vh;overflow-y:auto">'+(rows||'<div style="color:var(--text3);text-align:center;padding:20px">활동 로그가 없습니다.</div>')+'</div>'
      +'<div class="modal-footer"><div></div><div class="modal-footer-right"><button class="btn ghost" onclick="closeModal()">닫기</button></div></div>'
      +'</div></div>';
  }catch(e){
    el.innerHTML='<div class="overlay" onclick="if(event.target===this)closeModal()"><div class="modal" style="width:600px"><div class="modal-title">활동 로그</div><div style="color:var(--red);padding:20px">오류: '+esc(e.message)+'</div><div class="modal-footer"><div></div><div class="modal-footer-right"><button class="btn ghost" onclick="closeModal()">닫기</button></div></div></div></div>';
  }
}
