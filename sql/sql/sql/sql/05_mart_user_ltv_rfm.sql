CREATE OR REPLACE TABLE `d2c-analytics-502304.marts.mart_user_ltv_rfm` AS
WITH purchase_events AS (
  SELECT
    user_pseudo_id,
    DATE(TIMESTAMP_MICROS(event_timestamp), 'Asia/Seoul') AS purchase_date,
    ecommerce.purchase_revenue_in_usd AS revenue_usd
  FROM `d2c-analytics-502304.analytics_537721411.events_*`
  WHERE _TABLE_SUFFIX NOT LIKE 'intraday%'
    AND event_name = 'purchase'
    AND ecommerce.purchase_revenue_in_usd IS NOT NULL
),
ref_date AS (
  SELECT MAX(purchase_date) AS max_date FROM purchase_events
),
user_rfm_raw AS (
  SELECT
    p.user_pseudo_id,
    DATE_DIFF((SELECT max_date FROM ref_date), MAX(p.purchase_date), DAY) AS recency_days,
    COUNT(*) AS frequency,
    ROUND(SUM(p.revenue_usd), 2) AS monetary_ltv,
    ROUND(SAFE_DIVIDE(SUM(p.revenue_usd), COUNT(*)), 2) AS avg_order_value,
    MIN(p.purchase_date) AS first_purchase_date,
    MAX(p.purchase_date) AS last_purchase_date
  FROM purchase_events p
  GROUP BY p.user_pseudo_id
),
scored AS (
  SELECT
    *,
    NTILE(5) OVER (ORDER BY recency_days ASC) AS r_score,
    NTILE(5) OVER (ORDER BY frequency DESC) AS f_score,
    NTILE(5) OVER (ORDER BY monetary_ltv DESC) AS m_score
  FROM user_rfm_raw
),
segmented AS (
  SELECT
    *,
    (r_score + f_score + m_score) AS rfm_total_score,
    CASE
      WHEN r_score <= 2 AND f_score <= 2 AND m_score <= 2 THEN 'Champions'
      WHEN f_score <= 2 AND m_score <= 2 AND r_score >= 3 THEN 'Loyal Customers'
      WHEN r_score >= 4 AND f_score <= 2 AND m_score <= 2 THEN 'At Risk'
      WHEN r_score <= 2 AND frequency = 1 THEN 'New Customer'
      WHEN r_score >= 4 AND f_score >= 4 AND m_score >= 4 THEN 'Lost'
      ELSE 'Regular'
    END AS rfm_segment
  FROM scored
)
SELECT
  user_pseudo_id,
  first_purchase_date,
  last_purchase_date,
  recency_days,
  frequency,
  monetary_ltv,
  avg_order_value,
  r_score, f_score, m_score, rfm_total_score,
  rfm_segment
FROM segmented;
