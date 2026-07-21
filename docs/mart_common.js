// ===== 컬럼 사전: 한국어 해석 + 실무 설명 =====
const KOREAN_LABELS = {
  // 날짜/기본
  event_date: { ko: '날짜', desc: '데이터 집계 기준일' },
  // 트래픽
  sessions: { ko: '세션 수', desc: '사이트 방문 횟수 (한 사용자가 여러 번 방문하면 각각 세션)' },
  users: { ko: '순 사용자 수', desc: '중복 제거된 방문자 수' },
  new_users: { ko: '신규 사용자', desc: '처음 방문한 사용자 수' },
  returning_users: { ko: '재방문 사용자', desc: '이전에 방문한 적 있는 사용자 수' },
  user_type: { ko: '사용자 유형', desc: '신규(new) 또는 재방문(returning) 구분' },
  // 이커머스
  pdp_views: { ko: '상품 상세 조회수', desc: 'Product Detail Page 진입 횟수' },
  add_to_carts: { ko: '장바구니 담기', desc: '사용자가 장바구니에 상품을 담은 횟수' },
  checkouts: { ko: '결제 시작', desc: '결제 페이지에 진입한 횟수' },
  purchases: { ko: '구매 완료', desc: '실제로 결제가 완료된 주문 건수' },
  revenue: { ko: '매출액', desc: '실제 발생한 구매 금액 총합' },
  units_sold: { ko: '판매 수량', desc: '실제로 판매된 상품 개수' },
  aov: { ko: '객단가 (AOV)', desc: '주문 한 건당 평균 구매 금액 = 매출 / 구매수' },
  avg_order_value: { ko: '객단가', desc: '주문 한 건당 평균 구매 금액' },
  cvr_user_pct: { ko: '사용자 전환율', desc: '사용자 100명 중 몇 명이 구매했는가 (%)' },
  cart_abandonment_pct: { ko: '장바구니 이탈률', desc: '결제 시작 후 구매까지 안 이어진 비율 (%)' },
  // 퍼널
  funnel_type: { ko: '퍼널 유형', desc: '분석 대상 퍼널 종류 (전체/결제수단별 등)' },
  segment: { ko: '세그먼트', desc: '사용자 그룹 분류' },
  step_number: { ko: '단계 번호', desc: '퍼널 내 단계 순서' },
  step_name: { ko: '단계명', desc: '퍼널 각 단계 이름' },
  pct_of_step1: { ko: '유입 대비 비율', desc: '첫 단계 대비 도달률 (%)' },
  dropoff_from_prev_pct: { ko: '단계 이탈률', desc: '직전 단계에서 몇 %가 이탈했는가' },
  // 리텐션
  cohort_week: { ko: '가입 주차', desc: '사용자가 처음 방문한 주' },
  cohort_month: { ko: '가입 월', desc: '사용자가 처음 방문한 월' },
  weeks_since_signup: { ko: '경과 주차', desc: '가입 후 몇 주가 지났는지' },
  retained_users: { ko: '유지 사용자 수', desc: '해당 주차에 재방문한 사용자' },
  retention_pct: { ko: '리텐션율', desc: '가입 대비 유지율 (%)' },
  // 어트리뷰션
  channel: { ko: '유입 채널', desc: '사용자가 들어온 마케팅 채널' },
  touch_position: { ko: '접점 위치', desc: 'first/mid/last — 구매 여정에서의 위치' },
  first_touch_conversions: { ko: '첫 접점 기여 전환', desc: '첫 유입 채널에 100% 배분한 전환수' },
  last_touch_conversions: { ko: '마지막 접점 기여 전환', desc: '마지막 채널에 100% 배분한 전환수' },
  linear_conversions: { ko: '선형 배분 전환', desc: '모든 접점에 균등 배분한 전환수' },
  // 시간 패턴
  day_of_week_num: { ko: '요일', desc: '0=일, 1=월, ..., 6=토' },
  hour_of_day: { ko: '시간대', desc: '0시~23시' },
  // 참여도
  engagement_tier: { ko: '참여 등급', desc: 'high/medium/low — 세션 몰입도' },
  avg_pageviews_per_session: { ko: '세션당 평균 페이지뷰', desc: '한 번 방문에 몇 페이지를 봤는지' },
  avg_engagement_seconds: { ko: '평균 체류시간', desc: '세션당 평균 머문 시간 (초)' },
  scroll_90pct_sessions: { ko: '스크롤 90% 세션', desc: '페이지 끝까지 스크롤한 세션 수' },
  download_sessions: { ko: '파일 다운로드 세션', desc: '파일을 받은 세션 수' },
  video_start_sessions: { ko: '비디오 시작 세션', desc: '비디오 재생을 시작한 세션' },
  video_complete_sessions: { ko: '비디오 완료 세션', desc: '비디오를 끝까지 본 세션' },
  outbound_click_sessions: { ko: '외부 링크 클릭 세션', desc: '외부 사이트로 나간 세션' },
  // 다크소셜/AI
  traffic_channel: { ko: '트래픽 채널', desc: '유입 출처 (AI 검색/다크소셜/일반)' },
  add_to_cart_sessions: { ko: '장바구니 발생 세션', desc: '장바구니 담기가 있었던 세션' },
  purchase_sessions: { ko: '구매 발생 세션', desc: '구매가 있었던 세션' },
  session_conversion_rate_pct: { ko: '세션 전환율', desc: '세션 대비 구매 세션 비율 (%)' },
  cvr_session_pct: { ko: '세션 전환율', desc: '세션 100건 중 구매 발생 비율 (%)' },
  // RFM/LTV
  rfm_segment: { ko: 'RFM 세그먼트', desc: 'VIP/충성/이탈위험 등 고객 등급' },
  r_score: { ko: 'R 점수', desc: 'Recency — 최근 구매일 점수 (5=최근)' },
  f_score: { ko: 'F 점수', desc: 'Frequency — 구매 빈도 점수 (5=자주)' },
  m_score: { ko: 'M 점수', desc: 'Monetary — 구매 금액 점수 (5=많이)' },
  recency_days: { ko: '최근성 (일)', desc: '마지막 구매로부터 지난 일수' },
  frequency: { ko: '구매 빈도', desc: '총 구매 횟수' },
  monetary: { ko: '총 구매액', desc: '누적 구매 금액' },
  ltv: { ko: '고객 생애가치', desc: '이 고객이 지금까지 가져온 총 매출' },
  user_pseudo_id: { ko: '사용자 ID', desc: 'GA4 익명 식별자' },
  cluster_id: { ko: '군집 번호', desc: 'K-means 자동 분류 그룹' },
  purchase_probability: { ko: '구매 확률', desc: 'ML 모델이 예측한 구매 가능성 (0~1)' },
  // 이상치
  anomaly_probability: { ko: '이상치 확률', desc: 'ARIMA가 이상하다고 판단한 정도' },
  is_anomaly: { ko: '이상치 여부', desc: '평소 패턴에서 벗어난 날인지' },
  actual_revenue: { ko: '실제 매출', desc: '해당 날짜 실제 매출액' },
  lower_bound: { ko: '예측 하한', desc: 'ARIMA 예측 하한선' },
  upper_bound: { ko: '예측 상한', desc: 'ARIMA 예측 상한선' }
};
const ko = (k) => (KOREAN_LABELS[k]?.ko) || k;
const koDesc = (k) => (KOREAN_LABELS[k]?.desc) || '';

