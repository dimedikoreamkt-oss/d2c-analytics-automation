// ============================================
// 💬 네이버 광고 지능형 챗봇 (규칙 기반 · 무료 · 대화형)
// ============================================
const CHAT_CTX = {
  lastTopic: null,
  lastEntity: null,
  lastAnswer: null,
  lastActionList: [],
  history: []
};

function chatAppend(msg, isUser){
  const box = document.getElementById('chatMessages');
  const div = document.createElement('div');
  div.className = 'chat-msg ' + (isUser ? 'user' : 'bot');
  div.innerHTML = msg;
  box.appendChild(div);
  box.scrollTop = box.scrollHeight;
}

// ============ 데이터 헬퍼 ============
function getCampAggAll(){
  const agg = {};
  (DATA.perf||[]).forEach(r => {
    const k = r.campaign_name; if (!k) return;
    if (!agg[k]) agg[k] = {type:r.campaign_type, cost:0, rev:0, conv:0, clicks:0, imps:0, dates:new Set()};
    agg[k].cost += num(r.cost_krw);
    agg[k].rev += num(r.revenue);
    agg[k].conv += num(r.conversions);
    agg[k].clicks += num(r.clicks);
    agg[k].imps += num(r.impressions);
    if (r.event_date) agg[k].dates.add(r.event_date);
  });
  return Object.entries(agg).map(([n,v]) => ({
    name:n, type:v.type, cost:v.cost, revenue:v.rev, conv:v.conv, clicks:v.clicks, imps:v.imps,
    ctr: v.imps ? v.clicks/v.imps*100 : 0,
    cpc: v.clicks ? v.cost/v.clicks : 0,
    cvr: v.clicks ? v.conv/v.clicks*100 : 0,
    cpa: v.conv ? v.cost/v.conv : 0,
    roas: v.cost ? v.rev/v.cost : 0,
    days: v.dates.size
  }));
}

function getCampPeriodAgg(campName, dateList){
  const rows = (DATA.perf||[]).filter(r => r.campaign_name === campName && dateList.includes(r.event_date));
  const s = {cost:0, rev:0, conv:0, clicks:0, imps:0};
  rows.forEach(r => {
    s.cost += num(r.cost_krw); s.rev += num(r.revenue); s.conv += num(r.conversions);
    s.clicks += num(r.clicks); s.imps += num(r.impressions);
  });
  return {
    ...s,
    ctr: s.imps ? s.clicks/s.imps*100 : 0,
    cpc: s.clicks ? s.cost/s.clicks : 0,
    cvr: s.clicks ? s.conv/s.clicks*100 : 0,
    roas: s.cost ? s.rev/s.cost : 0
  };
}

function extractEntities(q){
  const perf = DATA.perf || [];
  const kw = DATA.keyword || [];
  const campNames = [...new Set(perf.map(r => r.campaign_name).filter(Boolean))];
  const kwNames = [...new Set(kw.map(r => r.keyword).filter(Boolean))];
  const found = {campaigns:[], keywords:[]};
  for (const n of campNames){ if (n && q.includes(n)) found.campaigns.push(n); }
  for (const n of kwNames){ if (n && q.includes(n)) found.keywords.push(n); }
  if (found.campaigns.length === 0){
    const seen = new Set();
    for (const n of campNames){
      if (!n || seen.has(n)) continue;
      const parts = n.split(/[_\s\-]/).filter(p => p.length >= 2);
      for (const p of parts){
        if (q.includes(p) && !seen.has(n)){ found.campaigns.push(n); seen.add(n); break; }
      }
    }
  }
  if (found.keywords.length === 0){
    const words = q.match(/[가-힣a-zA-Z0-9]+/g) || [];
    for (const w of words){
      if (w.length < 2) continue;
      for (const kn of kwNames){
        if (kn && kn.includes(w) && !found.keywords.includes(kn)) found.keywords.push(kn);
        if (found.keywords.length >= 10) break;
      }
      if (found.keywords.length >= 10) break;
    }
  }
  return found;
}

function extractType(q){
  if (/쇼핑|shopping/i.test(q)) return 'SHOPPING';
  if (/웹사이트|웹 ?사이트|파워링크|일반검색/.test(q)) return 'WEB_SITE';
  if (/브랜드 ?검색|브랜드검색|brand/i.test(q)) return 'BRAND_SEARCH';
  return null;
}

// ============ 핵심 분석 함수 ============

