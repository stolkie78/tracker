#!/usr/bin/env bash
set -euo pipefail

PB_URL="${PB_URL:-http://pocketbase:8090}"
PB_SUPERUSER_EMAIL="${PB_SUPERUSER_EMAIL:?Set PB_SUPERUSER_EMAIL}"
PB_SUPERUSER_PASSWORD="${PB_SUPERUSER_PASSWORD:?Set PB_SUPERUSER_PASSWORD}"
PB_ADMIN_USER_EMAIL="${PB_ADMIN_USER_EMAIL:-}"
PB_ADMIN_USER_PASSWORD="${PB_ADMIN_USER_PASSWORD:-}"
PB_ADMIN_USER_NAME="${PB_ADMIN_USER_NAME:-TOP Trainer Admin}"
GOOGLE_CLIENT_ID="${GOOGLE_CLIENT_ID:-}"
GOOGLE_CLIENT_SECRET="${GOOGLE_CLIENT_SECRET:-}"

if { [ -n "$PB_ADMIN_USER_EMAIL" ] && [ -z "$PB_ADMIN_USER_PASSWORD" ]; } ||
  { [ -z "$PB_ADMIN_USER_EMAIL" ] && [ -n "$PB_ADMIN_USER_PASSWORD" ]; }; then
  echo "Set both PB_ADMIN_USER_EMAIL and PB_ADMIN_USER_PASSWORD, or leave both empty." >&2
  exit 1
fi

if { [ -n "$GOOGLE_CLIENT_ID" ] && [ -z "$GOOGLE_CLIENT_SECRET" ]; } ||
  { [ -z "$GOOGLE_CLIENT_ID" ] && [ -n "$GOOGLE_CLIENT_SECRET" ]; }; then
  echo "Set both GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET, or leave both empty." >&2
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
  if [ "$type" = base ]; then
    [ "$list_rule" = __locked__ ] || list_rule="@request.auth.id != \"\" && ($list_rule)"
    [ "$view_rule" = __locked__ ] || view_rule="@request.auth.id != \"\" && ($view_rule)"
    [ "$create_rule" = __locked__ ] || create_rule="@request.auth.id != \"\" && ($create_rule)"
    [ "$update_rule" = __locked__ ] || update_rule="@request.auth.id != \"\" && ($update_rule)"
    [ "$delete_rule" = __locked__ ] || delete_rule="@request.auth.id != \"\" && ($delete_rule)"
    # Relaties naar persoonlijke records mogen nooit naar een andere gebruiker wijzen.
    local relation
    for relation in $(printf '%s' "$fields" | jq -r '.[] | select(.type == "relation" and .name != "owner" and .name != "user" and .name != "exercise") | .name'); do
      create_rule="$create_rule && ($relation = \"\" || $relation.owner = @request.auth.id)"
      update_rule="$update_rule && (@request.body.$relation:isset = false || @request.body.$relation = $relation)"
    done
    if printf '%s' "$fields" | jq -e '.[] | select(.type == "relation" and .name == "exercise")' >/dev/null; then
      create_rule="$create_rule && (exercise.owner = \"\" || exercise.owner = @request.auth.id)"
      update_rule="$update_rule && (@request.body.exercise:isset = false || @request.body.exercise = exercise)"
    fi
  fi
  existing_id="$(api "$PB_URL/api/collections?filter=$(printf 'name%%3D%%22%s%%22' "$name")&perPage=1" | jq -r '.items[0].id // empty')"
  payload="$(jq -n \
    --arg name "$name" \
    --arg type "$type" \
    --argjson fields "$fields" \
    --arg list "$list_rule" --arg view "$view_rule" --arg create "$create_rule" --arg update "$update_rule" --arg delete "$delete_rule" \
    'def rule: if . == "__locked__" then null else . end; {name:$name,type:$type,fields:$fields,listRule:($list|rule),viewRule:($view|rule),createRule:($create|rule),updateRule:($update|rule),deleteRule:($delete|rule)}')"
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
  --argjson birth "$(date_field birth_date)" \
  --argjson phone "$(text_field phone)" --argjson bio "$(text_field bio)" \
  --argjson height '{"name":"height_cm","type":"number","min":0,"max":300}' \
  --argjson photo '{"name":"photo","type":"file","maxSelect":1,"maxSize":5242880,"mimeTypes":["image/jpeg","image/png","image/webp"],"protected":true}' \
  --argjson role "$(select_field role '["admin","coach","athlete"]' true)" \
  '[$user,$display,$role,$birth,$phone,$bio,$height,$photo]')"