// ===== SVG 아이콘 =====
const ICONS = {
  trendUp: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="22 7 13.5 15.5 8.5 10.5 2 17"/><polyline points="16 7 22 7 22 13"/></svg>',
  trendDown: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="22 17 13.5 8.5 8.5 13.5 2 7"/><polyline points="16 17 22 17 22 11"/></svg>',
  trendFlat: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="5" y1="12" x2="19" y2="12"/></svg>',
  insight: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41"/><circle cx="12" cy="12" r="5"/></svg>',
  check: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>',
  warn: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>',
  alert: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>',
  rocket: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4.5 16.5c-1.5 1.26-2 5-2 5s3.74-.5 5-2c.71-.84.7-2.13-.09-2.91a2.18 2.18 0 00-2.91-.09zM12 15l-3-3a22 22 0 012-3.95A12.88 12.88 0 0122 2c0 2.72-.78 7.5-6 11a22.35 22.35 0 01-4 2z"/><path d="M9 12H4s.55-3.03 2-4c1.62-1.08 5 0 5 0M12 15v5s3.03-.55 4-2c1.08-1.62 0-5 0-5"/></svg>',
  bar: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="20" x2="12" y2="10"/><line x1="18" y1="20" x2="18" y2="4"/><line x1="6" y1="20" x2="6" y2="16"/></svg>'
};

