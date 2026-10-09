#!/usr/bin/env bash
set -euo pipefail

PB_URL="${PB_URL:-http://pocketbase:8090}"
PB_SUPERUSER_EMAIL="${PB_SUPERUSER_EMAIL:?Set PB_SUPERUSER_EMAIL}"
PB_SUPERUSER_PASSWORD="${PB_SUPERUSER_PASSWORD:?Set PB_SUPERUSER_PASSWORD}"
PB_ADMIN_USER_EMAIL="${PB_ADMIN_USER_EMAIL:-}"
PB_ADMIN_USER_PASSWORD="${PB_ADMIN_USER_PASSWORD:-}"
PB_ADMIN_USER_NAME="${PB_ADMIN_USER_NAME:-TOP Trainer Admin}"

if { [ -n "$PB_ADMIN_USER_EMAIL" ] && [ -z "$PB_ADMIN_USER_PASSWORD" ]; } ||
  { [ -z "$PB_ADMIN_USER_EMAIL" ] && [ -n "$PB_ADMIN_USER_PASSWORD" ]; }; then
  echo "Set both PB_ADMIN_USER_EMAIL and PB_ADMIN_USER_PASSWORD, or leave both empty." >&2
  exit 1
fi

command -v curl >/dev/null || { echo "curl is required" >&2; exit 1; }
command -v jq >/dev/null || { echo "jq is required" >&2; exit 1; }

for attempt in $(seq 1 60); do
  if curl -fsS "$PB_URL/api/health" >/dev/null 2>&1; then break; fi
  if [ "$attempt" -eq 60 ]; then echo "PocketBase did not become healthy at $PB_URL" >&2; exit 1; fi
  sleep 2
done

AUTH_RESPONSE="$(curl -fsS -X POST "$PB_URL/api/collections/_superusers/auth-with-password" \
  -H 'Content-Type: application/json' \
  --data "$(jq -n --arg identity "$PB_SUPERUSER_EMAIL" --arg password "$PB_SUPERUSER_PASSWORD" '{identity:$identity,password:$password}')")"
TOKEN="$(printf '%s' "$AUTH_RESPONSE" | jq -er '.token')"
AUTH_HEADER="Authorization: $TOKEN"

api() {
  local response status body
  response="$(curl -sS -w $'\n%{http_code}' "$@" -H "$AUTH_HEADER")"
  status="${response##*$'\n'}"
  body="${response%$'\n'*}"
  if [ "$status" -lt 200 ] || [ "$status" -ge 300 ]; then
    echo "PocketBase API request failed (HTTP $status): $body" >&2
    return 1
  fi
  printf '%s' "$body"
}

collection_id() {
  local name="$1"
  api "$PB_URL/api/collections?filter=$(printf 'name%%3D%%22%s%%22' "$name")&perPage=1" | jq -er '.items[0].id'
}

ensure_collection() {
  local name="$1" type="$2" fields="$3" list_rule="$4" view_rule="$5" create_rule="$6" update_rule="$7" delete_rule="$8"
  local existing_id payload
  existing_id="$(api "$PB_URL/api/collections?filter=$(printf 'name%%3D%%22%s%%22' "$name")&perPage=1" | jq -r '.items[0].id // empty')"
  payload="$(jq -n \
    --arg name "$name" \
    --arg type "$type" \
    --argjson fields "$fields" \
    --arg list "$list_rule" --arg view "$view_rule" --arg create "$create_rule" --arg update "$update_rule" --arg delete "$delete_rule" \
    '{name:$name,type:$type,fields:$fields,listRule:$list,viewRule:$view,createRule:$create,updateRule:$update,deleteRule:$delete}')"
  if [ -n "$existing_id" ]; then
    api -X PATCH "$PB_URL/api/collections/$existing_id" -H 'Content-Type: application/json' --data "$payload" >/dev/null
  else
    if ! api -X POST "$PB_URL/api/collections" -H 'Content-Type: application/json' --data "$payload" >/dev/null; then
      printf 'Collection schema payload for %s: %s\n' "$name" "$fields" >&2
      return 1
    fi
  fi
  echo "Ensured collection: $name"
}

ensure_select_values() {
  local collection="$1" field_name="$2" values="$3" id response patched
  echo "Ensuring select options: $collection.$field_name"
  id="$(collection_id "$collection")"
  response="$(api "$PB_URL/api/collections/$id")"
  patched="$(printf '%s' "$response" | jq --arg field "$field_name" --argjson values "$values" '
    .fields |= map(if .name == $field then .values = $values else . end)
  ')"
  api -X PATCH "$PB_URL/api/collections/$id" -H 'Content-Type: application/json' --data "$patched" >/dev/null
}

