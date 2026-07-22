DROP TABLE IF EXISTS `d2c-analytics-502304.marts.mart_market_winners`;

CREATE TABLE `d2c-analytics-502304.marts.mart_market_winners` AS

WITH appeal_dict AS (
  SELECT '할인/프로모션' AS tag, r'(할인|세일|SALE|프로모션|반값|특가|1\+1|무료증정)' AS pattern UNION ALL
  SELECT '전후비교(BA)', r'(전후|비포|before\s*after|BA|변화|달라진)' UNION ALL
  SELECT '시술대체', r'(시술|병원|리쥬란|울쎄라|인모드|보톡스|필러|대신)' UNION ALL
  SELECT '홈케어/셀프', r'(홈케어|셀프|집에서|매일\s*\d+분|하루\s*\d+분)' UNION ALL
  SELECT '디바이스/기기', r'(마사지기|기기|디바이스|EMS|LED|저주파|초음파)' UNION ALL
  SELECT '리프팅/탄력', r'(리프팅|탄력|처짐|당김|주름|팽팽)' UNION ALL
  SELECT '얼굴형/윤곽', r'(안면윤곽|V\s*라인|턱선|광대|처진볼|이중턱|볼살)' UNION ALL
  SELECT '후기/리뷰', r'(후기|리뷰|만족|평가|별점|★|⭐)' UNION ALL
  SELECT '전문가/인증', r'(전문의|의사|피부과|박사|인증|특허|FDA|1위)' UNION ALL
  SELECT '희소성/긴급성', r'(마감|한정|품절|재입고|오늘만|24시간)' UNION ALL
  SELECT '성분/기능', r'(성분|함유|추출|콜라겐|히알루론|펩타이드|천연)' UNION ALL
  SELECT '연예인/셀럽', r'(연예인|아이돌|배우|인플루언서|유튜버|셀럽)' UNION ALL
  SELECT '가격노출', r'(₩\s*\d+|\d+\s*원|만원|가성비)' UNION ALL
  SELECT '자연스러움', r'(자연스러운|티안나|부드럽게|부담없이)' UNION ALL
  SELECT '인기/검증', r'(완판|품절대란|1위|베스트|누적판매)'
),

ad_appeal AS (
  SELECT
    s.ad_id,
    ARRAY_AGG(DISTINCT a.tag IGNORE NULLS) AS appeal_tags
  FROM `d2c-analytics-502304.marts.scraped_ads` s
  LEFT JOIN appeal_dict a
    ON REGEXP_CONTAINS(LOWER(IFNULL(s.body_text,'')), a.pattern)
  GROUP BY s.ad_id
)

SELECT
  s.ad_id,
  s.page_name,
  s.search_keyword AS matched_keywords,
  s.delivery_start_raw AS delivery_start,
  NULL AS delivery_stop,
  s.running_days,
  s.is_active AS is_currently_active,
  s.snapshot_url,
  s.landing_url,
  s.image_url,
  s.body_text,
  NULL AS title_text,
  NULL AS description_text,
  s.platforms,
  NULL AS target_ages,
  NULL AS target_gender,
  NULL AS impressions_lower,
  NULL AS impressions_upper,
  NULL AS spend_lower,
  NULL AS spend_upper,
  NULL AS currency,
  aa.appeal_tags,
  ARRAY_LENGTH(aa.appeal_tags) AS appeal_count,

  CASE
    WHEN s.running_days >= 60 AND s.is_active THEN 'SUPER_WINNER'
    WHEN s.running_days >= 30 AND s.is_active THEN 'WINNER'
    WHEN s.running_days >= 14 AND s.is_active THEN 'GROWING'
    WHEN s.running_days >= 7 AND s.is_active THEN 'TESTING'
    WHEN s.running_days IS NOT NULL AND s.running_days < 7 AND NOT s.is_active THEN 'QUICK_KILL'
    WHEN NOT s.is_active AND s.running_days >= 14 THEN 'CONCLUDED'
    ELSE 'UNKNOWN'
  END AS winner_grade,

  FALSE AS is_new_today,
  FALSE AS is_new_this_week,

  CASE
    WHEN s.platforms LIKE '%instagram%' AND s.platforms LIKE '%facebook%' THEN 'multi_platform'
    WHEN s.platforms LIKE '%instagram%' THEN 'instagram_only'
    WHEN s.platforms LIKE '%facebook%' THEN 'facebook_only'
    ELSE 'other'
  END AS platform_strategy,

  NULL AS impressions_midpoint,
  CURRENT_TIMESTAMP() AS analyzed_at
FROM `d2c-analytics-502304.marts.scraped_ads` s
LEFT JOIN ad_appeal aa ON s.ad_id = aa.ad_id;
