let managedFilterActive=true;

function toggleManagedFilter(){
  managedFilterActive=!managedFilterActive;
  document.getElementById('managedFilterBtn').classList.toggle('active',managedFilterActive);
  document.getElementById('allContractBtn').classList.toggle('active',!managedFilterActive);
  renderContractsPage();
}

function renderContractsPage(){
  const el=document.getElementById('contractsPageContent');if(!el)return;
  const q=(document.getElementById('contractSearch')?.value||'').toLowerCase();

  // 필터: 우리 팀 계약 or 전체
  let filteredContracts=managedFilterActive
    ? contracts.filter(ct=>ct.is_managed===true)
    : contracts;

  // 검색
  if(q) filteredContracts=filteredContracts.filter(ct=>{
    const c=clients.find(x=>x.id===ct.client_id);
    return (c?.name||'').toLowerCase().includes(q)||(ct.contract_name||'').toLowerCase().includes(q);
  });

  // 거래처별 그룹핑
  const grouped={};
  clients.forEach(c=>{
    const cc=filteredContracts.filter(ct=>ct.client_id===c.id);
    if(!cc.length)return;
    grouped[c.id]={client:c,contracts:cc};
  });
  // 고객사 없는 계약
  const orphans=filteredContracts.filter(ct=>!ct.client_id||!clients.find(c=>c.id===ct.client_id));

  const totalAmount=filteredContracts.reduce((s,ct)=>s+(ct.contract_amount?Number(ct.contract_amount):0),0);
  const clientCount=Object.keys(grouped).length;

  let html='<div style="display:grid;grid-template-columns:repeat(3,1fr);gap:12px;margin-bottom:24px">'
    +'<div class="card"><div style="font-size:11px;font-weight:700;color:var(--text3);margin-bottom:8px">'+(managedFilterActive?'우리 팀 계약':'전체 계약')+'</div><div style="font-size:28px;font-weight:900;color:var(--navy)">'+filteredContracts.length+'</div><div style="font-size:12px;color:var(--text3)">건</div></div>'
    +'<div class="card"><div style="font-size:11px;font-weight:700;color:var(--text3);margin-bottom:8px">거래처</div><div style="font-size:28px;font-weight:900;color:var(--blue)">'+clientCount+'</div><div style="font-size:12px;color:var(--text3)">개사</div></div>'
    +'<div class="card"><div style="font-size:11px;font-weight:700;color:var(--text3);margin-bottom:8px">계약 총액</div><div style="font-size:20px;font-weight:900;color:var(--navy)">'+(totalAmount?totalAmount.toLocaleString()+'원':'—')+'</div></div>'
    +'</div>';

  if(!Object.keys(grouped).length&&!orphans.length){
    el.innerHTML=html+(managedFilterActive
      ?'<div style="text-align:center;padding:60px 20px;color:var(--text3)"><div style="font-size:36px;margin-bottom:12px">📋</div><div style="font-size:15px;font-weight:700;margin-bottom:8px">우리 팀 관리 계약이 없습니다</div><div style="font-size:13px">계약 추가 후 "우리 팀 관리 계약" 체크박스를 켜주세요</div></div>'
      :'<div style="text-align:center;padding:40px;color:var(--text3)">계약 정보가 없습니다.</div>');
    return;
  }

  Object.values(grouped).sort((a,b)=>a.client.name.localeCompare(b.client.name)).forEach(({client:c,contracts:cc})=>{
    const totalAmt=cc.reduce((s,ct)=>s+(ct.contract_amount?Number(ct.contract_amount):0),0);
    const activeCount=cc.filter(ct=>ct.contract_status==='진행중').length;
    html+='<div class="card" style="margin-bottom:12px">'
      +'<div style="display:flex;align-items:center;gap:12px;margin-bottom:12px;padding-bottom:12px;border-bottom:1px solid var(--border);cursor:pointer" onclick="openClientDetail(\''+c.id+'\',\'contracts\')">'
      +'<div style="width:38px;height:38px;border-radius:10px;background:linear-gradient(135deg,var(--blue),var(--blue-dark));color:#fff;font-size:15px;font-weight:800;display:flex;align-items:center;justify-content:center;flex-shrink:0">'+esc(c.name.charAt(0))+'</div>'
      +'<div style="flex:1"><div style="font-size:15px;font-weight:800;color:var(--navy)">'+esc(c.name)+'</div>'
      +'<div style="font-size:11px;color:var(--text3);margin-top:2px">'+cc.length+'건'+(totalAmt?' · '+totalAmt.toLocaleString()+'원':'')+(activeCount?' · <span style="color:var(--blue)">진행중 '+activeCount+'건</span>':'')+'</div></div>'
      +'<span style="font-size:11px;color:var(--text3)">↗</span>'
      +'</div>'
      +'<div style="display:flex;flex-direction:column;gap:6px">'
      +cc.map(ct=>{
        const isEnded=ct.contract_status==='완료'||ct.contract_status==='해지';
        const stCls=ct.contract_status==='진행중'?'badge-blue':isEnded?'badge-gray':'badge-orange';
        return '<div style="display:flex;align-items:center;gap:8px;padding:9px 12px;background:var(--bg);border-radius:var(--radius-sm);transition:background .12s;opacity:'+(isEnded?'.55':'1')+'" onmouseover="this.style.background=\'var(--blue-light)\'" onmouseout="this.style.background=\'var(--bg)\'">'
          +'<div style="flex:1;min-width:0;cursor:pointer" onclick="openContractDetail(\''+ct.id+'\')">'
          +'<div style="font-size:13px;font-weight:600;color:'+(isEnded?'var(--text3)':'var(--navy)')+';white-space:nowrap;overflow:hidden;text-overflow:ellipsis" title="'+esc(ct.contract_name||'')+'">'+esc(ct.contract_name||'계약명 없음')+'</div>'
          +(ct.contract_type?'<div style="font-size:11px;color:var(--text3)">'+esc(ct.contract_type)+(ct.contract_amount?' · '+Number(ct.contract_amount).toLocaleString()+'원':'')+'</div>':'')
          +'</div>'
          +'<button onclick="toggleContractManaged(\''+ct.id+'\','+(!ct.is_managed)+')" title="우리 팀 관리 여부 (현재: '+(ct.is_managed?'관리':'미관리')+')" style="flex-shrink:0;width:26px;height:26px;border-radius:6px;border:1px solid '+(ct.is_managed?'var(--blue)':'var(--border2)')+';background:'+(ct.is_managed?'var(--blue-light)':'transparent')+';cursor:pointer;font-size:11px;display:flex;align-items:center;justify-content:center">🏢</button>'
          +'<button onclick="toggleContractEnded(\''+ct.id+'\',\''+ct.contract_status+'\')" title="종료 여부 (현재: '+(isEnded?'종료':'진행중')+')" style="flex-shrink:0;width:26px;height:26px;border-radius:6px;border:1px solid '+(isEnded?'var(--red)':'var(--border2)')+';background:'+(isEnded?'var(--red-bg)':'transparent')+';cursor:pointer;font-size:11px;display:flex;align-items:center;justify-content:center">'+(isEnded?'🔴':'⚪')+'</button>'
          +'<span class="badge '+stCls+'" style="flex-shrink:0">'+(ct.contract_status||'검토중')+'</span>'
          +'</div>';
      }).join('')
      +'</div></div>';
  });
  el.innerHTML=html;
}