// 특정 엔티티(캠페인/키워드) 원인 진단
function diagnoseEntity(name, isCampaign){
  const perf = DATA.perf || [];
  const kw = DATA.keyword || [];
  const rows = isCampaign 
    ? perf.filter(r => r.campaign_name === name)
    : perf.filter(r => (r.campaign_name||'').includes(name));
  
  if (!rows.length){
    const kwRows = kw.filter(k => (k.keyword||'').includes(name) || (k.campaign_name||'').includes(name));
    if (kwRows.length){
      return kwRows.slice(0,5).map(k => 
        '<div class="cause-item"><strong>'+k.keyword+'</strong> ('+k.campaign_name+') · ROAS <span class="metric-inline">'+nfmt.r(k.roas)+'</span> · 30일 매출 '+nfmt.k(k.revenue_30d)+' · 지출 '+nfmt.k(k.cost_30d)+' · 등급 '+(k.keyword_grade||'-')+'</div>'
      ).join('');
    }
    return null;
  }
  
  const targetName = rows[0].campaign_name;
  const dates = [...new Set(rows.map(r => r.event_date))].sort().reverse();
  const r7 = dates.slice(0,7);
  const p7 = dates.slice(7,14);
  const rec = getCampPeriodAgg(targetName, r7);
  const prv = getCampPeriodAgg(targetName, p7);
  
  const revCh = prv.rev ? (rec.rev-prv.rev)/prv.rev*100 : 0;
  const costCh = prv.cost ? (rec.cost-prv.cost)/prv.cost*100 : 0;
  const cpcCh = prv.cpc ? (rec.cpc-prv.cpc)/prv.cpc*100 : 0;
  const cvrCh = prv.cvr ? (rec.cvr-prv.cvr)/prv.cvr*100 : 0;
  const ctrCh = prv.ctr ? (rec.ctr-prv.ctr)/prv.ctr*100 : 0;
  const impCh = prv.imps ? (rec.imps-prv.imps)/prv.imps*100 : 0;
  
  const causes = [];
  const trend = revCh > 5 ? '📈 상승' : revCh < -5 ? '📉 하락' : '➡️ 안정';
  
  if (revCh < -5){
    causes.push('<strong>📉 매출 하락 원인 진단:</strong>');
    if (Math.abs(impCh) > 15) causes.push('<div class="cause-item">1️⃣ <strong>노출량 '+(impCh>0?'증가':'감소')+':</strong> '+prv.imps.toLocaleString()+' → '+rec.imps.toLocaleString()+' ('+(impCh>0?'+':'')+impCh.toFixed(1)+'%) '+(impCh<0?'→ 입찰가 하락·경쟁 심화로 광고 노출 축소':'→ 노출은 늘었으나 매출 안 늘어남 = 품질 이슈')+'</div>');
    if (Math.abs(cpcCh) > 15) causes.push('<div class="cause-item">2️⃣ <strong>CPC '+(cpcCh>0?'상승':'하락')+':</strong> '+nfmt.k(prv.cpc)+' → '+nfmt.k(rec.cpc)+' ('+(cpcCh>0?'+':'')+cpcCh.toFixed(1)+'%) '+(cpcCh>0?'→ 경쟁사 입찰 상향·소재 품질 저하':'→ 노출 지면 변경 가능성')+'</div>');
    if (Math.abs(ctrCh) > 15) causes.push('<div class="cause-item">3️⃣ <strong>CTR '+(ctrCh>0?'개선':'악화')+':</strong> '+prv.ctr.toFixed(2)+'% → '+rec.ctr.toFixed(2)+'% ('+(ctrCh>0?'+':'')+ctrCh.toFixed(1)+'%) '+(ctrCh<0?'→ 소재 매력 저하·타겟 부적합':'')+'</div>');
    if (Math.abs(cvrCh) > 15) causes.push('<div class="cause-item">4️⃣ <strong>전환율 '+(cvrCh>0?'개선':'악화')+':</strong> '+prv.cvr.toFixed(2)+'% → '+rec.cvr.toFixed(2)+'% ('+(cvrCh>0?'+':'')+cvrCh.toFixed(1)+'%) '+(cvrCh<0?'→ 랜딩페이지·상품·가격 경쟁력 점검':'')+'</div>');
    const rDead = kw.filter(k => (k.campaign_name||'').includes(name) && num(k.roas)<1 && num(k.cost_30d)>3000);
    if (rDead.length) causes.push('<div class="cause-item">5️⃣ <strong>연관 DEAD 키워드 '+rDead.length+'개:</strong> '+rDead.slice(0,3).map(k=>'"'+k.keyword+'"('+num(k.roas).toFixed(2)+'x)').join(', ')+' → 예산 낭비</div>');
  } else if (revCh > 5){
    causes.push('<strong>📈 매출 상승 원인 분석:</strong>');
    if (impCh > 15) causes.push('<div class="cause-item">✅ 노출량 +'+impCh.toFixed(1)+'% 확대</div>');
    if (cvrCh > 15) causes.push('<div class="cause-item">✅ 전환율 개선 (+'+cvrCh.toFixed(1)+'%)</div>');
    if (cpcCh < -10) causes.push('<div class="cause-item">✅ CPC '+cpcCh.toFixed(1)+'% 하락 (효율 개선)</div>');
    const rStar = kw.filter(k => (k.campaign_name||'').includes(name) && num(k.roas)>=5);
    if (rStar.length) causes.push('<div class="cause-item">⭐ STAR 키워드 '+rStar.length+'개 활성: '+rStar.slice(0,3).map(k=>'"'+k.keyword+'"('+num(k.roas).toFixed(1)+'x)').join(', ')+'</div>');
  }
  
  const detail = '<div style="background:#f8fafc;padding:8px 12px;border-radius:6px;margin:8px 0;font-size:11.5px;line-height:1.7;">'+
    '<strong>📊 상세 지표 (최근 7일 vs 이전 7일)</strong><br>'+
    '• 노출: '+prv.imps.toLocaleString()+' → <strong>'+rec.imps.toLocaleString()+'</strong> ('+(impCh>=0?'+':'')+impCh.toFixed(1)+'%)<br>'+
    '• 클릭: '+prv.clicks+' → <strong>'+rec.clicks+'</strong><br>'+
    '• CTR: '+prv.ctr.toFixed(2)+'% → <strong>'+rec.ctr.toFixed(2)+'%</strong><br>'+
    '• 지출: '+nfmt.k(prv.cost)+' → <strong>'+nfmt.k(rec.cost)+'</strong> ('+(costCh>=0?'+':'')+costCh.toFixed(1)+'%)<br>'+
    '• CPC: '+nfmt.k(prv.cpc)+' → <strong>'+nfmt.k(rec.cpc)+'</strong> ('+(cpcCh>=0?'+':'')+cpcCh.toFixed(1)+'%)<br>'+
    '• 전환: '+prv.conv+' → <strong>'+rec.conv+'</strong><br>'+
    '• 전환율: '+prv.cvr.toFixed(2)+'% → <strong>'+rec.cvr.toFixed(2)+'%</strong><br>'+
    '• ROAS: <span class="metric-inline">'+prv.roas.toFixed(2)+'x</span> → <span class="metric-inline">'+rec.roas.toFixed(2)+'x</span>'+
    '</div>';
  
  let action;
  if (revCh < -10) action = '<strong>🎯 즉시 실행 액션:</strong><br>• DEAD 키워드 제외로 낭비 지출 차단<br>• 관련 STAR 키워드 확대로 매출 방어<br>• 랜딩페이지·상품 상세 재점검<br>• 경쟁사 입찰가 모니터링';
  else if (revCh > 10) action = '<strong>🎯 성장 유지 액션:</strong><br>• 상승 요인 키워드 예산 20~30% 확대<br>• 유사 소재·타겟 신규 캠페인 테스트<br>• ROAS 유지 확인 후 스케일업';
  else action = '<strong>🎯 유지·최적화:</strong><br>• 현 상태 안정 → 미세 최적화<br>• 하위 20% 키워드 정리<br>• 상위 20% 키워드 입찰 조정';
  
  return '<strong>🔍 "'+targetName+'" 분석 (최근 7일 vs 이전 7일)</strong><br><br>'+
    '<strong>'+trend+'</strong> · 매출 <span class="metric-inline">'+nfmt.k(prv.rev)+'</span> → <span class="metric-inline">'+nfmt.k(rec.rev)+'</span> (<strong style="color:'+(revCh>=0?'#10b981':'#ef4444')+';">'+(revCh>=0?'+':'')+revCh.toFixed(1)+'%</strong>)<br>'+
    detail + causes.join('') + '<br>' + action + '<br><br>'+
    '<em style="color:var(--muted);font-size:11px;">💡 후속: "이 캠페인 예산 늘려도 될까?", "관련 키워드", "경쟁 캠페인"</em>';
}

// 두 캠페인 비교
function compareEntities(a, b){
  const all = getCampAggAll();
  const findFn = n => all.find(c => c.name === n) || all.find(c => c.name.includes(n));
  const A = findFn(a); const B = findFn(b);
  if (!A || !B) return null;
  
  const wCell = (av, bv, fmt, higherBetter) => {
    const winA = higherBetter ? av > bv : av < bv;
    const winB = higherBetter ? bv > av : bv < av;
    const s1 = winA ? '<strong style="color:#10b981;">'+fmt(av)+' 🏆</strong>' : fmt(av);
    const s2 = winB ? '<strong style="color:#10b981;">'+fmt(bv)+' 🏆</strong>' : fmt(bv);
    return s1 + ' vs ' + s2;
  };
  
  return '<strong>⚔️ "'+A.name+'" vs "'+B.name+'" 비교</strong><br><br>'+
    '<div style="background:#f8fafc;padding:10px 14px;border-radius:8px;font-size:12px;line-height:1.9;">'+
    '<strong>💰 지출:</strong> '+wCell(A.cost, B.cost, nfmt.k, true)+'<br>'+
    '<strong>🛒 매출:</strong> '+wCell(A.revenue, B.revenue, nfmt.k, true)+'<br>'+
    '<strong>📊 ROAS:</strong> '+wCell(A.roas, B.roas, nfmt.r, true)+'<br>'+
    '<strong>👁️ 노출:</strong> '+wCell(A.imps, B.imps, nfmt.n, true)+'<br>'+
    '<strong>🖱️ 클릭:</strong> '+wCell(A.clicks, B.clicks, nfmt.n, true)+'<br>'+
    '<strong>📈 CTR:</strong> '+wCell(A.ctr, B.ctr, nfmt.p, true)+'<br>'+
    '<strong>💵 CPC:</strong> '+wCell(A.cpc, B.cpc, nfmt.k, false)+' <em>(낮을수록 유리)</em><br>'+
    '<strong>✅ 전환:</strong> '+wCell(A.conv, B.conv, nfmt.n, true)+'<br>'+
    '<strong>🎯 전환율:</strong> '+wCell(A.cvr, B.cvr, nfmt.p, true)+
    '</div><br>'+
    '<strong>💡 종합 평가:</strong><br>'+
    (A.roas > B.roas ? '• <strong>'+A.name+'</strong>의 ROAS가 '+(A.roas-B.roas).toFixed(2)+'x 더 높음 (효율성 우위)' : '• <strong>'+B.name+'</strong>의 ROAS가 '+(B.roas-A.roas).toFixed(2)+'x 더 높음')+'<br>'+
    (A.revenue > B.revenue ? '• <strong>'+A.name+'</strong>이 매출 규모 우위' : '• <strong>'+B.name+'</strong>이 매출 규모 우위')+'<br>'+
    (A.cpc < B.cpc ? '• <strong>'+A.name+'</strong>의 CPC가 더 저렴' : '• <strong>'+B.name+'</strong>의 CPC가 더 저렴')+'<br><br>'+
    '<strong>🎯 재분배 시뮬레이션:</strong><br>'+
    (A.roas > B.roas 
      ? B.name+'의 예산 30%를 '+A.name+'로 이전 시:<br>• 예상 추가 매출: <span class="metric-inline">'+nfmt.k(B.cost*0.3*(A.roas-B.roas))+'</span>'
      : A.name+'의 예산 30%를 '+B.name+'로 이전 시:<br>• 예상 추가 매출: <span class="metric-inline">'+nfmt.k(A.cost*0.3*(B.roas-A.roas))+'</span>');
}