ensure_collection profiles base "$PROFILE_FIELDS" \
  'user = @request.auth.id' 'user = @request.auth.id' 'user = @request.auth.id && @request.body.role = "athlete"' 'user = @request.auth.id && (@request.body.user:isset = false || @request.body.user = @request.auth.id) && @request.body.role:isset = false' '__locked__'

PROFILE_ID="$(collection_id profiles)"
PROFILE_INDEXES="$(api "$PB_URL/api/collections/$PROFILE_ID" | jq -c \
  '{indexes: ((.indexes // []) + ["CREATE UNIQUE INDEX idx_profiles_user ON profiles (user)"] | unique)}')"
api -X PATCH "$PB_URL/api/collections/$PROFILE_ID" -H 'Content-Type: application/json' \
  --data "$PROFILE_INDEXES" >/dev/null

MEASUREMENT_FIELDS="$(jq -cn --argjson owner "$OWNER_FIELD" \
  --argjson date "$(date_field measured_at true)" \
  --argjson weight '{"name":"weight_kg","type":"number","required":true,"min":1,"max":700}' \
  --argjson height '{"name":"height_cm","type":"number","required":true,"min":30,"max":300}' \
  --argjson waist '{"name":"waist_cm","type":"number","min":0,"max":400}' \
  '[$owner,$date,$weight,$height,$waist,
    {name:"created",type:"autodate",onCreate:true,onUpdate:false},
    {name:"updated",type:"autodate",onCreate:true,onUpdate:true}]')"
ensure_collection body_measurements base "$MEASUREMENT_FIELDS" \
  'owner = @request.auth.id' 'owner = @request.auth.id' 'owner = @request.auth.id' \
  'owner = @request.auth.id && (@request.body.owner:isset = false || @request.body.owner = @request.auth.id)' 'owner = @request.auth.id'

EXERCISE_FIELDS="$(jq -cn --argjson name "$(text_field name true)" \
  --argjson owner "$(relation_field owner _pb_users_auth_)" \
  --argjson category "$(select_field category '["compound","isolation","bodyweight","other"]' true)" \
  --argjson muscle "$(select_field muscle_group '["chest","back","shoulders","biceps","triceps","legs","glutes","core","full_body"]')" \
  --argjson equipment "$(jq -cn --argjson values '["barbell","dumbbell","kettlebell","machine","cable","bodyweight","band","other"]' '{name:"equipment_options",type:"select",required:false,maxSelect:8,values:$values}')" \
  --argjson active "$(bool_field active true)" '[$name,$category,$muscle,$equipment,$active,$owner]')"
EXERCISE_EDIT_RULE='owner = @request.auth.id || (owner = "" && @collection.profiles:admin.user ?= @request.auth.id && @collection.profiles:admin.role ?= "admin")'
ensure_collection exercises base "$EXERCISE_FIELDS" \
  '(owner = "" || owner = @request.auth.id)' '(owner = "" || owner = @request.auth.id)' 'owner = @request.auth.id' \
  "($EXERCISE_EDIT_RULE) && (@request.body.owner:isset = false || @request.body.owner = owner)" "$EXERCISE_EDIT_RULE"

