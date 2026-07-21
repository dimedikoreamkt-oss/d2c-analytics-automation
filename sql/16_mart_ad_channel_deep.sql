DROP TABLE IF EXISTS `d2c-analytics-502304.marts.mart_ad_channel_deep`;

CREATE TABLE `d2c-analytics-502304.marts.mart_ad_channel_deep`
PARTITION BY event_date AS

WITH base AS (
  SELECT
    PARSE_DATE('%Y%m%d', event_date) AS event_date,
    user_pseudo_id,
    (SELECT value.int_value FROM UNNEST(event_params) WHERE key = 'ga_session_id') AS session_id,
    event_name,
    ecommerce.purchase_revenue AS revenue,
    IFNULL(traffic_source.source, '(direct)') AS source,
    IFNULL(traffic_source.medium, '(none)') AS medium,
    IFNULL(traffic_source.name, '(not_set)') AS campaign,
    IFNULL(
      (SELECT value.string_value FROM UNNEST(event_params) WHERE key = 'campaign'),
      IFNULL(traffic_source.name, '(not_set)')
    ) AS event_campaign,
    IFNULL(
      (SELECT value.string_value FROM UNNEST(event_params) WHERE key = 'content'),
      '(not_set)'
    ) AS ad_content,
    IFNULL(
      (SELECT value.string_value FROM UNNEST(event_params) WHERE key = 'term'),
      '(not_set)'
    ) AS ad_term,
    IFNULL(device.category, 'unknown') AS device_category
  FROM `d2c-analytics-502304.analytics_537721411.events_*`
  WHERE _TABLE_SUFFIX BETWEEN FORMAT_DATE('%Y%m%d', DATE_SUB(CURRENT_DATE(), INTERVAL 30 DAY))
                          AND FORMAT_DATE('%Y%m%d', DATE_SUB(CURRENT_DATE(), INTERVAL 1 DAY))
),

first_touch_map AS (
  SELECT
    user_pseudo_id,
    ARRAY_AGG(STRUCT(source, medium, campaign) ORDER BY session_id ASC LIMIT 1)[OFFSET(0)] AS first
  FROM base
  WHERE session_id IS NOT NULL
  GROUP BY user_pseudo_id
),

agg AS (
  SELECT
    b.event_date,
    b.source,
    b.medium,
    b.event_campaign AS campaign,
    b.ad_content,
    b.device_category,
    COUNT(DISTINCT b.user_pseudo_id) AS users,
    COUNT(DISTINCT b.session_id) AS sessions,
    COUNTIF(b.event_name = 'page_view') AS page_views,
    COUNTIF(b.event_name = 'add_to_cart') AS add_to_carts,
    COUNTIF(b.event_name = 'begin_checkout') AS checkouts,
    COUNTIF(b.event_name = 'purchase') AS purchases,
    ROUND(SUM(IF(b.event_name = 'purchase', b.revenue, 0)), 2) AS revenue,
    -- 신규 획득 사용자 (첫 접점이 이 채널인 유저)
    COUNT(DISTINCT IF(
      ft.first.source = b.source AND ft.first.medium = b.medium AND ft.first.campaign = b.campaign,
      b.user_pseudo_id, NULL
    )) AS acquired_users
  FROM base b
  LEFT JOIN first_touch_map ft USING (user_pseudo_id)
  GROUP BY event_date, source, medium, campaign, ad_content, device_category
)

SELECT
  event_date,
  source,
  medium,
  campaign,
  ad_content,
  device_category,
  users,
  sessions,
  page_views,
  add_to_carts,
  checkouts,
  purchases,
  revenue,
  acquired_users,
  ROUND(SAFE_DIVIDE(purchases, sessions) * 100, 3) AS session_cvr_pct,
  ROUND(SAFE_DIVIDE(purchases, users) * 100, 3) AS user_cvr_pct,
  ROUND(SAFE_DIVIDE(revenue, purchases), 2) AS aov,
  ROUND(SAFE_DIVIDE(revenue, users), 2) AS revenue_per_user,
  ROUND(SAFE_DIVIDE(revenue, acquired_users), 2) AS revenue_per_acquired_user,
  ROUND(SAFE_DIVIDE(add_to_carts, sessions) * 100, 3) AS atc_rate_pct,
  ROUND(SAFE_DIVIDE(add_to_carts - purchases, add_to_carts) * 100, 2) AS cart_abandonment_pct
FROM agg;