select_field() {
  jq -cn --arg name "$1" --argjson values "$2" --argjson required "${3:-false}" \
    '{name:$name,type:"select",required:$required,maxSelect:1,values:$values}'
}

text_field() {
  jq -cn --arg name "$1" --argjson required "${2:-false}" '{name:$name,type:"text",required:$required,min:0,max:10000}'
}

number_field() {
  jq -cn --arg name "$1" --argjson required "${2:-false}" '{name:$name,type:"number",required:$required,min:null,max:null}'
}

relation_field() {
  jq -cn --arg name "$1" --arg collection "$2" --argjson required "${3:-false}" \
    '{name:$name,type:"relation",required:$required,collectionId:$collection,maxSelect:1,cascadeDelete:false}'
}

bool_field() {
  jq -cn --arg name "$1" --argjson required "${2:-false}" '{name:$name,type:"bool",required:$required}'
}

date_field() {
  jq -cn --arg name "$1" --argjson required "${2:-false}" '{name:$name,type:"date",required:$required}'
}

secret_field() {
  jq -cn --arg name "$1" '{name:$name,type:"text",required:false,hidden:true,min:0,max:4096}'
}

OWNER_FIELD="$(relation_field owner _pb_users_auth_ true)"
PROFILE_FIELDS="$(jq -cn --argjson user "$(relation_field user _pb_users_auth_ true)" \
  --argjson display "$(text_field display_name true)" \
  --argjson role "$(select_field role '["admin","coach","athlete"]' true)" \
  '[$user,$display,$role]')"
ensure_collection profiles base "$PROFILE_FIELDS" \
  'user = @request.auth.id' 'user = @request.auth.id' 'user = @request.auth.id && @request.body.role = "athlete"' 'user = @request.auth.id && @request.body.role:isset = false' 'user = @request.auth.id'

EXERCISE_FIELDS="$(jq -cn --argjson name "$(text_field name true)" \
  --argjson category "$(select_field category '["compound","isolation","bodyweight","other"]' true)" \
  --argjson muscle "$(select_field muscle_group '["chest","back","shoulders","biceps","triceps","legs","glutes","core","full_body"]')" \
  --argjson equipment "$(jq -cn --argjson values '["barbell","dumbbell","kettlebell","machine","cable","bodyweight","band","other"]' '{name:"equipment_options",type:"select",required:false,maxSelect:8,values:$values}')" \
  --argjson active "$(bool_field active true)" '[$name,$category,$muscle,$equipment,$active]')"
ensure_collection exercises base "$EXERCISE_FIELDS" '@request.auth.id != ""' '@request.auth.id != ""' '@request.auth.id != ""' '@request.auth.id != ""' '@request.auth.id != ""'

PLAN_FIELDS="$(jq -cn --argjson owner "$OWNER_FIELD" \
  --argjson title "$(text_field title true)" \
  --argjson goal "$(text_field goal true)" \
  --argjson start "$(date_field start_date true)" \
  --argjson end "$(date_field end_date true)" \
  --argjson weeks "$(number_field weeks true)" \
  --argjson summary "$(text_field summary)" \
  '[$owner,$title,$goal,$start,$end,$weeks,$summary]')"
ensure_collection training_plans base "$PLAN_FIELDS" \
  'owner = @request.auth.id' 'owner = @request.auth.id' 'owner = @request.auth.id' 'owner = @request.auth.id' 'owner = @request.auth.id'

AI_SETTINGS_FIELDS="$(jq -cn --argjson owner "$OWNER_FIELD" \
  --argjson endpoint "$(text_field endpoint true)" \
  --argjson model "$(text_field model true)" \
  --argjson key "$(secret_field api_key)" \
  --argjson key_set "$(bool_field api_key_set)" \
  '[$owner,$endpoint,$model,$key,$key_set]')"
ensure_collection ai_settings base "$AI_SETTINGS_FIELDS" \
  'owner = @request.auth.id' 'owner = @request.auth.id' 'owner = @request.auth.id' 'owner = @request.auth.id' 'owner = @request.auth.id'

