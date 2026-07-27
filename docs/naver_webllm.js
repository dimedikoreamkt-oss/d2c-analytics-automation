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
  if (!checkWebGPU()) {
    throw new Error('WebGPU 미지원 브라우저입니다. Chrome/Edge 최신 버전을 사용해주세요.');
  }
  const webllm = await loadWebLLMLibrary();
  LLM_STATE.loading = true;
  LLM_STATE.model = modelId;

  // Worker 도메인 접속 시 HuggingFace URL을 Worker 프록시로 재작성
  const isWorker = window.location.hostname.includes('workers.dev');
  const hfBase = isWorker 
    ? (window.location.origin + '/hf-proxy/')
    : 'https://huggingface.co/';
  
  // WebLLM appConfig: 모델·WASM URL 모두 HF 프록시로 통일
  // WebLLM v0.2.x는 model + model_lib 모두 huggingface.co에서 받음
  const rewriteUrl = (u) => {
    if (!u || !isWorker) return u;
    // huggingface.co → /hf-proxy/
    if (u.startsWith('https://huggingface.co/')) {
      return u.replace('https://huggingface.co/', hfBase);
    }
    // raw.githubusercontent.com (구버전 폴백)
    if (u.startsWith('https://raw.githubusercontent.com/')) {
      return u.replace('https://raw.githubusercontent.com/', window.location.origin + '/gh-proxy/');
    }
    return u;
  };
  
  const customAppConfig = {
    ...webllm.prebuiltAppConfig,
    model_list: webllm.prebuiltAppConfig.model_list.map(m => ({
      ...m,
      model: rewriteUrl(m.model),
      model_lib: rewriteUrl(m.model_lib),
      // 컨텍스트 윈도우 확장 (기본 4096 → 8192)
      overrides: {
        ...(m.overrides || {}),
        context_window_size: 8192
      }
    }))
  };
  
  // 선택된 모델의 실제 URL 확인용 로그
  const targetModel = customAppConfig.model_list.find(m => m.model_id === modelId);
  console.log('[WebLLM] isWorker:', isWorker);
  console.log('[WebLLM] Selected model:', modelId);
  console.log('[WebLLM] Selected model.model (weights):', targetModel?.model);
  console.log('[WebLLM] Selected model.model_lib (WASM):', targetModel?.model_lib);
  
  const engine = new webllm.MLCEngine({
    appConfig: customAppConfig,
    logLevel: 'INFO'
  });
  engine.setInitProgressCallback((r) => {
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
  
  const perf = filterPerf ? filterPerf() : (DATA.perf || []);
  const daily = filterDaily ? filterDaily() : (DATA.daily || []);
  const kw = filterKeyword ? filterKeyword() : (DATA.keyword || []);
  const type = DATA.type || [];
  const insight = (DATA.insight || [])[0] || {};

  // 항상 포함: 압축 요약
  const totalCost = perf.reduce((s, r) => s + num(r.cost_krw), 0);
  const totalRev = perf.reduce((s, r) => s + num(r.revenue), 0);
  const totalConv = perf.reduce((s, r) => s + num(r.conversions), 0);
  const totalImps = perf.reduce((s, r) => s + num(r.impressions), 0);
  const totalClicks = perf.reduce((s, r) => s + num(r.clicks), 0);
  
  ctx.summary = {
    period: (FILTERS && FILTERS.dateStart) ? (FILTERS.dateStart + '~' + FILTERS.dateEnd) : '전체',
    cost: totalCost,
    revenue: totalRev,
    conversions: totalConv,
    roas: totalCost ? +(totalRev / totalCost).toFixed(2) : 0,
    ctr_pct: totalImps ? +(totalClicks / totalImps * 100).toFixed(2) : 0,
    cpc: totalClicks ? Math.round(totalCost / totalClicks) : 0,
    cpa: totalConv ? Math.round(totalCost / totalConv) : 0,
    campaigns: new Set(perf.map(r => r.campaign_name).filter(Boolean)).size
  };

  // 오늘 지표
  if (daily[0]) {
    const t = daily[0];
    ctx.today = {
      date: t.event_date,
      cost: num(t.cost_krw),
      revenue: num(t.revenue),
      roas: +num(t.roas).toFixed(2),
      rev_dod: num(t.rev_dod_pct),
      cost_dod: num(t.cost_dod_pct),
      rev_wow: num(t.rev_wow_pct),
      status: t.alert_status
    };
  }

  // 캠페인 집계 (필드 최소화)
  const campAgg = {};
  perf.forEach(r => {
    const k = r.campaign_name; if (!k) return;
    if (!campAgg[k]) campAgg[k] = { type: r.campaign_type, c: 0, r: 0, cv: 0, cl: 0, i: 0 };
    campAgg[k].c += num(r.cost_krw);
    campAgg[k].r += num(r.revenue);
    campAgg[k].cv += num(r.conversions);
    campAgg[k].cl += num(r.clicks);
    campAgg[k].i += num(r.impressions);
  });
  const campList = Object.entries(campAgg).map(([n, v]) => ({
    n, t: v.t,
    cost: v.c, rev: v.r, cv: v.cv,
    roas: v.c ? +(v.r / v.c).toFixed(2) : 0,
    cpc: v.cl ? Math.round(v.c / v.cl) : 0,
    cvr: v.cl ? +(v.cv / v.cl * 100).toFixed(1) : 0
  })).sort((a, b) => b.cost - a.cost);

  // 질문 의도 감지
  const isKeyword = /키워드|keyword|star|dead|낭비|고효율/.test(q);
  const isCamp = /캠페인|campaign/.test(q);
  const isType = /유형|쇼핑|웹사이트|브랜드|shopping|web_site|brand/i.test(q);
  const isCause = /원인|왜|이유|하락|떨어|부진|급락/.test(q);
  const isBudget = /예산|재분배|투자/.test(q);
  const isRisk = /리스크|위험|문제/.test(q);
  const isAction = /뭐 ?해야|계획|플랜|action|다음/.test(q);

  // 언급된 캠페인/키워드
  const mentionedCamps = [];
  campList.forEach(c => {
    if (question.includes(c.n)) mentionedCamps.push(c);
    else {
      const parts = c.n.split(/[_\s\-]/).filter(p => p.length >= 2);
      if (parts.some(p => question.includes(p))) mentionedCamps.push(c);
    }
  });
  const mentionedKws = [];
  kw.forEach(k => {
    if (k.keyword && question.includes(k.keyword)) mentionedKws.push(k);
  });

  // 컨텍스트 삽입 (우선순위)
  if (mentionedCamps.length) {
    ctx.mentioned = mentionedCamps.slice(0, 3);
  }
  if (mentionedKws.length) {
    ctx.mentioned_kw = mentionedKws.slice(0, 5).map(k => ({
      kw: k.keyword, c: k.campaign_name,
      grade: k.keyword_grade,
      cost: num(k.cost_30d),
      rev: num(k.revenue_30d),
      conv: num(k.conversions_30d),
      roas: +num(k.roas).toFixed(2)
    }));
  }

  // 필요 시에만 상위 데이터 추가
  if (!mentionedCamps.length && (isCamp || isBudget || isAction || isCause)) {
    ctx.top_campaigns = campList.slice(0, 8);
  }

  if (isType || (!isKeyword && !mentionedCamps.length)) {
    const tyAgg = {};
    type.forEach(r => {
      const k = r.campaign_type; if (!k) return;
      if (!tyAgg[k]) tyAgg[k] = { c: 0, r: 0, cv: 0 };
      tyAgg[k].c += num(r.cost_krw);
      tyAgg[k].r += num(r.revenue);
      tyAgg[k].cv += num(r.purchases);
    });
    ctx.by_type = Object.entries(tyAgg).map(([k, v]) => ({
      type: k, cost: v.c, rev: v.r, conv: v.cv,
      roas: v.c ? +(v.r / v.c).toFixed(2) : 0
    }));
  }

  if (isKeyword || isBudget) {
    const validKw = kw.filter(k => k.keyword);
    const star = validKw.filter(k => num(k.roas) >= 5 && num(k.conversions_30d) >= 2);
    const dead = validKw.filter(k => num(k.cost_30d) > 3000 && num(k.roas) < 1);
    ctx.kw_stats = {
      star: star.length,
      dead: dead.length,
      wasted: dead.reduce((s, k) => s + num(k.cost_30d), 0),
      star_top: star.sort((a, b) => num(b.revenue_30d) - num(a.revenue_30d)).slice(0, 5).map(k => ({
        kw: k.keyword, roas: +num(k.roas).toFixed(1), rev: num(k.revenue_30d)
      })),
      dead_top: dead.sort((a, b) => num(b.cost_30d) - num(a.cost_30d)).slice(0, 5).map(k => ({
        kw: k.keyword, roas: +num(k.roas).toFixed(2), cost: num(k.cost_30d)
      }))
    };
  }

  if (isCause || isAction || isRisk) {
    // 최근 7일 vs 이전 7일 요약만
    const w7 = daily.slice(0, 7);
    const p7 = daily.slice(7, 14);
    const sum = arr => arr.reduce((s, r) => ({
      c: s.c + num(r.cost_krw), r: s.r + num(r.revenue), cv: s.cv + num(r.purchases)
    }), { c: 0, r: 0, cv: 0 });
    const w = sum(w7); const p = sum(p7);
    ctx.week_compare = {
      recent: { cost: w.c, rev: w.r, conv: w.cv, roas: w.c ? +(w.r / w.c).toFixed(2) : 0 },
      prev: { cost: p.c, rev: p.r, conv: p.cv, roas: p.c ? +(p.r / p.c).toFixed(2) : 0 },
      rev_change_pct: p.r ? +((w.r - p.r) / p.r * 100).toFixed(1) : 0
    };
    ctx.insight_key = {
      status: insight.overall_status,
      top_rev_camp: insight.top_revenue_campaign,
      worst_camp: insight.worst_revenue_campaign,
      best_roas: insight.best_roas_campaign
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
  const systemPrompt = `당신은 네이버 검색광고 시니어 마케팅 분석가입니다. 한국어로 답변하세요.

원칙: 실제 숫자 인용, 원인→액션 순서, 마크다운 사용, 간결하게(200~400자).
용어: STAR(ROAS≥5x)·HEALTHY(2~5x)·LOSING(1~2x)·DEAD(<1x).

데이터:
${JSON.stringify(context)}`;

  // 대화 히스토리 (최근 4턴만 - 컨텍스트 절약)
  LLM_STATE.history.push({ role: 'user', content: userQuestion });
  const messages = [
    { role: 'system', content: systemPrompt },
    ...LLM_STATE.history.slice(-4)
  ];

  let fullText = '';
  const stream = await LLM_STATE.engine.chat.completions.create({
    messages,
    temperature: 0.3,
    max_tokens: 600,
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
  
  // Worker 도메인에서는 HF 프록시 경유 (Cloudflare Worker에 /hf-proxy/ 엔드포인트 필요)
  const isWorker = window.location.hostname.includes('workers.dev');

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
    <div id="proxyNotice" style="display:none;margin-bottom:10px;padding:8px 12px;background:#eff6ff;border:1px solid #93c5fd;border-radius:6px;font-size:11px;color:#1d4ed8;">
      ℹ️ Cloudflare Worker 프록시 경유 모드 - 모델 다운로드는 Worker 서버를 거쳐 이루어집니다.
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

  // Worker 접속 시 프록시 안내 표시
  if (window.location.hostname.includes('workers.dev')) {
    const notice = document.getElementById('proxyNotice');
    if (notice) notice.style.display = 'block';
  }
  
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
