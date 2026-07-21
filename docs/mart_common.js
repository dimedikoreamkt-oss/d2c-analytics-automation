// ===== 컬럼 사전 =====
const KOREAN_LABELS = {
  event_date: { ko: '날짜', desc: '데이터 집계 기준일' },
  sessions: { ko: '세션 수', desc: '사이트 방문 횟수 (한 사용자가 여러 번 방문하면 각각 세션)' },
  users: { ko: '순 사용자 수', desc: '중복 제거된 방문자 수' },
  new_users: { ko: '신규 사용자', desc: '처음 방문한 사용자 수' },
  returning_users: { ko: '재방문 사용자', desc: '이전에 방문한 적 있는 사용자 수' },
  user_type: { ko: '사용자 유형', desc: '신규(new) 또는 재방문(returning) 구분' },
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
  funnel_type: { ko: '퍼널 유형', desc: '분석 대상 퍼널 종류' },
  segment: { ko: '세그먼트', desc: '사용자 그룹 분류' },
  step_number: { ko: '단계 번호', desc: '퍼널 내 단계 순서' },
  step_name: { ko: '단계명', desc: '퍼널 각 단계 이름' },
  pct_of_step1: { ko: '유입 대비 비율', desc: '첫 단계 대비 도달률 (%)' },
  dropoff_from_prev_pct: { ko: '단계 이탈률', desc: '직전 단계에서 몇 %가 이탈했는가' },
  cohort_week: { ko: '가입 주차', desc: '사용자가 처음 방문한 주' },
  cohort_month: { ko: '가입 월', desc: '사용자가 처음 방문한 월' },
  weeks_since_signup: { ko: '경과 주차', desc: '가입 후 몇 주가 지났는지' },
  retained_users: { ko: '유지 사용자 수', desc: '해당 주차에 재방문한 사용자' },
  retention_pct: { ko: '리텐션율', desc: '가입 대비 유지율 (%)' },
  channel: { ko: '유입 채널', desc: '사용자가 들어온 마케팅 채널' },
  touch_position: { ko: '접점 위치', desc: 'first/mid/last — 구매 여정에서의 위치' },
  first_touch_conversions: { ko: '첫 접점 기여 전환', desc: '첫 유입 채널에 100% 배분한 전환수' },
  last_touch_conversions: { ko: '마지막 접점 기여 전환', desc: '마지막 채널에 100% 배분한 전환수' },
  linear_conversions: { ko: '선형 배분 전환', desc: '모든 접점에 균등 배분한 전환수' },
  day_of_week_num: { ko: '요일', desc: '0=일, 1=월, ..., 6=토' },
  hour_of_day: { ko: '시간대', desc: '0시~23시' },
  engagement_tier: { ko: '참여 등급', desc: 'high/medium/low — 세션 몰입도' },
  avg_pageviews_per_session: { ko: '세션당 평균 페이지뷰', desc: '한 번 방문에 몇 페이지를 봤는지' },
  avg_engagement_seconds: { ko: '평균 체류시간', desc: '세션당 평균 머문 시간 (초)' },
  scroll_90pct_sessions: { ko: '스크롤 90% 세션', desc: '페이지 끝까지 스크롤한 세션 수' },
  download_sessions: { ko: '파일 다운로드 세션', desc: '파일을 받은 세션 수' },
  video_start_sessions: { ko: '비디오 시작 세션', desc: '비디오 재생을 시작한 세션' },
  video_complete_sessions: { ko: '비디오 완료 세션', desc: '비디오를 끝까지 본 세션' },
  outbound_click_sessions: { ko: '외부 링크 클릭 세션', desc: '외부 사이트로 나간 세션' },
  traffic_channel: { ko: '트래픽 채널', desc: '유입 출처 (AI 검색/다크소셜/일반)' },
  add_to_cart_sessions: { ko: '장바구니 발생 세션', desc: '장바구니 담기가 있었던 세션' },
  purchase_sessions: { ko: '구매 발생 세션', desc: '구매가 있었던 세션' },
  session_conversion_rate_pct: { ko: '세션 전환율', desc: '세션 대비 구매 세션 비율 (%)' },
  cvr_session_pct: { ko: '세션 전환율', desc: '세션 100건 중 구매 발생 비율 (%)' },
  rfm_segment: { ko: 'RFM 세그먼트', desc: 'VIP/충성/이탈위험 등 고객 등급' },
  r_score: { ko: 'R 점수', desc: 'Recency — 최근 구매일 점수' },
  f_score: { ko: 'F 점수', desc: 'Frequency — 구매 빈도 점수' },
  m_score: { ko: 'M 점수', desc: 'Monetary — 구매 금액 점수' },
  recency_days: { ko: '최근성 (일)', desc: '마지막 구매로부터 지난 일수' },
  frequency: { ko: '구매 빈도', desc: '총 구매 횟수' },
  monetary: { ko: '총 구매액', desc: '누적 구매 금액' },
  ltv: { ko: '고객 생애가치', desc: '이 고객이 지금까지 가져온 총 매출' },
  user_pseudo_id: { ko: '사용자 ID', desc: 'GA4 익명 식별자' },
  cluster_id: { ko: '군집 번호', desc: 'K-means 자동 분류 그룹' },
  purchase_probability: { ko: '구매 확률', desc: 'ML 모델이 예측한 구매 가능성' }
    // Mart 13/14/16 신규 컬럼
  age_bracket: { ko: '연령대', desc: '18-24, 25-34, 35-44, 45-54, 55-64, 65+' },
  gender: { ko: '성별', desc: 'male / female / unknown' },
  country: { ko: '국가', desc: '방문자의 국가' },
  region: { ko: '지역 (시도)', desc: '한국이면 서울/경기/부산 등' },
  city: { ko: '도시', desc: '방문자의 도시' },
  device_category: { ko: '디바이스', desc: 'mobile / desktop / tablet' },
  interest_type: { ko: '관심사 유형', desc: 'affinity(친밀도) / in_market(구매의향) / life_event(생애이벤트)' },
  interest_value: { ko: '관심사 카테고리', desc: 'GA4가 분류한 관심 카테고리명' },
  source: { ko: '유입 소스', desc: '어디에서 들어왔는가 (예: google, facebook, naver)' },
  medium: { ko: '유입 매체', desc: '어떤 방식으로 들어왔는가 (예: cpc, organic, email)' },
  campaign: { ko: '캠페인명', desc: '마케팅 캠페인 식별자 (UTM campaign)' },
  ad_content: { ko: '광고 소재', desc: '동일 캠페인 내 크리에이티브 구분 (UTM content)' },
  ad_term: { ko: '광고 키워드', desc: '검색 광고의 키워드 (UTM term)' },
  page_views: { ko: '페이지뷰', desc: '총 페이지 조회 수' },
  acquired_users: { ko: '신규 획득 사용자', desc: '이 채널을 통해 처음 방문한 사용자 수' },
  session_cvr_pct: { ko: '세션 전환율', desc: '세션 100건 중 구매 세션 비율 (%)' },
  user_cvr_pct: { ko: '사용자 전환율', desc: '사용자 100명 중 구매자 비율 (%)' },
  revenue_per_user: { ko: '유저당 매출', desc: '사용자 1명당 평균 매출' },
  revenue_per_acquired_user: { ko: '획득당 매출', desc: '신규 획득 유저 1명당 매출 (LTV 근사)' },
  atc_rate_pct: { ko: '장바구니 담기율', desc: '세션 100건 중 장바구니 담기 발생 비율' },
  // Mart 17 광고 성과 (CAC/ROAS)
  platform: { ko: '광고 플랫폼', desc: 'meta / google / naver / kakao / tiktok' },
  utm_source: { ko: 'UTM 소스', desc: '유입 출처 (예: facebook, google, naver)' },
  utm_medium: { ko: 'UTM 매체', desc: '유입 방식 (예: cpc, paid_social)' },
  utm_campaign: { ko: 'UTM 캠페인', desc: '캠페인 식별자' },
  impressions: { ko: '노출 수', desc: '광고가 사용자에게 보여진 횟수' },
  clicks: { ko: '클릭 수', desc: '광고를 클릭한 횟수' },
  spend_krw: { ko: '광고비 (원)', desc: '해당 조건의 광고 지출액 (KRW)' },
  spend_original: { ko: '광고비 (원본 통화)', desc: '플랫폼 계정 통화 기준 금액' },
  platform_conversions: { ko: '플랫폼 전환수', desc: '광고 플랫폼이 자체 측정한 전환 (참고용)' },
  platform_revenue: { ko: '플랫폼 매출', desc: '광고 플랫폼이 자체 측정한 매출 (참고용)' },
  ga_revenue: { ko: 'GA 매출', desc: 'GA4가 측정한 실제 매출 (신뢰 기준)' },
  cpc: { ko: 'CPC (클릭당 비용)', desc: '광고비 ÷ 클릭 수' },
  cpm: { ko: 'CPM (1000노출당)', desc: '광고비 ÷ 노출 × 1000' },
  ctr_pct: { ko: 'CTR (클릭률)', desc: '클릭 ÷ 노출 × 100 (%)' },
  cac_krw: { ko: 'CAC (신규 획득비)', desc: '광고비 ÷ 신규 획득 유저 — 낮을수록 좋음' },
  cpa_krw: { ko: 'CPA (주문당 획득비)', desc: '광고비 ÷ 구매 수' },
  roas: { ko: 'ROAS (매출 배수)', desc: 'GA 매출 ÷ 광고비 — 1.0 이상이 손익분기, 3.0 이상 건강' },
  platform_roas: { ko: 'Platform ROAS', desc: '플랫폼 자체 매출 기준 (오버트래킹 주의)' },
  click_to_purchase_pct: { ko: '클릭→구매 전환율', desc: '광고 클릭 후 실제 구매까지 이어진 비율' },
  ltv_estimate_krw: { ko: 'LTV 추정치', desc: '획득 유저 1명이 가져온 누적 매출' },
  ltv_cac_ratio: { ko: 'LTV / CAC', desc: '3배 이상이면 건강한 유닛이코노믹스, 1배 미만은 손해' },


};
const ko = (k) => (KOREAN_LABELS[k]?.ko) || k;
const koDesc = (k) => (KOREAN_LABELS[k]?.desc) || '';

