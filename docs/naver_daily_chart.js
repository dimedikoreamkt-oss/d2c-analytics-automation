// ============================================
// 📊 일일 성과 커스터마이징 차트 (다중 지표 토글)
// ============================================

let dailyMultiChart;
const DAILY_METRICS_STATE = {
  // 초기 활성 지표
  active: new Set(['impressions', 'clicks', 'revenue'])
};

// 지표 정의 (data 속성에서 자동 추출되지만 fallback용)
const METRIC_META = {
  impressions:   { color:'#0066FF', label:'노출',    yaxis:'y',  type:'bar',  fmt:'n' },
  clicks:        { color:'#8b5cf6', label:'클릭',    yaxis:'y',  type:'bar',  fmt:'n' },
  revenue:       { color:'#10b981', label:'매출',    yaxis:'y2', type:'bar',  fmt:'k' },
  cost_krw:      { color:'#3b82f6', label:'광고비',  yaxis:'y2', type:'bar',  fmt:'k' },
  roas:          { color:'#f59e0b', label:'ROAS',    yaxis:'y3', type:'line', fmt:'r' },
  purchases:     { color:'#ec4899', label:'전환',    yaxis:'y',  type:'bar',  fmt:'n' },
  ctr_pct:       { color:'#14b8a6', label:'CTR(%)',  yaxis:'y3', type:'line', fmt:'p' },
  cpc_krw:       { color:'#f97316', label:'CPC',     yaxis:'y2', type:'line', fmt:'k' },
  cpa_krw:       { color:'#a855f7', label:'CPA',     yaxis:'y2', type:'line', fmt:'k' },
  click_cvr_pct: { color:'#06b6d4', label:'전환율(%)', yaxis:'y3', type:'line', fmt:'p' }
};

function fmtByType(v, type) {
  if (v == null || isNaN(v)) return '-';
  if (type === 'k') return '₩' + Math.round(v).toLocaleString('ko-KR');
  if (type === 'r') return (+v).toFixed(2) + 'x';
  if (type === 'p') return (+v).toFixed(2) + '%';
  return Math.round(v).toLocaleString('ko-KR');
}