// 예산 재분배 시뮬레이션
function simulateBudgetReallocation(){
  const kw = DATA.keyword || [];
  const dead = kw.filter(k => k.keyword && num(k.cost_30d) > 3000 && num(k.roas) < 1);
  const star = kw.filter(k => k.keyword && num(k.roas) >= 5 && num(k.conversions_30d) >= 2);
  if (!dead.length && !star.length) return '재분배 대상 키워드가 없습니다.';
  const wasted = dead.reduce((s,k) => s+num(k.cost_30d), 0);
  const avgStarRoas = star.length ? star.reduce((s,k) => s+num(k.roas), 0)/star.length : 0;
  const estRev = wasted * avgStarRoas;
  const currStarRev = star.reduce((s,k) => s+num(k.revenue_30d), 0);
  
  return '<strong>💰 예산 재분배 시뮬레이션 (30일 기준)</strong><br><br>'+
    '<strong>1️⃣ DEAD 키워드 제외로 절약:</strong><br>'+
    '• 대상 '+dead.length+'개 키워드<br>'+
    '• 절약 금액: <span class="metric-inline">'+nfmt.k(wasted)+'</span><br>'+
    '• 상위 3개: '+dead.sort((a,b) => num(b.cost_30d)-num(a.cost_30d)).slice(0,3).map(k => k.keyword+'('+nfmt.k(k.cost_30d)+')').join(', ')+'<br><br>'+
    '<strong>2️⃣ STAR 키워드로 재투자:</strong><br>'+
    '• STAR '+star.length+'개 (평균 ROAS <span class="metric-inline">'+avgStarRoas.toFixed(2)+'x</span>)<br>'+
    '• 현재 30일 매출: '+nfmt.k(currStarRev)+'<br>'+
    '• '+nfmt.k(wasted)+' 추가 투입 시 예상 매출: <span class="metric-inline" style="background:#f0fdf4;color:#059669;">'+nfmt.k(estRev)+'</span><br>'+
    '• <strong>총 매출 증가 예상: +'+(estRev/(currStarRev||1)*100).toFixed(1)+'%</strong><br><br>'+
    '<strong>🎯 실행 순서:</strong><br>'+
    '1. DEAD 키워드 광고관리자에서 "제외" 처리<br>'+
    '2. STAR 키워드 입찰가 +20~30% 조정<br>'+
    '3. STAR 키워드 예산 상한 3~5배 확대<br>'+
    '4. 3일 후 성과 재점검<br><br>'+
    '<em style="color:var(--muted);font-size:11px;">💡 후속: "STAR 자세히", "DEAD 리스트", "실행 방법"</em>';
}

// 액션 플랜
function generateActionPlan(){
  const kw = DATA.keyword || [];
  const daily = DATA.daily || [];
  const ins = (DATA.insight || [])[0] || {};
  const t = daily[0] || {};
  const dead = kw.filter(k => k.keyword && num(k.cost_30d) > 3000 && num(k.roas) < 1).sort((a,b) => num(b.cost_30d) - num(a.cost_30d));
  const star = kw.filter(k => k.keyword && num(k.roas) >= 5 && num(k.conversions_30d) >= 2).sort((a,b) => num(b.revenue_30d) - num(a.revenue_30d));
  const losing = kw.filter(k => k.keyword && num(k.cost_30d) > 3000 && num(k.roas) >= 1 && num(k.roas) < 2);
  const actions = [];
  
  if (dead.length){
    const w = dead.reduce((s,k) => s+num(k.cost_30d), 0);
    actions.push({p:'🚨', t:'HIGH', title:'DEAD 키워드 '+dead.length+'개 즉시 제외', exp:'절약: '+nfmt.k(w)+'/월 · 낭비 지출 차단', steps:'대상: '+dead.slice(0,5).map(k => k.keyword).join(', ')+(dead.length>5 ? ' 외 '+(dead.length-5)+'개' : '')});
  }
  if (star.length){
    const rv = star.reduce((s,k) => s+num(k.revenue_30d), 0);
    actions.push({p:'⭐', t:'HIGH', title:'STAR 키워드 '+star.length+'개 예산 3~5x 확대', exp:'매출 잠재력: 현재 '+nfmt.k(rv)+'/월 → 예상 '+nfmt.k(rv*3)+'~'+nfmt.k(rv*5), steps:'대상: '+star.slice(0,5).map(k => k.keyword+'('+num(k.roas).toFixed(1)+'x)').join(', ')});
  }
  if (losing.length){
    actions.push({p:'⚠️', t:'MID', title:'LOSING 키워드 '+losing.length+'개 입찰 -20% 조정', exp:'효율 개선 · 손익 회복', steps:'상위: '+losing.slice(0,5).map(k => k.keyword).join(', ')});
  }
  if (num(t.roas) < 2 && num(t.roas) > 0){
    actions.push({p:'🔴', t:'HIGH', title:'전체 ROAS 방어', exp:'오늘 ROAS '+nfmt.r(t.roas)+' - 손익분기 위험', steps:'DEAD/LOSING 즉시 정리 + 하위 30% 예산 축소'});
  }
  if (ins.top_cost_increase_campaign && num(ins.top_cost_increase_pct) > 30){
    actions.push({p:'💸', t:'MID', title:'광고비 급증 캠페인 점검: '+ins.top_cost_increase_campaign, exp:'+'+num(ins.top_cost_increase_pct).toFixed(1)+'% 상승 · ROAS 확인 필요', steps:'입찰가·예산 상한 재검토'});
  }
  
  const types = (DATA.type||[]);
  const tyAgg = {};
  types.forEach(r => {
    const k = r.campaign_type; if (!k) return;
    if (!tyAgg[k]) tyAgg[k] = {c:0, rv:0};
    tyAgg[k].c += num(r.cost_krw); tyAgg[k].rv += num(r.revenue);
  });
  const tyList = Object.entries(tyAgg).map(([k,v]) => ({k, roas:v.c ? v.rv/v.c : 0, c:v.c})).sort((a,b) => b.roas - a.roas);
  if (tyList.length >= 2 && tyList[0].roas > tyList[1].roas*1.3){
    actions.push({p:'📊', t:'MID', title:'유형별 예산 재조정: '+tyList[0].k+' 확대', exp:tyList[0].k+' ROAS '+tyList[0].roas.toFixed(2)+'x가 '+tyList[1].k+' '+tyList[1].roas.toFixed(2)+'x 대비 30%+ 우위', steps:tyList[1].k+' 예산 10~15%를 '+tyList[0].k+'로 이전'});
  }
  
  CHAT_CTX.lastActionList = actions;
  return '<strong>🗓️ 다음 주 실행 액션 플랜 (우선순위순)</strong><br><br>'+
    actions.map((a,i) => 
      '<div style="background:'+(a.t==='HIGH'?'#fef2f2':'#fffbeb')+';border-left:3px solid '+(a.t==='HIGH'?'#ef4444':'#f59e0b')+';padding:10px 12px;border-radius:6px;margin-bottom:8px;">'+
      '<div style="font-size:12.5px;font-weight:700;margin-bottom:4px;">'+a.p+' <span style="color:'+(a.t==='HIGH'?'#dc2626':'#d97706')+';">['+a.t+']</span> '+(i+1)+'. '+a.title+'</div>'+
      '<div style="font-size:11.5px;color:#475569;margin-bottom:3px;"><strong>📈 예상 효과:</strong> '+a.exp+'</div>'+
      '<div style="font-size:11px;color:var(--muted);"><strong>📋 세부:</strong> '+a.steps+'</div>'+
      '</div>'
    ).join('')+
    '<br><em style="color:var(--muted);font-size:11px;">💡 "1번 자세히", "2번 어떻게 실행?" 등 후속 질문 가능</em>';
}

