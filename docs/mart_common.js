// 컬럼명 → 한국어 해석 사전
const KOREAN_LABELS = {
  event_date: '날짜', sessions: '세션 수', users: '사용자 수', pdp_views: '상품페이지 조회',
  add_to_carts: '장바구니 담기', checkouts: '결제 시작', purchases: '구매 완료',
  revenue: '매출', units_sold: '판매 수량', cvr_user_pct: '사용자당 전환율 (%)',
  aov: '객단가 (평균 구매금액)', cart_abandonment_pct: '장바구니 이탈율 (%)',
  funnel_type: '퍼널 유형', segment: '세그먼트', step_number: '단계 번호',
  step_name: '단계명', pct_of_step1: '1단계 대비 비율 (%)',
  dropoff_from_prev_pct: '전 단계 대비 이탈률 (%)', cohort_week: '가입 주차',
  weeks_since_signup: '가입 후 경과 주', retained_users: '유지 사용자 수',
  retention_pct: '리텐션율 (%)', channel: '채널', touch_position: '터치 위치',
  first_touch_conversions: '첫 접점 전환수', last_touch_conversions: '마지막 접점 전환수',
  linear_conversions: '선형 배분 전환수', user_type: '사용자 유형',
  new_users: '신규 사용자', returning_users: '재방문 사용자',
  day_of_week_num: '요일', hour_of_day: '시간대',
  engagement_tier: '참여도 등급', scroll_90pct_sessions: '스크롤 90% 세션',
  download_sessions: '다운로드 세션', video_start_sessions: '비디오 시작 세션',
  video_complete_sessions: '비디오 완료 세션', outbound_click_sessions: '외부 클릭 세션',
  avg_pageviews_per_session: '세션당 평균 페이지뷰', avg_engagement_seconds: '평균 참여 시간(초)',
  traffic_channel: '유입 채널', add_to_cart_sessions: '장바구니 세션',
  purchase_sessions: '구매 세션', session_conversion_rate_pct: '세션 전환율 (%)',
  rfm_segment: 'RFM 세그먼트', recency_days: '최근 방문 (일)',
  frequency: '방문 빈도', monetary: '총 구매금액', ltv: '고객생애가치',
  user_pseudo_id: '사용자 ID', cluster_id: '군집 번호',
  purchase_probability: '구매 확률', anomaly_probability: '이상치 확률',
  is_anomaly: '이상치 여부', actual_revenue: '실제 매출',
  lower_bound: '하한선', upper_bound: '상한선'
};
const ko = (k) => KOREAN_LABELS[k] || k;

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

function buildSidebar() {
  const marts = [
    ['mart1.html', 'MART 1', '일별 이커머스 KPI'],
    ['mart2.html', 'MART 2', '퍼널 이탈 분석'],
    ['mart3.html', 'MART 3', '코호트 리텐션'],
    ['mart4.html', 'MART 4', '멀티터치 어트리뷰션'],
    ['mart5.html', 'MART 5', 'LTV / RFM'],
    ['mart6.html', 'MART 6', '신규 vs 재방문'],
    ['mart7.html', 'MART 7', '요일×시간대 히트맵'],
    ['mart8.html', 'MART 8', '콘텐츠 참여도'],
    ['mart9.html', 'MART 9', '다크소셜 / AI 리퍼럴'],
  ];
  const sidebar = document.querySelector('.sidebar');
  if (!sidebar) return;
  const current = location.pathname.split('/').pop();
  sidebar.innerHTML = `<div class="sec-label">Analytics</div>` +
    marts.map(([h, tag, name]) => `<a href="${h}" class="${h === current ? 'active' : ''}">
      <span class="num">${tag.replace('MART ', '')}</span> ${name}</a>`).join('');
}

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
  if (!isFinite(cur) || !isFinite(prev) || prev === 0) return `<span class="delta-badge flat">— 비교불가</span>`;
  const diff = isPctMetric ? (cur - prev) : ((cur - prev) / Math.abs(prev)) * 100;
  const arrow = diff > 0.5 ? '↑' : (diff < -0.5 ? '↓' : '→');
  const cls = diff > 0.5 ? 'up' : (diff < -0.5 ? 'down' : 'flat');
  const unit = isPctMetric ? 'p' : '%';
  return `<span class="delta-badge ${cls}">${arrow} ${diff >= 0 ? '+' : ''}${diff.toFixed(1)}${unit}</span>`;
}