PLAN_FIELDS="$(jq -cn --argjson owner "$OWNER_FIELD" \
  --argjson title "$(text_field title true)" \
  --argjson goal "$(text_field goal true)" \
  --argjson start "$(date_field start_date true)" \
  --argjson end "$(date_field end_date true)" \
  --argjson weeks "$(number_field weeks true)" \
  --argjson summary "$(text_field summary)" \
  --argjson mode "$(select_field schedule_mode '["fixed_weekdays","flexible_cycle"]')" \
  --argjson cycle_days "$(number_field cycle_days)" --argjson cycles "$(number_field cycles)" \
  --argjson pattern "$(text_field cycle_pattern)" \
  '[$owner,$title,$goal,$start,$end,$weeks,$summary,$mode,$cycle_days,$cycles,$pattern]')"
ensure_collection training_plans base "$PLAN_FIELDS" \
  'owner = @request.auth.id' 'owner = @request.auth.id' 'owner = @request.auth.id' "owner = @request.auth.id && (@request.body.owner:isset = false || @request.body.owner = @request.auth.id)" 'owner = @request.auth.id'

AI_SETTINGS_FIELDS="$(jq -cn --argjson owner "$OWNER_FIELD" \
  --argjson endpoint "$(text_field endpoint true)" \
  --argjson model "$(text_field model true)" \
  --argjson key "$(secret_field api_key)" \
  --argjson key_set "$(bool_field api_key_set)" \
  '[$owner,$endpoint,$model,$key,$key_set]')"
ensure_collection ai_settings base "$AI_SETTINGS_FIELDS" \
  'owner = @request.auth.id' 'owner = @request.auth.id' 'owner = @request.auth.id' "owner = @request.auth.id && (@request.body.owner:isset = false || @request.body.owner = @request.auth.id)" 'owner = @request.auth.id'

STRAVA_FIELDS="$(jq -cn --argjson owner "$OWNER_FIELD" \
  --argjson athlete "$(text_field athlete_id)" --argjson name "$(text_field athlete_name)" \
  --argjson access "$(secret_field access_token)" --argjson refresh "$(secret_field refresh_token)" \
  --argjson expires "$(number_field expires_at)" --argjson synced "$(date_field last_synced_at)" \
  '[$owner,$athlete,$name,$access,$refresh,$expires,$synced]')"
# Alleen toegankelijk via de server-hooks (rules "__locked__" = geen API-toegang).
ensure_collection strava_connections base "$STRAVA_FIELDS" \
  __locked__ __locked__ __locked__ __locked__ __locked__

APP_CONFIG_FIELDS="$(jq -cn --argjson key "$(text_field key true)" \
  --argjson client_id "$(text_field strava_client_id)" \
  --argjson client_secret "$(secret_field strava_client_secret)" \
  '[$key,$client_id,$client_secret]')"
# App-brede sleutels zijn uitsluitend via server-hooks beschikbaar.
ensure_collection app_config base "$APP_CONFIG_FIELDS" \
  __locked__ __locked__ __locked__ __locked__ __locked__
APP_CONFIG_ID="$(collection_id app_config)"
APP_CONFIG_INDEXES="$(api "$PB_URL/api/collections/$APP_CONFIG_ID" | jq -c \
  '{indexes: ((.indexes // []) + ["CREATE UNIQUE INDEX idx_app_config_key ON app_config (key)"] | unique)}')"
api -X PATCH "$PB_URL/api/collections/$APP_CONFIG_ID" -H 'Content-Type: application/json' \
  --data "$APP_CONFIG_INDEXES" >/dev/null

CALENDAR_FIELDS="$(jq -cn --argjson owner "$OWNER_FIELD" \
  --argjson token "$(secret_field token)" \
  '[$owner,$token]')"
# Alleen toegankelijk via de server-hooks (geheim agenda-token per gebruiker).
ensure_collection calendar_feeds base "$CALENDAR_FIELDS" \
  __locked__ __locked__ __locked__ __locked__ __locked__