PLAN_ID="$(collection_id training_plans)"
WORKOUT_FIELDS="$(jq -cn --argjson owner "$OWNER_FIELD" \
  --argjson plan "$(relation_field plan "$PLAN_ID")" \
  --argjson title "$(text_field title true)" \
  --argjson type "$(select_field type '["strength","cardio","interval","recovery"]' true)" \
  --argjson status "$(select_field status '["planned","in_progress","completed","skipped"]' true)" \
  --argjson date "$(jq -cn '{name:"performed_at",type:"date",required:true}')" \
  --argjson duration "$(number_field duration_minutes)" --argjson notes "$(text_field notes)" \
  --argjson cardio "$(select_field cardio_mode '["running","cycling","rowing","swimming","walking","other"]')" \
  --argjson distance "$(number_field distance_km)" --argjson heart "$(number_field average_heart_rate)" \
  --argjson interval_work "$(number_field interval_work_seconds)" --argjson interval_rest "$(number_field interval_rest_seconds)" \
  --argjson rounds "$(number_field interval_rounds)" \
  --argjson recovery "$(select_field recovery_activity '["rest","mobility","yoga","walking","stretching","other"]')" \
  --argjson effort "$(number_field perceived_effort)" --argjson series "$(text_field series_id)" \
  '[$owner,$plan,$title,$type,$status,$date,$duration,$notes,$cardio,$distance,$heart,$interval_work,$interval_rest,$rounds,$recovery,$effort,$series]')"
ensure_collection workouts base "$WORKOUT_FIELDS" \
  'owner = @request.auth.id' 'owner = @request.auth.id' 'owner = @request.auth.id' 'owner = @request.auth.id' 'owner = @request.auth.id'

WORKOUT_ID="$(collection_id workouts)"
EXERCISE_ID="$(collection_id exercises)"
WORKOUT_EXERCISE_FIELDS="$(jq -cn --argjson owner "$OWNER_FIELD" \
  --argjson workout "$(relation_field workout "$WORKOUT_ID" true)" \
  --argjson exercise "$(relation_field exercise "$EXERCISE_ID" true)" \
  --argjson order "$(number_field set_order true)" --argjson sets "$(number_field target_sets true)" \
  --argjson min "$(number_field reps_min true)" --argjson max "$(number_field reps_max true)" \
  --argjson start "$(number_field starting_weight)" --argjson increment "$(number_field weight_increment true)" \
  --argjson equipment "$(select_field equipment '["barbell","dumbbell","kettlebell","machine","cable","bodyweight","band","other"]')" \
  '[$owner,$workout,$exercise,$order,$sets,$min,$max,$start,$increment,$equipment]')"
ensure_collection workout_exercises base "$WORKOUT_EXERCISE_FIELDS" \
  'owner = @request.auth.id' 'owner = @request.auth.id' 'owner = @request.auth.id' 'owner = @request.auth.id' 'owner = @request.auth.id'

WORKOUT_EXERCISE_ID="$(collection_id workout_exercises)"
SET_FIELDS="$(jq -cn --argjson owner "$OWNER_FIELD" \
  --argjson workout_exercise "$(relation_field workout_exercise "$WORKOUT_EXERCISE_ID" true)" \
  --argjson order "$(number_field set_order true)" --argjson reps "$(number_field reps)" \
  --argjson weight "$(number_field weight)" --argjson completed "$(bool_field completed)" \
  '[$owner,$workout_exercise,$order,$reps,$weight,$completed]')"
ensure_collection workout_sets base "$SET_FIELDS" \
  'owner = @request.auth.id' 'owner = @request.auth.id' 'owner = @request.auth.id' 'owner = @request.auth.id' 'owner = @request.auth.id'

ensure_select_values workouts type '["strength","cardio","interval","recovery"]'
ensure_select_values workouts status '["planned","in_progress","completed","skipped"]'
ensure_select_values exercises category '["compound","isolation","bodyweight","other"]'
ensure_select_values exercises muscle_group '["chest","back","shoulders","biceps","triceps","legs","glutes","core","full_body"]'
ensure_select_values exercises equipment_options '["barbell","dumbbell","kettlebell","machine","cable","bodyweight","band","other"]'

seed_exercise() {
  local name="$1" category="$2" muscle="$3" equipment="$4"
  local existing exercise_collection_id payload
  exercise_collection_id="$(collection_id exercises)"
  existing="$(api --get --data-urlencode "filter=name=\"$name\"" --data-urlencode perPage=1 \
    "$PB_URL/api/collections/$exercise_collection_id/records" | jq -r '.items[0].id // empty')"
  payload="$(jq -n --arg name "$name" --arg category "$category" --arg muscle "$muscle" --arg equipment "$equipment" \
    '{name:$name,category:$category,muscle_group:$muscle,equipment_options:($equipment|split(",")),active:true}')"
  if [ -n "$existing" ]; then
    api -X PATCH "$PB_URL/api/collections/$exercise_collection_id/records/$existing" \
      -H 'Content-Type: application/json' --data "$payload" >/dev/null
  else
    api -X POST "$PB_URL/api/collections/$exercise_collection_id/records" \
      -H 'Content-Type: application/json' --data "$payload" >/dev/null
  fi
}

