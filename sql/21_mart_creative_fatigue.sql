-- Mart 21: 소재 피로도 자동 감지
-- 러닝 기간 · Frequency · CTR/CPC/CPM 트렌드 기반 종합 점수화
DROP TABLE IF EXISTS `d2c-analytics-502304.marts.mart_creative_fatigue`;

CREATE TABLE `d2c-analytics-502304.marts.mart_creative_fatigue` AS

WITH raw_perf AS (
  SELECT
    event_date, ad_id, ad_name, campaign_name, adset_name,
    impressions, reach, frequency, spend_krw, clicks, ctr_pct, cpc, cpm,
    meta_purchases, meta_purchase_value, meta_roas,
    ga_sessions, ga_purchases, ga_revenue, ga_roas
  FROM `d2c-analytics-502304.marts.mart_creative_performance`
  WHERE event_date >= DATE_SUB(CURRENT_DATE(), INTERVAL 60 DAY)
),

ad_lifespan AS (
  -- 광고별 러닝 시작일·종료일·러닝 일수
  SELECT
    ad_id,
    ad_name,
    campaign_name,
    adset_name,
    MIN(event_date) AS first_active_date,
    MAX(event_date) AS last_active_date,
    DATE_DIFF(MAX(event_date), MIN(event_date), DAY) + 1 AS running_days,
    COUNT(DISTINCT event_date) AS active_days,
    SUM(spend_krw) AS total_spend,
    SUM(impressions) AS total_impressions,
    SUM(clicks) AS total_clicks,
    SUM(ga_purchases) AS total_purchases,
    SUM(ga_revenue) AS total_ga_revenue,
    SAFE_DIVIDE(SUM(impressions) * (SELECT AVG(frequency) FROM raw_perf rp2 WHERE rp2.ad_id = rp.ad_id AND rp2.impressions > 0),
      NULLIF(SUM(impressions), 0)) AS avg_frequency
  FROM raw_perf rp
  WHERE spend_krw > 0
  GROUP BY ad_id, ad_name, campaign_name, adset_name
),

-- 최근 7일 성과
recent_7d AS (
  SELECT
    ad_id,
    SUM(impressions) AS r7_imps,
    SUM(clicks) AS r7_clicks,
    SUM(spend_krw) AS r7_spend,
    SAFE_DIVIDE(SUM(clicks), NULLIF(SUM(impressions), 0)) * 100 AS r7_ctr,
    SAFE_DIVIDE(SUM(spend_krw), NULLIF(SUM(clicks), 0)) AS r7_cpc,
    SAFE_DIVIDE(SUM(spend_krw) * 1000, NULLIF(SUM(impressions), 0)) AS r7_cpm,
    SAFE_DIVIDE(SUM(frequency * impressions), NULLIF(SUM(impressions), 0)) AS r7_freq
  FROM raw_perf
  WHERE event_date BETWEEN DATE_SUB(CURRENT_DATE(), INTERVAL 7 DAY) AND DATE_SUB(CURRENT_DATE(), INTERVAL 1 DAY)
  GROUP BY ad_id
),

-- 첫 7일 성과 (또는 러닝 초반 7일)
first_7d AS (
  SELECT
    rp.ad_id,
    SUM(rp.impressions) AS f7_imps,
    SUM(rp.clicks) AS f7_clicks,
    SUM(rp.spend_krw) AS f7_spend,
    SAFE_DIVIDE(SUM(rp.clicks), NULLIF(SUM(rp.impressions), 0)) * 100 AS f7_ctr,
    SAFE_DIVIDE(SUM(rp.spend_krw), NULLIF(SUM(rp.clicks), 0)) AS f7_cpc,
    SAFE_DIVIDE(SUM(rp.spend_krw) * 1000, NULLIF(SUM(rp.impressions), 0)) AS f7_cpm,
    SAFE_DIVIDE(SUM(rp.frequency * rp.impressions), NULLIF(SUM(rp.impressions), 0)) AS f7_freq
  FROM raw_perf rp
  INNER JOIN ad_lifespan al ON rp.ad_id = al.ad_id
  WHERE rp.event_date BETWEEN al.first_active_date AND DATE_ADD(al.first_active_date, INTERVAL 6 DAY)
  GROUP BY rp.ad_id
),

-- 전체 기간 성과 (누적)
lifetime AS (
  SELECT
    ad_id,
    SUM(impressions) AS life_imps,
    SUM(clicks) AS life_clicks,
    SUM(spend_krw) AS life_spend,
    SAFE_DIVIDE(SUM(clicks), NULLIF(SUM(impressions), 0)) * 100 AS life_ctr,
    SAFE_DIVIDE(SUM(spend_krw), NULLIF(SUM(clicks), 0)) AS life_cpc,
    SAFE_DIVIDE(SUM(spend_krw) * 1000, NULLIF(SUM(impressions), 0)) AS life_cpm,
    SAFE_DIVIDE(SUM(frequency * impressions), NULLIF(SUM(impressions), 0)) AS life_freq,
    SUM(ga_purchases) AS life_purchases,
    SUM(ga_revenue) AS life_revenue,
    SAFE_DIVIDE(SUM(ga_revenue), NULLIF(SUM(spend_krw), 0)) AS life_ga_roas
  FROM raw_perf
  GROUP BY ad_id
),