PLAN_ID="$(collection_id training_plans)"
EXERCISE_ID="$(collection_id exercises)"
TEMPLATE_FIELDS="$(jq -cn --argjson owner "$OWNER_FIELD" \
  --argjson title "$(text_field title true)" \
  --argjson type "$(select_field type '["strength","cardio","interval","recovery","sport","life"]' true)" \
  --argjson duration "$(number_field duration_minutes)" --argjson notes "$(text_field notes)" \
  --argjson cardio "$(select_field cardio_mode '["running","cycling","rowing","swimming","walking","hiking","other"]')" \
  --argjson distance "$(number_field distance_km)" \
  --argjson interval_work "$(number_field interval_work_seconds)" --argjson interval_rest "$(number_field interval_rest_seconds)" \
  --argjson rounds "$(number_field interval_rounds)" \
  --argjson recovery "$(select_field recovery_activity '["rest","mobility","yoga","walking","stretching","other"]')" \
  --argjson sport "$(select_field sport_activity '["indoor_volleyball","beach_volleyball","pickleball","football","tennis","basketball"]')" \
  --argjson level "$(select_field level '["beginner","intermediate","advanced"]')" \
  --argjson goal "$(text_field goal)" --argjson tags "$(text_field tags)" \
  '[$owner,$title,$type,$duration,$notes,$cardio,$distance,$interval_work,$interval_rest,$rounds,$recovery,$sport,$level,$goal,$tags]')"
ensure_collection workout_templates base "$TEMPLATE_FIELDS" \
  'owner = @request.auth.id' 'owner = @request.auth.id' 'owner = @request.auth.id' "owner = @request.auth.id && (@request.body.owner:isset = false || @request.body.owner = @request.auth.id)" 'owner = @request.auth.id'

TEMPLATE_ID="$(collection_id workout_templates)"
TEMPLATE_EXERCISE_FIELDS="$(jq -cn --argjson owner "$OWNER_FIELD" \
  --argjson template "$(relation_field template "$TEMPLATE_ID" true)" \
  --argjson exercise "$(relation_field exercise "$EXERCISE_ID" true)" \
  --argjson order "$(number_field set_order true)" --argjson sets "$(number_field target_sets true)" \
  --argjson min "$(number_field reps_min true)" --argjson max "$(number_field reps_max true)" \
  --argjson start "$(number_field starting_weight)" --argjson increment "$(number_field weight_increment true)" \
  --argjson rest "$(number_field rest_seconds)" --argjson tempo "$(text_field tempo)" \
  --argjson equipment "$(select_field equipment '["barbell","dumbbell","kettlebell","machine","cable","bodyweight","band","other"]')" \
  '[$owner,$template,$exercise,$order,$sets,$min,$max,$start,$increment,$equipment,$rest,$tempo]')"
ensure_collection template_exercises base "$TEMPLATE_EXERCISE_FIELDS" \
  'owner = @request.auth.id' 'owner = @request.auth.id' 'owner = @request.auth.id' "owner = @request.auth.id && (@request.body.owner:isset = false || @request.body.owner = @request.auth.id)" 'owner = @request.auth.id'
WORKOUT_FIELDS="$(jq -cn --argjson owner "$OWNER_FIELD" \
  --argjson day_part "$(select_field day_part '["morning","afternoon","evening"]')" \
  --argjson plan "$(relation_field plan "$PLAN_ID")" \
  --argjson template "$(relation_field template "$TEMPLATE_ID")" \
  --argjson due "$(date_field due_date)" \
  --argjson title "$(text_field title true)" \
  --argjson type "$(select_field type '["strength","cardio","interval","recovery","sport","life"]' true)" \
  --argjson status "$(select_field status '["planned","in_progress","completed","skipped"]' true)" \
  --argjson date "$(jq -cn '{name:"performed_at",type:"date",required:true}')" \
  --argjson duration "$(number_field duration_minutes)" --argjson notes "$(text_field notes)" \
  --argjson cardio "$(select_field cardio_mode '["running","cycling","rowing","swimming","walking","hiking","other"]')" \
  --argjson distance "$(number_field distance_km)" --argjson heart "$(number_field average_heart_rate)" \
  --argjson interval_work "$(number_field interval_work_seconds)" --argjson interval_rest "$(number_field interval_rest_seconds)" \
  --argjson rounds "$(number_field interval_rounds)" \
  --argjson recovery "$(select_field recovery_activity '["rest","mobility","yoga","walking","stretching","other"]')" \
  --argjson sport "$(select_field sport_activity '["indoor_volleyball","beach_volleyball","pickleball","football","tennis","basketball"]')" \
  --argjson effort "$(number_field perceived_effort)" --argjson series "$(text_field series_id)" \
  --argjson strava "$(text_field strava_id)" --argjson elevation "$(number_field elevation_gain_m)" \
  '[$owner,$plan,$title,$type,$status,$date,$duration,$notes,$cardio,$distance,$heart,$interval_work,$interval_rest,$rounds,$recovery,$sport,$effort,$series,$strava,$elevation,$template,$due,$day_part]')"