// ===== SVG 아이콘 =====
const ICONS = {
  trendUp: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="22 7 13.5 15.5 8.5 10.5 2 17"/><polyline points="16 7 22 7 22 13"/></svg>',
  trendDown: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="22 17 13.5 8.5 8.5 13.5 2 7"/><polyline points="16 17 22 17 22 11"/></svg>',
  trendFlat: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="5" y1="12" x2="19" y2="12"/></svg>',
  insight: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41"/><circle cx="12" cy="12" r="5"/></svg>',
  calendar: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>',
  check: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>',
  warn: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>',
  alert: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>',
  rocket: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4.5 16.5c-1.5 1.26-2 5-2 5s3.74-.5 5-2c.71-.84.7-2.13-.09-2.91a2.18 2.18 0 00-2.91-.09zM12 15l-3-3a22 22 0 012-3.95A12.88 12.88 0 0122 2c0 2.72-.78 7.5-6 11a22.35 22.35 0 01-4 2z"/></svg>',
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
    ['mart13.html', '13', '인구통계 분석'],
    ['mart14.html', '14', '관심사 카테고리'],
    ['mart16.html', '16', '광고 채널 딥다이브'],
    ['mart17.html', '17', '광고 CAC / ROAS'],

  ];
  const sidebar = document.querySelector('.sidebar');
  if (!sidebar) return;
  const current = location.pathname.split('/').pop();
  sidebar.innerHTML =
    `<div class="sec-label">기본 분석</div>` +
    marts.slice(0, 9).map(([h, tag, name]) => `<a href="${h}" class="${h === current ? 'active' : ''}">
      <span class="num">${tag}</span> ${name}</a>`).join('') +
    `<div class="sec-label" style="margin-top:16px">고급 분석 · Growth</div>` +
    marts.slice(9).map(([h, tag, name]) => `<a href="${h}" class="${h === current ? 'active' : ''}">
      <span class="num">${tag}</span> ${name}</a>`).join('');
}