// 요약
function generateSummary(){
  const daily = DATA.daily || [];
  const kw = DATA.keyword || [];
  const ins = (DATA.insight || [])[0] || {};
  const t = daily[0] || {};
  const w7 = daily.slice(0, 7);
  const p7 = daily.slice(7, 14);
  const sum = arr => arr.reduce((s,r) => ({
    c:s.c+num(r.cost_krw), rv:s.rv+num(r.revenue), cv:s.cv+num(r.purchases),
    i:s.i+num(r.impressions), cl:s.cl+num(r.clicks)
  }), {c:0, rv:0, cv:0, i:0, cl:0});
  const w = sum(w7); const p = sum(p7);
  const revCh = p.rv ? (w.rv-p.rv)/p.rv*100 : 0;
  const costCh = p.c ? (w.c-p.c)/p.c*100 : 0;
  const wRoas = w.c ? w.rv/w.c : 0;
  const pRoas = p.c ? p.rv/p.c : 0;
  const dead = kw.filter(k => k.keyword && num(k.cost_30d)>3000 && num(k.roas)<1);
  const star = kw.filter(k => k.keyword && num(k.roas)>=5);
  
  return '<strong>📊 최근 7일 종합 요약</strong><br><br>'+
    '<div style="background:#f8fafc;padding:10px 14px;border-radius:8px;line-height:1.9;font-size:12px;">'+
    '<strong>💰 총 지출:</strong> <span class="metric-inline">'+nfmt.k(w.c)+'</span> (전주比 '+(costCh>=0?'+':'')+costCh.toFixed(1)+'%)<br>'+
    '<strong>🛒 총 매출:</strong> <span class="metric-inline">'+nfmt.k(w.rv)+'</span> (전주比 <strong style="color:'+(revCh>=0?'#10b981':'#ef4444')+';">'+(revCh>=0?'+':'')+revCh.toFixed(1)+'%</strong>)<br>'+
    '<strong>📊 ROAS:</strong> <span class="metric-inline">'+wRoas.toFixed(2)+'x</span> (전주 '+pRoas.toFixed(2)+'x)<br>'+
    '<strong>✅ 전환:</strong> '+w.cv+'건 · <strong>👁️ 노출:</strong> '+nfmt.n(w.i)+' · <strong>🖱️ 클릭:</strong> '+nfmt.n(w.cl)+
    '</div><br>'+
    '<strong>🎯 하이라이트:</strong><br>'+
    (revCh > 10 ? '<div class="cause-item">🎉 <strong>매출 급성장:</strong> +'+revCh.toFixed(1)+'% (전주比)</div>' 
      : revCh < -10 ? '<div class="cause-item">⚠️ <strong>매출 하락 경고:</strong> '+revCh.toFixed(1)+'% (전주比)</div>' 
      : '<div class="cause-item">📊 <strong>안정 운영:</strong> 매출 '+revCh.toFixed(1)+'% 변동</div>')+
    (wRoas >= 3 ? '<div class="cause-item">💪 <strong>ROAS 우수:</strong> '+wRoas.toFixed(2)+'x</div>' 
      : wRoas >= 2 ? '<div class="cause-item">🟡 <strong>ROAS 양호:</strong> '+wRoas.toFixed(2)+'x</div>' 
      : '<div class="cause-item">🔴 <strong>ROAS 부진:</strong> '+wRoas.toFixed(2)+'x</div>')+
    (ins.top_revenue_campaign ? '<div class="cause-item">🏆 <strong>매출 1위:</strong> '+ins.top_revenue_campaign+'</div>' : '')+
    (ins.best_roas_campaign ? '<div class="cause-item">⚡ <strong>ROAS 1위:</strong> '+ins.best_roas_campaign+' ('+num(ins.best_roas_value).toFixed(2)+'x)</div>' : '')+
    '<div class="cause-item">⭐ STAR '+star.length+'개 · 🔴 DEAD '+dead.length+'개</div>'+
    '<br><em style="color:var(--muted);font-size:11px;">💡 후속: "다음 주 뭐 해야 해?", "매출 왜 떨어졌어?", "예산 어디 넣을까?"</em>';
}

// ROAS 개선
function suggestRoasImprovement(){
  const kw = DATA.keyword || [];
  const dead = kw.filter(k => k.keyword && num(k.cost_30d)>3000 && num(k.roas)<1);
  const losing = kw.filter(k => k.keyword && num(k.cost_30d)>3000 && num(k.roas)>=1 && num(k.roas)<2);
  const highCpc = kw.filter(k => k.keyword && num(k.cpc_krw)>3000 && num(k.roas)<3).sort((a,b) => num(b.cpc_krw)-num(a.cpc_krw)).slice(0,5);
  const lowCvr = kw.filter(k => k.keyword && num(k.clicks_30d)>50 && num(k.conversions_30d)/num(k.clicks_30d)<0.02);
  
  return '<strong>🎯 ROAS 개선 5단계 전략</strong><br><br>'+
    '<strong>1️⃣ 낭비 지출 제거 (즉효)</strong><br>'+
    '• DEAD 키워드 '+dead.length+'개 즉시 제외 → 낭비 '+nfmt.k(dead.reduce((s,k) => s+num(k.cost_30d), 0))+' 차단<br>'+
    '• LOSING '+losing.length+'개 입찰 -20%<br><br>'+
    '<strong>2️⃣ 고효율 키워드 확대</strong><br>'+
    '• STAR 예산 3~5x · 유사 키워드 확장<br><br>'+
    '<strong>3️⃣ CPC 최적화</strong><br>'+
    (highCpc.length ? '• 고CPC 저ROAS 개선 대상 TOP 5:<br>'+highCpc.map(k => '&nbsp;&nbsp;- '+k.keyword+': CPC '+nfmt.k(k.cpc_krw)+' / ROAS '+nfmt.r(k.roas)).join('<br>') : '• CPC 이슈 없음')+
    '<br>• 입찰가 -15% 테스트<br><br>'+
    '<strong>4️⃣ 전환율 개선</strong><br>'+
    (lowCvr.length ? '• 낮은 전환율 '+lowCvr.length+'개 발견 → 랜딩·상품·가격 재점검' : '• 전환율 양호')+
    '<br>• 리마케팅 병행<br><br>'+
    '<strong>5️⃣ 요일·시간대 최적화</strong><br>'+
    '• 저효율 요일 -30% · 고효율 요일 +30%<br><br>'+
    '<strong>📈 예상 효과:</strong> ROAS 15~30% 개선 가능<br><br>'+
    '<em style="color:var(--muted);font-size:11px;">💡 후속: "1번 자세히", "고CPC 어떻게?", "전환율 낮은 이유"</em>';
}

