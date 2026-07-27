// ============================================
// 🧠 WebLLM 통합 (로컬 브라우저 LLM · 완전 무료)
// ============================================

const WEBLLM_MODELS = [
  { id: 'Qwen2.5-1.5B-Instruct-q4f16_1-MLC', label: '⚡ 가벼움 · 950MB', desc: 'Qwen2.5 1.5B · 저사양 OK', size: 950 },
  { id: 'Qwen2.5-3B-Instruct-q4f16_1-MLC', label: '⭐ 추천 · 1.8GB', desc: 'Qwen2.5 3B · 한국어 양호', size: 1800, default: true },
  { id: 'Llama-3.2-3B-Instruct-q4f16_1-MLC', label: '🦙 Llama · 2.0GB', desc: 'Llama 3.2 3B · 영어 강점', size: 2000 },
  { id: 'Qwen2.5-7B-Instruct-q4f16_1-MLC', label: '🎯 최고성능 · 4.1GB', desc: 'Qwen2.5 7B · 고사양 필요', size: 4100 }
];

const LLM_STATE = {
  engine: null,
  ready: false,
  loading: false,
  model: null,
  history: []  // { role, content }
};

// WebGPU 지원 확인
function checkWebGPU() {
  return typeof navigator !== 'undefined' && 'gpu' in navigator;
}

// ============================================
// WebLLM 모듈 동적 로드 (ES module)
// ============================================
async function loadWebLLMLibrary() {
  if (window._webllm) return window._webllm;
  try {
    const mod = await import('https://esm.run/@mlc-ai/web-llm@0.2.79');
    window._webllm = mod;
    return mod;
  } catch (e) {
    console.error('WebLLM 로드 실패:', e);
    throw new Error('WebLLM 라이브러리를 로드할 수 없습니다. Chrome 최신 버전 사용 확인');
  }
}

// ============================================
// 모델 다운로드 & 초기화
// ============================================
async function initLLM(modelId, onProgress) {
  // Cloudflare Worker 도메인 감지 → CORS 이슈로 GitHub Pages 안내
  if (window.location.hostname.includes('workers.dev')) {
    throw new Error('⚠️ Cloudflare Worker 도메인에서는 CORS 정책으로 인해 로컬 AI를 사용할 수 없습니다.\n\n📌 GitHub Pages 직접 접속 URL을 사용해주세요:\nhttps://dimedikoreamkt-oss.github.io/d2c-analytics-automation/mart26.html\n\n이 URL에서는 HuggingFace CDN에 직접 접속 가능하여 모델 다운로드가 정상 작동합니다.');
  }
  if (!checkWebGPU()) {
    throw new Error('WebGPU 미지원 브라우저입니다. Chrome/Edge 최신 버전을 사용해주세요.');
  }
  const webllm = await loadWebLLMLibrary();
  LLM_STATE.loading = true;
  LLM_STATE.model = modelId;

  const engine = new webllm.MLCEngine();
  engine.setInitProgressCallback((r) => {
    // r = { progress: 0~1, text: "..." }
    if (onProgress) onProgress(r);
  });

  await engine.reload(modelId);
  LLM_STATE.engine = engine;
  LLM_STATE.ready = true;
  LLM_STATE.loading = false;
  return engine;
}

