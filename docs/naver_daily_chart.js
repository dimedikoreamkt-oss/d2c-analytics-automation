/* ==========================================================================
   Mart26 · Daily Multi-Metric Chart
   - 전역 필터 연동 · 자동 축분리 · line/bar 자동 전환
   - canvas 높이 강제, 데이터 없으면 안내 표시
   ========================================================================== */
(function(){
  'use strict';

  const METRICS = [
    { key:'impressions', label:'노출',   axis:'y',  color:'#0066FF', fmt:'int'   },
    { key:'clicks',      label:'클릭',   axis:'y',  color:'#00A76F', fmt:'int'   },
    { key:'revenue',     label:'매출',   axis:'y2', color:'#E5484D', fmt:'krw'   },
    { key:'cost_krw',    label:'광고비', axis:'y2', color:'#F59E0B', fmt:'krw'   },
    { key:'roas',        label:'ROAS',   axis:'y3', color:'#14B8A6', fmt:'ratio' },
    { key:'conversions', label:'전환',   axis:'y',  color:'#8B5CF6', fmt:'int'   },
    { key:'ctr_pct',     label:'CTR',    axis:'y3', color:'#F97316', fmt:'pct'   },
    { key:'cpc_krw',     label:'CPC',    axis:'y2', color:'#6366F1', fmt:'krw'   },
    { key:'cpa_krw',     label:'CPA',    axis:'y2', color:'#DC2626', fmt:'krw'   },
    { key:'click_cvr_pct', label:'전환율', axis:'y3', color:'#A16207', fmt:'pct' }
  ];
  const DEFAULT_ACTIVE = ['impressions','clicks','revenue'];

  let rawData=[], activeMetrics=new Set(DEFAULT_ACTIVE), chartInst=null;

  const fmtInt=v=>Math.round(+v||0).toLocaleString('ko-KR');
  const fmtKrw=v=>'₩'+Math.round(+v||0).toLocaleString('ko-KR');
  const fmtPct=v=>((+v||0)).toFixed(2)+'%';
  const fmtRatio=v=>((+v||0)).toFixed(2);
  const fmtMap={int:fmtInt,krw:fmtKrw,pct:fmtPct,ratio:fmtRatio};

  function applyFilters(rows){
    const f = window.currentFilters || {};
    let out = (rows||[]).slice();

    if(f.dateFrom) out = out.filter(r=>r.event_date >= f.dateFrom);
    if(f.dateTo)   out = out.filter(r=>r.event_date <= f.dateTo);

    // 타입/캠페인 필터가 있으면 mart26 raw 에서 재집계
    if((f.campaignType||f.campaignName) && Array.isArray(window.mart26Data)){
      let src = window.mart26Data.slice();
      if(f.dateFrom) src = src.filter(r=>r.event_date>=f.dateFrom);
      if(f.dateTo)   src = src.filter(r=>r.event_date<=f.dateTo);
      if(f.campaignType) src = src.filter(r=>(r.campaign_type||'')===f.campaignType);
      if(f.campaignName) src = src.filter(r=>(r.campaign_name||'')===f.campaignName);

      const by={};
      src.forEach(r=>{
        const d=r.event_date; if(!d) return;
        const b=by[d]||(by[d]={event_date:d,impressions:0,clicks:0,revenue:0,cost_krw:0,conversions:0});
        b.impressions += (+r.impressions||0);
        b.clicks      += (+r.clicks||0);
        b.revenue     += (+r.revenue||+r.ga_revenue||0);
        b.cost_krw    += (+r.cost_krw||0);
        b.conversions += (+r.conversions||0);
      });
      out = Object.values(by).map(b=>{
        b.ctr_pct       = b.impressions? b.clicks/b.impressions*100 : 0;
        b.cpc_krw       = b.clicks?      b.cost_krw/b.clicks        : 0;
        b.cpa_krw       = b.conversions? b.cost_krw/b.conversions   : 0;
        b.roas          = b.cost_krw?    b.revenue/b.cost_krw       : 0;
        b.click_cvr_pct = b.clicks?      b.conversions/b.clicks*100 : 0;
        return b;
      });
    }
    return out.sort((a,b)=>(a.event_date||'').localeCompare(b.event_date||''));
  }

  function decideType(vals,axisMax){
    if(!vals.length||!axisMax) return 'bar';
    const mx = Math.max(...vals.map(v=>+v||0));
    return (mx/axisMax < 0.20) ? 'line' : 'bar';
  }

  function render(){
    const wrap = document.getElementById('daily-chart-wrap');
    const canvas = document.getElementById('daily-multi-chart');
    if(!canvas){ console.warn('[daily-chart] canvas 없음'); return; }

    const rows = applyFilters(rawData);
    const empty = document.getElementById('daily-chart-empty');

    if(!rows.length){
      canvas.style.display='none';
      if(empty){ empty.style.display='flex'; empty.textContent='📭 표시할 데이터가 없습니다 (필터 조건을 조정해 주세요)'; }
      if(chartInst){ chartInst.destroy(); chartInst=null; }
      return;
    }
    if(empty) empty.style.display='none';
    canvas.style.display='block';

    const labels = rows.map(r=>(r.event_date||'').slice(5));
    const axisMax = {y:0,y2:0,y3:0};
    METRICS.forEach(m=>{
      if(!activeMetrics.has(m.key)) return;
      const mx = Math.max(...rows.map(r=>+r[m.key]||0), 0);
      if(mx>axisMax[m.axis]) axisMax[m.axis]=mx;
    });

    const datasets = METRICS.filter(m=>activeMetrics.has(m.key)).map(m=>{
      const vals = rows.map(r=>+r[m.key]||0);
      const type = decideType(vals, axisMax[m.axis]);
      return {
        type, label:m.label, data:vals, yAxisID:m.axis,
        backgroundColor: type==='bar'? m.color+'CC' : m.color,
        borderColor: m.color,
        borderWidth: type==='line'?2.5:1,
        pointRadius: type==='line'?3:0,
        pointHoverRadius:5, tension:0.3, fill:false,
        order: type==='line'?0:1
      };
    });

    if(chartInst){ chartInst.destroy(); chartInst=null; }
    chartInst = new Chart(canvas.getContext('2d'), {
      data:{ labels, datasets },
      options:{
        responsive:true, maintainAspectRatio:false,
        interaction:{mode:'index',intersect:false},
        plugins:{
          legend:{position:'top', labels:{boxWidth:12,font:{size:11}}},
          tooltip:{callbacks:{label:c=>{
            const m=METRICS.find(x=>x.label===c.dataset.label);
            const f=m?fmtMap[m.fmt]:fmtInt;
            return `${c.dataset.label}: ${f(c.parsed.y)}`;
          }}}
        },
        scales:{
          x:{grid:{display:false}, ticks:{font:{size:11}}},
          y :{display:axisMax.y>0,  position:'left',  beginAtZero:true,
              title:{display:true,text:'건수',font:{size:10}},
              ticks:{callback:v=>fmtInt(v),font:{size:10}}},
          y2:{display:axisMax.y2>0, position:'right', beginAtZero:true, grid:{drawOnChartArea:false},
              title:{display:true,text:'금액(₩)',font:{size:10}},
              ticks:{callback:v=>fmtKrw(v),font:{size:10}}},
          y3:{display:axisMax.y3>0, position:'right', beginAtZero:true, grid:{drawOnChartArea:false}, offset:true,
              title:{display:true,text:'비율',font:{size:10}},
              ticks:{callback:v=>fmtRatio(v),font:{size:10}}}
        }
      }
    });
  }

  function buildButtons(){
    const box=document.getElementById('daily-metric-buttons');
    if(!box) return;
    box.innerHTML = METRICS.map(m=>{
      const on = activeMetrics.has(m.key);
      return `<button class="dm-btn ${on?'active':''}" data-key="${m.key}"
              style="border-color:${m.color};color:${on?'#fff':m.color};background:${on?m.color:'#fff'};">${m.label}</button>`;
    }).join('');
    box.querySelectorAll('.dm-btn').forEach(btn=>{
      btn.onclick=()=>{
        const k=btn.dataset.key;
        if(activeMetrics.has(k)) activeMetrics.delete(k); else activeMetrics.add(k);
        if(activeMetrics.size===0) activeMetrics.add(DEFAULT_ACTIVE[0]);
        buildButtons(); render();
      };
    });
  }

  function ensureContainer(){
    let wrap = document.getElementById('daily-chart-wrap');
    if(!wrap) return null;
    // canvas 부모 높이 확보 (Chart.js 렌더 필수)
    let holder = wrap.querySelector('.dm-canvas-holder');
    if(!holder){
      holder = document.createElement('div');
      holder.className='dm-canvas-holder';
      holder.style.cssText='position:relative;height:360px;width:100%;';
      // 기존 canvas 있으면 holder 안으로 이동
      const oldCanvas = document.getElementById('daily-multi-chart');
      if(oldCanvas){ holder.appendChild(oldCanvas); }
      else {
        const c=document.createElement('canvas');
        c.id='daily-multi-chart';
        holder.appendChild(c);
      }
      // empty state
      const emp=document.createElement('div');
      emp.id='daily-chart-empty';
      emp.style.cssText='display:none;position:absolute;inset:0;align-items:center;justify-content:center;color:#8892A6;font-size:13px;';
      holder.appendChild(emp);
      wrap.appendChild(holder);
    }
    return holder;
  }

  async function init(){
    // 스타일
    if(!document.getElementById('dm-btn-style')){
      const s=document.createElement('style'); s.id='dm-btn-style';
      s.textContent=`
        .dm-btn{padding:6px 12px;border:1.5px solid;border-radius:20px;font-size:12px;font-weight:600;
                cursor:pointer;transition:all .15s;font-family:inherit;}
        .dm-btn:hover{transform:translateY(-1px);box-shadow:0 4px 8px rgba(0,0,0,.1);}
        #daily-metric-buttons{display:flex;flex-wrap:wrap;gap:6px;margin:12px 0;}
        .dm-canvas-holder{position:relative;height:360px !important;width:100% !important;}
        #daily-multi-chart{width:100% !important;height:100% !important;}
      `;
      document.head.appendChild(s);
    }

    ensureContainer();

    try{
      const r = await fetch('data/mart29_naver_daily_comparison.json?t='+Date.now());
      rawData = r.ok ? await r.json() : [];
      console.log('[daily-chart] mart29 rows:', rawData.length);
    }catch(e){ console.error('[daily-chart] fetch fail',e); rawData=[]; }

    buildButtons();
    render();

    // 필터 이벤트 연동
    const prev = window.renderAll;
    window.renderAll = function(){
      if(typeof prev==='function'){ try{ prev.apply(this,arguments); }catch(e){} }
      render();
    };
    window.rerenderDailyChart = render;
    document.addEventListener('filterchange', render);
    window.addEventListener('filterchange', render);
  }

  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
