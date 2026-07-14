DROP TABLE IF EXISTS `d2c-analytics-502304.marts.mart_dark_social_ai_referral`;

CREATE TABLE `d2c-analytics-502304.marts.mart_dark_social_ai_referral`
PARTITION BY event_date AS

WITH raw_events AS (
  SELECT
    PARSE_DATE('%Y%m%d', event_date) AS event_date,
    user_pseudo_id,
    (SELECT value.int_value FROM UNNEST(event_params) WHERE key = 'ga_session_id') AS session_id,
    (SELECT value.string_value FROM UNNEST(event_params) WHERE key = 'source') AS session_source,
    (SELECT value.string_value FROM UNNEST(event_params) WHERE key = 'medium') AS session_medium,
    (SELECT value.string_value FROM UNNEST(event_params) WHERE key = 'page_referrer') AS page_referrer,
    event_name,
    event_timestamp
  FROM `d2c-analytics-502304.analytics_537721411.events_*`
  WHERE _TABLE_SUFFIX BETWEEN FORMAT_DATE('%Y%m%d', DATE_SUB(CURRENT_DATE(), INTERVAL 1 DAY))
                          AND FORMAT_DATE('%Y%m%d', DATE_SUB(CURRENT_DATE(), INTERVAL 1 DAY))
),

classified AS (
  SELECT
    event_date,
    user_pseudo_id,
    session_id,
    event_name,
    CASE
      WHEN REGEXP_CONTAINS(LOWER(IFNULL(page_referrer,'')), r'chatgpt\.com|openai\.com') THEN 'ai_chatgpt'
      WHEN REGEXP_CONTAINS(LOWER(IFNULL(page_referrer,'')), r'perplexity\.ai') THEN 'ai_perplexity'
      WHEN REGEXP_CONTAINS(LOWER(IFNULL(page_referrer,'')), r'gemini\.google\.com|bard\.google') THEN 'ai_gemini'
      WHEN REGEXP_CONTAINS(LOWER(IFNULL(page_referrer,'')), r'copilot\.microsoft') THEN 'ai_copilot'
      WHEN session_medium = '(none)' AND page_referrer IS NULL THEN 'direct_or_dark_social'
      WHEN REGEXP_CONTAINS(LOWER(IFNULL(page_referrer,'')), r'kakao|band\.us|t\.me|slack|discord') THEN 'dark_social_messenger'
      WHEN session_source IS NOT NULL THEN CONCAT(session_source, ' / ', IFNULL(session_medium,'(none)'))
      ELSE 'unclassified'
    END AS traffic_channel
  FROM raw_events
),

session_agg AS (
  SELECT
    event_date,
    traffic_channel,
    user_pseudo_id,
    session_id,
    MAX(CASE WHEN event_name = 'purchase' THEN 1 ELSE 0 END) AS is_purchase_session,
    MAX(CASE WHEN event_name = 'add_to_cart' THEN 1 ELSE 0 END) AS is_cart_session
  FROM classified
  GROUP BY event_date, traffic_channel, user_pseudo_id, session_id
)

SELECT
  event_date,
  traffic_channel,
  COUNT(DISTINCT user_pseudo_id) AS users,
  COUNT(DISTINCT session_id) AS sessions,
  SUM(is_cart_session) AS add_to_cart_sessions,
  SUM(is_purchase_session) AS purchase_sessions,
  ROUND(SAFE_DIVIDE(SUM(is_purchase_session), COUNT(DISTINCT session_id)) * 100, 2) AS session_conversion_rate_pct
FROM session_agg
GROUP BY event_date, traffic_channel;