// ===== 유틸 =====
function shortDate(s) { const p = String(s).split('-'); return p.length === 3 ? `${p[1]}/${p[2]}` : s; }
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
function toDate(s) { return new Date(s + 'T00:00:00Z'); }
function fromDate(d) {
  const y = d.getUTCFullYear(), m = String(d.getUTCMonth()+1).padStart(2,'0'), day = String(d.getUTCDate()).padStart(2,'0');
  return `${y}-${m}-${day}`;
}
function addDays(s, n) { const d = toDate(s); d.setUTCDate(d.getUTCDate()+n); return fromDate(d); }
function daysBetween(a, b) { return Math.round((toDate(b) - toDate(a)) / 86400000); }

function deltaBadge(cur, prev, isPctMetric) {
  if (!isFinite(cur) || !isFinite(prev) || prev === 0)
    return `<span class="delta-badge flat">${ICONS.trendFlat} 비교불가</span>`;
  const diff = isPctMetric ? (cur - prev) : ((cur - prev) / Math.abs(prev)) * 100;
  const icon = diff > 0.5 ? ICONS.trendUp : (diff < -0.5 ? ICONS.trendDown : ICONS.trendFlat);
  const cls = diff > 0.5 ? 'up' : (diff < -0.5 ? 'down' : 'flat');
  const unit = isPctMetric ? 'p' : '%';
  return `<span class="delta-badge ${cls}">${icon} ${diff >= 0 ? '+' : ''}${diff.toFixed(1)}${unit}</span>`;
}
function goodDirection(k) { return /abandon|drop|dropoff|bounce|churn|exit/i.test(k) ? 'down' : 'up'; }