ensure_collection workouts base "$WORKOUT_FIELDS" \
  'owner = @request.auth.id' 'owner = @request.auth.id' 'owner = @request.auth.id' "owner = @request.auth.id && (@request.body.owner:isset = false || @request.body.owner = @request.auth.id)" 'owner = @request.auth.id'

WORKOUT_ID="$(collection_id workouts)"
WORKOUT_EXERCISE_FIELDS="$(jq -cn --argjson owner "$OWNER_FIELD" \
  --argjson workout "$(relation_field workout "$WORKOUT_ID" true)" \
  --argjson exercise "$(relation_field exercise "$EXERCISE_ID" true)" \
  --argjson order "$(number_field set_order true)" --argjson sets "$(number_field target_sets true)" \
  --argjson min "$(number_field reps_min true)" --argjson max "$(number_field reps_max true)" \
  --argjson start "$(number_field starting_weight)" --argjson increment "$(number_field weight_increment true)" \
  --argjson rest "$(number_field rest_seconds)" --argjson tempo "$(text_field tempo)" \
  --argjson equipment "$(select_field equipment '["barbell","dumbbell","kettlebell","machine","cable","bodyweight","band","other"]')" \
  '[$owner,$workout,$exercise,$order,$sets,$min,$max,$start,$increment,$equipment,$rest,$tempo]')"
ensure_collection workout_exercises base "$WORKOUT_EXERCISE_FIELDS" \
  'owner = @request.auth.id' 'owner = @request.auth.id' 'owner = @request.auth.id' "owner = @request.auth.id && (@request.body.owner:isset = false || @request.body.owner = @request.auth.id)" 'owner = @request.auth.id'

WORKOUT_EXERCISE_ID="$(collection_id workout_exercises)"
SET_FIELDS="$(jq -cn --argjson owner "$OWNER_FIELD" \
  --argjson workout_exercise "$(relation_field workout_exercise "$WORKOUT_EXERCISE_ID" true)" \
  --argjson order "$(number_field set_order true)" --argjson reps "$(number_field reps)" \
  --argjson weight "$(number_field weight)" --argjson completed "$(bool_field completed)" \
  '[$owner,$workout_exercise,$order,$reps,$weight,$completed]')"
ensure_collection workout_sets base "$SET_FIELDS" \
  'owner = @request.auth.id' 'owner = @request.auth.id' 'owner = @request.auth.id' "owner = @request.auth.id && (@request.body.owner:isset = false || @request.body.owner = @request.auth.id)" 'owner = @request.auth.id'

HEALTH_PROGRAM_FIELDS="$(jq -cn --argjson owner "$OWNER_FIELD" \
  --argjson kind "$(select_field kind '["omad","16_8","12_12"]' true)" \
  --argjson title "$(text_field title true)" \
  --argjson start "$(text_field start_date true)" \
  --argjson meal_time "$(text_field meal_time)" \
  --argjson calories "$(number_field calories)" --argjson protein "$(number_field protein_g)" \
  --argjson plan "$(text_field meal_plan)" --argjson active "$(bool_field active)" \
  '[$owner,$kind,$title,$start,$meal_time,$calories,$protein,$plan,$active]')"