// ============================================
// 동적 컨텍스트 빌더 (질문 분석 → 관련 데이터만)
// ============================================
function buildDynamicContext(question) {
  const q = question.toLowerCase();
  const ctx = {};
  const summary = {};

  // 항상 포함: 전체 요약
  const perf = filterPerf ? filterPerf() : (DATA.perf || []);
  const daily = filterDaily ? filterDaily() : (DATA.daily || []);
  const kw = filterKeyword ? filterKeyword() : (DATA.keyword || []);
  const type = DATA.type || [];
  const insight = (DATA.insight || [])[0] || {};

  summary.total_cost = perf.reduce((s, r) => s + num(r.cost_krw), 0);
  summary.total_revenue = perf.reduce((s, r) => s + num(r.revenue), 0);
  summary.total_impressions = perf.reduce((s, r) => s + num(r.impressions), 0);
  summary.total_clicks = perf.reduce((s, r) => s + num(r.clicks), 0);
  summary.total_conversions = perf.reduce((s, r) => s + num(r.conversions), 0);
  summary.overall_roas = summary.total_cost ? +(summary.total_revenue / summary.total_cost).toFixed(2) : 0;
  summary.overall_ctr = summary.total_impressions ? +(summary.total_clicks / summary.total_impressions * 100).toFixed(2) : 0;
  summary.overall_cpc = summary.total_clicks ? Math.round(summary.total_cost / summary.total_clicks) : 0;
  summary.overall_cpa = summary.total_conversions ? Math.round(summary.total_cost / summary.total_conversions) : 0;
  summary.campaign_count = new Set(perf.map(r => r.campaign_name).filter(Boolean)).size;
  summary.date_range = (FILTERS && FILTERS.dateStart) ? (FILTERS.dateStart + ' ~ ' + FILTERS.dateEnd) : '전체';
  summary.compare_mode = (FILTERS && FILTERS.compareMode) || 'wow';
  summary.latest_date = perf.length ? perf.reduce((m, r) => r.event_date > m ? r.event_date : m, '') : '-';
  ctx.summary = summary;

  // 오늘 데이터
  if (daily[0]) {
    const t = daily[0];
    ctx.today = {
      date: t.event_date,
      cost_krw: num(t.cost_krw),
      revenue: num(t.revenue),
      roas: num(t.roas),
      purchases: num(t.purchases),
      ctr_pct: num(t.ctr_pct),
      rev_dod_pct: num(t.rev_dod_pct),
      cost_dod_pct: num(t.cost_dod_pct),
      rev_wow_pct: num(t.rev_wow_pct),
      alert_status: t.alert_status,
      recommended_action: t.recommended_action
    };
  }

  // 캠페인 집계
  const campAgg = {};
  perf.forEach(r => {
    const k = r.campaign_name; if (!k) return;
    if (!campAgg[k]) campAgg[k] = { type: r.campaign_type, cost: 0, rev: 0, conv: 0, clicks: 0, imps: 0 };
    campAgg[k].cost += num(r.cost_krw);
    campAgg[k].rev += num(r.revenue);
    campAgg[k].conv += num(r.conversions);
    campAgg[k].clicks += num(r.clicks);
    campAgg[k].imps += num(r.impressions);
  });
  const campList = Object.entries(campAgg).map(([n, v]) => ({
    name: n, type: v.type,
    impressions: v.imps, clicks: v.clicks,
    ctr_pct: v.imps ? +(v.clicks / v.imps * 100).toFixed(2) : 0,
    cost_krw: v.cost,
    cpc_krw: v.clicks ? Math.round(v.cost / v.clicks) : 0,
    conversions: v.conv,
    cvr_pct: v.clicks ? +(v.conv / v.clicks * 100).toFixed(2) : 0,
    revenue: v.rev,
    roas: v.cost ? +(v.rev / v.cost).toFixed(2) : 0
  })).sort((a, b) => b.cost - a.cost);

  // 질문 키워드 기반 컨텍스트 선택
  const needsAll = /전체|모든|전반|한 눈에|한눈에|요약|summary/.test(q);
  const needsToday = /오늘|어제|현재|지금|당일/.test(q);
  const needsWeek = /이번 ?주|지난 ?주|최근 ?7일|일주일/.test(q);
  const needsMonth = /한 ?달|30일|이번 ?달|월간/.test(q);
  const needsKeyword = /키워드|keyword|star|dead|healthy|낭비|고효율/.test(q);
  const needsCampaign = /캠페인|campaign/.test(q);
  const needsType = /유형|쇼핑|웹사이트|브랜드|shopping|web_site|brand/i.test(q);
  const needsCompare = /비교|vs|대비/.test(q);
  const needsCause = /원인|왜|이유|하락|떨어|부진|급락/.test(q);
  const needsCPC = /cpc|입찰|클릭당|비싸/.test(q);
  const needsCVR = /전환율|cvr|conversion/i.test(q);
  const needsBudget = /예산|budget|재분배|투자/.test(q);
  const needsRisk = /리스크|위험|문제|경고/.test(q);
  const needsAction = /뭐 ?해야|무엇|계획|플랜|action|다음/.test(q);

  // 언급된 캠페인/키워드 자동 추출
  const mentionedCamps = [];
  const mentionedKws = [];
  campList.forEach(c => {
    if (question.includes(c.name)) mentionedCamps.push(c.name);
    else {
      const parts = c.name.split(/[_\s\-]/).filter(p => p.length >= 2);
      if (parts.some(p => question.includes(p))) mentionedCamps.push(c.name);
    }
  });
  kw.forEach(k => {
    if (k.keyword && question.includes(k.keyword)) mentionedKws.push(k.keyword);
  });

  // 언급된 항목은 무조건 포함
  if (mentionedCamps.length) {
    ctx.mentioned_campaigns = campList.filter(c => mentionedCamps.includes(c.name)).slice(0, 5);
  }
  if (mentionedKws.length) {
    ctx.mentioned_keywords = kw.filter(k => mentionedKws.includes(k.keyword)).slice(0, 10).map(k => ({
      keyword: k.keyword, campaign: k.campaign_name,
      grade: k.keyword_grade,
      cost_30d: num(k.cost_30d), revenue_30d: num(k.revenue_30d),
      conversions_30d: num(k.conversions_30d), roas: +num(k.roas).toFixed(2),
      cpc_krw: num(k.cpc_krw), ctr_pct: num(k.ctr_pct)
    }));
  }

  // 일일 데이터
  if (needsToday || needsWeek || needsCause || needsAll || daily.length < 15) {
    ctx.daily_last_14d = daily.slice(0, 14).map(r => ({
      date: r.event_date,
      impressions: num(r.impressions), clicks: num(r.clicks),
      cost_krw: num(r.cost_krw), revenue: num(r.revenue),
      purchases: num(r.purchases), roas: num(r.roas),
      ctr_pct: num(r.ctr_pct), cpc_krw: num(r.cpc_krw),
      rev_dod_pct: num(r.rev_dod_pct), rev_wow_pct: num(r.rev_wow_pct),
      alert_status: r.alert_status
    }));
  }

  // 캠페인 상위
  if (needsCampaign || needsAll || needsCompare || needsBudget || needsAction || !mentionedCamps.length) {
    ctx.top20_campaigns = campList.slice(0, 20);
  }

  // 유형별
  if (needsType || needsAll || needsCompare) {
    const tyAgg = {};
    type.forEach(r => {
      const k = r.campaign_type; if (!k) return;
      if (!tyAgg[k]) tyAgg[k] = { cost: 0, rev: 0, conv: 0, imps: 0, clicks: 0 };
      tyAgg[k].cost += num(r.cost_krw);
      tyAgg[k].rev += num(r.revenue);
      tyAgg[k].conv += num(r.purchases);
      tyAgg[k].imps += num(r.impressions);
      tyAgg[k].clicks += num(r.clicks);
    });
    ctx.by_type = Object.entries(tyAgg).map(([k, v]) => ({
      type: k, cost_krw: v.cost, revenue: v.rev, conversions: v.conv,
      impressions: v.imps, clicks: v.clicks,
      roas: v.cost ? +(v.rev / v.cost).toFixed(2) : 0,
      ctr_pct: v.imps ? +(v.clicks / v.imps * 100).toFixed(2) : 0
    }));
  }

  // 키워드
  if (needsKeyword || needsAll || needsBudget) {
    const validKw = kw.filter(k => k.keyword);
    const star = validKw.filter(k => num(k.roas) >= 5 && num(k.conversions_30d) >= 2);
    const dead = validKw.filter(k => num(k.cost_30d) > 3000 && num(k.roas) < 1);
    const losing = validKw.filter(k => num(k.cost_30d) > 3000 && num(k.roas) >= 1 && num(k.roas) < 2);
    ctx.keyword_summary = {
      total: validKw.length,
      star_count: star.length,
      dead_count: dead.length,
      losing_count: losing.length,
      star_top10: star.sort((a, b) => num(b.revenue_30d) - num(a.revenue_30d)).slice(0, 10).map(k => ({
        keyword: k.keyword, campaign: k.campaign_name,
        roas: +num(k.roas).toFixed(2), revenue_30d: num(k.revenue_30d),
        cost_30d: num(k.cost_30d), conversions_30d: num(k.conversions_30d)
      })),
      dead_top10: dead.sort((a, b) => num(b.cost_30d) - num(a.cost_30d)).slice(0, 10).map(k => ({
        keyword: k.keyword, campaign: k.campaign_name,
        roas: +num(k.roas).toFixed(2), cost_30d: num(k.cost_30d), revenue_30d: num(k.revenue_30d)
      })),
      wasted_total: dead.reduce((s, k) => s + num(k.cost_30d), 0)
    };
  }

  // 인사이트
  if (needsAll || needsAction || needsRisk) {
    ctx.auto_insight = {
      overall_status: insight.overall_status,
      revenue_change_pct: insight.revenue_change_pct,
      cost_change_pct: insight.cost_change_pct,
      roas_change_pct: insight.roas_change_pct,
      top_revenue_campaign: insight.top_revenue_campaign,
      worst_revenue_campaign: insight.worst_revenue_campaign,
      best_roas_campaign: insight.best_roas_campaign,
      best_roas_value: insight.best_roas_value,
      top_cost_increase_campaign: insight.top_cost_increase_campaign,
      top_cost_increase_pct: insight.top_cost_increase_pct,
      top_cost_decrease_campaign: insight.top_cost_decrease_campaign,
      action_recommendation: insight.action_recommendation
    };
  }

  return ctx;
}

