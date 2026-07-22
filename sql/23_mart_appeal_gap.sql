-- Mart 23: 크리에이티브 × 지면(플랫폼) 성과
-- publisher_platform (facebook/instagram/messenger/audience_network)
--   × platform_position (feed/stories/reels/marketplace 등)
DROP TABLE IF EXISTS `d2c-analytics-502304.marts.mart_creative_platform`;

CREATE TABLE `d2c-analytics-502304.marts.mart_creative_platform`
PARTITION BY event_date AS
SELECT
  event_date,
  ad_id,
  ad_name,
  campaign_name,
  adset_name,
  IFNULL(publisher_platform, 'unknown') AS publisher_platform,
  IFNULL(platform_position,  'unknown') AS platform_position,
  CONCAT(
    IFNULL(publisher_platform, 'unknown'),
    ' - ',
    IFNULL(platform_position, 'unknown')
  ) AS placement,
  SUM(impressions)         AS impressions,
  SUM(reach)               AS reach,
  SUM(clicks)              AS clicks,
  SUM(inline_link_clicks)  AS link_clicks,
  SUM(spend_krw)           AS spend_krw,
  SUM(meta_purchases)      AS purchases,
  SUM(meta_purchase_value) AS revenue,
  SUM(meta_add_to_cart)          AS add_to_cart,
  SUM(meta_initiate_checkout)    AS initiate_checkout,
  SAFE_DIVIDE(SUM(clicks),         NULLIF(SUM(impressions), 0)) * 100 AS ctr_pct,
  SAFE_DIVIDE(SUM(inline_link_clicks), NULLIF(SUM(impressions), 0)) * 100 AS link_ctr_pct,
  SAFE_DIVIDE(SUM(meta_purchases), NULLIF(SUM(clicks), 0)) * 100 AS click_cvr_pct,
  SAFE_DIVIDE(SUM(spend_krw),      NULLIF(SUM(clicks), 0))       AS cpc_krw,
  SAFE_DIVIDE(SUM(spend_krw)*1000, NULLIF(SUM(impressions), 0))  AS cpm_krw,
  SAFE_DIVIDE(SUM(spend_krw),      NULLIF(SUM(meta_purchases), 0)) AS cpa_krw,
  SAFE_DIVIDE(SUM(meta_purchase_value), NULLIF(SUM(spend_krw), 0)) AS roas
FROM `d2c-analytics-502304.marts.meta_ad_insights_platform`
GROUP BY
  event_date, ad_id, ad_name, campaign_name, adset_name,
  publisher_platform, platform_position;
