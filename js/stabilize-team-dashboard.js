(function(){
  if(window.__STABILIZE_TEAM_DASHBOARD_LOADED__) return;
  window.__STABILIZE_TEAM_DASHBOARD_LOADED__ = true;

  function assignedToCurrentMember(project){
    if(typeof projectAssignedToCurrentMember === 'function'){
      return projectAssignedToCurrentMember(project);
    }
    return !!(currentMember?.name && Array.isArray(project?.members) && project.members.includes(currentMember.name));
  }

  function getTodayBase(){
    return typeof getHomeBaseDate === 'function' ? getHomeBaseDate() : new Date();
  }

  function getAvailabilityItems(){
    const today = getTodayBase();
    const todayLeave = (schedules || []).filter(function(schedule){
      return schedule.schedule_type === 'leave' && toDate(schedule.start) <= today && toDate(schedule.end) >= today;
    }).length;
    const todayFieldwork = (schedules || []).filter(function(schedule){
      return schedule.schedule_type === 'fieldwork' && toDate(schedule.start) <= today && toDate(schedule.end) >= today;
    }).length;
    return [
      {
        title:'오늘 휴가',
        meta:todayLeave ? (todayLeave + '건의 휴가 일정이 있습니다.') : '오늘 등록된 휴가 일정이 없습니다.',
        badges:['<span class="badge ' + (todayLeave ? 'badge-orange' : 'badge-gray') + '">' + todayLeave + '건</span>'],
        action:"document.getElementById('memberScheduleWrap')?.scrollIntoView({behavior:'smooth',block:'start'})"
      },
      {
        title:'오늘 필드웍',
        meta:todayFieldwork ? (todayFieldwork + '건의 현장 일정이 있습니다.') : '오늘 등록된 필드웍 일정이 없습니다.',
        badges:['<span class="badge ' + (todayFieldwork ? 'badge-blue' : 'badge-gray') + '">' + todayFieldwork + '건</span>'],
        action:"document.getElementById('memberScheduleWrap')?.scrollIntoView({behavior:'smooth',block:'start'})"
      },
      {
        title:'이번 주 일정',
        meta:currentMember?.name ? (currentMember.name + '님의 개인 일정과 팀 일정을 아래에서 확인하세요.') : '아래 일정 섹션에서 팀 스케줄을 확인하세요.',
        badges:['<span class="badge badge-gray">바로가기</span>'],
        action:"document.getElementById('myWeekWrap')?.scrollIntoView({behavior:'smooth',block:'start'})"
      }
    ];
  }

  function myIssueTotal(){
    return (projects || [])
      .filter(function(project){ return assignedToCurrentMember(project); })
      .reduce(function(total, project){
        return total + (openIssuesByProject[project.id] || 0);
      }, 0);
  }

  window.getHomeTodayDueProjects = function(){
    const today = getTodayBase();
    return (projects || []).filter(function(project){
      return project.status !== '완료' && toDate(project.end).getTime() === today.getTime();
    });
  };

  window.getHomeTodayItems = function(limit){
    if(!currentMember) return [];
    const today = getTodayBase();
    const items = [];

    (projects || [])
      .filter(function(project){
        return assignedToCurrentMember(project) &&
          project.status !== '완료' &&
          toDate(project.start) <= today &&
          toDate(project.end) >= today;
      })
      .forEach(function(project){
        const client = (clients || []).find(function(row){ return row.id === project.client_id; });
        const dueToday = toDate(project.end).getTime() === today.getTime();
        items.push({
          title:project.name,
          meta:(client ? client.name + ' · ' : '') + (dueToday ? '오늘 마감 프로젝트' : '진행 중 프로젝트'),
          badges:[dueToday ? '<span class="badge badge-orange">오늘 마감</span>' : '<span class="badge badge-blue">프로젝트</span>'],
          action:"openProjModal('" + project.id + "')",
          sortKey:dueToday ? 0 : 1
        });
      });

    (schedules || [])
      .filter(function(schedule){
        return currentMember?.name &&
          schedule.member_name === currentMember.name &&
          toDate(schedule.start) <= today &&
          toDate(schedule.end) >= today;
      })
      .forEach(function(schedule){
        const meta = SCHEDULE_META[schedule.schedule_type]?.label || schedule.schedule_type || '일정';
        items.push({
          title:schedule.title || meta,
          meta:'개인 일정 · ' + meta,
          badges:['<span class="badge badge-gray">' + esc(meta) + '</span>'],
          action:"openScheduleModal('" + schedule.id + "')",
          sortKey:2
        });
      });

    return items
      .sort(function(a, b){
        return (a.sortKey - b.sortKey) || a.title.localeCompare(b.title, 'ko');
      })
      .slice(0, limit || 4);
  };

  window.getHomeIssueItems = function(limit){
    const mine = (projects || []).filter(function(project){
      return assignedToCurrentMember(project) && (openIssuesByProject[project.id] || 0) > 0;
    });
    const source = mine.length ? mine : (projects || []).filter(function(project){
      return (openIssuesByProject[project.id] || 0) > 0;
    });
    return source
      .sort(function(a, b){
        const issueDiff = (openIssuesByProject[b.id] || 0) - (openIssuesByProject[a.id] || 0);
        if(issueDiff) return issueDiff;
        return toDate(a.end) - toDate(b.end);
      })
      .slice(0, limit || 4)
      .map(function(project){
        const client = (clients || []).find(function(row){ return row.id === project.client_id; });
        const issueCount = openIssuesByProject[project.id] || 0;
        const overdue = toDate(project.end) < getTodayBase() && project.status !== '완료';
        return {
          title:project.name,
          meta:(client ? client.name + ' · ' : '') + '열린 이슈 ' + issueCount + '건',
          badges:[overdue ? '<span class="badge badge-red">기한 주의</span>' : '<span class="badge badge-blue">이슈 ' + issueCount + '건</span>'],
          action:"openProjModal('" + project.id + "',null,null,'issue')"
        };
      });
  };

  window.renderTeamMainDashboard = function(){
    const el = document.getElementById('teamMainDashboardWrap');
    if(!el) return;

    const todayItems = window.getHomeTodayItems(4);
    const todayDue = window.getHomeTodayDueProjects();
    const issueItems = window.getHomeIssueItems(4);
    const unreadRequired = typeof getUnreadRequiredNotices === 'function' ? getUnreadRequiredNotices().length : 0;
    const availabilityItems = getAvailabilityItems();

    const cards = [
      {label:'오늘 일정',value:todayItems.length,sub:todayItems.length ? '오늘 처리할 일정과 프로젝트가 있습니다.' : '오늘 바로 처리할 일정이 없습니다.',className:'info',action:"document.getElementById('myWeekWrap')?.scrollIntoView({behavior:'smooth',block:'start'})"},
      {label:'오늘 마감',value:todayDue.length,sub:todayDue.length ? truncateText(todayDue.map(function(project){ return project.name; }).join(', '), 28) : '오늘 마감 프로젝트 없음',className:'today',action:"setPage('gantt')"},
      {label:'내 담당 이슈',value:myIssueTotal(),sub:myIssueTotal() ? '확인이 필요한 열린 이슈가 있습니다.' : '현재 담당 이슈가 없습니다.',className:'info',action:"document.getElementById('issueFeedWrap')?.scrollIntoView({behavior:'smooth',block:'start'})"},
      {label:'필독 공지',value:unreadRequired,sub:unreadRequired ? '확인하지 않은 필독 공지가 있습니다.' : '미확인 필독 공지가 없습니다.',className:unreadRequired ? 'warn' : 'info',action:"document.getElementById('teamNoticeWrap')?.scrollIntoView({behavior:'smooth',block:'start'})"}
    ];

    const emptyText = currentMember
      ? '오늘 바로 처리할 일정이 없습니다.'
      : '로그인 계정과 연결된 팀 프로필이 없어 개인 업무를 계산하지 못했습니다.';

    el.innerHTML =
      '<div class="main-focus-grid">' + cards.map(function(card){
        return '<div class="main-focus-card clickable ' + (card.className || '') + '" onclick="' + card.action + '">'
          + '<div class="main-focus-label">' + esc(card.label) + '</div>'
          + '<div class="main-focus-value">' + card.value + '</div>'
          + '<div class="main-focus-sub">' + esc(card.sub) + '</div>'
          + '</div>';
      }).join('') + '</div>'
      + '<div class="main-home-grid">'
      +   '<div class="main-home-card">'
      +     '<div class="main-home-head">'
      +       '<div><div class="main-home-title">오늘 해야 할 일</div><div class="main-home-sub">' + esc(currentMember?.name ? (currentMember.name + '님 기준으로 오늘 바로 확인해야 할 항목입니다.') : '오늘 체크해야 할 항목입니다.') + '</div></div>'
      +       '<button class="btn ghost sm" onclick="setPage(\'gantt\')">프로젝트 관리</button>'
      +     '</div>'
      +     renderHomeInfoList(todayItems, emptyText)
      +   '</div>'
      +   '<div class="main-home-stack">'
      +     '<div class="main-home-card">'
      +       '<div class="main-home-head">'
      +         '<div><div class="main-home-title">내 담당 이슈</div><div class="main-home-sub">열린 이슈가 있는 프로젝트를 우선순위대로 보여줍니다.</div></div>'
      +         '<button class="btn ghost sm" onclick="document.getElementById(\'issueFeedWrap\')?.scrollIntoView({behavior:\'smooth\',block:\'start\'})">아래 이슈 보기</button>'
      +       '</div>'
      +       renderHomeInfoList(issueItems, '현재 열려 있는 담당 이슈가 없습니다.')
      +     '</div>'
      +     '<div class="main-home-card">'
      +       '<div class="main-home-head">'
      +         '<div><div class="main-home-title">팀 일정 요약</div><div class="main-home-sub">휴가, 필드웍, 개인 일정을 빠르게 확인하고 아래 상세 섹션으로 이동합니다.</div></div>'
      +         '<button class="btn ghost sm" onclick="document.getElementById(\'memberScheduleWrap\')?.scrollIntoView({behavior:\'smooth\',block:\'start\'})">일정 보기</button>'
      +       '</div>'
      +       renderHomeInfoList(availabilityItems, '팀 일정 요약이 없습니다.')
      +     '</div>'
      +   '</div>'
      + '</div>';
  };

  window.renderDash = function(){
    const today = getTodayBase();
    const overdue = (projects || []).filter(function(project){ return isOverdue(project); });
    const unbilled = (projects || []).filter(function(project){
      return project.status === '완료' && project.is_billable && project.billing_status === '미청구';
    });
    const followups = (projects || []).filter(function(project){
      return project.status === '완료' && project.follow_up_needed;
    });
    const todayLeave = (schedules || []).filter(function(schedule){
      return schedule.schedule_type === 'leave' && toDate(schedule.start) <= today && toDate(schedule.end) >= today;
    });
    const todayFieldwork = (schedules || []).filter(function(schedule){
      return schedule.schedule_type === 'fieldwork' && toDate(schedule.start) <= today && toDate(schedule.end) >= today;
    });

    const alertWrap = document.getElementById('alertWrap');
    if(alertWrap){
      const cards = [
        {label:'기간 초과',value:overdue.length,sub:overdue.length ? truncateText(overdue.map(function(project){ return project.name; }).join(', '), 28) : '지연 프로젝트 없음',className:'warn',action:"setPage('dash')"},
        {label:'빌링 필요',value:unbilled.length,sub:unbilled.length ? truncateText(unbilled.map(function(project){ return project.name; }).join(', '), 28) : '미청구 프로젝트 없음',className:'info',action:"setPage('dash')"},
        {label:'후속 조치',value:followups.length,sub:followups.length ? truncateText(followups.map(function(project){ return project.name; }).join(', '), 28) : '후속 조치 없음',className:'info',action:"setPage('dash')"},
        {label:'팀 가용성',value:todayLeave.length + todayFieldwork.length,sub:'휴가 ' + todayLeave.length + '건 · 필드웍 ' + todayFieldwork.length + '건',className:'info',action:"setPage('team')"}
      ];
      alertWrap.innerHTML = '<div class="main-focus-grid">' + cards.map(function(card){
        return '<div class="main-focus-card clickable ' + (card.className || '') + '" onclick="' + card.action + '">'
          + '<div class="main-focus-label">' + esc(card.label) + '</div>'
          + '<div class="main-focus-value">' + card.value + '</div>'
          + '<div class="main-focus-sub">' + esc(card.sub) + '</div>'
          + '</div>';
      }).join('') + '</div>';
    }

    if(typeof renderPinned === 'function') renderPinned();
  };
})();