// 리스크
function diagnoseRisks(){
  const kw = DATA.keyword || [];
  const daily = DATA.daily || [];
  const t = daily[0] || {};
  const risks = [];
  
  if (num(t.rev_dod_pct) < -20) risks.push({lv:'CRITICAL', t:'매출 급락', d:'전일 대비 '+num(t.rev_dod_pct).toFixed(1)+'% 감소 · ROAS '+nfmt.r(t.roas)});
  const dead = kw.filter(k => k.keyword && num(k.cost_30d)>3000 && num(k.roas)<1);
  const wasted = dead.reduce((s,k) => s+num(k.cost_30d), 0);
  const totalCost = kw.reduce((s,k) => s+num(k.cost_30d), 0);
  const wastePct = totalCost ? wasted/totalCost*100 : 0;
  if (wastePct > 15) risks.push({lv:'HIGH', t:'낭비 지출 과다', d:'DEAD '+dead.length+'개 · 전체 지출의 '+wastePct.toFixed(1)+'% ('+nfmt.k(wasted)+')'});
  const campAgg = getCampAggAll().sort((a,b) => b.revenue - a.revenue);
  const topRev = campAgg[0]?.revenue || 0;
  const totalRev = campAgg.reduce((s,c) => s+c.revenue, 0);
  const depPct = totalRev ? topRev/totalRev*100 : 0;
  if (depPct > 50) risks.push({lv:'HIGH', t:'매출 편중', d:'"'+campAgg[0].name+'"이 매출의 '+depPct.toFixed(1)+'% 차지 · 리스크 분산 필요'});
  if (num(t.roas) > 0 && num(t.roas) < 2) risks.push({lv:'HIGH', t:'ROAS 손익분기 근접', d:'오늘 ROAS '+nfmt.r(t.roas)});
  if (num(t.cost_dod_pct) > 30 && num(t.rev_dod_pct) < num(t.cost_dod_pct)) risks.push({lv:'MID', t:'광고비 대비 매출 부진', d:'광고비 +'+num(t.cost_dod_pct).toFixed(1)+'% vs 매출 '+(num(t.rev_dod_pct)>=0?'+':'')+num(t.rev_dod_pct).toFixed(1)+'%'});
  const highCpcCamps = campAgg.filter(c => c.cpc>5000 && c.roas<2);
  if (highCpcCamps.length > 0) risks.push({lv:'MID', t:'CPC 이상치', d:highCpcCamps.length+'개 캠페인 CPC ₩5K 초과 & ROAS<2'});
  
  if (!risks.length) return '✅ <strong>현재 특별한 리스크가 감지되지 않았습니다.</strong><br><br>주요 지표가 정상 범위 내에서 안정적으로 운영되고 있습니다.';
  return '<strong>🚨 리스크 진단 결과 ('+risks.length+'건)</strong><br><br>'+
    risks.map((r,i) => 
      '<div style="background:'+(r.lv==='CRITICAL'?'#fef2f2':r.lv==='HIGH'?'#fef2f2':'#fffbeb')+';border-left:3px solid '+(r.lv==='CRITICAL'?'#dc2626':r.lv==='HIGH'?'#ef4444':'#f59e0b')+';padding:10px 12px;border-radius:6px;margin-bottom:8px;">'+
      '<div style="font-size:12px;font-weight:700;margin-bottom:3px;">🚨 <span style="color:'+(r.lv==='CRITICAL'?'#dc2626':r.lv==='HIGH'?'#ef4444':'#d97706')+';">['+r.lv+']</span> '+(i+1)+'. '+r.t+'</div>'+
      '<div style="font-size:11.5px;color:#475569;">'+r.d+'</div></div>'
    ).join('')+
    '<br><em style="color:var(--muted);font-size:11px;">💡 후속: "1번 자세히", "이거 어떻게 해결?"</em>';
}

// 등급별 리스트
function listGrade(gradeName){
  const kw = DATA.keyword || [];
  let list, title, action;
  if (gradeName === 'STAR'){
    list = kw.filter(k => k.keyword && num(k.roas)>=5 && num(k.conversions_30d)>=2).sort((a,b) => num(b.revenue_30d)-num(a.revenue_30d)).slice(0,15);
    title = '⭐ STAR 키워드';
    action = '💰 <strong>액션:</strong> 예산 3~5x 확대 + 입찰 +20~30%';
  } else if (gradeName === 'DEAD'){
    list = kw.filter(k => k.keyword && num(k.cost_30d)>3000 && num(k.roas)<1).sort((a,b) => num(b.cost_30d)-num(a.cost_30d)).slice(0,15);
    title = '🔴 DEAD 키워드';
    action = '🚫 <strong>액션:</strong> 즉시 광고 제외';
  } else if (gradeName === 'LOSING'){
    list = kw.filter(k => k.keyword && num(k.cost_30d)>3000 && num(k.roas)>=1 && num(k.roas)<2).sort((a,b) => num(b.cost_30d)-num(a.cost_30d)).slice(0,15);
    title = '⚠️ LOSING 키워드';
    action = '⚠️ <strong>액션:</strong> 입찰 -20% · 소재 개선';
  } else {
    list = kw.filter(k => k.keyword && num(k.roas)>=2 && num(k.roas)<5).sort((a,b) => num(b.revenue_30d)-num(a.revenue_30d)).slice(0,15);
    title = '✅ HEALTHY 키워드';
    action = '🔧 <strong>액션:</strong> 유지 · 미세 최적화';
  }
  if (!list.length) return title+' 해당 없음.';
  const total = {cost:list.reduce((s,k) => s+num(k.cost_30d), 0), rev:list.reduce((s,k) => s+num(k.revenue_30d), 0)};
  return '<strong>'+title+' TOP '+list.length+'</strong> · 지출 <span class="metric-inline">'+nfmt.k(total.cost)+'</span> · 매출 <span class="metric-inline">'+nfmt.k(total.rev)+'</span><br><br>'+
    '<div style="max-height:280px;overflow-y:auto;">'+
    list.map((k,i) => '<div class="cause-item">'+(i+1)+'. <strong>'+k.keyword+'</strong> <small style="color:var(--muted);">('+(k.campaign_name||'-')+')</small><br>&nbsp;&nbsp;ROAS <span class="metric-inline">'+nfmt.r(k.roas)+'</span> · 지출 '+nfmt.k(k.cost_30d)+' · 매출 '+nfmt.k(k.revenue_30d)+' · 전환 '+k.conversions_30d+'</div>').join('')+
    '</div><br>'+action+'<br><br>'+
    '<em style="color:var(--muted);font-size:11px;">💡 후속: "예산 재분배", "원인 분석"</em>';
}

