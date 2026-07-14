CREATE OR REPLACE TABLE `d2c-analytics-502304.marts.mart_funnel_dropoff`
PARTITION BY event_date AS
WITH base_events AS (
  SELECT
    DATE(TIMESTAMP_MICROS(event_timestamp), 'Asia/Seoul') AS event_date,
    user_pseudo_id,
    (SELECT value.int_value FROM UNNEST(event_params) WHERE key = 'ga_session_id') AS session_id,
    event_name,
    event_timestamp
  FROM `d2c-analytics-502304.analytics_537721411.events_*`
  WHERE _TABLE_SUFFIX NOT LIKE 'intraday%'
    AND event_name IN ('view_item','add_to_cart','begin_checkout','purchase',
                        'naverpay_start','login_prompt_view','login_method_select')
),
step_times AS (
  SELECT
    event_date, user_pseudo_id, session_id,
    MIN(IF(event_name = 'view_item', event_timestamp, NULL)) AS t1,
    MIN(IF(event_name = 'add_to_cart', event_timestamp, NULL)) AS t2,
    MIN(IF(event_name = 'begin_checkout', event_timestamp, NULL)) AS t3,
    MIN(IF(event_name = 'purchase', event_timestamp, NULL)) AS t4,
    MIN(IF(event_name = 'naverpay_start', event_timestamp, NULL)) AS t_naverpay,
    MIN(IF(event_name = 'login_prompt_view', event_timestamp, NULL)) AS t_login_prompt,
    MIN(IF(event_name = 'login_method_select', event_timestamp, NULL)) AS t_login_method
  FROM base_events
  GROUP BY event_date, user_pseudo_id, session_id
),
session_flags AS (
  SELECT
    event_date, user_pseudo_id, session_id,
    (t1 IS NOT NULL) AS reached_step1,
    (t1 IS NOT NULL AND t2 IS NOT NULL AND t2 >= t1) AS reached_step2,
    (t1 IS NOT NULL AND t2 IS NOT NULL AND t2 >= t1
      AND t3 IS NOT NULL AND t3 >= t2) AS reached_step3,
    (t1 IS NOT NULL AND t2 IS NOT NULL AND t2 >= t1
      AND t3 IS NOT NULL AND t3 >= t2
      AND t4 IS NOT NULL AND t4 >= t3) AS reached_step4,
    (t_naverpay IS NOT NULL) AS used_naverpay,
    (t_login_prompt IS NOT NULL) AS saw_login_prompt,
    (t_login_prompt IS NOT NULL AND t_login_method IS NOT NULL
      AND t_login_method >= t_login_prompt) AS completed_login_method
  FROM step_times
),
main_counts AS (
  SELECT event_date,
    COUNTIF(reached_step1) AS s1, COUNTIF(reached_step2) AS s2,
    COUNTIF(reached_step3) AS s3, COUNTIF(reached_step4) AS s4
  FROM session_flags GROUP BY event_date
),
main_long AS (
  SELECT event_date,'main_funnel' AS funnel_type,'all' AS segment,1 AS step_number,'view_item' AS step_name, s1 AS sessions FROM main_counts
  UNION ALL SELECT event_date,'main_funnel','all',2,'add_to_cart', s2 FROM main_counts
  UNION ALL SELECT event_date,'main_funnel','all',3,'begin_checkout', s3 FROM main_counts
  UNION ALL SELECT event_date,'main_funnel','all',4,'purchase', s4 FROM main_counts
),
payment_counts AS (
  SELECT event_date, used_naverpay,
    COUNTIF(reached_step3) AS s3, COUNTIF(reached_step4) AS s4
  FROM session_flags
  WHERE reached_step3
  GROUP BY event_date, used_naverpay
),
payment_long AS (
  SELECT event_date,'by_payment_method' AS funnel_type,
    IF(used_naverpay,'naverpay','general') AS segment,
    3 AS step_number,'begin_checkout' AS step_name, s3 AS sessions
  FROM payment_counts
  UNION ALL
  SELECT event_date,'by_payment_method',
    IF(used_naverpay,'naverpay','general'),
    4,'purchase', s4
  FROM payment_counts
),
login_counts AS (
  SELECT event_date,
    COUNTIF(saw_login_prompt) AS l1,
    COUNTIF(completed_login_method) AS l2
  FROM session_flags GROUP BY event_date
),
login_long AS (
  SELECT event_date,'login_subfunnel' AS funnel_type,'all' AS segment,1 AS step_number,'login_prompt_view' AS step_name, l1 AS sessions FROM login_counts
  UNION ALL SELECT event_date,'login_subfunnel','all',2,'login_method_select', l2 FROM login_counts
),
combined AS (
  SELECT * FROM main_long
  UNION ALL SELECT * FROM payment_long
  UNION ALL SELECT * FROM login_long
)
SELECT
  event_date, funnel_type, segment, step_number, step_name, sessions,
  ROUND(SAFE_DIVIDE(sessions,
    FIRST_VALUE(sessions) OVER (PARTITION BY event_date, funnel_type, segment ORDER BY step_number)
  ) * 100, 2) AS pct_of_step1,
  ROUND((1 - SAFE_DIVIDE(sessions,
    LAG(sessions) OVER (PARTITION BY event_date, funnel_type, segment ORDER BY step_number)
  )) * 100, 2) AS dropoff_from_prev_pct
FROM combined;
