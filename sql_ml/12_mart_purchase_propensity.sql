-- 1단계: 세션 특성 + 구매여부(label)로 로지스틱 회귀 학습
CREATE OR REPLACE MODEL `d2c-analytics-502304.marts.model_purchase_propensity`
OPTIONS(
  MODEL_TYPE = 'LOGISTIC_REG',
  INPUT_LABEL_COLS = ['is_purchase'],
  AUTO_CLASS_WEIGHTS = TRUE
) AS
WITH base_events AS (
  SELECT
    user_pseudo_id,
    (SELECT value.int_value FROM UNNEST(event_params) WHERE key = 'ga_session_id') AS session_id,
    event_name,
    device.category AS device_category,
    (SELECT value.int_value FROM UNNEST(event_params) WHERE key = 'engagement_time_msec') AS engagement_time_msec,
    PARSE_DATE('%Y%m%d', event_date) AS event_date,
    TIMESTAMP_MICROS(user_first_touch_timestamp) AS first_touch_ts
  FROM `d2c-analytics-502304.analytics_537721411.events_*`
),
session_features AS (
  SELECT
    user_pseudo_id,
    session_id,
    ANY_VALUE(device_category) AS device_category,
    IF(ANY_VALUE(event_date) = DATE(MIN(first_touch_ts)), 1, 0) AS is_new_user,
    COUNTIF(event_name = 'page_view') AS pageviews,
    COUNTIF(event_name = 'add_to_cart') AS add_to_cart_events,
    SUM(engagement_time_msec) / 1000.0 AS engagement_seconds,
    MAX(IF(event_name = 'purchase', 1, 0)) AS is_purchase
  FROM base_events
  GROUP BY user_pseudo_id, session_id
)
SELECT
  device_category,
  is_new_user,
  pageviews,
  add_to_cart_events,
  engagement_seconds,
  is_purchase
FROM session_features;

-- 2단계: 어제 세션 중 미구매 세션의 구매 확률 예측
DROP TABLE IF EXISTS `d2c-analytics-502304.marts.mart_purchase_propensity`;

CREATE TABLE `d2c-analytics-502304.marts.mart_purchase_propensity` AS
WITH base_events AS (
  SELECT
    user_pseudo_id,
    (SELECT value.int_value FROM UNNEST(event_params) WHERE key = 'ga_session_id') AS session_id,
    event_name,
    device.category AS device_category,
    (SELECT value.int_value FROM UNNEST(event_params) WHERE key = 'engagement_time_msec') AS engagement_time_msec,
    PARSE_DATE('%Y%m%d', event_date) AS event_date,
    TIMESTAMP_MICROS(user_first_touch_timestamp) AS first_touch_ts
  FROM `d2c-analytics-502304.analytics_537721411.events_*`
  WHERE _TABLE_SUFFIX = FORMAT_DATE('%Y%m%d', DATE_SUB(CURRENT_DATE(), INTERVAL 1 DAY))
),
session_features AS (
  SELECT
    user_pseudo_id,
    session_id,
    ANY_VALUE(event_date) AS event_date,
    ANY_VALUE(device_category) AS device_category,
    IF(ANY_VALUE(event_date) = DATE(MIN(first_touch_ts)), 1, 0) AS is_new_user,
    COUNTIF(event_name = 'page_view') AS pageviews,
    COUNTIF(event_name = 'add_to_cart') AS add_to_cart_events,
    SUM(engagement_time_msec) / 1000.0 AS engagement_seconds,
    MAX(IF(event_name = 'purchase', 1, 0)) AS is_purchase
  FROM base_events
  GROUP BY user_pseudo_id, session_id
)
SELECT
  user_pseudo_id,
  session_id,
  event_date,
  device_category,
  is_new_user,
  pageviews,
  add_to_cart_events,
  engagement_seconds,
  (SELECT prob FROM UNNEST(predicted_is_purchase_probs) WHERE label = 1) AS purchase_probability
FROM ML.PREDICT(
  MODEL `d2c-analytics-502304.marts.model_purchase_propensity`,
  (SELECT * FROM session_features WHERE is_purchase = 0)
);