// 유형별 성과
function typePerformance(tyName){
  const perf = (DATA.perf||[]).filter(r => r.campaign_type === tyName);
  if (!perf.length) return tyName+' 유형 데이터 없음';
  const tot = perf.reduce((s,r) => ({
    c:s.c+num(r.cost_krw), rv:s.rv+num(r.revenue), cv:s.cv+num(r.conversions),
    i:s.i+num(r.impressions), cl:s.cl+num(r.clicks)
  }), {c:0, rv:0, cv:0, i:0, cl:0});
  const camps = [...new Set(perf.map(r => r.campaign_name))];
  const roas = tot.c ? tot.rv/tot.c : 0;
  const campAgg = {};
  perf.forEach(r => {
    const k = r.campaign_name; if (!k) return;
    if (!campAgg[k]) campAgg[k] = {c:0, rv:0, cv:0};
    campAgg[k].c += num(r.cost_krw); campAgg[k].rv += num(r.revenue); campAgg[k].cv += num(r.conversions);
  });
  const topCamps = Object.entries(campAgg).map(([n,v]) => ({n, ...v, roas:v.c ? v.rv/v.c : 0})).sort((a,b) => b.rv - a.rv).slice(0,5);
  return '<strong>📊 '+tyName+' 유형 종합 성과</strong><br><br>'+
    '<div style="background:#f8fafc;padding:10px 14px;border-radius:8px;line-height:1.9;font-size:12px;">'+
    '<strong>📋 캠페인 수:</strong> <span class="metric-inline">'+camps.length+'개</span><br>'+
    '<strong>👁️ 노출:</strong> '+nfmt.n(tot.i)+' · <strong>🖱️ 클릭:</strong> '+nfmt.n(tot.cl)+' · <strong>CTR:</strong> '+(tot.i?(tot.cl/tot.i*100).toFixed(2):'0')+'%<br>'+
    '<strong>💰 지출:</strong> <span class="metric-inline">'+nfmt.k(tot.c)+'</span> · <strong>CPC:</strong> '+nfmt.k(tot.cl?tot.c/tot.cl:0)+'<br>'+
    '<strong>🛒 매출:</strong> <span class="metric-inline">'+nfmt.k(tot.rv)+'</span> · <strong>전환:</strong> '+tot.cv+'건<br>'+
    '<strong>📊 ROAS:</strong> <span class="metric-inline">'+nfmt.r(roas)+'</span>'+
    '</div><br>'+
    '<strong>🏆 매출 TOP 5 캠페인:</strong><br>'+
    topCamps.map((c,i) => '<div class="cause-item">'+(i+1)+'. <strong>'+c.n+'</strong> · 매출 '+nfmt.k(c.rv)+' · ROAS '+nfmt.r(c.roas)+' · 전환 '+c.cv+'</div>').join('')+
    '<br><em style="color:var(--muted);font-size:11px;">💡 후속: "예산 늘려도 돼?", "1위 자세히", "다른 유형 비교"</em>';
}

// 후속 질문 처리
function handleFollowUp(q){
  const firstMatch = /첫|1번|1 ?번|1번째|첫번째/.test(q);
  const secondMatch = /둘|2번|2 ?번|2번째|두번째/.test(q);
  const thirdMatch = /셋|3번|3 ?번|3번째|세번째/.test(q);
  const numMatch = q.match(/(\d+)\s*번/);
  let idx = -1;
  if (firstMatch) idx = 0;
  else if (secondMatch) idx = 1;
  else if (thirdMatch) idx = 2;
  else if (numMatch){ const d = parseInt(numMatch[1]); if (!isNaN(d)) idx = d-1; }
  
  if (idx >= 0 && CHAT_CTX.lastActionList[idx]){
    const a = CHAT_CTX.lastActionList[idx];
    return '<strong>🎯 액션 상세: '+a.title+'</strong><br><br>'+
      '<strong>📈 예상 효과:</strong><br>'+a.exp+'<br><br>'+
      '<strong>📋 세부 실행:</strong><br>'+a.steps+'<br><br>'+
      '<strong>✅ 실행 체크리스트:</strong><br>'+
      '1. 네이버 광고관리자 접속<br>'+
      '2. 해당 캠페인/키워드 개별 확인<br>'+
      '3. 위 세부 대상에 대해 조치 적용<br>'+
      '4. 3일 후 성과 재측정<br>'+
      '5. 필요시 조정<br><br>'+
      '<em style="color:var(--muted);font-size:11px;">💡 후속: "다른 액션도", "실행 후 확인 방법"</em>';
  }
  if (/자세히|더 |상세|디테일/.test(q)){
    if (CHAT_CTX.lastTopic === 'campaign' && CHAT_CTX.lastEntity){
      return diagnoseEntity(CHAT_CTX.lastEntity, true) || '추가 정보 없음';
    }
  }
  return null;
}