function renderDailyMultiChart() {
  const canvas = document.getElementById('dailyMultiChart');
  if (!canvas) return;
  
  const daily = (typeof filterDaily === 'function' ? filterDaily() : (DATA.daily || []))
    .slice().sort((a, b) => (a.event_date || '').localeCompare(b.event_date || ''));
  
  if (!daily.length) {
    canvas.parentNode.innerHTML = '<div class="loading">해당 기간 데이터 없음</div>';
    return;
  }
  
  const labels = daily.map(r => (r.event_date || '').slice(5));
  const datasets = [];
  
  DAILY_METRICS_STATE.active.forEach(m => {
    const meta = METRIC_META[m];
    if (!meta) return;
    const data = daily.map(r => num(r[m]));
    const ds = {
      label: meta.label,
      data,
      yAxisID: meta.yaxis,
      order: meta.type === 'line' ? 1 : 2
    };
    if (meta.type === 'line') {
      ds.type = 'line';
      ds.borderColor = meta.color;
      ds.backgroundColor = meta.color;
      ds.borderWidth = 2.5;
      ds.tension = 0.35;
      ds.pointRadius = 3;
      ds.pointHoverRadius = 5;
      ds.fill = false;
    } else {
      ds.type = 'bar';
      // 반투명 배경으로
      ds.backgroundColor = meta.color + 'B8';  // ~72% opacity
      ds.borderColor = meta.color;
      ds.borderRadius = 3;
      ds.borderWidth = 1;
    }
    ds._fmt = meta.fmt;
    datasets.push(ds);
  });
  
  if (dailyMultiChart) dailyMultiChart.destroy();
  const ctx = canvas.getContext('2d');
  
  // 어떤 Y축이 실제로 사용되는지 확인
  const usedAxes = new Set();
  DAILY_METRICS_STATE.active.forEach(m => usedAxes.add(METRIC_META[m]?.yaxis));
  
  const scales = {
    x: { ticks: { font: { size: 10 } } }
  };
  if (usedAxes.has('y')) {
    scales.y = {
      position: 'left',
      title: { display: true, text: '개수 (노출/클릭/전환)', font: { size: 10 } },
      ticks: {
        callback: v => v >= 1000 ? (v / 1000).toFixed(0) + 'K' : v,
        font: { size: 10 }
      }
    };
  }
  if (usedAxes.has('y2')) {
    scales.y2 = {
      position: 'right',
      title: { display: true, text: '금액 (₩)', font: { size: 10 } },
      grid: { drawOnChartArea: false },
      ticks: {
        callback: v => v >= 1000000 ? '₩' + (v / 1000000).toFixed(1) + 'M' 
                     : v >= 1000 ? '₩' + (v / 1000).toFixed(0) + 'K' 
                     : '₩' + v,
        font: { size: 10 }
      }
    };
  }
  if (usedAxes.has('y3')) {
    scales.y3 = {
      position: 'right',
      offset: usedAxes.has('y2'),
      title: { display: true, text: 'ROAS / % (비율)', font: { size: 10 } },
      grid: { drawOnChartArea: false },
      ticks: {
        callback: v => (+v).toFixed(1),
        font: { size: 10 }
      },
      min: 0
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
          labels: { boxWidth: 12, font: { size: 11 }, padding: 10 }
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
}

// 지표 버튼 이벤트
function initDailyMetricBtns() {
  const btns = document.querySelectorAll('#dailyMetricBtns .metric-btn');
  if (!btns.length) return;
  
  // 초기 active 상태 sync
  DAILY_METRICS_STATE.active.clear();
  btns.forEach(btn => {
    if (btn.classList.contains('active')) {
      DAILY_METRICS_STATE.active.add(btn.dataset.metric);
    }
  });
  
  btns.forEach(btn => {
    btn.addEventListener('click', () => {
      const metric = btn.dataset.metric;
      const isActive = btn.classList.toggle('active');
      if (isActive) {
        DAILY_METRICS_STATE.active.add(metric);
      } else {
        // 최소 1개는 유지
        if (DAILY_METRICS_STATE.active.size <= 1) {
          btn.classList.add('active');  // 되돌리기
          return;
        }
        DAILY_METRICS_STATE.active.delete(metric);
      }
      renderDailyMultiChart();
    });
  });
}

// ============================================
// 🚀📉 상승/하락 키워드 TOP 10 재구성
// mart31의 여러 날짜 데이터를 활용 (최신 날짜만이 아닌 최근 이력 활용)
// 그리고 mart31이 부실할 경우 mart28(30일 통계) + mart26(일자별)에서 계산
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
  
  // 방법 1: mart31 (trend)에서 rev_wow_pct가 있는 최신 데이터 활용
  let allRows = [];
  const seen = new Set();
  
  // trend에서 유효한 항목 수집
  trendData.forEach(r => {
    if (!r.keyword || r.keyword === 'null') return;
    const key = r.keyword + '|' + (r.campaign_name || '');
    if (seen.has(key)) return;
    seen.add(key);
    
    const wow = num(r.rev_wow_pct);
    const curr = num(r.revenue);
    if (curr <= 0 && !wow) return;
    
    // 이전 매출 역산
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
  
  // 방법 2: mart31에 wow 데이터가 부실하면 mart26 (perf)에서 계산
  if (allRows.filter(r => r.change !== 0 && !isNaN(r.change)).length < 5) {
    console.log('[Trend] mart31 데이터 부족, mart26에서 재계산');
    
    // perf에서 키워드별 일자별 데이터 집계
    const kwByDate = {};  // { keyword_key: { date: {rev, cost, conv, imps, clicks} } }
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
    
    // 최근 7일 vs 이전 7일 비교
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
        
        // 유의미한 데이터만
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
      console.log('[Trend] mart26 재계산 완료:', allRows.length, '개');
    }
  }
  
  // 유효한 변화율만 필터링
  const withChange = allRows.filter(r => 
    !isNaN(r.change) && (r.currRev > 0 || r.prevRev > 0)
  );
  
  // 상승 TOP 10
  let rising = withChange.filter(r => r.change > 5).sort((a, b) => b.change - a.change).slice(0, 10);
  // 하락 TOP 10
  let falling = withChange.filter(r => r.change < -5).sort((a, b) => a.change - b.change).slice(0, 10);
  
  const state = typeof SORT_STATE !== 'undefined' ? SORT_STATE : {};
  if (typeof sortRows === 'function') {
    const stR = state.rising || { key: 'change', dir: 'desc' };
    rising = sortRows(rising, stR.key, stR.dir);
    const stF = state.falling || { key: 'change', dir: 'asc' };
    falling = sortRows(falling, stF.key, stF.dir);
  }
  
  const risingHtml = (typeof makeSortHeader === 'function' ? makeSortHeader(cols, 'rising') : '') 
    + '<tbody>' 
    + (rising.length 
      ? rising.map(r => `<tr>
          <td><strong>${r.keyword}</strong><br><small style="color:var(--muted);">${r.campaign}</small></td>
          <td class="num">${nfmt.k(r.currRev)}</td>
          <td class="num">${nfmt.k(r.prevRev)}</td>
          <td class="num trend-up">+${r.change.toFixed(1)}%</td>
          <td class="num ${roasClass(r.roas)}">${nfmt.r(r.roas)}</td>
        </tr>`).join('')
      : '<tr><td colspan="5" style="text-align:center;padding:24px;color:var(--muted);">상승 키워드 없음<br><small>충분한 이력 데이터 필요 (14일+)</small></td></tr>')
    + '</tbody>';
  
  const fallingHtml = (typeof makeSortHeader === 'function' ? makeSortHeader(cols, 'falling') : '')
    + '<tbody>'
    + (falling.length 
      ? falling.map(r => `<tr>
          <td><strong>${r.keyword}</strong><br><small style="color:var(--muted);">${r.campaign}</small></td>
          <td class="num">${nfmt.k(r.currRev)}</td>
          <td class="num">${nfmt.k(r.prevRev)}</td>
          <td class="num trend-down">${r.change.toFixed(1)}%</td>
          <td class="num ${roasClass(r.roas)}">${nfmt.r(r.roas)}</td>
        </tr>`).join('')
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
  
  console.log('[Trend] 상승 키워드:', rising.length, '개, 하락 키워드:', falling.length, '개');
}

// ============================================
// 초기화 - 기존 render()가 완료된 후 추가 렌더
// ============================================
function bootDailyChart() {
  const wait = setInterval(() => {
    if (typeof DATA !== 'undefined' && DATA.daily && document.getElementById('dailyMultiChart')) {
      clearInterval(wait);
      initDailyMetricBtns();
      renderDailyMultiChart();
      renderKeywordTrendsFixed();
      
      // 필터 변경 시에도 재렌더
      const origRenderAll = window.renderAll;
      if (typeof origRenderAll === 'function' && !window._dailyChartHooked) {
        window._dailyChartHooked = true;
        window.renderAll = function() {
          origRenderAll.apply(this, arguments);
          setTimeout(() => {
            renderDailyMultiChart();
            renderKeywordTrendsFixed();
          }, 50);
        };
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