# Oefening (beweging) staat los van het apparaat: het apparaat kies je per training.
seed_exercise "Squat" compound legs barbell,dumbbell,kettlebell
seed_exercise "Front squat" compound legs barbell
seed_exercise "Bench press" compound chest barbell,dumbbell,machine
seed_exercise "Incline bench press" compound chest barbell,dumbbell
seed_exercise "Floor press" compound chest kettlebell,dumbbell
seed_exercise "Deadlift" compound back barbell,kettlebell
seed_exercise "Sumo deadlift" compound legs barbell,kettlebell
seed_exercise "Romanian deadlift" compound legs barbell,dumbbell
seed_exercise "Overhead press" compound shoulders barbell,dumbbell,machine,kettlebell
seed_exercise "Row" compound back barbell,dumbbell,cable,machine,kettlebell
seed_exercise "Lat pulldown" compound back cable,machine
seed_exercise "Pull-up" compound back bodyweight,machine
seed_exercise "Chest fly" isolation chest dumbbell,cable,machine
seed_exercise "Lateral raise" isolation shoulders dumbbell,cable
seed_exercise "Curl" isolation biceps barbell,dumbbell,cable
seed_exercise "Tricep extension" isolation triceps dumbbell,cable
seed_exercise "Tricep pushdown" isolation triceps cable
seed_exercise "Face pull" isolation shoulders cable
seed_exercise "Pull-through" compound glutes cable
seed_exercise "Woodchop" compound core cable
seed_exercise "Straight-arm pulldown" isolation back cable
seed_exercise "Hip thrust" compound glutes barbell
seed_exercise "Lunge" compound legs dumbbell,kettlebell
seed_exercise "Swing" compound glutes kettlebell
seed_exercise "Clean and press" compound full_body kettlebell
seed_exercise "Turkish get-up" compound full_body kettlebell
seed_exercise "Snatch" compound full_body kettlebell
seed_exercise "Leg press" compound legs machine
seed_exercise "Leg curl" isolation legs machine
seed_exercise "Leg extension" isolation legs machine
seed_exercise "Calf raise" isolation legs machine

# Migreert oude gecombineerde oefeningen (bijv. "Barbell curl") naar oefening + apparaat.
migrate_legacy_exercise() {
  local old_name="$1" new_name="$2" equipment="$3"
  local exercises_id workout_exercises_id old_id new_id entry_id
  exercises_id="$(collection_id exercises)"
  workout_exercises_id="$(collection_id workout_exercises)"
  old_id="$(api --get --data-urlencode "filter=name=\"$old_name\"" --data-urlencode perPage=1 \
    "$PB_URL/api/collections/$exercises_id/records" | jq -r '.items[0].id // empty')"
  [ -n "$old_id" ] || return 0
  new_id="$(api --get --data-urlencode "filter=name=\"$new_name\"" --data-urlencode perPage=1 \
    "$PB_URL/api/collections/$exercises_id/records" | jq -er '.items[0].id')"
  api --get --data-urlencode "filter=exercise=\"$old_id\" && equipment=\"\"" --data-urlencode perPage=500 \
    "$PB_URL/api/collections/$workout_exercises_id/records" | jq -r '.items[].id' | while read -r entry_id; do
    api -X PATCH "$PB_URL/api/collections/$workout_exercises_id/records/$entry_id" \
      -H 'Content-Type: application/json' \
      --data "$(jq -n --arg e "$new_id" --arg q "$equipment" '{exercise:$e,equipment:$q}')" >/dev/null
  done
  if [ "$old_id" != "$new_id" ]; then
    api -X DELETE "$PB_URL/api/collections/$exercises_id/records/$old_id" >/dev/null || true
  fi
}

while IFS='|' read -r old new equipment; do
  [ -n "$old" ] && migrate_legacy_exercise "$old" "$new" "$equipment"