// ============================================
// LLM 호출
// ============================================
async function askLLM(userQuestion, onToken) {
  if (!LLM_STATE.ready || !LLM_STATE.engine) {
    throw new Error('LLM이 준비되지 않았습니다.');
  }

  const context = buildDynamicContext(userQuestion);
  const systemPrompt = `당신은 D2C 이커머스 브랜드의 시니어 퍼포먼스 마케팅 분석가입니다. 네이버 검색광고 데이터를 분석해 실무적이고 구체적인 답변을 한국어로 제공합니다.

**분석 원칙:**
1. 반드시 데이터의 실제 숫자를 인용하세요 (매출 ₩X, ROAS X.XXx 형태)
2. 원인 → 결과 → 실행 액션 순서로 답하세요
3. 데이터에 없는 정보는 추측하지 말고 "데이터로 확인 불가"라고 답하세요
4. 마크다운 형식(제목·리스트·굵은글씨)으로 구조화하세요
5. 답변은 간결하되 실용적으로 (300~600자 권장)

**용어 정의:**
- STAR: ROAS ≥ 5x + 전환 ≥ 2건 (예산 확대 대상)
- HEALTHY: ROAS 2~5x (유지)
- LOSING: ROAS 1~2x (입찰 조정)
- DEAD: ROAS < 1x + 지출 ≥ ₩3K (제외 대상)

**주어진 데이터 (JSON):**
${JSON.stringify(context, null, 2)}`;

  // 대화 히스토리 (최근 6턴)
  LLM_STATE.history.push({ role: 'user', content: userQuestion });
  const messages = [
    { role: 'system', content: systemPrompt },
    ...LLM_STATE.history.slice(-6)
  ];

  let fullText = '';
  const stream = await LLM_STATE.engine.chat.completions.create({
    messages,
    temperature: 0.3,
    max_tokens: 800,
    stream: true
  });

  for await (const chunk of stream) {
    const delta = chunk.choices?.[0]?.delta?.content || '';
    if (delta) {
      fullText += delta;
      if (onToken) onToken(delta, fullText);
    }
  }

  LLM_STATE.history.push({ role: 'assistant', content: fullText });
  return fullText;
}