function render(rows) {
  const keys = Object.keys(rows[0]);
  const dateKey = keys.find(k => k.toLowerCase().includes('date'));
  const categoricalKeys = keys.filter(k => k !== dateKey && !isNumeric(rows[0][k]));
  const numericKeys = keys.filter(k => k !== dateKey && isNumeric(rows[0][k]));

  // 필터 드롭다운
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

  // 지표 선택 칩 바
  let selectedMetrics = numericKeys.slice(0, 3);
  const chipBar = document.createElement('div');
  chipBar.className = 'chip-bar';
  chipBar.innerHTML = `<div class="chip-label">📊 표시할 지표 선택</div>` +
    numericKeys.map(k => `<span class="chip ${selectedMetrics.includes(k) ? 'active' : ''}" data-key="${k}">
      ${k} <span class="ko">· ${ko(k)}</span></span>`).join('');
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

    // 상단 핵심 지표 배너 (선택한 지표 상위 3개)
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
        const dWeek = isFinite(prev7Avg) ? deltaBadge(cur7Avg, prev7Avg, isPct) : '<span class="delta-badge flat">7일 대기</span>';

        const card = document.createElement('div');
        card.className = 'hero-card';
        card.innerHTML = `
          <div class="h-label">${k}<span class="ko">· ${ko(k)}</span></div>
          <div class="h-value">${fmt(cur)}</div>
          <div class="h-delta">전일 ${dDay} 7일평균 ${dWeek}</div>
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

    // 인사이트
    if (dateKey && selectedMetrics.length && dates.length >= 2) {
      const insights = [];
      selectedMetrics.forEach(k => {
        const isPct = /pct|rate|ratio/i.test(k);
        const byDate = aggregateByDate(filtered, k);
        const cur = byDate[latestDate];
        const prev = byDate[prevDate];
        if (!isFinite(cur) || !isFinite(prev) || prev === 0) return;
        const diff = isPct ? (cur - prev) : ((cur - prev) / Math.abs(prev)) * 100;
        const abs = Math.abs(diff);
        if (abs < 10) return;
        const goodIsUp = !/abandon|drop|dropoff|bounce/i.test(k);
        const cls = ((diff > 0) === goodIsUp) ? 'good' : 'bad';
        const emoji = cls === 'good' ? '✅' : '⚠️';
        const dir = diff > 0 ? '증가' : '감소';
        insights.push(`${emoji} <b>${ko(k)}</b>이(가) 전일 대비 ${abs.toFixed(1)}${isPct?'p':'%'} ${dir} (${fmt(prev)} → ${fmt(cur)})`);
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
        const abs = Math.abs(diff);
        if (abs < 20) return;
        const goodIsUp = !/abandon|drop|dropoff|bounce/i.test(k);
        const cls = ((diff > 0) === goodIsUp) ? 'good' : 'warn';
        const emoji = cls === 'good' ? '🚀' : '⚠️';
        const dir = diff > 0 ? '높음' : '낮음';
        insights.push(`${emoji} <b>${ko(k)}</b>이(가) 지난 7일 평균보다 ${abs.toFixed(1)}${isPct?'p':'%'} ${dir}`);
      });
      if (insights.length) {
        const box = document.createElement('div');
        box.className = 'insight-box';
        box.innerHTML = `<div class="i-title">💡 오늘의 하이라이트 · ${latestDate}</div>` +
          insights.slice(0, 6).map(t => `<div class="insight-item">${t}</div>`).join('');
        contentDiv.appendChild(box);
      }
    }

    // KPI 카드 (선택된 지표만)
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
        card.innerHTML = `<div class="label">${k}<span class="ko">· ${ko(k)}</span></div>
                          <div class="value">${displayVal}</div>
                          <div class="k-delta">${deltaTxt || ''}</div>`;
        kpiGrid.appendChild(card);
      });
      contentDiv.appendChild(kpiGrid);
    }

    // 차트 (선택된 지표만, 2열 그리드)
    if (dateKey && selectedMetrics.length) {
      const chartGrid = document.createElement('div');
      chartGrid.className = 'chart-grid';
      const palette = ['#0066FF','#4d94ff','#F59E0B','#00A76F','#E5484D','#8B5CF6','#06B6D4','#EC4899'];
      const labels = dates.map(shortDate);
      selectedMetrics.forEach((k, i) => {
        const byDate = aggregateByDate(filtered, k);
        const box = document.createElement('div');
        box.className = 'chart-box';
        box.innerHTML = `<h3>${k}</h3><div class="h3-sub">${ko(k)}</div><canvas></canvas>`;
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

    // 원본 테이블
    const tblBox = document.createElement('div');
    tblBox.className = 'chart-box';
    tblBox.innerHTML = `<h3>Raw Data</h3><div class="h3-sub">원본 데이터 (최대 500행)</div>
                        <div style="overflow-x:auto"><table></table></div>`;
    contentDiv.appendChild(tblBox);
    const table = tblBox.querySelector('table');
    const shown = filtered.slice(0, 500);
    const thead = '<thead><tr>' + keys.map(k => `<th>${k}<br><span style="font-weight:400;text-transform:none;color:#8892A6">${ko(k)}</span></th>`).join('') + '</tr></thead>';
    const tbody = '<tbody>' + shown.map(r =>
      '<tr>' + keys.map(k => `<td>${r[k] ?? ''}</td>`).join('') + '</tr>'
    ).join('') + '</tbody>';
    table.innerHTML = thead + tbody;
  }

  draw();
}
