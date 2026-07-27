/* ==========================================================================
   Mart26 · Daily Multi-Metric Chart (필터 연동 버전)
   - 전역 필터 (window.currentFilters) 를 실시간 반영
   - 지표 다중 선택 · 자동 축 분리 · 자동 line/bar 전환
   ========================================================================== */
(function () {
  'use strict';

  const METRICS = [
    { key:'impressions',   label:'노출',      axis:'y',  color:'#0066FF', fmt:'int'   },
    { key:'clicks',        label:'클릭',      axis:'y',  color:'#00A76F', fmt:'int'   },
    { key:'revenue',       label:'매출',      axis:'y2', color:'#E5484D', fmt:'krw'   },
    { key:'cost_krw',      label:'광고비',    axis:'y2', color:'#F59E0B', fmt:'krw'   },
    { key:'conversions',   label:'전환',      axis:'y',  color:'#8B5CF6', fmt:'int'   },
    { key:'purchases',     label:'구매',      axis:'y',  color:'#EC4899', fmt:'int'   },
    { key:'roas',          label:'ROAS',      axis:'y3', color:'#14B8A6', fmt:'ratio' },
    { key:'ctr_pct',       label:'CTR(%)',    axis:'y3', color:'#F97316', fmt:'pct'   },
    { key:'cpc_krw',       label:'CPC',       axis:'y2', color:'#6366F1', fmt:'krw'   },
    { key:'cpa_krw',       label:'CPA',       axis:'y2', color:'#DC2626', fmt:'krw'   }
  ];
  const DEFAULT_ACTIVE = ['impressions','clicks','revenue'];

  let rawData = [];      // 원본
  let activeMetrics = new Set(DEFAULT_ACTIVE);
  let chartInst = null;

  /* ---- 포맷터 ---- */
  const fmtInt   = v => (v||0).toLocaleString('ko-KR');
  const fmtKrw   = v => '₩' + Math.round(v||0).toLocaleString('ko-KR');
  const fmtPct   = v => (v||0).toFixed(2) + '%';
  const fmtRatio = v => (v||0).toFixed(2);
  const fmtMap   = { int:fmtInt, krw:fmtKrw, pct:fmtPct, ratio:fmtRatio };

  /* ---- 필터 적용 ---- */
  function applyFilters(rows){
    const f = window.currentFilters || {};
    let out = rows.slice();

    // 날짜 필터
    if (f.dateFrom) out = out.filter(r => r.event_date >= f.dateFrom);
    if (f.dateTo)   out = out.filter(r => r.event_date <= f.dateTo);

    // 캠페인 타입 필터: mart29 는 type 없음 → mart26 에서 해당 기간의 날짜 셋으로 재계산
    if ((f.campaignType || f.campaignName) && Array.isArray(window.mart26Data)) {
      let src = window.mart26Data.slice();
      if (f.dateFrom) src = src.filter(r => r.event_date >= f.dateFrom);
      if (f.dateTo)   src = src.filter(r => r.event_date <= f.dateTo);
      if (f.campaignType) src = src.filter(r => (r.campaign_type||'') === f.campaignType);
      if (f.campaignName) src = src.filter(r => (r.campaign_name||'') === f.campaignName);

      // 일자별 재집계
      const byDate = {};
      src.forEach(r => {
        const d = r.event_date;
        if(!d) return;
        const b = byDate[d] || (byDate[d] = {
          event_date:d, impressions:0, clicks:0, revenue:0, cost_krw:0,
          conversions:0, purchases:0, ctr_pct:0, cpc_krw:0, cpa_krw:0, roas:0
        });
        b.impressions += (+r.impressions||0);
        b.clicks      += (+r.clicks||0);
        b.revenue     += (+r.revenue||+r.ga_revenue||0);
        b.cost_krw    += (+r.cost_krw||0);
        b.conversions += (+r.conversions||0);
        b.purchases   += (+r.conversions||+r.ga_purchases||0);
      });
      out = Object.values(byDate).map(b => {
        b.ctr_pct = b.impressions ? (b.clicks / b.impressions * 100) : 0;
        b.cpc_krw = b.clicks      ? (b.cost_krw / b.clicks)          : 0;
        b.cpa_krw = b.purchases   ? (b.cost_krw / b.purchases)       : 0;
        b.roas    = b.cost_krw    ? (b.revenue / b.cost_krw)         : 0;
        return b;
      });
    }

    return out.sort((a,b)=> (a.event_date||'').localeCompare(b.event_date||''));
  }

  /* ---- 자동 축/타입 결정 ---- */
  function decideType(values, axisMax){
    if (!values.length || !axisMax) return 'bar';
    const localMax = Math.max(...values.map(v => +v || 0));
    // 축 최대치 대비 20% 미만이면 line 으로
    return (localMax / axisMax < 0.20) ? 'line' : 'bar';
  }

  /* ---- 렌더 ---- */
  function render(){
    const rows = applyFilters(rawData);
    const labels = rows.map(r => (r.event_date||'').slice(5)); // MM-DD

    // 축별 최대값
    const axisMax = { y:0, y2:0, y3:0 };
    METRICS.forEach(m=>{
      if(!activeMetrics.has(m.key)) return;
      const vals = rows.map(r => +r[m.key] || 0);
      const mx = Math.max(...vals, 0);
      if(mx > axisMax[m.axis]) axisMax[m.axis] = mx;
    });

    const datasets = METRICS.filter(m=>activeMetrics.has(m.key)).map(m=>{
      const vals = rows.map(r => +r[m.key] || 0);
      const type = decideType(vals, axisMax[m.axis]);
      return {
        type,
        label: m.label,
        data: vals,
        yAxisID: m.axis,
        backgroundColor: type==='bar' ? m.color+'CC' : m.color,
        borderColor: m.color,
        borderWidth: type==='line' ? 2.5 : 1,
        pointRadius: type==='line' ? 3 : 0,
        pointHoverRadius: 5,
        tension: 0.3,
        fill: false,
        order: type==='line' ? 0 : 1
      };
    });

    const ctx = document.getElementById('daily-multi-chart');
    if(!ctx) return;
    if(chartInst){ chartInst.destroy(); chartInst = null; }

    chartInst = new Chart(ctx, {
      data: { labels, datasets },
      options: {
        responsive:true, maintainAspectRatio:false,
        interaction:{ mode:'index', intersect:false },
        plugins:{
          legend:{ display:true, position:'top', labels:{ boxWidth:12, font:{size:11} } },
          tooltip:{
            callbacks:{
              label:(c)=>{
                const m = METRICS.find(x=>x.label===c.dataset.label);
                const f = m ? fmtMap[m.fmt] : fmtInt;
                return `${c.dataset.label}: ${f(c.parsed.y)}`;
              }
            }
          }
        },
        scales:{
          x:{ grid:{ display:false }, ticks:{ font:{size:11} } },
          y : { display: axisMax.y>0,  position:'left',  beginAtZero:true,
                title:{ display:true, text:'건수', font:{size:10} },
                ticks:{ callback:v=>fmtInt(v), font:{size:10} } },
          y2: { display: axisMax.y2>0, position:'right', beginAtZero:true, grid:{ drawOnChartArea:false },
                title:{ display:true, text:'금액(₩)', font:{size:10} },
                ticks:{ callback:v=>fmtKrw(v), font:{size:10} } },
          y3: { display: axisMax.y3>0, position:'right', beginAtZero:true, grid:{ drawOnChartArea:false },
                offset:true,
                title:{ display:true, text:'비율', font:{size:10} },
                ticks:{ callback:v=>fmtRatio(v), font:{size:10} } }
        }
      }
    });
  }

  /* ---- 지표 버튼 UI ---- */
  function buildButtons(){
    const box = document.getElementById('daily-metric-buttons');
    if(!box) return;
    box.innerHTML = METRICS.map(m=>{
      const on = activeMetrics.has(m.key) ? 'active' : '';
      return `<button class="dm-btn ${on}" data-key="${m.key}" style="border-color:${m.color};color:${activeMetrics.has(m.key)?'#fff':m.color};background:${activeMetrics.has(m.key)?m.color:'#fff'};">${m.label}</button>`;
    }).join('');
    box.querySelectorAll('.dm-btn').forEach(btn=>{
      btn.onclick = ()=>{
        const k = btn.dataset.key;
        if(activeMetrics.has(k)) activeMetrics.delete(k); else activeMetrics.add(k);
        if(activeMetrics.size===0) activeMetrics.add(DEFAULT_ACTIVE[0]);
        buildButtons();
        render();
      };
    });
  }

  /* ---- 초기화 ---- */
  async function init(){
    try{
      const r = await fetch('data/mart29_naver_daily_comparison.json?t='+Date.now());
      rawData = r.ok ? await r.json() : [];
    }catch(e){ console.error('[daily-chart] fetch fail', e); rawData=[]; }

    // 스타일 주입
    if(!document.getElementById('dm-btn-style')){
      const s = document.createElement('style'); s.id='dm-btn-style';
      s.textContent = `
        .dm-btn{ padding:6px 12px; border:1.5px solid; border-radius:20px; font-size:12px; font-weight:600;
                 cursor:pointer; transition:all .15s; font-family:inherit; }
        .dm-btn:hover{ transform:translateY(-1px); box-shadow:0 4px 8px rgba(0,0,0,.1); }
        #daily-chart-wrap{ background:#fff; border:1px solid var(--border,#E8ECF2); border-radius:12px; padding:20px; margin:16px 0; }
        #daily-chart-wrap h3{ font-size:15px; font-weight:700; margin-bottom:8px; }
        #daily-metric-buttons{ display:flex; flex-wrap:wrap; gap:6px; margin:12px 0; }
        #daily-multi-chart{ height:340px !important; }
      `;
      document.head.appendChild(s);
    }

    buildButtons();
    render();

    // ★ 전역 필터 변경 시 자동 재렌더
    window.rerenderDailyChart = render;
    const prevRenderAll = window.renderAll;
    window.renderAll = function(){
      if(typeof prevRenderAll === 'function'){ try{ prevRenderAll.apply(this, arguments); }catch(e){} }
      render();
    };
    document.addEventListener('filterchange', render);
    window.addEventListener('filterchange', render);
  }

  if(document.readyState==='loading'){
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
