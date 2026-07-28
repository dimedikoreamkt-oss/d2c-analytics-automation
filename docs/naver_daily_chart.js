// ============================================
// 📊 일일 성과 스마트 차트 (자동 축·타입 배정 + 필터 연동)
// ============================================

let dailyMultiChart;
const DAILY_METRICS_STATE = {
  active: new Set(['impressions', 'clicks', 'revenue'])
};

// 지표 정의 - color, label, unit(개수/금액/비율)
const METRIC_META = {
  impressions:   { color:'#0066FF', label:'노출',      unit:'count',  fmt:'n' },
  clicks:        { color:'#8b5cf6', label:'클릭',      unit:'count',  fmt:'n' },
  purchases:     { color:'#ec4899', label:'전환',      unit:'count',  fmt:'n' },
  revenue:       { color:'#10b981', label:'매출',      unit:'money',  fmt:'k' },
  cost_krw:      { color:'#3b82f6', label:'광고비',    unit:'money',  fmt:'k' },
  cpc_krw:       { color:'#f97316', label:'CPC',       unit:'money',  fmt:'k' },
  cpa_krw:       { color:'#a855f7', label:'CPA',       unit:'money',  fmt:'k' },
  roas:          { color:'#f59e0b', label:'ROAS',      unit:'ratio',  fmt:'r' },
  ctr_pct:       { color:'#14b8a6', label:'CTR',       unit:'pct',    fmt:'p' },
  click_cvr_pct: { color:'#06b6d4', label:'전환율',    unit:'pct',    fmt:'p' }
};

function fmtByType(v, type) {
  if (v == null || isNaN(v)) return '-';
  if (type === 'k') return '₩' + Math.round(v).toLocaleString('ko-KR');
  if (type === 'r') return (+v).toFixed(2) + 'x';
  if (type === 'p') return (+v).toFixed(2) + '%';
  return Math.round(v).toLocaleString('ko-KR');
}

// ============================================
// 스마트 축·타입 자동 배정
// ============================================
function assignAxisAndType(activeMetrics, daily) {
  // 각 지표의 최대값 계산
  const maxValues = {};
  activeMetrics.forEach(m => {
    maxValues[m] = Math.max(...daily.map(r => Math.abs(num(r[m]))));
  });
  
  // 단위별로 그룹화
  const byUnit = { count: [], money: [], ratio: [], pct: [] };
  activeMetrics.forEach(m => {
    byUnit[METRIC_META[m].unit].push(m);
  });
  
  // Y축 배정 규칙:
  // - count와 money는 절대값이 다름 → 무조건 다른 축
  // - ratio(ROAS)와 pct(CTR/CVR)는 작은 값 → 별도 y3 축
  // 
  // 최대 3개 축 사용:
  //   y (좌): count (노출/클릭/전환) - 첫 번째 그룹
  //   y2 (우1): money (매출/광고비/CPC/CPA)
  //   y3 (우2): ratio/pct (ROAS/CTR/전환율)
  
  const axisMap = {};
  const typeMap = {};
  
  activeMetrics.forEach(m => {
    const meta = METRIC_META[m];
    const maxV = maxValues[m];
    
    // 축 배정
    if (meta.unit === 'count') axisMap[m] = 'y';
    else if (meta.unit === 'money') axisMap[m] = 'y2';
    else axisMap[m] = 'y3';  // ratio + pct
  });
  
  // 차트 타입 자동 결정 (같은 축 안에서 스케일 차이 감지)
  const axisMax = { y: 0, y2: 0, y3: 0 };
  Object.entries(axisMap).forEach(([m, ax]) => {
    axisMax[ax] = Math.max(axisMax[ax], maxValues[m]);
  });
  
  activeMetrics.forEach(m => {
    const meta = METRIC_META[m];
    const ax = axisMap[m];
    const maxV = maxValues[m];
    const axMaxV = axisMax[ax];
    
    // 규칙:
    // - ratio/pct는 항상 line (막대 안 어울림)
    // - 같은 축의 최대값 대비 20% 미만이면 line (막대로는 안 보임)
    // - 그 외 (누적성 데이터, 충분한 크기) 막대
    if (meta.unit === 'ratio' || meta.unit === 'pct') {
      typeMap[m] = 'line';
    } else if (axMaxV > 0 && maxV / axMaxV < 0.2) {
      typeMap[m] = 'line';  // 스케일이 20% 미만이면 라인
    } else {
      typeMap[m] = 'bar';
    }
  });
  
  return { axisMap, typeMap };
}