// ===== 사이드바 =====
function buildSidebar() {
  const marts = [
    ['mart1.html', '1', '일별 이커머스 KPI'],
    ['mart2.html', '2', '퍼널 이탈 분석'],
    ['mart3.html', '3', '코호트 리텐션'],
    ['mart4.html', '4', '멀티터치 어트리뷰션'],
    ['mart5.html', '5', 'LTV / RFM'],
    ['mart6.html', '6', '신규 vs 재방문'],
    ['mart7.html', '7', '요일×시간대 히트맵'],
    ['mart8.html', '8', '콘텐츠 참여도'],
    ['mart9.html', '9', '다크소셜 / AI 리퍼럴'],
  ];
  const sidebar = document.querySelector('.sidebar');
  if (!sidebar) return;
  const current = location.pathname.split('/').pop();
  sidebar.innerHTML = `<div class="sec-label">Analytics</div>` +
    marts.map(([h, tag, name]) => `<a href="${h}" class="${h === current ? 'active' : ''}">
      <span class="num">${tag}</span> ${name}</a>`).join('');
}

// ===== 유틸 =====
function shortDate(s) {
  const p = String(s).split('-');
  return p.length === 3 ? `${p[1]}/${p[2]}` : s;
}
function isNumeric(v) {
  if (v === null || v === undefined || v === '') return false;
  if (typeof v === 'object') return false;
  return !isNaN(parseFloat(v)) && isFinite(v);
}
function fmt(v) {
  if (v === null || v === undefined || isNaN(v)) return '-';
  if (Math.abs(v) >= 1000000) return (v/1000000).toFixed(1) + 'M';
  if (Math.abs(v) >= 1000) return v.toLocaleString(undefined, {maximumFractionDigits: 0});
  if (Math.abs(v) >= 10) return v.toLocaleString(undefined, {maximumFractionDigits: 1});
  return v.toLocaleString(undefined, {maximumFractionDigits: 2});
}
function deltaBadge(cur, prev, isPctMetric) {
  if (!isFinite(cur) || !isFinite(prev) || prev === 0) return `<span class="delta-badge flat">${ICONS.trendFlat} 비교불가</span>`;
  const diff = isPctMetric ? (cur - prev) : ((cur - prev) / Math.abs(prev)) * 100;
  const icon = diff > 0.5 ? ICONS.trendUp : (diff < -0.5 ? ICONS.trendDown : ICONS.trendFlat);
  const cls = diff > 0.5 ? 'up' : (diff < -0.5 ? 'down' : 'flat');
  const unit = isPctMetric ? 'p' : '%';
  return `<span class="delta-badge ${cls}">${icon} ${diff >= 0 ? '+' : ''}${diff.toFixed(1)}${unit}</span>`;
}

// 좋음/나쁨 방향 (일부 지표는 감소가 좋음)
function goodDirection(k) {
  return /abandon|drop|dropoff|bounce|churn|ejection|exit/i.test(k) ? 'down' : 'up';
}

// 자연스러운 한국어 코멘트 생성
function buildComment(k, cur, prev, isPct, mode) {
  const label = ko(k);
  const abs = Math.abs(mode === 'week' ? cur : ((cur - prev)/Math.abs(prev))*100);
  const unit = isPct ? 'p' : '%';
  if (mode === 'day') {
    const diff = isPct ? (cur - prev) : ((cur - prev)/Math.abs(prev))*100;
    const dir = diff > 0 ? '늘었' : '줄었';
    return `<b>${label}</b>가 어제(${fmt(prev)})보다 <b>${abs.toFixed(1)}${unit}</b> ${dir}어요 → 오늘 <b>${fmt(cur)}</b>`;
  } else {
    const dir = cur > 0 ? '높아요' : '낮아요';
    return `<b>${label}</b>가 지난 7일 평균보다 <b>${abs.toFixed(1)}${unit}</b> ${dir}`;
  }
}
function commentTone(k, diff) {
  const good = goodDirection(k);
  const isGood = (diff > 0 && good === 'up') || (diff < 0 && good === 'down');
  return isGood ? 'good' : 'bad';
}
function commentIcon(tone, mode) {
  if (mode === 'week') return tone === 'good' ? ICONS.rocket : ICONS.warn;
  return tone === 'good' ? ICONS.check : ICONS.alert;
}

