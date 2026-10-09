#!/usr/bin/env bash
# Laadt idempotent demodata voor de admin-gebruiker (PB_ADMIN_USER_EMAIL).
set -euo pipefail

PB_URL="${PB_URL:-http://pocketbase:8090}"
PB_SUPERUSER_EMAIL="${PB_SUPERUSER_EMAIL:?Set PB_SUPERUSER_EMAIL}"
PB_SUPERUSER_PASSWORD="${PB_SUPERUSER_PASSWORD:?Set PB_SUPERUSER_PASSWORD}"
PB_ADMIN_USER_EMAIL="${PB_ADMIN_USER_EMAIL:?Demodata vereist PB_ADMIN_USER_EMAIL}"
SERIES_ID="demo-upper-series"

TOKEN="$(curl -fsS -X POST "$PB_URL/api/collections/_superusers/auth-with-password" -H 'Content-Type: application/json' \
  --data "$(jq -n --arg i "$PB_SUPERUSER_EMAIL" --arg p "$PB_SUPERUSER_PASSWORD" '{identity:$i,password:$p}')" | jq -er .token)"

api() { curl -fsS "$@" -H "Authorization: $TOKEN" -H 'Content-Type: application/json'; }
q() { jq -rn --arg v "$1" '$v|@uri'; }

OWNER="$(api "$PB_URL/api/collections/users/records?perPage=1&filter=$(q "email=\"$PB_ADMIN_USER_EMAIL\"")" | jq -er '.items[0].id')"

if [ "$(api "$PB_URL/api/collections/workouts/records?perPage=1&filter=$(q "owner=\"$OWNER\" && series_id=\"$SERIES_ID\"")" | jq '.totalItems')" -gt 0 ]; then
  echo "Demodata staat er al, overslaan."
  exit 0
fi

exercise_id() {
  api "$PB_URL/api/collections/exercises/records?perPage=1&filter=$(q "name=\"$1\"")" | jq -er '.items[0].id'
}

create() { api -X POST "$PB_URL/api/collections/$1/records" --data "$2"; }

add_exercise() { # workout name order sets min max weight increment status equipment
  local we
  we="$(create workout_exercises "$(jq -n --arg o "$OWNER" --arg w "$1" --arg e "$(exercise_id "$2")" \
    --arg eq "${10}" --argjson ord "$3" --argjson s "$4" --argjson mn "$5" --argjson mx "$6" --argjson wt "$7" --argjson inc "$8" \
    '{owner:$o,workout:$w,exercise:$e,equipment:$eq,set_order:$ord,target_sets:$s,reps_min:$mn,reps_max:$mx,starting_weight:$wt,weight_increment:$inc}')" | jq -er .id)"
  for i in $(seq 1 "$4"); do
    if [ "$9" = completed ]; then reps="$6"; done=true; else reps=0; done=false; fi
    create workout_sets "$(jq -n --arg o "$OWNER" --arg w "$we" --argjson i "$i" --argjson r "$reps" --argjson wt "$7" --argjson d "$done" \
      '{owner:$o,workout_exercise:$w,set_order:$i,reps:$r,weight:$wt,completed:$d}')" >/dev/null
  done
}

strength_workout() { # title date status series weightOffset
  local id
  id="$(create workouts "$(jq -n --arg o "$OWNER" --arg t "$1" --arg d "$2" --arg s "$3" --arg series "$4" \
    '{owner:$o,title:$t,type:"strength",status:$s,performed_at:$d,duration_minutes:60} + (if $series=="" then {} else {series_id:$series} end)')" | jq -er .id)"
  add_exercise "$id" "Bench press" 1 4 6 8 "$((60 + $5))" 2.5 "$3" barbell
  add_exercise "$id" "Row" 2 4 8 10 "$((50 + $5))" 2.5 "$3" cable
  add_exercise "$id" "Overhead press" 3 3 8 12 "$((16 + $5 / 5))" 1 "$3" dumbbell
}

day() { date -u -d "@$(($(date +%s) + $1 * 86400))" +%Y-%m-%d; }

strength_workout "Upper" "$(day -14) 09:00:00.000Z" completed "" 0
strength_workout "Upper" "$(day -7) 09:00:00.000Z" completed "" 2
for week in 0 1 2 3; do
  strength_workout "Upper" "$(day "$((week * 7 + 2))") 09:00:00.000Z" planned "$SERIES_ID" 5
done

create workouts "$(jq -n --arg o "$OWNER" --arg d "$(day -5) 18:00:00.000Z" \
  '{owner:$o,title:"Duurloop",type:"cardio",status:"completed",performed_at:$d,duration_minutes:40,cardio_mode:"running",distance_km:7.5,average_heart_rate:152,perceived_effort:6}')" >/dev/null
create workouts "$(jq -n --arg o "$OWNER" --arg d "$(day -3) 18:00:00.000Z" \
  '{owner:$o,title:"HIIT fiets",type:"interval",status:"completed",performed_at:$d,duration_minutes:25,cardio_mode:"cycling",interval_work_seconds:30,interval_rest_seconds:60,interval_rounds:8,perceived_effort:8}')" >/dev/null
create workouts "$(jq -n --arg o "$OWNER" --arg d "$(day -1) 19:00:00.000Z" \
  '{owner:$o,title:"Mobiliteit",type:"recovery",status:"completed",performed_at:$d,duration_minutes:20,recovery_activity:"mobility"}')" >/dev/null
echo "Demodata geladen."
