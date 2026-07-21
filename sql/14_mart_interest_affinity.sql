DROP TABLE IF EXISTS `d2c-analytics-502304.marts.mart_interest_affinity`;

CREATE TABLE `d2c-analytics-502304.marts.mart_interest_affinity`
PARTITION BY event_date AS

WITH base AS (
  SELECT
    PARSE_DATE('%Y%m%d', event_date) AS event_date,
    user_pseudo_id,
    (SELECT value.int_value FROM UNNEST(event_params) WHERE key = 'ga_session_id') AS session_id,
    event_name,
    ecommerce.purchase_revenue AS revenue,
    -- GA4 user_properties에서 affinity/in-market 추출
    IFNULL(
      (SELECT value.string_value FROM UNNEST(user_properties) WHERE key = 'affinity_category'),
      'unknown'
    ) AS affinity_category,
    IFNULL(
      (SELECT value.string_value FROM UNNEST(user_properties) WHERE key = 'in_market_segment'),
      'unknown'
    ) AS in_market_segment,
    IFNULL(
      (SELECT value.string_value FROM UNNEST(user_properties) WHERE key = 'life_event'),
      'unknown'
    ) AS life_event
  FROM `d2c-analytics-502304.analytics_537721411.events_*`
  WHERE _TABLE_SUFFIX BETWEEN FORMAT_DATE('%Y%m%d', DATE_SUB(CURRENT_DATE(), INTERVAL 30 DAY))
                          AND FORMAT_DATE('%Y%m%d', DATE_SUB(CURRENT_DATE(), INTERVAL 1 DAY))
),

by_affinity AS (
  SELECT
    event_date,
    'affinity' AS interest_type,
    affinity_category AS interest_value,
    COUNT(DISTINCT user_pseudo_id) AS users,
    COUNT(DISTINCT session_id) AS sessions,
    COUNTIF(event_name = 'purchase') AS purchases,
    ROUND(SUM(IF(event_name = 'purchase', revenue, 0)), 2) AS revenue
  FROM base
  GROUP BY event_date, affinity_category
),

by_in_market AS (
  SELECT
    event_date,
    'in_market' AS interest_type,
    in_market_segment AS interest_value,
    COUNT(DISTINCT user_pseudo_id) AS users,
    COUNT(DISTINCT session_id) AS sessions,
    COUNTIF(event_name = 'purchase') AS purchases,
    ROUND(SUM(IF(event_name = 'purchase', revenue, 0)), 2) AS revenue
  FROM base
  GROUP BY event_date, in_market_segment
),

by_life_event AS (
  SELECT
    event_date,
    'life_event' AS interest_type,
    life_event AS interest_value,
    COUNT(DISTINCT user_pseudo_id) AS users,
    COUNT(DISTINCT session_id) AS sessions,
    COUNTIF(event_name = 'purchase') AS purchases,
    ROUND(SUM(IF(event_name = 'purchase', revenue, 0)), 2) AS revenue
  FROM base
  GROUP BY event_date, life_event
),

combined AS (
  SELECT * FROM by_affinity
  UNION ALL SELECT * FROM by_in_market
  UNION ALL SELECT * FROM by_life_event
)

SELECT
  event_date,
  interest_type,
  interest_value,
  users,
  sessions,
  purchases,
  revenue,
  ROUND(SAFE_DIVIDE(purchases, users) * 100, 3) AS cvr_user_pct,
  ROUND(SAFE_DIVIDE(revenue, purchases), 2) AS aov
FROM combined;
