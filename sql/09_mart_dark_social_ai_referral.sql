CREATE OR REPLACE TABLE `d2c-analytics-502304.marts.mart_dark_social_ai_referral`
PARTITION BY event_date
CLUSTER BY referral_category AS
WITH base_events AS (
  SELECT
    DATE(TIMESTAMP_MICROS(event_timestamp), 'Asia/Seoul') AS event_date,
    user_pseudo_id,
    (SELECT value.int_value FROM UNNEST(event_params) WHERE key = 'ga_session_id') AS session_id,
    COALESCE(traffic_source.source, '(direct)') AS source,
    COALESCE(traffic_source.medium, '(none)') AS medium,
    event_name,
    ecommerce.purchase_revenue_in_usd AS revenue_usd
  FROM `d2c-analytics-502304.analytics_537721411.events_*`
  WHERE _TABLE_SUFFIX NOT LIKE 'intraday%'
),
categorized AS (
  SELECT *,
    CASE
      WHEN REGEXP_CONTAINS(LOWER(source), r'chatgpt\.com|openai\.com|perplexity\.ai|claude\.ai|gemini\.google\.com|copilot\.microsoft\.com|bing\.com/chat')
        THEN 'ai_search_referral'
      WHEN medium = 'referral' AND REGEXP_CONTAINS(LOWER(source), r'facebook\.com|instagram\.com|kakaotalk|band\.us|t\.co|threads\.net')
        THEN 'dark_social_referral'
      WHEN medium = 'referral'
        THEN 'other_referral'
      WHEN source = '(direct)' AND medium = '(none)'
        THEN 'direct'
      WHEN medium IN ('cpc','paid','ppc')
        THEN 'paid_media'
      WHEN medium = 'organic'
        THEN 'organic_search'
      ELSE 'other'
    END AS referral_category
  FROM base_events
)
SELECT
  event_date,
  referral_category,
  source,
  COUNT(DISTINCT user_pseudo_id) AS users,
  COUNT(DISTINCT CONCAT(user_pseudo_id, CAST(session_id AS STRING))) AS sessions,
  COUNTIF(event_name = 'view_item') AS pdp_views,
  COUNTIF(event_name = 'add_to_cart') AS add_to_carts,
  COUNTIF(event_name = 'purchase') AS purchases,
  ROUND(SUM(IF(event_name = 'purchase', revenue_usd, 0)), 2) AS revenue,
  ROUND(SAFE_DIVIDE(
    COUNTIF(event_name = 'purchase'),
    COUNT(DISTINCT user_pseudo_id)) * 100, 3) AS cvr_user_pct
FROM categorized
GROUP BY event_date, referral_category, source;