// ============================================
// 차트 렌더링
// ============================================
function renderDailyMultiChart() {
  const canvas = document.getElementById('dailyMultiChart');
  if (!canvas) return;
  
  // 글로벌 필터 반영: filterDaily() 함수가 있으면 사용, 없으면 raw
  const daily = (typeof filterDaily === 'function' ? filterDaily() : (DATA.daily || []))
    .slice()
    .sort((a, b) => (a.event_date || '').localeCompare(b.event_date || ''));
  
  if (!daily.length) {
    canvas.parentNode.innerHTML = '<div class="chart-wrap tall"><canvas id="dailyMultiChart"></canvas></div><div class="loading">해당 기간 데이터 없음</div>';
    return;
  }
  
  const activeMetrics = Array.from(DAILY_METRICS_STATE.active);
  if (!activeMetrics.length) {
    if (dailyMultiChart) dailyMultiChart.destroy();
    return;
  }
  
  // 스마트 축·타입 배정
  const { axisMap, typeMap } = assignAxisAndType(activeMetrics, daily);
  
  const labels = daily.map(r => (r.event_date || '').slice(5));
  const datasets = [];
  
  activeMetrics.forEach(m => {
    const meta = METRIC_META[m];
    const data = daily.map(r => num(r[m]));
    const isLine = typeMap[m] === 'line';
    
    const ds = {
      label: meta.label + (isLine ? ' (선)' : ''),
      data,
      yAxisID: axisMap[m],
      order: isLine ? 1 : 2,
      _fmt: meta.fmt
    };
    
    if (isLine) {
      ds.type = 'line';
      ds.borderColor = meta.color;
      ds.backgroundColor = meta.color + '20';
      ds.borderWidth = 2.5;
      ds.tension = 0.35;
      ds.pointRadius = 3.5;
      ds.pointHoverRadius = 6;
      ds.pointBackgroundColor = meta.color;
      ds.pointBorderColor = 'white';
      ds.pointBorderWidth = 1.5;
      ds.fill = false;
    } else {
      ds.type = 'bar';
      ds.backgroundColor = meta.color + 'CC';  // ~80% opacity
      ds.borderColor = meta.color;
      ds.borderRadius = 3;
      ds.borderWidth = 1;
    }
    datasets.push(ds);
  });
  
  if (dailyMultiChart) dailyMultiChart.destroy();
  const ctx = canvas.getContext('2d');
  
  // 사용되는 축만 활성화
  const usedAxes = new Set(Object.values(axisMap));
  const scales = {
    x: { 
      stacked: false,
      ticks: { font: { size: 10 } },
      grid: { color: '#f1f5f9' }
    }
  };
  
  if (usedAxes.has('y')) {
    scales.y = {
      position: 'left',
      title: { display: true, text: '개수 (노출/클릭/전환)', font: { size: 10 }, color: '#64748b' },
      ticks: {
        callback: v => v >= 1000 ? (v / 1000).toFixed(1) + 'K' : v,
        font: { size: 10 },
        color: '#64748b'
      },
      grid: { color: '#f8fafc' },
      beginAtZero: true
    };
  }
  if (usedAxes.has('y2')) {
    scales.y2 = {
      position: 'right',
      title: { display: true, text: '금액 (₩)', font: { size: 10 }, color: '#64748b' },
      grid: { drawOnChartArea: false },
      ticks: {
        callback: v => v >= 1000000 ? '₩' + (v / 1000000).toFixed(1) + 'M' 
                     : v >= 1000 ? '₩' + (v / 1000).toFixed(0) + 'K' 
                     : '₩' + v,
        font: { size: 10 },
        color: '#64748b'
      },
      beginAtZero: true
    };
  }
  if (usedAxes.has('y3')) {
    scales.y3 = {
      type: 'linear',
      position: 'right',
      title: { display: true, text: 'ROAS / 비율(%)', font: { size: 10 }, color: '#64748b' },
      grid: { drawOnChartArea: false },
      ticks: {
        callback: v => (+v).toFixed(1),
        font: { size: 10 },
        color: '#64748b'
      },
      min: 0,
      // y2와 겹치지 않도록 오프셋
      offset: usedAxes.has('y2') ? true : false
    };
  }
  
  dailyMultiChart = new Chart(ctx, {
    data: { labels, datasets },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: { mode: 'index', intersect: false },
      plugins: {
        legend: {
          position: 'top',
          labels: { boxWidth: 12, font: { size: 11 }, padding: 10, usePointStyle: false }
        },
        tooltip: {
          callbacks: {
            label: (c) => {
              const ds = c.dataset;
              const v = c.parsed.y;
              const fmt = ds._fmt || 'n';
              return `${ds.label}: ${fmtByType(v, fmt)}`;
            }
          }
        }
      },
      scales
    }
  });
  
  // 축 배정 정보를 하단 안내에 반영
  updateAxisHint(axisMap, typeMap);
}

