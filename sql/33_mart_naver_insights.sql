-- ============================================
-- Mart 33: 네이버 자동 인사이트 (매출 하락 원인, 광고비 변동 분석)
-- ============================================
CREATE OR REPLACE TABLE `d2c-analytics-502304.marts.mart_naver_insights` AS
WITH latest AS (
  SELECT MAX(event_date) AS latest_date FROM `d2c-analytics-502304.marts.naver_ad_insights`
),
-- 일별 전체 요약
daily_total AS (
  SELECT
    event_date,
    SUM(cost_krw) AS cost,
    SUM(conversion_value) AS revenue,
    SUM(conversions) AS purchases,
    SUM(impressions) AS impressions,
    SUM(clicks) AS clicks
  FROM `d2c-analytics-502304.marts.naver_ad_insights`
  WHERE device IS NULL OR device = ''
  GROUP BY event_date
),
-- 최근 7일 vs 이전 7일 비교
recent_7d AS (
  SELECT
    '최근 7일' AS period,
    SUM(cost) AS cost, SUM(revenue) AS revenue, SUM(purchases) AS purchases,
    SUM(impressions) AS impressions, SUM(clicks) AS clicks,
    SAFE_DIVIDE(SUM(revenue), NULLIF(SUM(cost), 0)) AS roas
  FROM daily_total
  WHERE event_date >= DATE_SUB((SELECT latest_date FROM latest), INTERVAL 6 DAY)
),
prev_7d AS (
  SELECT
    '이전 7일' AS period,
    SUM(cost) AS cost, SUM(revenue) AS revenue, SUM(purchases) AS purchases,
    SUM(impressions) AS impressions, SUM(clicks) AS clicks,
    SAFE_DIVIDE(SUM(revenue), NULLIF(SUM(cost), 0)) AS roas
  FROM daily_total
  WHERE event_date BETWEEN
    DATE_SUB((SELECT latest_date FROM latest), INTERVAL 13 DAY) AND
    DATE_SUB((SELECT latest_date FROM latest), INTERVAL 7 DAY)
),
-- 캠페인별 최근 7일 vs 이전 7일
campaign_shift AS (
  SELECT
    campaign_name,
    campaign_type,
    -- 최근 7일
    SUM(CASE WHEN event_date >= DATE_SUB((SELECT latest_date FROM latest), INTERVAL 6 DAY)
             THEN cost_krw ELSE 0 END) AS recent_cost,
    SUM(CASE WHEN event_date >= DATE_SUB((SELECT latest_date FROM latest), INTERVAL 6 DAY)
             THEN conversion_value ELSE 0 END) AS recent_revenue,
    SUM(CASE WHEN event_date >= DATE_SUB((SELECT latest_date FROM latest), INTERVAL 6 DAY)
             THEN conversions ELSE 0 END) AS recent_purchases,
    -- 이전 7일
    SUM(CASE WHEN event_date BETWEEN
             DATE_SUB((SELECT latest_date FROM latest), INTERVAL 13 DAY) AND
             DATE_SUB((SELECT latest_date FROM latest), INTERVAL 7 DAY)
             THEN cost_krw ELSE 0 END) AS prev_cost,
    SUM(CASE WHEN event_date BETWEEN
             DATE_SUB((SELECT latest_date FROM latest), INTERVAL 13 DAY) AND
             DATE_SUB((SELECT latest_date FROM latest), INTERVAL 7 DAY)
             THEN conversion_value ELSE 0 END) AS prev_revenue,
    SUM(CASE WHEN event_date BETWEEN
             DATE_SUB((SELECT latest_date FROM latest), INTERVAL 13 DAY) AND
             DATE_SUB((SELECT latest_date FROM latest), INTERVAL 7 DAY)
             THEN conversions ELSE 0 END) AS prev_purchases
  FROM `d2c-analytics-502304.marts.naver_ad_insights`
  WHERE (device IS NULL OR device = '')
    AND event_date >= DATE_SUB((SELECT latest_date FROM latest), INTERVAL 13 DAY)
  GROUP BY campaign_name, campaign_type
),
campaign_analysis AS (
  SELECT
    campaign_name,
    campaign_type,
    recent_cost, recent_revenue, recent_purchases,
    prev_cost, prev_revenue, prev_purchases,
    ROUND(SAFE_DIVIDE(recent_revenue - prev_revenue, NULLIF(prev_revenue, 0)) * 100, 1) AS rev_change_pct,
    ROUND(SAFE_DIVIDE(recent_cost - prev_cost, NULLIF(prev_cost, 0)) * 100, 1) AS cost_change_pct,
    SAFE_DIVIDE(recent_revenue, NULLIF(recent_cost, 0)) AS recent_roas,
    SAFE_DIVIDE(prev_revenue, NULLIF(prev_cost, 0)) AS prev_roas,
    -- 매출 변화 금액
    (recent_revenue - prev_revenue) AS rev_delta
  FROM campaign_shift
  WHERE prev_cost > 0 OR recent_cost > 0
)
SELECT
  (SELECT latest_date FROM latest) AS report_date,

  -- 전체 요약
  (SELECT roas FROM recent_7d) AS recent_7d_roas,
  (SELECT roas FROM prev_7d) AS prev_7d_roas,
  (SELECT cost FROM recent_7d) AS recent_7d_cost,
  (SELECT cost FROM prev_7d) AS prev_7d_cost,
  (SELECT revenue FROM recent_7d) AS recent_7d_revenue,
  (SELECT revenue FROM prev_7d) AS prev_7d_revenue,
  (SELECT purchases FROM recent_7d) AS recent_7d_purchases,
  (SELECT purchases FROM prev_7d) AS prev_7d_purchases,
  (SELECT impressions FROM recent_7d) AS recent_7d_impressions,
  (SELECT impressions FROM prev_7d) AS prev_7d_impressions,
  (SELECT clicks FROM recent_7d) AS recent_7d_clicks,
  (SELECT clicks FROM prev_7d) AS prev_7d_clicks,

  -- 변화율
  ROUND(SAFE_DIVIDE(
    (SELECT revenue FROM recent_7d) - (SELECT revenue FROM prev_7d),
    NULLIF((SELECT revenue FROM prev_7d), 0)
  ) * 100, 1) AS revenue_change_pct,

  ROUND(SAFE_DIVIDE(
    (SELECT cost FROM recent_7d) - (SELECT cost FROM prev_7d),
    NULLIF((SELECT cost FROM prev_7d), 0)
  ) * 100, 1) AS cost_change_pct,

  ROUND(SAFE_DIVIDE(
    (SELECT roas FROM recent_7d) - (SELECT roas FROM prev_7d),
    NULLIF((SELECT roas FROM prev_7d), 0)
  ) * 100, 1) AS roas_change_pct,

  -- 매출 최대 기여 캠페인
  (SELECT campaign_name FROM campaign_analysis ORDER BY rev_delta DESC LIMIT 1) AS top_revenue_campaign,
  (SELECT MAX(rev_delta) FROM campaign_analysis) AS top_revenue_delta,

  -- 매출 최대 하락 캠페인
  (SELECT campaign_name FROM campaign_analysis ORDER BY rev_delta ASC LIMIT 1) AS worst_revenue_campaign,
  (SELECT MIN(rev_delta) FROM campaign_analysis) AS worst_revenue_delta,

  -- 광고비 최대 증가 캠페인
  (SELECT campaign_name FROM campaign_analysis ORDER BY cost_change_pct DESC LIMIT 1) AS top_cost_increase_campaign,
  (SELECT MAX(cost_change_pct) FROM campaign_analysis) AS top_cost_increase_pct,

  -- 광고비 최대 감소 캠페인
  (SELECT campaign_name FROM campaign_analysis ORDER BY cost_change_pct ASC LIMIT 1) AS top_cost_decrease_campaign,
  (SELECT MIN(cost_change_pct) FROM campaign_analysis) AS top_cost_decrease_pct,

  -- ROAS 최고/최저 캠페인
  (SELECT campaign_name FROM campaign_analysis WHERE recent_cost > 0 ORDER BY recent_roas DESC LIMIT 1) AS best_roas_campaign,
  (SELECT MAX(recent_roas) FROM campaign_analysis WHERE recent_cost > 0) AS best_roas_value,

  -- 종합 진단
  CASE
    WHEN SAFE_DIVIDE(
      (SELECT revenue FROM recent_7d) - (SELECT revenue FROM prev_7d),
      NULLIF((SELECT revenue FROM prev_7d), 0)
    ) <= -0.15 THEN '🔴 매출 하락 위험'
    WHEN SAFE_DIVIDE(
      (SELECT revenue FROM recent_7d) - (SELECT revenue FROM prev_7d),
      NULLIF((SELECT revenue FROM prev_7d), 0)
    ) >= 0.15 THEN '🟢 매출 성장'
    ELSE '🟡 안정적'
  END AS overall_status,

  -- 추천 액션
  CASE
    WHEN SAFE_DIVIDE(
      (SELECT revenue FROM recent_7d) - (SELECT revenue FROM prev_7d),
      NULLIF((SELECT revenue FROM prev_7d), 0)
    ) <= -0.15
    AND SAFE_DIVIDE(
      (SELECT cost FROM recent_7d) - (SELECT cost FROM prev_7d),
      NULLIF((SELECT cost FROM prev_7d), 0)
    ) >= 0 THEN
      '⚠️ 매출 하락 + 광고비 증가 → 고비용 저성과 키워드 정리, 랜딩페이지 전환율 개선 필수'

    WHEN SAFE_DIVIDE(
      (SELECT revenue FROM recent_7d) - (SELECT revenue FROM prev_7d),
      NULLIF((SELECT revenue FROM prev_7d), 0)
    ) <= -0.15
    AND SAFE_DIVIDE(
      (SELECT cost FROM recent_7d) - (SELECT cost FROM prev_7d),
      NULLIF((SELECT cost FROM prev_7d), 0)
    ) < 0 THEN
      '⚠️ 매출+광고비 동시 하락 → 예산 복원, STAR 키워드 입찰가 20% 인상 검토'

    WHEN SAFE_DIVIDE(
      (SELECT revenue FROM recent_7d) - (SELECT revenue FROM prev_7d),
      NULLIF((SELECT revenue FROM prev_7d), 0)
    ) >= 0.15 THEN
      '✅ 매출 성장 → 현재 전략 유지, STAR 키워드 예산 확대 검토'

    ELSE '📊 추세 모니터링 유지'
  END AS action_recommendation
