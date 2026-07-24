DROP TABLE IF EXISTS `d2c-analytics-502304.marts.mart_ad_channel_with_spend`;

CREATE TABLE `d2c-analytics-502304.marts.mart_ad_channel_with_spend`
PARTITION BY event_date AS

WITH
-- Meta 캠페인 → GA4 캠페인 매핑 규칙
campaign_map AS (
  SELECT '8LF_ASC_CBO' AS meta_campaign, '8lf_main' AS ga_campaign UNION ALL
  SELECT '8LF_ASC_Detail_26.07.10', '8lf_detail'
  -- 새 캠페인 매핑 추가 시 여기에 UNION ALL로 이어붙이면 됨
),

-- source 정규화 함수 대신 인라인 CASE
-- Meta의 'facebook' + 다양한 GA4 source(meta_asc/meta/m.facebook.com/facebook.com)를 'meta'로 통일
ga_perf AS (
  SELECT
    event_date,
    CASE
      WHEN LOWER(source) IN ('meta_asc', 'meta', 'facebook', 'facebook.com', 'm.facebook.com') THEN 'meta'
      WHEN LOWER(source) LIKE '%google%' THEN 'google'
      WHEN LOWER(source) LIKE '%naver%' THEN 'naver'
      WHEN LOWER(source) LIKE '%kakao%' THEN 'kakao'
      WHEN LOWER(source) LIKE '%tiktok%' THEN 'tiktok'
      ELSE LOWER(source)
    END AS source_norm,
    LOWER(campaign) AS campaign_norm,
    source AS source_original,
    medium AS medium_original,
    campaign AS campaign_original,
    SUM(users) AS users,
    SUM(sessions) AS sessions,
    SUM(add_to_carts) AS add_to_carts,
    SUM(checkouts) AS checkouts,
    SUM(purchases) AS purchases,
    SUM(revenue) AS revenue,
    SUM(acquired_users) AS acquired_users
  FROM `d2c-analytics-502304.marts.mart_ad_channel_deep`
  WHERE event_date >= DATE_SUB(CURRENT_DATE(), INTERVAL 90 DAY)
  GROUP BY event_date, source_norm, campaign_norm, source_original, medium_original, campaign_original
),

-- GA4 성과를 source_norm + campaign_norm 기준으로 재집계 (medium은 무시)
ga_perf_agg AS (
  SELECT
    event_date,
    source_norm,
    campaign_norm,
    SUM(users) AS users,
    SUM(sessions) AS sessions,
    SUM(add_to_carts) AS add_to_carts,
    SUM(checkouts) AS checkouts,
    SUM(purchases) AS purchases,
    SUM(revenue) AS revenue,
    SUM(acquired_users) AS acquired_users,
    ANY_VALUE(campaign_original) AS campaign_original
  FROM ga_perf
  GROUP BY event_date, source_norm, campaign_norm
),

-- Meta 광고비를 매핑 테이블로 GA4 캠페인명에 맞춤
ad_spend AS (
  SELECT
    a.event_date,
    'meta' AS source_norm,
    -- 매핑 테이블에 있으면 GA4 이름 사용, 없으면 소문자 원본
    COALESCE(LOWER(m.ga_campaign), LOWER(a.utm_campaign)) AS campaign_norm,
    a.platform,
    a.utm_campaign AS meta_campaign_original,
    SUM(a.impressions) AS impressions,
    SUM(a.clicks) AS clicks,
    SUM(a.spend_krw) AS spend_krw,
    SUM(a.platform_conversions) AS platform_conversions,
    SUM(a.platform_revenue) AS platform_revenue
  FROM `d2c-analytics-502304.marts.ad_spend_daily` a
  LEFT JOIN campaign_map m
    ON a.utm_campaign = m.meta_campaign
  WHERE a.platform = 'meta'
    AND a.event_date >= DATE_SUB(CURRENT_DATE(), INTERVAL 90 DAY)
  GROUP BY a.event_date, campaign_norm, a.platform, a.utm_campaign
)

SELECT
  COALESCE(g.event_date, s.event_date) AS event_date,
  COALESCE(g.source_norm, s.source_norm) AS utm_source,
  s.meta_campaign_original AS meta_campaign,
  g.campaign_original AS ga_campaign,
  COALESCE(g.campaign_norm, s.campaign_norm) AS utm_campaign,
  s.platform,

  -- 광고비 지표
  s.impressions,
  s.clicks,
  s.spend_krw,
  s.platform_conversions,
  s.platform_revenue,

  -- GA4 성과 지표
  g.users,
  g.sessions,
  g.add_to_carts,
  g.checkouts,
  g.purchases,
  g.revenue AS ga_revenue,
  g.acquired_users,

  -- 실무 핵심 지표
  ROUND(SAFE_DIVIDE(s.spend_krw, s.clicks), 0) AS cpc,
  ROUND(SAFE_DIVIDE(s.spend_krw, s.impressions) * 1000, 0) AS cpm,
  ROUND(SAFE_DIVIDE(s.clicks, s.impressions) * 100, 3) AS ctr_pct,
  ROUND(SAFE_DIVIDE(s.spend_krw, g.acquired_users), 0) AS cac_krw,
  ROUND(SAFE_DIVIDE(s.spend_krw, g.purchases), 0) AS cpa_krw,
  ROUND(SAFE_DIVIDE(g.revenue, s.spend_krw), 2) AS roas,
  ROUND(SAFE_DIVIDE(s.platform_revenue, s.spend_krw), 2) AS platform_roas,
  ROUND(SAFE_DIVIDE(g.purchases, s.clicks) * 100, 3) AS click_to_purchase_pct,
  ROUND(SAFE_DIVIDE(g.revenue, g.acquired_users), 0) AS ltv_estimate_krw,
  ROUND(SAFE_DIVIDE(
    SAFE_DIVIDE(g.revenue, g.acquired_users),
    SAFE_DIVIDE(s.spend_krw, g.acquired_users)
  ), 2) AS ltv_cac_ratio

FROM ga_perf_agg g
FULL OUTER JOIN ad_spend s
  ON g.event_date = s.event_date
  AND g.source_norm = s.source_norm
  AND g.campaign_norm = s.campaign_norm;
