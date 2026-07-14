CREATE OR REPLACE TABLE `d2c-analytics-502304.marts.mart_daily_ecommerce_kpi`
PARTITION BY event_date
CLUSTER BY source, medium AS
WITH base_events AS (
  SELECT
    DATE(TIMESTAMP_MICROS(event_timestamp), 'Asia/Seoul') AS event_date,
    user_pseudo_id,
    (SELECT value.int_value FROM UNNEST(event_params) WHERE key = 'ga_session_id') AS session_id,
    COALESCE(traffic_source.source, '(direct)') AS source,
    COALESCE(traffic_source.medium, '(none)') AS medium,
    COALESCE(traffic_source.name, '(not set)') AS campaign,
    COALESCE(device.category, 'unknown') AS device,
    COALESCE(geo.country, 'unknown') AS country,
    event_name,
    ecommerce.purchase_revenue_in_usd AS revenue_usd,
    ecommerce.total_item_quantity AS units
  FROM `d2c-analytics-502304.analytics_537721411.events_*`
  WHERE _TABLE_SUFFIX NOT LIKE 'intraday%'
)
SELECT
  event_date, source, medium, campaign, device, country,
  COUNT(DISTINCT user_pseudo_id) AS users,
  COUNT(DISTINCT CONCAT(user_pseudo_id, CAST(session_id AS STRING))) AS sessions,
  COUNTIF(event_name = 'view_item') AS pdp_views,
  COUNTIF(event_name = 'add_to_cart') AS add_to_carts,
  COUNTIF(event_name = 'begin_checkout') AS checkouts,
  COUNTIF(event_name = 'purchase') AS purchases,
  ROUND(SUM(IF(event_name = 'purchase', revenue_usd, 0)), 2) AS revenue,
  SUM(IF(event_name = 'purchase', units, 0)) AS units_sold,
  ROUND(SAFE_DIVIDE(COUNTIF(event_name = 'purchase'), COUNT(DISTINCT user_pseudo_id)) * 100, 3) AS cvr_user_pct,
  ROUND(SAFE_DIVIDE(SUM(IF(event_name = 'purchase', revenue_usd, 0)), COUNTIF(event_name = 'purchase')), 2) AS aov,
  ROUND((1 - SAFE_DIVIDE(COUNTIF(event_name = 'purchase'), NULLIF(COUNTIF(event_name = 'add_to_cart'), 0))) * 100, 2) AS cart_abandonment_pct
FROM base_events
GROUP BY event_date, source, medium, campaign, device, country;