// 축 배정 안내 텍스트 업데이트
function updateAxisHint(axisMap, typeMap) {
  const hint = document.getElementById('dailyChartHint');
  if (!hint) return;
  
  const groups = { y: [], y2: [], y3: [] };
  Object.entries(axisMap).forEach(([m, ax]) => {
    const meta = METRIC_META[m];
    const type = typeMap[m] === 'line' ? '📈' : '📊';
    groups[ax].push(`${type} ${meta.label}`);
  });
  
  const parts = [];
  if (groups.y.length) parts.push(`<strong style="color:#64748b;">좌축:</strong> ${groups.y.join(', ')}`);
  if (groups.y2.length) parts.push(`<strong style="color:#3b82f6;">우축1(₩):</strong> ${groups.y2.join(', ')}`);
  if (groups.y3.length) parts.push(`<strong style="color:#f59e0b;">우축2(비율):</strong> ${groups.y3.join(', ')}`);
  
  hint.innerHTML = '🎨 <strong>자동 축 배정:</strong> ' + parts.join(' · ') 
    + '<br>💡 데이터 스케일이 작으면 자동으로 <span style="color:#f59e0b;">선(📈)</span>으로 표시, 필터 변경 시 자동 재렌더';
}

// ============================================
// 지표 버튼 이벤트
// ============================================
function initDailyMetricBtns() {
  const btns = document.querySelectorAll('#dailyMetricBtns .metric-btn');
  if (!btns.length) return;
  
  // 초기 상태 sync
  DAILY_METRICS_STATE.active.clear();
  btns.forEach(btn => {
    if (btn.classList.contains('active')) {
      DAILY_METRICS_STATE.active.add(btn.dataset.metric);
    }
  });
  
  btns.forEach(btn => {
    // 기존 리스너 제거를 위해 clone
    const newBtn = btn.cloneNode(true);
    btn.parentNode.replaceChild(newBtn, btn);
    
    newBtn.addEventListener('click', () => {
      const metric = newBtn.dataset.metric;
      const isActive = newBtn.classList.toggle('active');
      if (isActive) {
        DAILY_METRICS_STATE.active.add(metric);
      } else {
        if (DAILY_METRICS_STATE.active.size <= 1) {
          newBtn.classList.add('active');
          return;
        }
        DAILY_METRICS_STATE.active.delete(metric);
      }
      renderDailyMultiChart();
    });
  });
}

