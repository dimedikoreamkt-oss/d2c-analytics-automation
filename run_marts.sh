#!/bin/bash
set -e
PROJECT_ID="d2c-analytics-502304"
LOCATION="asia-northeast3"

echo "=== D2C Analytics marts refresh start: $(date) ==="
for f in sql/*.sql; do
  echo "--- running $f ---"
  bq query --project_id="${PROJECT_ID}" --location="${LOCATION}" \
    --use_legacy_sql=false < "$f"
  echo "--- done $f ---"
done
echo "=== All 5 marts refreshed: $(date) ==="

echo "=== Exporting dashboard data (JSON) ==="
mkdir -p docs/data

# export 함수: 실패해도 다음 export 계속 진행
run_export() {
  local label="$1"
  local outfile="$2"
  local query="$3"
  echo "--- exporting ${label} -> ${outfile} ---"
  if bq query --project_id="${PROJECT_ID}" --location="${LOCATION}" \
       --use_legacy_sql=false --format=json "${query}" > "${outfile}.tmp"; then
    mv "${outfile}.tmp" "${outfile}"
    echo "--- ${label} OK ---"
  else
    rm -f "${outfile}.tmp"
    echo "!!! ${label} FAILED (skipped) !!!"
  fi
}

# Mart 1
run_export "Mart 1 (daily KPI)" "docs/data/mart1_daily_kpi.json" "
SELECT
  event_date,
  SUM(sessions) AS sessions,
  SUM(users) AS users,
  SUM(pdp_views) AS pdp_views,
  SUM(add_to_carts) AS add_to_carts,
  SUM(checkouts) AS checkouts,
  SUM(purchases) AS purchases,
  ROUND(SUM(revenue), 2) AS revenue,
  SUM(units_sold) AS units_sold,
  ROUND(SAFE_DIVIDE(SUM(purchases), SUM(users)) * 100, 3) AS cvr_user_pct,
  ROUND(SAFE_DIVIDE(SUM(revenue), SUM(purchases)), 2) AS aov,
  ROUND(SAFE_DIVIDE(SUM(checkouts) - SUM(purchases), SUM(checkouts)) * 100, 1) AS cart_abandonment_pct
FROM \`${PROJECT_ID}.marts.mart_daily_ecommerce_kpi\`
WHERE event_date >= DATE_SUB(CURRENT_DATE(), INTERVAL 90 DAY)
GROUP BY event_date
ORDER BY event_date ASC"

# Mart 2 (long format)
run_export "Mart 2 (funnel)" "docs/data/mart2_funnel.json" "
SELECT event_date, funnel_type, segment, step_number, step_name,
       sessions, pct_of_step1, dropoff_from_prev_pct
FROM \`${PROJECT_ID}.marts.mart_funnel_dropoff\`
WHERE event_date >= DATE_SUB(CURRENT_DATE(), INTERVAL 90 DAY)
ORDER BY event_date ASC, funnel_type, segment, step_number"

# Mart 3
run_export "Mart 3 (cohort)" "docs/data/mart3_cohort.json" "
SELECT *
FROM \`${PROJECT_ID}.marts.mart_cohort_retention\`
ORDER BY 1"

# Mart 4
run_export "Mart 4 (attribution)" "docs/data/mart4_attribution.json" "
SELECT *
FROM \`${PROJECT_ID}.marts.mart_attribution_multi_touch\`
ORDER BY 1"

# Mart 5
run_export "Mart 5 (LTV/RFM)" "docs/data/mart5_ltv_rfm.json" "
SELECT *
FROM \`${PROJECT_ID}.marts.mart_user_ltv_rfm\`
LIMIT 5000"

# Mart 6
run_export "Mart 6 (new vs returning)" "docs/data/mart6_new_vs_returning.json" "
SELECT *
FROM \`${PROJECT_ID}.marts.mart_new_vs_returning\`
WHERE event_date >= DATE_SUB(CURRENT_DATE(), INTERVAL 90 DAY)
ORDER BY event_date ASC, user_type"

# Mart 7 (heatmap)
run_export "Mart 7 (time heatmap)" "docs/data/mart7_time_heatmap.json" "
SELECT *
FROM \`${PROJECT_ID}.marts.mart_time_pattern_heatmap\`
ORDER BY day_of_week_num, hour_of_day"

# Mart 8
run_export "Mart 8 (engagement)" "docs/data/mart8_engagement.json" "
SELECT *
FROM \`${PROJECT_ID}.marts.mart_engagement_scroll_depth\`
WHERE event_date >= DATE_SUB(CURRENT_DATE(), INTERVAL 90 DAY)
ORDER BY event_date ASC, engagement_tier"

# Mart 9
run_export "Mart 9 (dark social / AI)" "docs/data/mart9_dark_social_ai.json" "
SELECT *
FROM \`${PROJECT_ID}.marts.mart_dark_social_ai_referral\`
WHERE event_date >= DATE_SUB(CURRENT_DATE(), INTERVAL 90 DAY)
ORDER BY event_date ASC, sessions DESC"

echo "=== Dashboard data export done: $(date) ==="
