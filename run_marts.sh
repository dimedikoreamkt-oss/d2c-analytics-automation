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
  "SELECT * FROM (
     SELECT * FROM \`${PROJECT_ID}.marts.mart_daily_ecommerce_kpi\`
     ORDER BY event_date DESC LIMIT 90
   ) ORDER BY event_date ASC" \
  > docs/data/mart1_daily_kpi.json

echo "=== Dashboard data export done: $(date) ==="
