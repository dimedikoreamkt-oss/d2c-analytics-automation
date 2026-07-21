#!/bin/bash
set -e
PROJECT_ID="d2c-analytics-502304"
LOCATION="asia-northeast3"

echo "=== D2C Analytics marts refresh start: $(date) ==="
for f in sql/*.sql
do
  echo "--- running $f ---"
  bq query --project_id="${PROJECT_ID}" --location="${LOCATION}" \
    --use_legacy_sql=false < "$f"
  echo "--- done $f ---"
done

echo "=== All 5 marts refreshed: $(date) ==="

echo "=== All 5 marts refreshed: $(date) ==="

echo "=== Exporting dashboard data (JSON) ==="
mkdir -p docs/data

bq query --project_id="${PROJECT_ID}" --location="${LOCATION}" \
  --use_legacy_sql=false --format=json \
  "SELECT
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
   FROM (
     SELECT * FROM \`${PROJECT_ID}.marts.mart_daily_ecommerce_kpi\`
     WHERE event_date >= DATE_SUB(CURRENT_DATE(), INTERVAL 90 DAY)
   )
   GROUP BY event_date
   ORDER BY event_date ASC" \
  > docs/data/mart1_daily_kpi.json

  echo "=== Exporting Mart 2 (funnel) ==="
bq query --project_id="${PROJECT_ID}" --location="${LOCATION}" \
  --use_legacy_sql=false --format=json \
  "SELECT
     event_date,
     SUM(sessions) AS sessions,
     SUM(pdp_views) AS pdp_views,
     SUM(add_to_carts) AS add_to_carts,
     SUM(checkouts) AS checkouts,
     SUM(purchases) AS purchases,
     ROUND(SAFE_DIVIDE(SUM(pdp_views), SUM(sessions)) * 100, 2) AS session_to_pdp_pct,
     ROUND(SAFE_DIVIDE(SUM(add_to_carts), SUM(pdp_views)) * 100, 2) AS pdp_to_atc_pct,
     ROUND(SAFE_DIVIDE(SUM(checkouts), SUM(add_to_carts)) * 100, 2) AS atc_to_checkout_pct,
     ROUND(SAFE_DIVIDE(SUM(purchases), SUM(checkouts)) * 100, 2) AS checkout_to_purchase_pct,
     ROUND(SAFE_DIVIDE(SUM(purchases), SUM(sessions)) * 100, 3) AS session_to_purchase_pct
   FROM \`${PROJECT_ID}.marts.mart_funnel_dropoff\`
   WHERE event_date >= DATE_SUB(CURRENT_DATE(), INTERVAL 90 DAY)
   GROUP BY event_date
   ORDER BY event_date ASC" \
  > docs/data/mart2_funnel.json
echo "=== Mart 2 export done ==="

