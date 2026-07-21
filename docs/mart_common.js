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

  function render(rows) {
    const keys = Object.keys(rows[0]);
    const dateKey = keys.find(k => k.toLowerCase().includes('date'));
    const categoricalKeys = keys.filter(k => k !== dateKey && !isNumeric(rows[0][k]));
    const numericKeys = keys.filter(k => k !== dateKey && isNumeric(rows[0][k]));

    // 카테고리 컬럼이 있으면 필터 드롭다운 생성
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

      // KPI 카드 (숫자 컬럼별 합계 또는 최신값)
      const kpiGrid = document.createElement('div');
      kpiGrid.className = 'kpi-grid';
      numericKeys.forEach(k => {
        const vals = filtered.map(r => parseFloat(r[k])).filter(v => !isNaN(v));
        if (!vals.length) return;
        const sum = vals.reduce((a,b) => a+b, 0);
        const isPercent = /pct|rate|ratio/i.test(k);
        const displayVal = isPercent ? (vals[vals.length-1] || 0).toFixed(2) : sum.toLocaleString(undefined, {maximumFractionDigits: 2});
        const label = isPercent ? `${k} (최신)` : `${k} (합계)`;
        const card = document.createElement('div');
        card.className = 'kpi-card';
        card.innerHTML = `<div class="label">${label}</div><div class="value">${displayVal}</div>`;
        kpiGrid.appendChild(card);
      });
      contentDiv.appendChild(kpiGrid);

      // 시계열 차트 (date 컬럼이 있을 때만)
      if (dateKey) {
        const dates = [...new Set(filtered.map(r => r[dateKey]))].sort();
        const labels = dates.map(shortDate);
        const palette = ['#4f8cff','#7bb0ff','#ffb84f','#7affc0','#ff7a7a','#c47aff','#7affe0','#ffd47a'];
        numericKeys.slice(0, 6).forEach((k, i) => {
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
                data: dates.map(d => {
                  const drows = filtered.filter(r => r[dateKey] === d);
                  return drows.reduce((sum, r) => sum + (parseFloat(r[k])||0), 0);
                }),
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