done <<'LEGACY'
Barbell squat|Squat|barbell
Dumbbell goblet squat|Squat|dumbbell
Kettlebell goblet squat|Squat|kettlebell
Front squat|Front squat|barbell
Bench press|Bench press|barbell
Dumbbell bench press|Bench press|dumbbell
Chest press machine|Bench press|machine
Incline bench press|Incline bench press|barbell
Kettlebell floor press|Floor press|kettlebell
Deadlift|Deadlift|barbell
Kettlebell deadlift|Deadlift|kettlebell
Kettlebell sumo deadlift|Sumo deadlift|kettlebell
Romanian deadlift|Romanian deadlift|barbell
Dumbbell Romanian deadlift|Romanian deadlift|dumbbell
Overhead press|Overhead press|barbell
Dumbbell shoulder press|Overhead press|dumbbell
Shoulder press machine|Overhead press|machine
Barbell row|Row|barbell
Dumbbell row|Row|dumbbell
Cable seated row|Row|cable
Seated row machine|Row|machine
Kettlebell one-arm row|Row|kettlebell
Cable lat pulldown|Lat pulldown|cable
Lat pulldown machine|Lat pulldown|machine
Pull-up|Pull-up|machine
Dumbbell chest fly|Chest fly|dumbbell
Cable chest fly|Chest fly|cable
Seated chest fly machine|Chest fly|machine
Dumbbell lateral raise|Lateral raise|dumbbell
Cable lateral raise|Lateral raise|cable
Barbell curl|Curl|barbell
Dumbbell bicep curl|Curl|dumbbell
Cable bicep curl|Curl|cable
Dumbbell tricep extension|Tricep extension|dumbbell
Cable tricep pushdown|Tricep pushdown|cable
Cable face pull|Face pull|cable
Cable pull-through|Pull-through|cable
Cable woodchop|Woodchop|cable
Cable straight-arm pulldown|Straight-arm pulldown|cable
Hip thrust|Hip thrust|barbell
Dumbbell lunge|Lunge|dumbbell
Kettlebell reverse lunge|Lunge|kettlebell
Kettlebell swing|Swing|kettlebell
Kettlebell clean and press|Clean and press|kettlebell
Kettlebell Turkish get-up|Turkish get-up|kettlebell
Kettlebell snatch|Snatch|kettlebell
Leg press|Leg press|machine
Seated leg curl|Leg curl|machine
Leg extension|Leg extension|machine
Calf raise machine|Calf raise|machine
LEGACY

ensure_admin_user() {
  if [ -z "$PB_ADMIN_USER_EMAIL" ]; then
    echo "Skipping app admin account (PB_ADMIN_USER_EMAIL/PB_ADMIN_USER_PASSWORD are not set)."
    return
  fi

  local users_id existing_user user_id profile_id user_payload profile_payload
  users_id="$(collection_id users)"
  existing_user="$(api --get --data-urlencode "filter=email=\"$PB_ADMIN_USER_EMAIL\"" --data-urlencode perPage=1 \
    "$PB_URL/api/collections/$users_id/records" | jq -r '.items[0].id // empty')"

  if [ -n "$existing_user" ]; then
    user_id="$existing_user"
    echo "App admin account already exists: $PB_ADMIN_USER_EMAIL"
  else
    user_payload="$(jq -n \
      --arg email "$PB_ADMIN_USER_EMAIL" \
      --arg password "$PB_ADMIN_USER_PASSWORD" \
      --arg name "$PB_ADMIN_USER_NAME" \
      '{email:$email,password:$password,passwordConfirm:$password,name:$name,emailVisibility:true,verified:true}')"
    user_id="$(api -X POST "$PB_URL/api/collections/$users_id/records" \
      -H 'Content-Type: application/json' --data "$user_payload" | jq -er '.id')"
    echo "Created app admin account: $PB_ADMIN_USER_EMAIL"
  fi

  profile_id="$(api --get --data-urlencode "filter=user=\"$user_id\"" --data-urlencode perPage=1 \
    "$PB_URL/api/collections/$(collection_id profiles)/records" | jq -r '.items[0].id // empty')"
  if [ -n "$profile_id" ]; then
    profile_payload="$(jq -n --arg display_name "$PB_ADMIN_USER_NAME" '{display_name:$display_name,role:"admin"}')"
    api -X PATCH "$PB_URL/api/collections/$(collection_id profiles)/records/$profile_id" \
      -H 'Content-Type: application/json' --data "$profile_payload" >/dev/null
    echo "Ensured app admin profile role."
  else
    profile_payload="$(jq -n --arg user "$user_id" --arg display_name "$PB_ADMIN_USER_NAME" \
      '{user:$user,display_name:$display_name,role:"admin"}')"
    api -X POST "$PB_URL/api/collections/$(collection_id profiles)/records" \
      -H 'Content-Type: application/json' --data "$profile_payload" >/dev/null
    echo "Created app admin profile."
  fi
}

ensure_admin_user

echo "PocketBase collections are ready."