ensure_collection health_programs base "$HEALTH_PROGRAM_FIELDS" \
  'owner = @request.auth.id' 'owner = @request.auth.id' 'owner = @request.auth.id' "owner = @request.auth.id && (@request.body.owner:isset = false || @request.body.owner = @request.auth.id)" 'owner = @request.auth.id'

HEALTH_PROGRAM_ID="$(collection_id health_programs)"
HEALTH_CHECKIN_FIELDS="$(jq -cn --argjson owner "$OWNER_FIELD" \
  --argjson program "$(relation_field program "$HEALTH_PROGRAM_ID" true)" \
  --argjson date "$(text_field date true)" \
  --argjson fasted "$(bool_field fasted)" --argjson note "$(text_field note)" \
  '[$owner,$program,$date,$fasted,$note]')"
ensure_collection health_checkins base "$HEALTH_CHECKIN_FIELDS" \
  'owner = @request.auth.id' 'owner = @request.auth.id' 'owner = @request.auth.id' "owner = @request.auth.id && (@request.body.owner:isset = false || @request.body.owner = @request.auth.id)" 'owner = @request.auth.id'

ensure_select_values workout_templates level '["beginner","intermediate","advanced"]'
ensure_select_values training_plans schedule_mode '["fixed_weekdays","flexible_cycle"]'
ensure_select_values workouts type '["strength","cardio","interval","recovery","sport","life"]'
ensure_select_values workouts sport_activity '["indoor_volleyball","beach_volleyball","pickleball","football","tennis","basketball"]'
ensure_select_values workout_templates sport_activity '["indoor_volleyball","beach_volleyball","pickleball","football","tennis","basketball"]'
ensure_select_values workouts status '["planned","in_progress","completed","skipped"]'
ensure_select_values exercises category '["compound","isolation","bodyweight","other"]'
ensure_select_values exercises muscle_group '["chest","back","shoulders","biceps","triceps","legs","glutes","core","full_body"]'
ensure_select_values health_programs kind '["omad","16_8","12_12"]'
ensure_select_values exercises equipment_options '["barbell","dumbbell","kettlebell","machine","cable","bodyweight","band","other"]'

# Read the first page repeatedly: updated records no longer match the filter.
for collection in workout_templates workouts; do
  while true; do
    records="$(api --get \
      --data-urlencode 'filter=(type="recovery" && recovery_activity="walking") || ((type="cardio" || type="interval") && (cardio_mode="walking" || cardio_mode="hiking"))' \
      --data-urlencode perPage=100 "$PB_URL/api/collections/$collection/records")"
    [ "$(printf '%s' "$records" | jq '.items | length')" -gt 0 ] || break
    while IFS= read -r record; do
      id="$(printf '%s' "$record" | jq -r '.id')"
      payload="$(printf '%s' "$record" | jq -c '{
        type:"life",
        cardio_mode:(if .type == "recovery" then "walking" else .cardio_mode end),
        recovery_activity:""
      }')"
      api -X PATCH "$PB_URL/api/collections/$collection/records/$id" \
        -H 'Content-Type: application/json' --data "$payload" >/dev/null
    done < <(printf '%s' "$records" | jq -c '.items[]')
  done
  ensure_select_values "$collection" recovery_activity '["rest","mobility","yoga","stretching","other"]'
done

seed_exercise() {
  local name="$1" category="$2" muscle="$3" equipment="$4"
  local existing exercise_collection_id payload
  exercise_collection_id="$(collection_id exercises)"
  existing="$(api --get --data-urlencode "filter=name=\"$name\" && owner=\"\"" --data-urlencode perPage=1 \
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
seed_exercise "Front raise" isolation shoulders dumbbell,cable
seed_exercise "Pike push-up" compound shoulders bodyweight
seed_exercise "Dips" compound triceps bodyweight,machine
seed_exercise "Upright row" compound shoulders dumbbell,cable,barbell
seed_exercise "Rear delt fly" isolation shoulders dumbbell,machine,cable
seed_exercise "Cable cross rear delt pull" isolation shoulders cable
seed_exercise "Inverted row" compound back bodyweight,barbell
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
  old_id="$(api --get --data-urlencode "filter=name=\"$old_name\" && owner=\"\"" --data-urlencode perPage=1 \
    "$PB_URL/api/collections/$exercises_id/records" | jq -r '.items[0].id // empty')"
  [ -n "$old_id" ] || return 0
  new_id="$(api --get --data-urlencode "filter=name=\"$new_name\" && owner=\"\"" --data-urlencode perPage=1 \
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