// ============================================
// 마크다운 → HTML 렌더링 (간단)
// ============================================
function renderMD(md) {
  if (!md) return '';
  let h = md
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/\*([^*\n]+)\*/g, '<em>$1</em>')
    .replace(/`([^`]+)`/g, '<span class="metric-inline">$1</span>')
    .replace(/^### (.+)$/gm, '<h4 style="font-size:12.5px;margin:8px 0 4px;color:#1e293b;">$1</h4>')
    .replace(/^## (.+)$/gm, '<h3 style="font-size:13px;margin:10px 0 5px;color:#0066FF;">$1</h3>')
    .replace(/^# (.+)$/gm, '<h3 style="font-size:14px;margin:10px 0 6px;color:#0066FF;">$1</h3>')
    .replace(/^\- (.+)$/gm, '<div class="cause-item">• $1</div>')
    .replace(/^\d+\. (.+)$/gm, '<div class="cause-item">$&</div>')
    .replace(/\n\n/g, '<br><br>')
    .replace(/\n/g, '<br>');
  return h;
}

// ============================================
// UI 초기화 (탭 & 다운로드 버튼)
// ============================================
function initWebLLMUI() {
  const container = document.getElementById('chatMessages')?.parentNode;
  if (!container) return;
  if (document.getElementById('chatModeTabs')) return; // 이미 초기화됨

  // 탭 UI 추가
  const tabs = document.createElement('div');
  tabs.id = 'chatModeTabs';
  tabs.style.cssText = 'display:flex;gap:4px;margin-bottom:8px;border-bottom:1px solid var(--border);';
  tabs.innerHTML = `
    <button class="chat-tab active" data-mode="rule" style="padding:6px 14px;background:transparent;border:none;border-bottom:2px solid #0066FF;color:#0066FF;font-weight:700;font-size:12px;cursor:pointer;">💬 규칙 봇 (빠름)</button>
    <button class="chat-tab" data-mode="llm" style="padding:6px 14px;background:transparent;border:none;border-bottom:2px solid transparent;color:var(--muted);font-weight:600;font-size:12px;cursor:pointer;">🧠 AI (로컬 LLM)</button>
    <div id="llmStatus" style="margin-left:auto;font-size:11px;color:var(--muted);align-self:center;">비활성</div>
  `;
  container.insertBefore(tabs, container.firstChild);

  // 탭 클릭 이벤트
  tabs.querySelectorAll('.chat-tab').forEach(btn => {
    btn.addEventListener('click', () => {
      tabs.querySelectorAll('.chat-tab').forEach(b => {
        b.classList.remove('active');
        b.style.borderBottom = '2px solid transparent';
        b.style.color = 'var(--muted)';
        b.style.fontWeight = '600';
      });
      btn.classList.add('active');
      btn.style.borderBottom = '2px solid #0066FF';
      btn.style.color = '#0066FF';
      btn.style.fontWeight = '700';
      window._chatMode = btn.dataset.mode;

      if (btn.dataset.mode === 'llm' && !LLM_STATE.ready && !LLM_STATE.loading) {
        showLLMSetup();
      } else if (btn.dataset.mode === 'llm' && LLM_STATE.ready) {
        chatAppend(`🧠 AI 모드 활성화됨 (모델: ${LLM_STATE.model})<br>이제 자유롭게 질문하세요. 첫 응답은 3~10초 소요될 수 있습니다.`, false);
      }
    });
  });

  window._chatMode = 'rule';
}

// LLM 설정 UI
function showLLMSetup() {
  const box = document.getElementById('chatMessages');
  if (document.getElementById('llmSetupBox')) return;
  
  // Worker 도메인 사전 감지
  const isWorker = window.location.hostname.includes('workers.dev');
  if (isWorker) {
    const warn = document.createElement('div');
    warn.className = 'chat-msg bot';
    warn.style.background = '#fef2f2';
    warn.style.border = '1px solid #fecaca';
    warn.innerHTML = '⚠️ <strong>현재 Cloudflare Worker 도메인으로 접속 중</strong><br><br>CORS 정책으로 인해 HuggingFace CDN에서 AI 모델을 다운로드할 수 없습니다.<br><br><strong>📌 아래 URL로 직접 접속해주세요:</strong><br><a href="https://dimedikoreamkt-oss.github.io/d2c-analytics-automation/mart26.html" target="_blank" style="color:#0066FF;font-weight:700;">GitHub Pages 직접 접속 ↗</a><br><br>이 URL에서는 로그인은 없지만 로컬 AI 기능이 완벽하게 작동합니다.<br>(로컬 AI는 데이터를 외부로 전송하지 않으므로 인증과 무관합니다)';
    box.appendChild(warn);
    box.scrollTop = box.scrollHeight;
    return;
  }

  const supported = checkWebGPU();
  const setup = document.createElement('div');
  setup.id = 'llmSetupBox';
  setup.className = 'chat-msg bot';
  setup.style.maxWidth = '100%';
  if (!supported) {
    setup.innerHTML = `❌ <strong>WebGPU 미지원 브라우저</strong><br>Chrome 또는 Edge 최신 버전(113+)에서만 로컬 AI를 사용할 수 있습니다.<br>현재 브라우저에서는 규칙 봇 모드를 사용해주세요.`;
    box.appendChild(setup);
    box.scrollTop = box.scrollHeight;
    return;
  }

  const modelOptions = WEBLLM_MODELS.map(m => 
    `<option value="${m.id}" ${m.default ? 'selected' : ''}>${m.label} - ${m.desc}</option>`
  ).join('');

  setup.innerHTML = `
    <strong>🧠 로컬 AI 활성화</strong><br><br>
    <div style="background:#eff6ff;border:1px solid #93c5fd;padding:10px 12px;border-radius:8px;font-size:11.5px;line-height:1.6;margin-bottom:10px;">
      <strong>ℹ️ 참고사항:</strong><br>
      • 최초 다운로드 후 브라우저 캐시에 저장 → 다음부터 즉시 로드<br>
      • 데이터는 외부로 전송되지 않음 (완전 로컬 실행)<br>
      • 응답에 3~15초 소요 (GPU 성능에 따라)<br>
      • 규칙 봇 대비 유연하지만 정확도는 다소 낮을 수 있음
    </div>
    <div style="margin-bottom:10px;">
      <strong>📦 모델 선택:</strong><br>
      <select id="llmModelSelect" style="width:100%;padding:6px 10px;border:1px solid var(--border);border-radius:6px;font-size:12px;margin-top:4px;">
        ${modelOptions}
      </select>
    </div>
    <button id="llmStartBtn" style="width:100%;padding:10px;background:#0066FF;color:white;border:none;border-radius:8px;font-weight:700;font-size:13px;cursor:pointer;">🚀 다운로드 & 활성화</button>
    <div id="llmProgress" style="display:none;margin-top:10px;">
      <div style="background:#e5e7eb;height:8px;border-radius:4px;overflow:hidden;">
        <div id="llmProgressBar" style="height:100%;background:linear-gradient(90deg,#0066FF,#10b981);width:0%;transition:width 0.3s;"></div>
      </div>
      <div id="llmProgressText" style="font-size:11px;color:var(--muted);margin-top:4px;">준비 중...</div>
    </div>
  `;
  box.appendChild(setup);
  box.scrollTop = box.scrollHeight;

  document.getElementById('llmStartBtn').addEventListener('click', async () => {
    const selectedModel = document.getElementById('llmModelSelect').value;
    const btn = document.getElementById('llmStartBtn');
    const progressDiv = document.getElementById('llmProgress');
    const progressBar = document.getElementById('llmProgressBar');
    const progressText = document.getElementById('llmProgressText');
    const statusEl = document.getElementById('llmStatus');

    btn.disabled = true;
    btn.textContent = '⏳ 로딩 중...';
    btn.style.background = '#94a3b8';
    progressDiv.style.display = 'block';
    statusEl.textContent = '⏳ 로딩';

    try {
      await initLLM(selectedModel, (r) => {
        const pct = Math.round((r.progress || 0) * 100);
        progressBar.style.width = pct + '%';
        progressText.textContent = `${pct}% · ${(r.text || '').slice(0, 80)}`;
      });
      btn.textContent = '✅ 활성화 완료';
      btn.style.background = '#10b981';
      statusEl.textContent = '✅ AI 준비됨';
      statusEl.style.color = '#10b981';
      progressText.textContent = '✅ 준비 완료! 이제 질문해보세요.';
      chatAppend(`🎉 <strong>AI 활성화 완료!</strong><br>모델: <span class="metric-inline">${selectedModel}</span><br><br>이제 아래 입력창에 자유롭게 질문하세요. 첫 응답은 3~10초 소요될 수 있습니다.<br><br><strong>💡 예시:</strong><br>• "이번 주 매출 하락 원인을 3가지로 정리해줘"<br>• "쇼핑 캠페인 중 ROAS가 3 이상이면서 전환율이 낮은 것 알려줘"<br>• "코코픽과 고요S를 CPC, 전환율 관점에서 비교하고 어느 쪽에 예산을 더 넣을지 조언해줘"<br>• "지난 7일 데이터로 다음 주 예산 배분 계획을 세워줘"`, false);
    } catch (err) {
      btn.disabled = false;
      btn.textContent = '🔄 재시도';
      btn.style.background = '#ef4444';
      statusEl.textContent = '❌ 실패';
      statusEl.style.color = '#ef4444';
      progressText.textContent = '❌ 오류: ' + err.message;
      console.error(err);
    }
  });
}

// ============================================
// LLM 채팅 핸들러 (규칙 봇의 handleChat을 덮어씀)
// ============================================
async function handleLLMChat() {
  const inp = document.getElementById('chatInput');
  const q = inp.value.trim();
  if (!q) return;
  chatAppend(q, true);
  inp.value = '';
  inp.disabled = true;
  document.getElementById('chatSend').disabled = true;

  // 스트리밍 응답용 메시지 박스
  const box = document.getElementById('chatMessages');
  const respDiv = document.createElement('div');
  respDiv.className = 'chat-msg bot';
  respDiv.innerHTML = '<span class="spinner" style="width:14px;height:14px;display:inline-block;border:2px solid #e5e7eb;border-top-color:#0066FF;border-radius:50%;animation:spin 0.8s linear infinite;"></span> AI 분석 중...';
  box.appendChild(respDiv);
  box.scrollTop = box.scrollHeight;

  try {
    let acc = '';
    await askLLM(q, (delta, full) => {
      acc = full;
      respDiv.innerHTML = renderMD(acc) + '<span style="opacity:0.5;">▊</span>';
      box.scrollTop = box.scrollHeight;
    });
    respDiv.innerHTML = renderMD(acc);
  } catch (err) {
    respDiv.innerHTML = '❌ 오류: ' + err.message;
    console.error(err);
  }

  inp.disabled = false;
  document.getElementById('chatSend').disabled = false;
  inp.focus();
}

// ============================================
// 기존 handleChat을 래핑해서 모드 분기
// ============================================
function setupChatModeRouter() {
  const inp = document.getElementById('chatInput');
  const sendBtn = document.getElementById('chatSend');
  if (!inp || !sendBtn) return;

  // 기존 이벤트 리스너 제거를 위해 clone & replace
  const newSend = sendBtn.cloneNode(true);
  sendBtn.parentNode.replaceChild(newSend, sendBtn);
  const newInp = inp.cloneNode(true);
  inp.parentNode.replaceChild(newInp, inp);

  const routedHandle = () => {
    const mode = window._chatMode || 'rule';
    if (mode === 'llm') {
      if (!LLM_STATE.ready) {
        chatAppend('⚠️ AI가 아직 활성화되지 않았습니다. 상단 "🧠 AI (로컬 LLM)" 탭에서 활성화해주세요.', false);
        return;
      }
      handleLLMChat();
    } else {
      // 규칙 봇 (기존 handleChat 재사용)
      if (typeof handleChat === 'function') {
        handleChat();
      }
    }
  };

  newSend.addEventListener('click', routedHandle);
  newInp.addEventListener('keypress', e => {
    if (e.key === 'Enter') routedHandle();
  });

  // 빠른 질문 버튼도 라우팅
  document.querySelectorAll('.quick-q').forEach(el => {
    const newEl = el.cloneNode(true);
    el.parentNode.replaceChild(newEl, el);
    newEl.addEventListener('click', () => {
      document.getElementById('chatInput').value = newEl.dataset.q;
      routedHandle();
    });
  });
}

// 자동 초기화 (DOM 로드 후, 챗봇 초기화 후)
function bootWebLLM() {
  // 챗봇 UI가 준비될 때까지 대기
  const wait = setInterval(() => {
    if (document.getElementById('chatMessages') && document.getElementById('chatInput')) {
      clearInterval(wait);
      initWebLLMUI();
      setupChatModeRouter();
    }
  }, 300);
  setTimeout(() => clearInterval(wait), 15000); // 15초 후 포기
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', bootWebLLM);
} else {
  bootWebLLM();
}