// ===== 공용 날짜 필터 UI =====
function buildDateFilter(container, allDates, onChange) {
  const dates = allDates.slice().sort();
  const minD = dates[0], maxD = dates[dates.length - 1];

  // 기본: 최근 7일 vs 그 이전 7일
  const span = 7;
  let primaryEnd = maxD;
  let primaryStart = addDays(maxD, -(span-1));
  if (toDate(primaryStart) < toDate(minD)) primaryStart = minD;
  let compareEnd = addDays(primaryStart, -1);
  let compareStart = addDays(compareEnd, -(daysBetween(primaryStart, primaryEnd)));
  if (toDate(compareStart) < toDate(minD)) compareStart = minD;

  const wrap = document.createElement('div');
  wrap.className = 'date-filter';
  wrap.innerHTML = `
    <div class="df-section primary">
      <div class="df-title">${ICONS.calendar} 기준 기간 · Primary</div>
      <div class="df-inputs">
        <input type="date" id="dfPStart" value="${primaryStart}" min="${minD}" max="${maxD}">
        <span class="df-sep">→</span>
        <input type="date" id="dfPEnd" value="${primaryEnd}" min="${minD}" max="${maxD}">
      </div>
      <div class="df-quick" id="dfQuick">
        <button data-span="1">어제</button>
        <button data-span="7" class="active">최근 7일</button>
        <button data-span="14">최근 14일</button>
        <button data-span="30">최근 30일</button>
      </div>
    </div>
    <div class="df-section">
      <div class="df-title">${ICONS.calendar} 비교 기간 · Compare</div>
      <div class="df-inputs">
        <input type="date" id="dfCStart" value="${compareStart}" min="${minD}" max="${maxD}">
        <span class="df-sep">→</span>
        <input type="date" id="dfCEnd" value="${compareEnd}" min="${minD}" max="${maxD}">
      </div>
      <div class="df-quick">
        <button id="dfPrevPeriod" class="active">직전 동일 기간</button>
        <button id="dfPrevWeek">전주 동일</button>
      </div>
    </div>
    <button class="df-apply" id="dfApply">적용</button>
  `;
  container.appendChild(wrap);

  const getVals = () => ({
    primaryStart: document.getElementById('dfPStart').value,
    primaryEnd: document.getElementById('dfPEnd').value,
    compareStart: document.getElementById('dfCStart').value,
    compareEnd: document.getElementById('dfCEnd').value,
  });

  document.getElementById('dfApply').addEventListener('click', () => onChange(getVals()));

  document.querySelectorAll('#dfQuick button').forEach(b => {
    b.addEventListener('click', () => {
      document.querySelectorAll('#dfQuick button').forEach(x => x.classList.remove('active'));
      b.classList.add('active');
      const s = parseInt(b.dataset.span);
      let pe = maxD, ps = addDays(maxD, -(s-1));
      if (toDate(ps) < toDate(minD)) ps = minD;
      document.getElementById('dfPStart').value = ps;
      document.getElementById('dfPEnd').value = pe;
      // 비교: 직전 동일 기간
      const ce = addDays(ps, -1);
      let cs = addDays(ce, -(daysBetween(ps, pe)));
      if (toDate(cs) < toDate(minD)) cs = minD;
      document.getElementById('dfCStart').value = cs;
      document.getElementById('dfCEnd').value = ce;
      onChange(getVals());
    });
  });

  document.getElementById('dfPrevPeriod').addEventListener('click', () => {
    const v = getVals();
    const len = daysBetween(v.primaryStart, v.primaryEnd);
    const ce = addDays(v.primaryStart, -1);
    let cs = addDays(ce, -len);
    if (toDate(cs) < toDate(minD)) cs = minD;
    document.getElementById('dfCStart').value = cs;
    document.getElementById('dfCEnd').value = ce;
    onChange(getVals());
  });
  document.getElementById('dfPrevWeek').addEventListener('click', () => {
    const v = getVals();
    let cs = addDays(v.primaryStart, -7);
    let ce = addDays(v.primaryEnd, -7);
    if (toDate(cs) < toDate(minD)) cs = minD;
    document.getElementById('dfCStart').value = cs;
    document.getElementById('dfCEnd').value = ce;
    onChange(getVals());
  });

  return getVals();
}