// ============ 메인 라우터 ============
function analyzeQuery(q){
  const ql = q.toLowerCase();
  CHAT_CTX.history.push({role:'user', content:q});
  
  const followUp = handleFollowUp(q);
  if (followUp){ CHAT_CTX.history.push({role:'bot', content:followUp}); return followUp; }
  
  const entities = extractEntities(q);
  const tyQ = extractType(q);
  let answer;
  
  // 다중 엔티티 비교
  if (entities.campaigns.length >= 2 && (ql.includes('비교') || ql.includes('vs') || ql.includes('대비') || ql.includes('랑') || ql.includes('와'))){
    answer = compareEntities(entities.campaigns[0], entities.campaigns[1]);
    if (answer){ CHAT_CTX.lastTopic='compare'; CHAT_CTX.history.push({role:'bot', content:answer}); return answer; }
  }
  
  // 단일 엔티티
  if (entities.campaigns.length > 0){
    answer = diagnoseEntity(entities.campaigns[0], true);
    if (answer){ CHAT_CTX.lastTopic='campaign'; CHAT_CTX.lastEntity=entities.campaigns[0]; CHAT_CTX.history.push({role:'bot', content:answer}); return answer; }
  }
  if (entities.keywords.length > 0){
    answer = diagnoseEntity(entities.keywords[0], false);
    if (answer){ CHAT_CTX.lastTopic='keyword'; CHAT_CTX.lastEntity=entities.keywords[0]; CHAT_CTX.history.push({role:'bot', content:answer}); return answer; }
  }
  
  // 의도별 라우팅
  if (/요약|정리|summary|이번 ?주|지난 ?주|전반적|전체적|한 눈에|한눈에/.test(q)){
    answer = generateSummary(); CHAT_CTX.lastTopic='summary'; CHAT_CTX.history.push({role:'bot', content:answer}); return answer;
  }
  if (/다음 ?주|다음 ?달|뭐 ?해야|무엇을 ?해야|액션|플랜|계획|해야 ?할/.test(q)){
    answer = generateActionPlan(); CHAT_CTX.lastTopic='action_plan'; CHAT_CTX.history.push({role:'bot', content:answer}); return answer;
  }
  if (/예산|budget|재분배|얼마.*투자|투자.*얼마|어디.*더|어디.*넣|어디에.*쓸/.test(q)){
    answer = simulateBudgetReallocation(); CHAT_CTX.lastTopic='budget'; CHAT_CTX.history.push({role:'bot', content:answer}); return answer;
  }
  if (/roas.*개선|roas.*올리|roas.*높이|효율.*개선|어떻게.*개선|개선.*방법|성과.*올리/.test(q)){
    answer = suggestRoasImprovement(); CHAT_CTX.lastTopic='roas_improve'; CHAT_CTX.history.push({role:'bot', content:answer}); return answer;
  }
  if (/리스크|위험|문제|경고|주의|위기|이상/.test(q)){
    answer = diagnoseRisks(); CHAT_CTX.lastTopic='risk'; CHAT_CTX.history.push({role:'bot', content:answer}); return answer;
  }
  if (/매출.*하락|매출.*떨어|매출.*줄|매출.*감소|왜.*떨어|왜.*하락|왜.*부진|부진.*이유|안 좋아진|나빠진/.test(q)){
    const daily = DATA.daily || [];
    const kw = DATA.keyword || [];
    const ins = (DATA.insight || [])[0] || {};
    const t = daily[0] || {};
    const rc = num(t.rev_dod_pct), cc = num(t.cost_dod_pct), wc = num(t.rev_wow_pct);
    const dead = kw.filter(k => k.keyword && num(k.cost_30d)>5000 && num(k.roas)<1);
    const w = dead.reduce((s,k) => s+num(k.cost_30d), 0);
    const causes = [];
    if (rc < 0) causes.push('<div class="cause-item">📉 <strong>전일 대비 매출:</strong> '+rc.toFixed(1)+'% 감소 ('+nfmt.k(t.revenue)+', ROAS '+nfmt.r(t.roas)+')</div>');
    if (wc < -10) causes.push('<div class="cause-item">📆 <strong>전주 대비:</strong> '+wc.toFixed(1)+'% 하락 - 지속 하락세</div>');
    if (cc < -10) causes.push('<div class="cause-item">💸 <strong>광고비 축소:</strong> '+cc.toFixed(1)+'% 감소로 노출 감소</div>');
    else if (cc > 10 && rc < cc) causes.push('<div class="cause-item">💸 <strong>광고비 증가 vs 매출 부진:</strong> +'+cc.toFixed(1)+'% vs '+rc.toFixed(1)+'% · 효율 저하</div>');
    if (dead.length) causes.push('<div class="cause-item">🔴 <strong>DEAD 낭비:</strong> '+dead.length+'개 · <span class="metric-inline">'+nfmt.k(w)+'</span> 30일간 낭비</div>');
    if (ins.worst_revenue_campaign) causes.push('<div class="cause-item">⚠️ <strong>매출 최저 캠페인:</strong> '+ins.worst_revenue_campaign+'</div>');
    
    const campAgg = getCampAggAll();
    const declining = [];
    const perfF = DATA.perf || [];
    campAgg.forEach(c => {
      const dates = [...new Set(perfF.filter(r => r.campaign_name===c.name).map(r => r.event_date))].sort().reverse();
      if (dates.length < 14) return;
      const rec = getCampPeriodAgg(c.name, dates.slice(0,7));
      const prv = getCampPeriodAgg(c.name, dates.slice(7,14));
      if (prv.rev > 50000){
        const ch = (rec.rv - prv.rv)/prv.rv*100;
        if (ch < -20) declining.push({name:c.name, change:ch, recRev:rec.rv, prvRev:prv.rv});
      }
    });
    declining.sort((a,b) => a.change - b.change);
    if (declining.length){
      causes.push('<div class="cause-item">📉 <strong>주요 하락 캠페인 '+declining.length+'개:</strong><br>'+declining.slice(0,3).map(d => '&nbsp;&nbsp;• '+d.name+': '+nfmt.k(d.prvRev)+' → '+nfmt.k(d.recRev)+' ('+d.change.toFixed(1)+'%)').join('<br>')+'</div>');
    }
    
    answer = '<strong>📉 매출 하락 원인 종합 분석</strong><br><br>'+
      (causes.join('') || '<div class="cause-item">특이 하락 요인 감지되지 않음</div>')+
      '<br><strong>🎯 권장 액션:</strong><br>'+
      '1. DEAD 즉시 제외로 낭비 차단<br>'+
      '2. STAR 예산 확대로 매출 방어<br>'+
      '3. 하락 캠페인 개별 원인 진단<br>'+
      '4. 랜딩페이지·상품 상세 재점검<br><br>'+
      '<em style="color:var(--muted);font-size:11px;">💡 후속: "STAR 알려줘", "'+(declining[0]?.name || '하락 캠페인')+' 자세히", "예산 재분배"</em>';
    CHAT_CTX.lastTopic = 'revenue_decline';
    CHAT_CTX.history.push({role:'bot', content:answer});
    return answer;
  }
  if (/star|스타|잘 ?팔|잘 ?되는|효과 ?좋|고효율/.test(q)){
    answer = listGrade('STAR'); CHAT_CTX.history.push({role:'bot', content:answer}); return answer;
  }
  if (/dead|낭비|제외|죽은|버릴|손해|비효율/.test(q)){
    answer = listGrade('DEAD'); CHAT_CTX.history.push({role:'bot', content:answer}); return answer;
  }
  if (/losing|주의.*키워드|입찰 ?조정/.test(q)){
    answer = listGrade('LOSING'); CHAT_CTX.history.push({role:'bot', content:answer}); return answer;
  }
  if (/healthy|건강|안정 ?키워드/.test(q)){
    answer = listGrade('HEALTHY'); CHAT_CTX.history.push({role:'bot', content:answer}); return answer;
  }
  if (/roas.*좋|roas.*top|roas.*최고|roas.*1위|최고.*캠페인/.test(q)){
    const list = getCampAggAll().filter(r => r.cost > 5000).sort((a,b) => b.roas - a.roas).slice(0,10);
    answer = '<strong>🏆 ROAS TOP '+list.length+' 캠페인</strong><br><br>'+
      list.map((r,i) => '<div class="cause-item">'+(i+1)+'. <strong>'+r.name+'</strong> ('+(r.type||'-')+') · ROAS <span class="metric-inline">'+nfmt.r(r.roas)+'</span> · 매출 '+nfmt.k(r.revenue)+' · 지출 '+nfmt.k(r.cost)+'</div>').join('')+
      '<br><em style="color:var(--muted);font-size:11px;">💡 후속: "1위 자세히", "예산 늘려도 돼?"</em>';
    CHAT_CTX.history.push({role:'bot', content:answer});
    return answer;
  }
  if (tyQ){
    answer = typePerformance(tyQ); CHAT_CTX.history.push({role:'bot', content:answer}); return answer;
  }
  if (/오늘|어때|현재|상태|지금/.test(q)){
    const t = (DATA.daily||[])[0] || {};
    answer = '<strong>📊 오늘('+t.event_date+') 성과 요약</strong><br><br>'+
      '<div style="background:#f8fafc;padding:10px 14px;border-radius:8px;line-height:1.9;font-size:12px;">'+
      '<strong>💰 광고비:</strong> <span class="metric-inline">'+nfmt.k(t.cost_krw)+'</span> (전일比 '+(num(t.cost_dod_pct)>=0?'+':'')+num(t.cost_dod_pct).toFixed(1)+'%)<br>'+
      '<strong>🛒 매출:</strong> <span class="metric-inline">'+nfmt.k(t.revenue)+'</span> (전일比 '+(num(t.rev_dod_pct)>=0?'+':'')+num(t.rev_dod_pct).toFixed(1)+'%)<br>'+
      '<strong>📊 ROAS:</strong> <span class="metric-inline">'+nfmt.r(t.roas)+'</span> · <strong>전환:</strong> '+t.purchases+'건 · <strong>CTR:</strong> '+nfmt.p(t.ctr_pct)+'<br>'+
      '<strong>🎯 상태:</strong> '+(t.alert_status || '정상')+
      '</div><br>'+
      '<strong>💡 오늘의 권장 행동:</strong> '+(t.recommended_action || '모니터링 유지')+'<br><br>'+
      '<em style="color:var(--muted);font-size:11px;">💡 후속: "매출 왜 이런거야?", "다음 뭐 해야?", "이번 주 요약"</em>';
    CHAT_CTX.history.push({role:'bot', content:answer});
    return answer;
  }
  if (/cpc|입찰가|클릭당|비싸/.test(q)){
    const highCpc = getCampAggAll().filter(c => c.cost > 3000 && c.cpc > 2000).sort((a,b) => b.cpc - a.cpc).slice(0,10);
    answer = '<strong>💰 CPC 분석 (높은 순 TOP 10)</strong><br><br>'+
      highCpc.map((c,i) => '<div class="cause-item">'+(i+1)+'. <strong>'+c.name+'</strong> · CPC <span class="metric-inline">'+nfmt.k(c.cpc)+'</span> · ROAS '+nfmt.r(c.roas)+' '+(c.roas<2?'⚠️ 조정 필요':'✅ 유지')+'</div>').join('')+
      '<br><strong>🎯 조치 가이드:</strong><br>'+
      '• CPC 높고 ROAS<2 → 입찰 -20% 즉시<br>'+
      '• CPC 높으나 ROAS≥3 → 유지 or 소폭 상향<br>'+
      '• 경쟁 심화 시 다른 매칭 방식 시도<br><br>'+
      '<em style="color:var(--muted);font-size:11px;">💡 후속: "1위 자세히", "CPC 낮추는 방법"</em>';
    CHAT_CTX.history.push({role:'bot', content:answer});
    return answer;
  }
  if (/전환율|cvr|conversion/i.test(q)){
    const perf = getCampAggAll().filter(c => c.clicks > 50).sort((a,b) => a.cvr - b.cvr);
    const low = perf.slice(0,10);
    const high = perf.slice(-5).reverse();
    answer = '<strong>🎯 전환율 분석</strong><br><br>'+
      '<strong>🔴 전환율 낮은 캠페인 (개선 대상 TOP 10)</strong><br>'+
      low.map((c,i) => '<div class="cause-item">'+(i+1)+'. <strong>'+c.name+'</strong> · 전환율 <span class="metric-inline">'+nfmt.p(c.cvr)+'</span> · 클릭 '+c.clicks+' · ROAS '+nfmt.r(c.roas)+'</div>').join('')+
      '<br><strong>🟢 전환율 우수 캠페인 (TOP 5)</strong><br>'+
      high.map((c,i) => '<div class="cause-item">'+(i+1)+'. <strong>'+c.name+'</strong> · 전환율 <span class="metric-inline">'+nfmt.p(c.cvr)+'</span></div>').join('')+
      '<br><strong>💡 개선 방법:</strong><br>'+
      '1. 랜딩페이지 최적화 (속도·UX·CTA)<br>'+
      '2. 상품 상세 개선<br>'+
      '3. 가격·리뷰·프로모션 노출<br>'+
      '4. 리마케팅 병행<br><br>'+
      '<em style="color:var(--muted);font-size:11px;">💡 후속: "1위 자세히", "랜딩 어떻게 개선?"</em>';
    CHAT_CTX.history.push({role:'bot', content:answer});
    return answer;
  }
  if (/요일|주말|평일|시간대/.test(q)){
    const d = DATA.daily || [];
    const dn = ['일','월','화','수','목','금','토'];
    const agg = [0,1,2,3,4,5,6].map(() => ({rv:0, c:0, cnt:0}));
    d.forEach(r => {
      if (!r.event_date) return;
      const w = new Date(r.event_date+'T00:00:00').getDay();
      if (isNaN(w)) return;
      agg[w].rv += num(r.revenue); agg[w].c += num(r.cost_krw); agg[w].cnt++;
    });
    const dr = agg.map((x,i) => ({day:dn[i], roas:x.c ? x.rv/x.c : 0, rev:x.rv, cost:x.c, cnt:x.cnt})).filter(x => x.cnt > 0);
    dr.sort((a,b) => b.roas - a.roas);
    answer = '<strong>📅 요일별 성과 (ROAS 순위)</strong><br><br>'+
      dr.map((d,i) => '<div class="cause-item">'+(i+1)+'. <strong>'+d.day+'요일</strong> · ROAS <span class="metric-inline">'+nfmt.r(d.roas)+'</span> · 매출 '+nfmt.k(d.rev)+' · 지출 '+nfmt.k(d.cost)+'</div>').join('')+
      '<br><strong>🎯 예산 최적화:</strong><br>'+
      '• 최고 요일 ('+(dr[0]?.day||'-')+'요일): +20~30% 확대<br>'+
      '• 최저 요일 ('+(dr[dr.length-1]?.day||'-')+'요일): -20% 축소 or 중단<br>'+
      '• 요일 스케줄 조정으로 ROAS 10~15% 개선 가능<br><br>'+
      '<em style="color:var(--muted);font-size:11px;">💡 후속: "요일 자동 조정 방법", "이번 주 예상"</em>';
    CHAT_CTX.history.push({role:'bot', content:answer});
    return answer;
  }
  
  // Fallback
  answer = '💭 <strong>제가 도와드릴 수 있는 것들:</strong><br><br>'+
    '<strong>📊 성과 분석</strong><br>'+
    '• "이번 주 성과 요약해줘"<br>'+
    '• "오늘 상태 어때?"<br>'+
    '• "쇼핑 캠페인 성과"<br><br>'+
    '<strong>🔍 원인 진단</strong><br>'+
    '• "매출 왜 떨어졌어?"<br>'+
    '• "[캠페인/제품명] 매출 하락 원인" (예: "코코픽 왜 안 좋아?")<br>'+
    '• "CPC가 왜 비싸졌지?"<br>'+
    '• "전환율 낮은 이유"<br><br>'+
    '<strong>⚔️ 비교 분석</strong><br>'+
    '• "고요S랑 코코픽 비교해줘"<br>'+
    '• "쇼핑이랑 웹사이트 어느게 나아?"<br><br>'+
    '<strong>💰 예산·전략</strong><br>'+
    '• "예산 어디에 더 넣을까?"<br>'+
    '• "예산 재분배 시뮬레이션"<br>'+
    '• "ROAS 개선 방법"<br>'+
    '• "다음 주에 뭘 해야 해?"<br><br>'+
    '<strong>📋 리스트</strong><br>'+
    '• "STAR 키워드" / "DEAD 키워드"<br>'+
    '• "ROAS TOP 캠페인"<br>'+
    '• "요일별 성과"<br><br>'+
    '<strong>🚨 리스크</strong><br>'+
    '• "위험한 캠페인" / "리스크 진단"<br><br>'+
    '<em style="color:var(--muted);font-size:11px;">💡 답변 후 "1번 자세히" 등 대화 이어짐</em>';
  CHAT_CTX.history.push({role:'bot', content:answer});
  return answer;
}