// ===== 메인 =====
(async function() {
  buildSidebar();
  const statusEl = document.getElementById('status');
  const root = document.getElementById('root');
  try {
    const res = await fetch(DATA_FILE + '?t=' + Date.now());
    if (!res.ok) throw new Error('데이터 파일을 찾을 수 없음 (아직 생성 전일 수 있음)');
    const rows = await res.json();
    if (!rows || !rows.length) { statusEl.textContent = '아직 데이터가 없습니다.'; return; }
    statusEl.textContent = `총 ${rows.length.toLocaleString()}행 로드됨`;
    render(rows);
  } catch (e) {
    statusEl.textContent = '⚠️ ' + e.message;
  }
})();

function render(rows) {
  const keys = Object.keys(rows[0]);
  const dateKey = keys.find(k => k.toLowerCase().includes('date'));
  const categoricalKeys = keys.filter(k => k !== dateKey && !isNumeric(rows[0][k]));
  const numericKeys = keys.filter(k => k !== dateKey && isNumeric(rows[0][k]));

  // 필터
  let filterKey = null;
  if (categoricalKeys.length > 0) {
    filterKey = categoricalKeys[0];
    const controls = document.createElement('div');
    controls.className = 'controls';
    const uniques = [...new Set(rows.map(r => r[filterKey]))].filter(v => v !== null && v !== undefined);
    controls.innerHTML = `<div>
      <label>${ko(filterKey)}</label>
      <select id="filterSel">
        <option value="__all__">전체</option>
        ${uniques.map(v => `<option value="${v}">${v}</option>`).join('')}
      </select></div>`;
    document.getElementById('root').appendChild(controls);
    document.getElementById('filterSel').addEventListener('change', () => draw());
  }

  // 지표 선택 칩
  let selectedMetrics = numericKeys.slice(0, 3);
  const chipBar = document.createElement('div');
  chipBar.className = 'chip-bar';
  chipBar.innerHTML = `<div class="chip-label">${ICONS.bar} 표시할 지표 선택</div>` +
    numericKeys.map(k => `<span class="chip ${selectedMetrics.includes(k) ? 'active' : ''}" data-key="${k}" title="${koDesc(k)}">
      ${ko(k)} <span class="chip-en">${k}</span></span>`).join('');
  document.getElementById('root').appendChild(chipBar);
  chipBar.querySelectorAll('.chip').forEach(el => {
    el.addEventListener('click', () => {
      const k = el.dataset.key;
      if (selectedMetrics.includes(k)) selectedMetrics = selectedMetrics.filter(x => x !== k);
      else selectedMetrics.push(k);
      el.classList.toggle('active');
      draw();
    });
  });

  const contentDiv = document.createElement('div');
  document.getElementById('root').appendChild(contentDiv);

  function aggregateByDate(rowsIn, key) {
    if (!dateKey) return {};
    const map = {};
    rowsIn.forEach(r => {
      const d = r[dateKey];
      const v = parseFloat(r[key]);
      if (!isFinite(v)) return;
      map[d] = (map[d] || 0) + v;
    });
    return map;
  }

  function draw() {
    contentDiv.innerHTML = '';
    let filtered = rows;
    if (filterKey) {
      const val = document.getElementById('filterSel').value;
      if (val !== '__all__') filtered = rows.filter(r => String(r[filterKey]) === val);
    }
    if (!filtered.length) {
      contentDiv.innerHTML = '<p class="status">선택한 조건에 데이터가 없습니다.</p>';
      return;
    }

    const dates = dateKey ? [...new Set(filtered.map(r => r[dateKey]))].sort() : [];
    const latestDate = dates[dates.length - 1];
    const prevDate = dates[dates.length - 2];

    // ===== 상단 배너 =====
    if (dateKey && selectedMetrics.length) {
      const topMetrics = selectedMetrics.slice(0, 3);
      const hero = document.createElement('div');
      hero.className = 'hero-grid';
      topMetrics.forEach(k => {
        const isPct = /pct|rate|ratio/i.test(k);
        const byDate = aggregateByDate(filtered, k);
        const cur = byDate[latestDate] ?? 0;
        const prev = byDate[prevDate];
        const last7 = dates.slice(-14, -7);
        const cur7 = dates.slice(-7);
        const avg = (arr) => {
          const vs = arr.map(d => byDate[d]).filter(v => isFinite(v));
          return vs.length ? vs.reduce((a,b)=>a+b,0)/vs.length : NaN;
        };
        const prev7Avg = avg(last7);
        const cur7Avg = avg(cur7);
        const dDay = deltaBadge(cur, prev, isPct);
        const dWeek = isFinite(prev7Avg) ? deltaBadge(cur7Avg, prev7Avg, isPct) : `<span class="delta-badge flat">${ICONS.trendFlat} 7일 대기</span>`;

        const card = document.createElement('div');
        card.className = 'hero-card';
        card.innerHTML = `
          <div class="h-label">${ko(k)} <span class="en">· ${k}</span></div>
          <div class="h-desc">${koDesc(k)}</div>
          <div class="h-value">${fmt(cur)}</div>
          <div class="h-delta"><span class="d-lbl">어제 대비</span> ${dDay} <span class="d-lbl">7일 평균</span> ${dWeek}</div>
          <canvas></canvas>`;
        hero.appendChild(card);
        const ctx = card.querySelector('canvas').getContext('2d');
        const spark = dates.slice(-14).map(d => byDate[d] ?? 0);
        new Chart(ctx, {
          type: 'line',
          data: {
            labels: dates.slice(-14).map(shortDate),
            datasets: [{
              data: spark,
              borderColor: '#0066FF',
              backgroundColor: 'rgba(0, 102, 255, 0.15)',
              tension: 0.4, pointRadius: 0, borderWidth: 2, fill: true
            }]
          },
          options: {
            responsive: true, maintainAspectRatio: false,
            plugins: { legend: { display: false }, tooltip: { enabled: false } },
            scales: { x: { display: false }, y: { display: false } }
          }
        });
      });
      contentDiv.appendChild(hero);
    }

    // ===== 인사이트 =====
    if (dateKey && selectedMetrics.length && dates.length >= 2) {
      const items = [];
      selectedMetrics.forEach(k => {
        const isPct = /pct|rate|ratio/i.test(k);
        const byDate = aggregateByDate(filtered, k);
        const cur = byDate[latestDate];
        const prev = byDate[prevDate];
        if (!isFinite(cur) || !isFinite(prev) || prev === 0) return;
        const diff = isPct ? (cur - prev) : ((cur - prev) / Math.abs(prev)) * 100;
        if (Math.abs(diff) < 10) return;
        const tone = commentTone(k, diff);
        items.push({
          tone,
          icon: commentIcon(tone, 'day'),
          text: buildComment(k, cur, prev, isPct, 'day')
        });
      });
      selectedMetrics.forEach(k => {
        const isPct = /pct|rate|ratio/i.test(k);
        const byDate = aggregateByDate(filtered, k);
        const cur = byDate[latestDate];
        const past7 = dates.slice(-8, -1).map(d => byDate[d]).filter(v => isFinite(v));
        if (!isFinite(cur) || past7.length < 3) return;
        const avg = past7.reduce((a,b)=>a+b,0)/past7.length;
        if (avg === 0) return;
        const diff = isPct ? (cur - avg) : ((cur - avg)/Math.abs(avg))*100;
        if (Math.abs(diff) < 20) return;
        const tone = commentTone(k, diff);
        items.push({
          tone,
          icon: commentIcon(tone, 'week'),
          text: buildComment(k, diff, avg, isPct, 'week')
        });
      });
      if (items.length) {
        const box = document.createElement('div');
        box.className = 'insight-box';
        box.innerHTML = `<div class="i-title">${ICONS.insight} 오늘의 요약 · ${latestDate}</div>` +
          items.slice(0, 6).map(i => `<div class="insight-item ${i.tone}"><span class="i-ico">${i.icon}</span><span class="i-txt">${i.text}</span></div>`).join('');
        contentDiv.appendChild(box);
      }
    }

    // ===== KPI 카드 =====
    if (selectedMetrics.length) {
      const kpiGrid = document.createElement('div');
      kpiGrid.className = 'kpi-grid';
      selectedMetrics.forEach(k => {
        const isPct = /pct|rate|ratio/i.test(k);
        let displayVal, deltaTxt = '';
        if (dateKey) {
          const byDate = aggregateByDate(filtered, k);
          const cur = byDate[latestDate];
          const prev = byDate[prevDate];
          if (isFinite(cur)) {
            displayVal = fmt(cur);
            if (isFinite(prev)) deltaTxt = deltaBadge(cur, prev, isPct);
          } else {
            const vs = filtered.map(r => parseFloat(r[k])).filter(v => isFinite(v));
            displayVal = vs.length ? fmt(vs.reduce((a,b)=>a+b,0)) : '-';
          }
        } else {
          const vs = filtered.map(r => parseFloat(r[k])).filter(v => isFinite(v));
          displayVal = vs.length ? fmt(vs.reduce((a,b)=>a+b,0)) : '-';
        }
        const card = document.createElement('div');
        card.className = 'kpi-card';
        card.innerHTML = `<div class="label">${ko(k)} <span class="en">${k}</span></div>
                          <div class="value">${displayVal}</div>
                          <div class="k-desc">${koDesc(k)}</div>
                          <div class="k-delta">${deltaTxt || ''}</div>`;
        kpiGrid.appendChild(card);
      });
      contentDiv.appendChild(kpiGrid);
    }

    // ===== 차트 =====
    if (dateKey && selectedMetrics.length) {
      const chartGrid = document.createElement('div');
      chartGrid.className = 'chart-grid';
      const palette = ['#0066FF','#4d94ff','#F59E0B','#00A76F','#E5484D','#8B5CF6','#06B6D4','#EC4899'];
      const labels = dates.map(shortDate);
      selectedMetrics.forEach((k, i) => {
        const byDate = aggregateByDate(filtered, k);
        const box = document.createElement('div');
        box.className = 'chart-box';
        box.innerHTML = `<h3>${ko(k)} <span class="chart-en">${k}</span></h3><div class="h3-sub">${koDesc(k)}</div><canvas></canvas>`;
        chartGrid.appendChild(box);
        const ctx = box.querySelector('canvas').getContext('2d');
        new Chart(ctx, {
          type: 'line',
          data: {
            labels,
            datasets: [{
              label: ko(k),
              data: dates.map(d => byDate[d] ?? 0),
              borderColor: palette[i % palette.length],
              backgroundColor: palette[i % palette.length] + '1A',
              tension: 0.35, pointRadius: 2, borderWidth: 2, fill: true
            }]
          },
          options: {
            responsive: true, maintainAspectRatio: false,
            plugins: { legend: { display: false } },
            scales: {
              x: { ticks: { color: '#8892A6', font: { size: 11 }, maxRotation: 60, minRotation: 45, autoSkip: true }, grid: { color: '#F0F3F7' } },
              y: { ticks: { color: '#8892A6', font: { size: 11 } }, grid: { color: '#F0F3F7' }, beginAtZero: true }
            }
          }
        });
      });
      contentDiv.appendChild(chartGrid);
    }

    // ===== 원본 테이블 =====
    const tblBox = document.createElement('div');
    tblBox.className = 'chart-box';
    tblBox.innerHTML = `<h3>원본 데이터 <span class="chart-en">Raw Data</span></h3><div class="h3-sub">최대 500행</div>
                        <div style="overflow-x:auto"><table></table></div>`;
    contentDiv.appendChild(tblBox);
    const table = tblBox.querySelector('table');
    const shown = rows.slice(0, 500);
    const thead = '<thead><tr>' + keys.map(k => `<th><div class="th-ko">${ko(k)}</div><div class="th-en">${k}</div></th>`).join('') + '</tr></thead>';
    const tbody = '<tbody>' + shown.map(r =>
      '<tr>' + keys.map(k => `<td>${r[k] ?? ''}</td>`).join('') + '</tr>'
    ).join('') + '</tbody>';
    table.innerHTML = thead + tbody;
  }

  draw();
}
