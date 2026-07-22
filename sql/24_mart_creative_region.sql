DROP TABLE IF EXISTS `d2c-analytics-502304.marts.mart_creative_region`;
CREATE TABLE `d2c-analytics-502304.marts.mart_creative_region`
PARTITION BY event_date AS
SELECT
  event_date, ad_id, ad_name, campaign_name, adset_name,
  IFNULL(region, 'unknown') AS region,
  SUM(impressions) AS impressions,
  SUM(clicks)      AS clicks,
  SUM(spend_krw)   AS spend_krw,
  SUM(meta_purchases)      AS purchases,
  SUM(meta_purchase_value) AS revenue,
  SAFE_DIVIDE(SUM(clicks),NULLIF(SUM(impressions),0)) * 100 AS ctr_pct,
  SAFE_DIVIDE(SUM(meta_purchases),NULLIF(SUM(clicks),0)) * 100 AS click_cvr_pct,
  SAFE_DIVIDE(SUM(meta_purchase_value),NULLIF(SUM(spend_krw),0)) AS roas
FROM `d2c-analytics-502304.marts.meta_ad_insights_region`
GROUP BY event_date, ad_id, ad_name, campaign_name, adset_name, region;