ensure_google_oauth() {
  local users_id payload
  users_id="$(collection_id users)"
  if [ -n "$GOOGLE_CLIENT_ID" ]; then
    payload="$(jq -n --arg id "$GOOGLE_CLIENT_ID" --arg secret "$GOOGLE_CLIENT_SECRET" \
      '{oauth2:{enabled:true,providers:[{name:"google",clientId:$id,clientSecret:$secret}]}}')"
    echo "Ensuring Google OAuth provider."
  else
    payload='{"oauth2":{"enabled":false,"providers":[]}}'
    echo "Google OAuth not configured; disabled."
  fi
  api -X PATCH "$PB_URL/api/collections/$users_id" -H 'Content-Type: application/json' --data "$payload" >/dev/null
}

# Standaard bouwblokken voor de bibliotheek van het app-adminaccount (alleen als die nog leeg is).
seed_template() { # title type duration level goal tags notes extra-json
  local owner="$1" payload
  payload="$(jq -n --arg o "$owner" --arg t "$2" --arg ty "$3" --argjson d "$4" --arg l "$5" --arg g "$6" --arg tags "$7" --arg n "$8" --argjson x "$9" \
    '{owner:$o,title:$t,type:$ty,duration_minutes:$d,level:$l,goal:$g,tags:$tags,notes:$n} + $x')"
  api -X POST "$PB_URL/api/collections/$(collection_id workout_templates)/records" \
    -H 'Content-Type: application/json' --data "$payload" | jq -er '.id'
}

seed_template_exercise() { # owner template exercise-name order sets min max weight increment equipment
  local exercise_id payload
  exercise_id="$(api --get --data-urlencode "filter=name=\"$3\" && owner=\"\"" --data-urlencode perPage=1 \
    "$PB_URL/api/collections/$(collection_id exercises)/records" | jq -er '.items[0].id')"
  payload="$(jq -n --arg o "$1" --arg t "$2" --arg e "$exercise_id" --argjson ord "$4" --argjson s "$5" --argjson mn "$6" --argjson mx "$7" \
    --argjson w "$8" --argjson inc "$9" --arg eq "${10}" \
    '{owner:$o,template:$t,exercise:$e,set_order:$ord,target_sets:$s,reps_min:$mn,reps_max:$mx,starting_weight:$w,weight_increment:$inc,equipment:$eq,rest_seconds:90,tempo:"3-1-1-0"}')"
  api -X POST "$PB_URL/api/collections/$(collection_id template_exercises)/records" \
    -H 'Content-Type: application/json' --data "$payload" >/dev/null
}