function filterByRange(rows, dateKey, start, end) {
  return rows.filter(r => {
    const d = r[dateKey];
    return d >= start && d <= end;
  });
}
function sumBy(rows, key) {
  return rows.reduce((s, r) => { const v = parseFloat(r[key]); return isFinite(v) ? s + v : s; }, 0);
}
function avgBy(rows, key) {
  const vs = rows.map(r => parseFloat(r[key])).filter(v => isFinite(v));
  return vs.length ? vs.reduce((a,b)=>a+b,0)/vs.length : NaN;
}

// ===== 메인 =====
(async function() {
  buildSidebar();
  const statusEl = document.getElementById('status');
  const root = document.getElementById('root');
  try {
    const res = await fetch(DATA_FILE + '?t=' + Date.now());
    if (!res.ok) throw new Error('데이터 파일을 찾을 수 없음');
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
  const allDates = dateKey ? [...new Set(rows.map(r => r[dateKey]))].sort() : [];

  const root = document.getElementById('root');
  let currentRange = null;
  let filterVal = '__all__';

  // 날짜 필터 (dateKey 있을 때만)
  if (dateKey && allDates.length > 0) {
    currentRange = buildDateFilter(root, allDates, (v) => { currentRange = v; draw(); });
  }

  // 카테고리 필터
  let filterKey = null;
  if (categoricalKeys.length > 0) {
    filterKey = categoricalKeys[0];
    const controls = document.createElement('div');
    controls.className = 'controls';
    const uniques = [...new Set(rows.map(r => r[filterKey]))].filter(v => v !== null && v !== undefined);
    // Mart 6은 기본으로 "전체" 유지해서 비교 모드가 자연스럽게 동작
    controls.innerHTML = `<div>
      <label>${ko(filterKey)}</label>
      <select id="filterSel">
        <option value="__all__">전체</option>
        ${uniques.map(v => `<option value="${v}">${v}</option>`).join('')}
      </select></div>`;
    root.appendChild(controls);
    document.getElementById('filterSel').addEventListener('change', () => {
      filterVal = document.getElementById('filterSel').value; draw();
    });
  }

  // 지표 선택 칩
  let selectedMetrics = numericKeys.slice(0, 3);
  const chipBar = document.createElement('div');
  chipBar.className = 'chip-bar';
  chipBar.innerHTML = `<div class="chip-label">${ICONS.bar} 표시할 지표 선택</div>` +
    numericKeys.map(k => `<span class="chip ${selectedMetrics.includes(k) ? 'active' : ''}" data-key="${k}" title="${koDesc(k)}">
      ${ko(k)} <span class="chip-en">${k}</span></span>`).join('');
  root.appendChild(chipBar);
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
  root.appendChild(contentDiv);

  function draw() {
    contentDiv.innerHTML = '';
    let base = rows;
    if (filterKey && filterVal !== '__all__') base = rows.filter(r => String(r[filterKey]) === filterVal);

    // 기간 필터링
    let primaryRows = base, compareRows = [];
    if (dateKey && currentRange) {
      primaryRows = filterByRange(base, dateKey, currentRange.primaryStart, currentRange.primaryEnd);
      compareRows = filterByRange(base, dateKey, currentRange.compareStart, currentRange.compareEnd);
    }
    if (!primaryRows.length) {
      contentDiv.innerHTML = '<p class="status">선택한 기간에 데이터가 없습니다.</p>';
      return;
    }

    // ===== 비교 배너 (선택 지표 상위 3개) =====
    if (dateKey && selectedMetrics.length && currentRange) {
      const hero = document.createElement('div');
      hero.className = 'compare-hero';
      selectedMetrics.slice(0, 3).forEach(k => {
        const isPct = /pct|rate|ratio/i.test(k);
        const curVal = isPct ? avgBy(primaryRows, k) : sumBy(primaryRows, k);
        const prevVal = isPct ? avgBy(compareRows, k) : sumBy(compareRows, k);
        const card = document.createElement('div');
        card.className = 'compare-card';
        card.innerHTML = `
          <div class="cc-label">${ko(k)} <span class="en">${k}</span></div>
          <div class="cc-desc">${koDesc(k)}</div>
          <div class="compare-rows">
            <div class="cr-block cr-primary">
              <div class="cr-label">기준 기간</div>
              <div class="cr-value">${fmt(curVal)}</div>
            </div>
            <div class="cr-block cr-secondary">
              <div class="cr-label">비교 기간</div>
              <div class="cr-value">${fmt(prevVal)}</div>
            </div>
          </div>
          <div class="compare-delta">${deltaBadge(curVal, prevVal, isPct)} <span style="color:var(--text-muted);font-size:12px;margin-left:6px">기준 vs 비교</span></div>`;
        hero.appendChild(card);
      });
      contentDiv.appendChild(hero);
    }

    // ===== 인사이트 =====
    if (dateKey && selectedMetrics.length && currentRange && compareRows.length) {
      const items = [];
      selectedMetrics.forEach(k => {
        const isPct = /pct|rate|ratio/i.test(k);
        const cur = isPct ? avgBy(primaryRows, k) : sumBy(primaryRows, k);
        const prev = isPct ? avgBy(compareRows, k) : sumBy(compareRows, k);
        if (!isFinite(cur) || !isFinite(prev) || prev === 0) return;
        const diff = isPct ? (cur - prev) : ((cur - prev)/Math.abs(prev))*100;
        if (Math.abs(diff) < 5) return;
        const good = goodDirection(k);
        const isGood = (diff > 0 && good === 'up') || (diff < 0 && good === 'down');
        const tone = isGood ? 'good' : 'bad';
        const icon = isGood ? ICONS.check : ICONS.alert;
        const dir = diff > 0 ? '증가' : '감소';
        items.push({
          tone, icon,
          text: `<b>${ko(k)}</b>가 비교 기간(${fmt(prev)})보다 <b>${Math.abs(diff).toFixed(1)}${isPct?'p':'%'} ${dir}</b>했어요 → 기준 기간 <b>${fmt(cur)}</b>`
        });
      });
      if (items.length) {
        const box = document.createElement('div');
        box.className = 'insight-box';
        box.innerHTML = `<div class="i-title">${ICONS.insight} 기간 비교 요약</div>` +
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
        const cur = isPct ? avgBy(primaryRows, k) : sumBy(primaryRows, k);
        const prev = isPct ? avgBy(compareRows, k) : sumBy(compareRows, k);
        const card = document.createElement('div');
        card.className = 'kpi-card';
        card.innerHTML = `<div class="label">${ko(k)} <span class="en">${k}</span></div>
                          <div class="value">${fmt(cur)}</div>
                          <div class="k-desc">${koDesc(k)}</div>
                          <div class="k-delta">${compareRows.length ? deltaBadge(cur, prev, isPct) : ''}</div>`;
        kpiGrid.appendChild(card);
      });
      contentDiv.appendChild(kpiGrid);
    }

    // ===== 시계열 차트 (기준 vs 비교 오버레이) =====
    if (dateKey && selectedMetrics.length) {
      const chartGrid = document.createElement('div');
      chartGrid.className = 'chart-grid';
      const palette = ['#0066FF','#4d94ff','#F59E0B','#00A76F','#E5484D','#8B5CF6','#06B6D4'];

      selectedMetrics.forEach((k, i) => {
        const primDates = [...new Set(primaryRows.map(r => r[dateKey]))].sort();
        const compDates = [...new Set(compareRows.map(r => r[dateKey]))].sort();
        const primMap = {}; primaryRows.forEach(r => { const v = parseFloat(r[k]); if (isFinite(v)) primMap[r[dateKey]] = (primMap[r[dateKey]]||0)+v; });
        const compMap = {}; compareRows.forEach(r => { const v = parseFloat(r[k]); if (isFinite(v)) compMap[r[dateKey]] = (compMap[r[dateKey]]||0)+v; });

        // x축은 기준 기간 날짜 인덱스, 비교 기간은 같은 길이로 정렬해 겹쳐 그리기
        const N = Math.max(primDates.length, compDates.length);
        const labels = primDates.map(shortDate);
        const primData = primDates.map(d => primMap[d] ?? 0);
        const compData = compDates.slice(0, N).map(d => compMap[d] ?? 0);

        const box = document.createElement('div');
        box.className = 'chart-box';
        box.innerHTML = `<h3>${ko(k)} <span class="chart-en">${k}</span></h3><div class="h3-sub">${koDesc(k)} — 파란색: 기준 / 회색: 비교</div><canvas></canvas>`;
        chartGrid.appendChild(box);
        const ctx = box.querySelector('canvas').getContext('2d');
        new Chart(ctx, {
          type: 'line',
          data: {
            labels,
            datasets: [
              { label: '기준 기간', data: primData, borderColor: '#0066FF', backgroundColor: 'rgba(0,102,255,0.12)', tension: 0.35, pointRadius: 2, borderWidth: 2.5, fill: true },
              { label: '비교 기간', data: compData, borderColor: '#8892A6', backgroundColor: 'rgba(136,146,166,0.08)', tension: 0.35, pointRadius: 2, borderWidth: 2, borderDash: [5, 5], fill: false }
            ]
          },
          options: {
            responsive: true, maintainAspectRatio: false,
            plugins: { legend: { labels: { color: '#5A6478', font: { size: 11 } } } },
            scales: {
              x: { ticks: { color: '#8892A6', font: { size: 11 }, maxRotation: 60, minRotation: 45, autoSkip: true }, grid: { color: '#F0F3F7' } },
              y: { ticks: { color: '#8892A6', font: { size: 11 } }, grid: { color: '#F0F3F7' }, beginAtZero: true }
            }
          }
        });
      });
      contentDiv.appendChild(chartGrid);
    }

    // ===== 원본 테이블 (기준 기간) =====
    const tblBox = document.createElement('div');
    tblBox.className = 'chart-box';
    tblBox.innerHTML = `<h3>원본 데이터 <span class="chart-en">Raw Data</span></h3><div class="h3-sub">기준 기간 · 최대 500행</div>
                        <div style="overflow-x:auto"><table></table></div>`;
    contentDiv.appendChild(tblBox);
    const table = tblBox.querySelector('table');
    const shown = primaryRows.slice(0, 500);
    const thead = '<thead><tr>' + keys.map(k => `<th><div class="th-ko">${ko(k)}</div><div class="th-en">${k}</div></th>`).join('') + '</tr></thead>';
    const tbody = '<tbody>' + shown.map(r =>
      '<tr>' + keys.map(k => `<td>${r[k] ?? ''}</td>`).join('') + '</tr>'
    ).join('') + '</tbody>';
    table.innerHTML = thead + tbody;
  }

  draw();
}