// ============================================
// 🚀📉 상승/하락 키워드 TOP 10 (변경 없음, 이전 버전 유지)
// ============================================
function renderKeywordTrendsFixed() {
  const trendData = DATA.trend || [];
  const kwData = DATA.keyword || [];
  const perfData = DATA.perf || [];
  
  const cols = [
    { key: 'keyword', label: '키워드' },
    { key: 'currRev', label: '현재 매출', num: true },
    { key: 'prevRev', label: '이전 매출', num: true },
    { key: 'change', label: '변화율', num: true },
    { key: 'roas', label: 'ROAS', num: true }
  ];
  
  let allRows = [];
  const seen = new Set();
  
  trendData.forEach(r => {
    if (!r.keyword || r.keyword === 'null') return;
    const key = r.keyword + '|' + (r.campaign_name || '');
    if (seen.has(key)) return;
    seen.add(key);
    
    const wow = num(r.rev_wow_pct);
    const curr = num(r.revenue);
    if (curr <= 0 && !wow) return;
    
    const prev = wow !== 0 && !isNaN(wow) 
      ? curr / (1 + wow / 100) 
      : num(r.rev_7d_avg) || 0;
    
    allRows.push({
      keyword: r.keyword,
      campaign: r.campaign_name || '-',
      currRev: curr,
      prevRev: prev,
      change: wow,
      roas: num(r.roas)
    });
  });
  
  // mart31 부실 시 mart26 (perf)에서 재계산
  if (allRows.filter(r => r.change !== 0 && !isNaN(r.change)).length < 5) {
    const kwByDate = {};
    perfData.forEach(r => {
      const kwName = r.keyword;
      const campName = r.campaign_name || '';
      if (!kwName || kwName === 'null' || !r.event_date) return;
      const key = kwName + '|' + campName;
      if (!kwByDate[key]) kwByDate[key] = { name: kwName, campaign: campName, dates: {} };
      const d = r.event_date;
      if (!kwByDate[key].dates[d]) kwByDate[key].dates[d] = { rev: 0, cost: 0, conv: 0 };
      kwByDate[key].dates[d].rev += num(r.revenue);
      kwByDate[key].dates[d].cost += num(r.cost_krw);
      kwByDate[key].dates[d].conv += num(r.conversions);
    });
    
    const allDates = [...new Set(perfData.map(r => r.event_date).filter(Boolean))].sort();
    if (allDates.length >= 14) {
      const recent7 = allDates.slice(-7);
      const prev7 = allDates.slice(-14, -7);
      
      allRows = [];
      Object.values(kwByDate).forEach(kd => {
        const recSum = recent7.reduce((s, d) => ({
          rev: s.rev + (kd.dates[d]?.rev || 0),
          cost: s.cost + (kd.dates[d]?.cost || 0),
          conv: s.conv + (kd.dates[d]?.conv || 0)
        }), { rev: 0, cost: 0, conv: 0 });
        const prvSum = prev7.reduce((s, d) => ({
          rev: s.rev + (kd.dates[d]?.rev || 0),
          cost: s.cost + (kd.dates[d]?.cost || 0),
          conv: s.conv + (kd.dates[d]?.conv || 0)
        }), { rev: 0, cost: 0, conv: 0 });
        
        if (recSum.rev < 1000 && prvSum.rev < 1000) return;
        
        const change = prvSum.rev > 0 ? (recSum.rev - prvSum.rev) / prvSum.rev * 100 
                     : recSum.rev > 0 ? 100 : 0;
        const roas = recSum.cost ? recSum.rev / recSum.cost : 0;
        
        allRows.push({
          keyword: kd.name,
          campaign: kd.campaign,
          currRev: recSum.rev,
          prevRev: prvSum.rev,
          change,
          roas
        });
      });
    }
  }
  
  const withChange = allRows.filter(r => 
    !isNaN(r.change) && (r.currRev > 0 || r.prevRev > 0)
  );
  
  let rising = withChange.filter(r => r.change > 5).sort((a, b) => b.change - a.change).slice(0, 10);
  let falling = withChange.filter(r => r.change < -5).sort((a, b) => a.change - b.change).slice(0, 10);
  
  const state = typeof SORT_STATE !== 'undefined' ? SORT_STATE : {};
  if (typeof sortRows === 'function') {
    const stR = state.rising || { key: 'change', dir: 'desc' };
    rising = sortRows(rising, stR.key, stR.dir);
    const stF = state.falling || { key: 'change', dir: 'asc' };
    falling = sortRows(falling, stF.key, stF.dir);
  }
  
  const buildRow = (r, cls) => `<tr>
    <td><strong>${r.keyword}</strong><br><small style="color:var(--muted);">${r.campaign}</small></td>
    <td class="num">${nfmt.k(r.currRev)}</td>
    <td class="num">${nfmt.k(r.prevRev)}</td>
    <td class="num ${cls}">${r.change >= 0 ? '+' : ''}${r.change.toFixed(1)}%</td>
    <td class="num ${roasClass(r.roas)}">${nfmt.r(r.roas)}</td>
  </tr>`;
  
  const risingHtml = (typeof makeSortHeader === 'function' ? makeSortHeader(cols, 'rising') : '') 
    + '<tbody>' 
    + (rising.length ? rising.map(r => buildRow(r, 'trend-up')).join('')
      : '<tr><td colspan="5" style="text-align:center;padding:24px;color:var(--muted);">상승 키워드 없음</td></tr>')
    + '</tbody>';
  
  const fallingHtml = (typeof makeSortHeader === 'function' ? makeSortHeader(cols, 'falling') : '')
    + '<tbody>'
    + (falling.length ? falling.map(r => buildRow(r, 'trend-down')).join('')
      : '<tr><td colspan="5" style="text-align:center;padding:24px;color:var(--muted);">하락 키워드 없음</td></tr>')
    + '</tbody>';
  
  const risingTbl = document.getElementById('risingKwTable');
  const fallingTbl = document.getElementById('fallingKwTable');
  if (risingTbl) risingTbl.innerHTML = risingHtml;
  if (fallingTbl) fallingTbl.innerHTML = fallingHtml;
  
  if (typeof attachSort === 'function') {
    attachSort('risingKwTable', cols, 'rising', renderKeywordTrendsFixed);
    attachSort('fallingKwTable', cols, 'falling', renderKeywordTrendsFixed);
  }
}