function handleChat(){
  const inp = document.getElementById('chatInput');
  const q = inp.value.trim();
  if (!q) return;
  chatAppend(q, true);
  inp.value = '';
  setTimeout(() => chatAppend(analyzeQuery(q), false), 200);
}

function initChatbot(){
  chatAppend('👋 안녕하세요! 저는 여러분의 <strong>네이버 검색광고 전담 분석가</strong>입니다.<br><br>'+
    '<strong>💬 자유롭게 대화하세요:</strong><br>'+
    '• 캠페인·제품·키워드명을 자연스럽게 언급 (예: "코코픽 왜 부진해?")<br>'+
    '• 원인 진단, 비교 분석, 예산 최적화, 리스크 진단 모두 가능<br>'+
    '• 답변 후 "1번 자세히", "다른 방법?" 등 <strong>대화 이어짐</strong><br><br>'+
    '<strong>💡 예시 질문:</strong><br>'+
    '📊 "이번 주 왜 부진했어?"<br>'+
    '⚔️ "고요S랑 코코픽 비교해줘"<br>'+
    '💰 "예산 어디에 더 넣어야 해?"<br>'+
    '🎯 "ROAS 개선 방법"<br>'+
    '🗓️ "다음 주에 뭘 해야 해?"<br>'+
    '🚨 "가장 위험한 캠페인이 뭐야?"<br><br>'+
    '<em style="color:var(--muted);font-size:11px;">아래 빠른 질문 버튼도 활용해보세요 👇</em>', false);
  document.querySelectorAll('.quick-q').forEach(el => el.addEventListener('click', () => {
    document.getElementById('chatInput').value = el.dataset.q;
    handleChat();
  }));
  document.getElementById('chatSend').addEventListener('click', handleChat);
  document.getElementById('chatInput').addEventListener('keypress', e => { if (e.key === 'Enter') handleChat(); });
}
