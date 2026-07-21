DROP TABLE IF EXISTS `d2c-analytics-502304.marts.mart_demographics`;

CREATE TABLE `d2c-analytics-502304.marts.mart_demographics`
PARTITION BY event_date AS

WITH base AS (
  SELECT
    PARSE_DATE('%Y%m%d', event_date) AS event_date,
    user_pseudo_id,
    (SELECT value.int_value FROM UNNEST(event_params) WHERE key = 'ga_session_id') AS session_id,
    event_name,
    ecommerce.purchase_revenue AS revenue,
    IFNULL(
      (SELECT value.string_value FROM UNNEST(user_properties) WHERE key = 'age_bracket'),
      'unknown'
    ) AS age_bracket,
    IFNULL(
      (SELECT value.string_value FROM UNNEST(user_properties) WHERE key = 'gender'),
      'unknown'
    ) AS gender,
    IFNULL(geo.country, 'unknown') AS country,
    IFNULL(geo.region, 'unknown') AS region,
    IFNULL(geo.city, 'unknown') AS city,
    IFNULL(device.category, 'unknown') AS device_category
  FROM `d2c-analytics-502304.analytics_537721411.events_*`
  WHERE _TABLE_SUFFIX BETWEEN FORMAT_DATE('%Y%m%d', DATE_SUB(CURRENT_DATE(), INTERVAL 30 DAY))
                          AND FORMAT_DATE('%Y%m%d', DATE_SUB(CURRENT_DATE(), INTERVAL 1 DAY))
)

SELECT
  event_date,
  age_bracket,
  gender,
  country,
  region,
  device_category,
  COUNT(DISTINCT user_pseudo_id) AS users,
  COUNT(DISTINCT session_id) AS sessions,
  COUNTIF(event_name = 'add_to_cart') AS add_to_carts,
  COUNTIF(event_name = 'purchase') AS purchases,
  ROUND(SUM(IF(event_name = 'purchase', revenue, 0)), 2) AS revenue,
  ROUND(SAFE_DIVIDE(COUNTIF(event_name = 'purchase'), COUNT(DISTINCT user_pseudo_id)) * 100, 3) AS cvr_user_pct,
  ROUND(SAFE_DIVIDE(SUM(IF(event_name = 'purchase', revenue, 0)), COUNTIF(event_name = 'purchase')), 2) AS aov
FROM base
GROUP BY event_date, age_bracket, gender, country, region, device_category;