seed_library() {
  [ -n "$PB_ADMIN_USER_EMAIL" ] || return 0
  local owner tid
  owner="$(api --get --data-urlencode "filter=email=\"$PB_ADMIN_USER_EMAIL\"" --data-urlencode perPage=1 \
    "$PB_URL/api/collections/$(collection_id users)/records" | jq -er '.items[0].id')"
  if [ "$(api --get --data-urlencode "filter=owner=\"$owner\"" --data-urlencode perPage=1 \
    "$PB_URL/api/collections/$(collection_id workout_templates)/records" | jq '.totalItems')" -gt 0 ]; then
    echo "Bibliotheek heeft al bouwblokken, overslaan."
    return 0
  fi

  tid="$(seed_template "$owner" "Upper body" strength 60 intermediate "Spiermassa" "bovenlichaam,duwen,trekken" "Standaard bovenlichaamtraining." '{}')"
  seed_template_exercise "$owner" "$tid" "Bench press" 1 3 6 10 40 2.5 barbell
  seed_template_exercise "$owner" "$tid" "Row" 2 3 8 12 30 2.5 barbell
  seed_template_exercise "$owner" "$tid" "Overhead press" 3 3 8 12 20 2.5 dumbbell
  seed_template_exercise "$owner" "$tid" "Lat pulldown" 4 3 8 12 40 2.5 cable
  seed_template_exercise "$owner" "$tid" "Curl" 5 2 10 15 10 1 dumbbell
  seed_template_exercise "$owner" "$tid" "Tricep pushdown" 6 2 10 15 20 2.5 cable

  tid="$(seed_template "$owner" "Lower body" strength 60 intermediate "Kracht" "onderlichaam,benen" "Standaard onderlichaamtraining." '{}')"
  seed_template_exercise "$owner" "$tid" "Squat" 1 4 5 8 60 2.5 barbell
  seed_template_exercise "$owner" "$tid" "Romanian deadlift" 2 3 8 12 50 2.5 barbell
  seed_template_exercise "$owner" "$tid" "Lunge" 3 3 10 12 12 2 dumbbell
  seed_template_exercise "$owner" "$tid" "Leg curl" 4 3 10 15 30 2.5 machine
  seed_template_exercise "$owner" "$tid" "Calf raise" 5 3 12 20 40 5 machine

  tid="$(seed_template "$owner" "Full body kettlebell" strength 45 beginner "Conditie en kracht" "full body,kettlebell" "Compacte training met één kettlebell." '{}')"
  seed_template_exercise "$owner" "$tid" "Swing" 1 4 10 15 16 2 kettlebell
  seed_template_exercise "$owner" "$tid" "Clean and press" 2 3 6 8 12 2 kettlebell
  seed_template_exercise "$owner" "$tid" "Turkish get-up" 3 2 3 5 8 2 kettlebell

  seed_template "$owner" "10K hardlopen" cardio 60 intermediate "Duurconditie" "hardlopen,duur" "Rustig tempo, praatsnelheid." '{"cardio_mode":"running","distance_km":10}' >/dev/null
  seed_template "$owner" "5K hardlopen" cardio 30 beginner "Conditie" "hardlopen" "Rustig opbouwen." '{"cardio_mode":"running","distance_km":5}' >/dev/null
  seed_template "$owner" "Fietstocht 30 km" cardio 75 beginner "Duurconditie" "fietsen,duur" "Constant tempo." '{"cardio_mode":"cycling","distance_km":30}' >/dev/null
  seed_template "$owner" "Intervallen 8 × 30/60" interval 30 intermediate "Snelheid en VO2max" "interval,hardlopen" "8 rondes: 30 sec hard, 60 sec rustig." '{"cardio_mode":"running","interval_work_seconds":30,"interval_rest_seconds":60,"interval_rounds":8}' >/dev/null
  seed_template "$owner" "Mobiliteit" recovery 20 beginner "Herstel" "mobiliteit,herstel" "Rustige mobiliteitsoefeningen." '{"recovery_activity":"mobility"}' >/dev/null
  seed_template "$owner" "Wandelen herstel" life 40 beginner "Life" "wandelen,life" "Rustig wandelen." '{"cardio_mode":"walking"}' >/dev/null
  seed_template "$owner" "Hiking" life 90 beginner "Life" "hiking,life" "Een wandeling in de natuur." '{"cardio_mode":"hiking"}' >/dev/null
  echo "Standaard bouwblokken toegevoegd aan de bibliotheek."
}


ensure_google_oauth
api -X PATCH "$PB_URL/api/collections/$(collection_id users)" -H 'Content-Type: application/json' \
  --data '{"listRule":"@request.auth.id != \"\" && id = @request.auth.id","viewRule":"@request.auth.id != \"\" && id = @request.auth.id","createRule":"","updateRule":"@request.auth.id != \"\" && id = @request.auth.id","deleteRule":null,"manageRule":null}' >/dev/null
ensure_admin_user
seed_library

echo "PocketBase collections are ready."