-- 신호 계산
signals AS (
  SELECT
    al.ad_id,
    al.ad_name,
    al.campaign_name,
    al.adset_name,
    al.first_active_date,
    al.last_active_date,
    al.running_days,
    al.active_days,
    l.life_imps,
    l.life_spend,
    l.life_ctr,
    l.life_cpc,
    l.life_cpm,
    l.life_freq,
    l.life_purchases,
    l.life_revenue,
    l.life_ga_roas,
    r7.r7_imps,
    r7.r7_spend,
    r7.r7_ctr,
    r7.r7_cpc,
    r7.r7_cpm,
    r7.r7_freq,
    f7.f7_ctr,
    f7.f7_cpc,
    f7.f7_cpm,
    f7.f7_freq,

    -- 시그널 1: 높은 빈도
    CASE WHEN r7.r7_freq >= 3.0 THEN 1 ELSE 0 END AS sig_high_freq,

    -- 시그널 2: CTR 하락 (첫 7일 대비 최근 7일)
    CASE
      WHEN f7.f7_ctr > 0 AND r7.r7_ctr IS NOT NULL
        AND (r7.r7_ctr - f7.f7_ctr) / f7.f7_ctr <= -0.25
      THEN 1 ELSE 0
    END AS sig_ctr_decline,

    -- 시그널 3: CPC 상승
    CASE
      WHEN f7.f7_cpc > 0 AND r7.r7_cpc IS NOT NULL
        AND (r7.r7_cpc - f7.f7_cpc) / f7.f7_cpc >= 0.30
      THEN 1 ELSE 0
    END AS sig_cpc_rise,

    -- 시그널 4: CPM 상승
    CASE
      WHEN f7.f7_cpm > 0 AND r7.r7_cpm IS NOT NULL
        AND (r7.r7_cpm - f7.f7_cpm) / f7.f7_cpm >= 0.25
      THEN 1 ELSE 0
    END AS sig_cpm_rise,

    -- 시그널 5: 롱런 소재
    CASE
      WHEN al.running_days >= 30 AND r7.r7_freq >= 2.5
      THEN 1 ELSE 0
    END AS sig_long_running,

    -- 변화율
    SAFE_DIVIDE(r7.r7_ctr - f7.f7_ctr, NULLIF(f7.f7_ctr, 0)) * 100 AS ctr_change_pct,
    SAFE_DIVIDE(r7.r7_cpc - f7.f7_cpc, NULLIF(f7.f7_cpc, 0)) * 100 AS cpc_change_pct,
    SAFE_DIVIDE(r7.r7_cpm - f7.f7_cpm, NULLIF(f7.f7_cpm, 0)) * 100 AS cpm_change_pct
  FROM ad_lifespan al
  LEFT JOIN lifetime l ON al.ad_id = l.ad_id
  LEFT JOIN recent_7d r7 ON al.ad_id = r7.ad_id
  LEFT JOIN first_7d f7 ON al.ad_id = f7.ad_id
)

SELECT
  *,
  (sig_high_freq + sig_ctr_decline + sig_cpc_rise + sig_cpm_rise + sig_long_running) AS signal_count,

  -- 피로도 점수 (0~100)
  LEAST(100, GREATEST(0,
    (sig_high_freq * 25)      -- 빈도 25점
    + (sig_ctr_decline * 30)  -- CTR 하락 30점
    + (sig_cpc_rise * 15)     -- CPC 상승 15점
    + (sig_cpm_rise * 10)     -- CPM 상승 10점
    + (sig_long_running * 20) -- 롱런 20점
  )) AS fatigue_score,

  -- 등급 판정
  CASE
    WHEN r7_spend IS NULL OR r7_spend = 0 THEN '휴면(NO_SPEND)'
    WHEN life_spend < 10000 THEN '판정불가(부족)'
    WHEN (sig_high_freq + sig_ctr_decline + sig_cpc_rise + sig_cpm_rise + sig_long_running) >= 4 THEN '즉시교체(CRITICAL)'
    WHEN (sig_high_freq + sig_ctr_decline + sig_cpc_rise + sig_cpm_rise + sig_long_running) = 3 THEN '위험(HIGH)'
    WHEN (sig_high_freq + sig_ctr_decline + sig_cpc_rise + sig_cpm_rise + sig_long_running) = 2 THEN '주의(MEDIUM)'
    WHEN (sig_high_freq + sig_ctr_decline + sig_cpc_rise + sig_cpm_rise + sig_long_running) = 1 THEN '관찰(LOW)'
    ELSE '건강(HEALTHY)'
  END AS fatigue_grade,

  -- 남은 수명 추정 (일 단위 · 지금 추세 유지 시)
  CASE
    WHEN r7_ctr IS NULL OR f7_ctr IS NULL OR r7_ctr >= f7_ctr THEN NULL
    WHEN (f7_ctr - r7_ctr) / NULLIF(f7_ctr, 0) < 0.05 THEN NULL
    ELSE GREATEST(0, ROUND(
      running_days * (r7_ctr / f7_ctr - 0.3) / GREATEST((f7_ctr - r7_ctr) / f7_ctr, 0.05), 0
    ))
  END AS estimated_days_remaining,

  CURRENT_DATE() AS snapshot_date
FROM signals;
