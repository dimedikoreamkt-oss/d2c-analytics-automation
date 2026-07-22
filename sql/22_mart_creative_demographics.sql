DROP TABLE IF EXISTS `d2c-analytics-502304.marts.mart_creative_demographics`;
CREATE TABLE `d2c-analytics-502304.marts.mart_creative_demographics`
PARTITION BY event_date AS
WITH base AS (
  SELECT
    event_date, ad_id, ad_name, campaign_name, adset_name,
    IFNULL(age, 'unknown')    AS age_bracket,
    IFNULL(gender, 'unknown') AS gender,
    impressions, reach, clicks, spend_krw,
    meta_purchases      AS purchases,
    meta_purchase_value AS revenue,
    ctr, cpc, cpm, frequency
  FROM `d2c-analytics-502304.marts.meta_ad_insights_age_gender`
)
SELECT
  event_date, ad_id, ad_name, campaign_name, adset_name,
  age_bracket, gender,
  SUM(impressions) AS impressions,
  SUM(reach)       AS reach,
  SUM(clicks)      AS clicks,
  SUM(spend_krw)   AS spend_krw,
  SUM(purchases)   AS purchases,
  SUM(revenue)     AS revenue,
  SAFE_DIVIDE(SUM(clicks),        NULLIF(SUM(impressions),0)) * 100 AS ctr_pct,
  SAFE_DIVIDE(SUM(spend_krw),     NULLIF(SUM(clicks),0))             AS cpc_krw,
  SAFE_DIVIDE(SUM(spend_krw)*1000,NULLIF(SUM(impressions),0))        AS cpm_krw,
  SAFE_DIVIDE(SUM(purchases),     NULLIF(SUM(clicks),0)) * 100        AS click_cvr_pct,
  SAFE_DIVIDE(SUM(revenue),       NULLIF(SUM(spend_krw),0))          AS roas,
  SAFE_DIVIDE(SUM(spend_krw),     NULLIF(SUM(purchases),0))          AS cpa_krw
FROM base
GROUP BY event_date, ad_id, ad_name, campaign_name, adset_name, age_bracket, gender;
