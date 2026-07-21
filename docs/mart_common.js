(async function() {
  const statusEl = document.getElementById('status');
  const root = document.getElementById('root');
  try {
    const res = await fetch(DATA_FILE + '?t=' + Date.now());
    if (!res.ok) throw new Error('데이터 파일을 찾을 수 없음 (아직 생성 전일 수 있음)');
    const rows = await res.json();
    if (!rows || !rows.length) { statusEl.textContent = '아직 데이터가 없습니다.'; return; }
    statusEl.textContent = `총 ${rows.length}행`;
    render(rows);
  } catch (e) {
    statusEl.textContent = '⚠️ ' + e.message;
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
    if (Math.abs(v) >= 1000) return v.toLocaleString(undefined, {maximumFractionDigits: 0});
    if (Math.abs(v) >= 10) return v.toLocaleString(undefined, {maximumFractionDigits: 1});
    return v.toLocaleString(undefined, {maximumFractionDigits: 2});
  }
  function deltaHtml(cur, prev, isPctMetric) {
    if (!isFinite(cur) || !isFinite(prev) || prev === 0) return `<span class="delta-flat">— 비교불가</span>`;
    const diff = isPctMetric ? (cur - prev) : ((cur - prev) / Math.abs(prev)) * 100;
    const arrow = diff > 0.5 ? '↑' : (diff < -0.5 ? '↓' : '→');
    const cls = diff > 0.5 ? 'delta-up' : (diff < -0.5 ? 'delta-down' : 'delta-flat');
    const unit = isPctMetric ? 'p' : '%';
    return `<span class="${cls}">${arrow} ${diff >= 0 ? '+' : ''}${diff.toFixed(1)}${unit}</span>`;
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
      controls.innerHTML = `<div><label>${filterKey}</label>
        <select id="filterSel">
          <option value="__all__">전체</option>
          ${uniques.map(v => `<option value="${v}">${v}</option>`).join('')}
        </select></div>`;
      root.appendChild(controls);
      document.getElementById('filterSel').addEventListener('change', () => draw());
    }

    const contentDiv = document.createElement('div');
    root.appendChild(contentDiv);

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
        contentDiv.innerHTML = '<p style="color:#9a9aa5">선택한 조건에 데이터가 없습니다.</p>';
        return;
      }

      const dates = dateKey ? [...new Set(filtered.map(r => r[dateKey]))].sort() : [];
      const latestDate = dates[dates.length - 1];
      const prevDate = dates[dates.length - 2];

      // ===== 상단 핵심 지표 3개 배너 =====
      if (dateKey && numericKeys.length >= 1) {
        const topMetrics = numericKeys.slice(0, 3);
        const hero = document.createElement('div');
        hero.className = 'hero-grid';
        topMetrics.forEach((k, i) => {
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
          const deltaDay = deltaHtml(cur, prev, isPct);
          const deltaWeek = isFinite(prev7Avg) ? deltaHtml(cur7Avg, prev7Avg, isPct) : '<span class="delta-flat">주간 비교 대기</span>';

          const card = document.createElement('div');
          card.className = 'hero-card';
          card.innerHTML = `
            <div class="h-label">${k}</div>
            <div class="h-value">${fmt(cur)}</div>
            <div class="h-delta">전일 ${deltaDay} &nbsp;·&nbsp; 7일 ${deltaWeek}</div>
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
                borderColor: '#4f8cff',
                backgroundColor: 'rgba(79,140,255,0.2)',
                tension: 0.35, pointRadius: 0, borderWidth: 2, fill: true
              }]
            },
            options: {
              responsive: true, maintainAspectRatio: false,
              plugins: { legend: { display: false }, tooltip: { enabled: false } },
              scales: { x: { display: false }, y: { display: false } },
              elements: { line: { borderJoinStyle: 'round' } }
            }
          });
        });
        contentDiv.appendChild(hero);
      }

      // ===== 자동 인사이트 =====
      if (dateKey && numericKeys.length && dates.length >= 2) {
        const insights = [];
        numericKeys.slice(0, 6).forEach(k => {
          const isPct = /pct|rate|ratio/i.test(k);
          const byDate = aggregateByDate(filtered, k);
          const cur = byDate[latestDate];
          const prev = byDate[prevDate];
          if (!isFinite(cur) || !isFinite(prev) || prev === 0) return;
          const diff = isPct ? (cur - prev) : ((cur - prev) / Math.abs(prev)) * 100;
          const goodIsUp = !/abandon|drop|dropoff|bounce/i.test(k);
          const abs = Math.abs(diff);
          if (abs < 10) return;
          const cls = ((diff > 0) === goodIsUp) ? 'good' : 'bad';
          const dir = diff > 0 ? '증가' : '감소';
          const emoji = cls === 'good' ? '✅' : '⚠️';
          insights.push({cls, text: `${emoji} <b>${k}</b>가 전일 대비 ${abs.toFixed(1)}${isPct?'p':'%'} ${dir} (${fmt(prev)} → ${fmt(cur)})`});
        });
        // 7일 평균 대비
        numericKeys.slice(0, 6).forEach(k => {
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
          insights.push({cls, text: `${emoji} <b>${k}</b>가 지난 7일 평균보다 ${abs.toFixed(1)}${isPct?'p':'%'} ${dir}`});
        });
        if (insights.length) {
          const box = document.createElement('div');
          box.className = 'insight-box';
          box.innerHTML = `<div class="i-title">💡 오늘의 하이라이트 (${latestDate})</div>` +
            insights.slice(0, 6).map(i => `<div class="insight-item ${i.cls}">${i.text}</div>`).join('');
          contentDiv.appendChild(box);
        }
      }

      // ===== KPI 카드 (증감률 포함) =====
      const kpiGrid = document.createElement('div');
      kpiGrid.className = 'kpi-grid';
      numericKeys.forEach(k => {
        const isPct = /pct|rate|ratio/i.test(k);
        let displayVal, deltaTxt = '';
        if (dateKey) {
          const byDate = aggregateByDate(filtered, k);
          const cur = byDate[latestDate];
          const prev = byDate[prevDate];
          if (isFinite(cur)) {
            displayVal = fmt(cur);
            if (isFinite(prev)) deltaTxt = deltaHtml(cur, prev, isPct);
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
        card.innerHTML = `<div class="label">${k}${isPct ? ' (최신)' : dateKey ? ' (' + latestDate + ')' : ' (합계)'}</div>
                          <div class="value">${displayVal}</div>
                          <div class="k-delta">${deltaTxt || ''}</div>`;
        kpiGrid.appendChild(card);
      });
      contentDiv.appendChild(kpiGrid);

      // 시계열 차트
      if (dateKey) {
        const palette = ['#4f8cff','#7bb0ff','#ffb84f','#7affc0','#ff7a7a','#c47aff','#7affe0','#ffd47a'];
        const labels = dates.map(shortDate);
        numericKeys.slice(0, 6).forEach((k, i) => {
          const byDate = aggregateByDate(filtered, k);
          const box = document.createElement('div');
          box.className = 'chart-box';
          box.innerHTML = `<h3>${k} 추이</h3><canvas></canvas>`;
          contentDiv.appendChild(box);
          const ctx = box.querySelector('canvas').getContext('2d');
          new Chart(ctx, {
            type: 'line',
            data: {
              labels,
              datasets: [{
                label: k,
                data: dates.map(d => byDate[d] ?? 0),
                borderColor: palette[i % palette.length],
                backgroundColor: palette[i % palette.length] + '22',
                tension: 0.3, pointRadius: 2, fill: true
              }]
            },
            options: {
              responsive: true,
              plugins: { legend: { display: false } },
              scales: {
                x: { ticks: { color: '#9a9aa5', maxRotation: 60, minRotation: 45, autoSkip: true }, grid: { color: '#242830' } },
                y: { ticks: { color: '#9a9aa5' }, grid: { color: '#242830' } }
              }
            }
          });
        });
      }

      // 원본 테이블
      const tblBox = document.createElement('div');
      tblBox.className = 'chart-box';
      tblBox.innerHTML = '<h3>원본 데이터 (최대 500행)</h3><div style="overflow-x:auto"><table></table></div>';
      contentDiv.appendChild(tblBox);
      const table = tblBox.querySelector('table');
      const shown = filtered.slice(0, 500);
      const thead = '<thead><tr>' + keys.map(k => `<th>${k}</th>`).join('') + '</tr></thead>';
      const tbody = '<tbody>' + shown.map(r =>
        '<tr>' + keys.map(k => `<td>${r[k] ?? ''}</td>`).join('') + '</tr>'
      ).join('') + '</tbody>';
      table.innerHTML = thead + tbody;
    }
    draw();
  }
})();