// ============================================
// 초기화 + 필터 후크 (renderAll 감싸기)
// ============================================
function bootDailyChart() {
  const wait = setInterval(() => {
    if (typeof DATA !== 'undefined' && DATA.daily && document.getElementById('dailyMultiChart')) {
      clearInterval(wait);
      
      // 축 안내 요소 없으면 추가
      const chartWrap = document.querySelector('.chart-wrap.tall canvas#dailyMultiChart');
      if (chartWrap && !document.getElementById('dailyChartHint')) {
        const hint = document.createElement('div');
        hint.id = 'dailyChartHint';
        hint.style.cssText = 'margin-top:8px;font-size:11px;color:var(--muted);line-height:1.6;padding:8px 10px;background:#f8fafc;border-radius:6px;border:1px solid #e5e7eb;';
        chartWrap.parentNode.parentNode.insertBefore(hint, chartWrap.parentNode.nextSibling);
      }
      
      initDailyMetricBtns();
      renderDailyMultiChart();
      renderKeywordTrendsFixed();
      
      // 필터 변경 시 자동 재렌더 (renderAll 감싸기)
      if (typeof window.renderAll === 'function' && !window._dailyChartHooked) {
        window._dailyChartHooked = true;
        const origRenderAll = window.renderAll;
        window.renderAll = function() {
          origRenderAll.apply(this, arguments);
          setTimeout(() => {
            renderDailyMultiChart();
            renderKeywordTrendsFixed();
          }, 50);
        };
        console.log('[DailyChart] 필터 후크 등록 완료 - 필터 변경 시 자동 재렌더');
      }
    }
  }, 300);
  setTimeout(() => clearInterval(wait), 20000);
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', bootDailyChart);
} else {
  bootDailyChart();
}
