var API = "https://www.strava.com/api/v3";
var RUN_TYPES = { Run: true, TrailRun: true, VirtualRun: true };
var DAY_MS = 86400000;

function config(app) {
  var records = app.findRecordsByFilter("app_config", "key = {:key}", "", 1, 0, { key: "global" });
  var record = records.length ? records[0] : null;
  return {
    clientId: record ? record.getString("strava_client_id") : "",
    clientSecret: record ? record.getString("strava_client_secret") : "",
  };
}

function isConfigured(app) {
  var c = config(app);
  return !!(c.clientId && c.clientSecret);
}

function saveConfig(app, clientId, clientSecret) {
  var records = app.findRecordsByFilter("app_config", "key = {:key}", "", 1, 0, { key: "global" });
  var record = records.length ? records[0] : new Record(app.findCollectionByNameOrId("app_config"));
  record.set("key", "global");
  record.set("strava_client_id", clientId);
  if (clientSecret) record.set("strava_client_secret", clientSecret);
  app.save(record);
  return record;
}

function form(values) {
  return Object.keys(values)
    .map(function (key) {
      return encodeURIComponent(key) + "=" + encodeURIComponent(values[key]);
    })
    .join("&");
}

function tokenRequest(app, values) {
  var c = config(app);
  if (!isConfigured(app)) throw new BadRequestError("Strava is not configured.");
  values.client_id = c.clientId;
  values.client_secret = c.clientSecret;
  var res = $http.send({
    url: "https://www.strava.com/oauth/token",
    method: "POST",
    body: form(values),
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    timeout: 30,
  });
  if (res.statusCode !== 200 || !res.json) {
    throw new BadRequestError("Strava authorization failed (HTTP " + res.statusCode + ").");
  }
  return res.json;
}

function findConnection(app, ownerId) {
  try {
    return app.findFirstRecordByFilter("strava_connections", "owner = {:owner}", { owner: ownerId });
  } catch (_) {
    return null;
  }
}

function storeTokens(app, record, token) {
  record.set("access_token", token.access_token);
  record.set("refresh_token", token.refresh_token);
  record.set("expires_at", token.expires_at);
  app.save(record);
}

function accessToken(app, record) {
  if (record.getInt("expires_at") > Math.floor(Date.now() / 1000) + 120) {
    return record.getString("access_token");
  }
  var token = tokenRequest(app, { grant_type: "refresh_token", refresh_token: record.getString("refresh_token") });
  storeTokens(app, record, token);
  return token.access_token;
}

function connect(app, ownerId, code) {
  var token = tokenRequest(app, { grant_type: "authorization_code", code: code });
  var record = findConnection(app, ownerId);
  if (!record) {
    record = new Record(app.findCollectionByNameOrId("strava_connections"));
    record.set("owner", ownerId);
  }
  record.set("athlete_id", token.athlete ? String(token.athlete.id) : "");
  record.set(
    "athlete_name",
    token.athlete ? ((token.athlete.firstname || "") + " " + (token.athlete.lastname || "")).trim() : ""
  );
  record.set("last_synced_at", "");
  storeTokens(app, record, token);
  return record;
}

function activityFields(activity) {
  var moving = Number(activity.moving_time) || 0;
  var fields = {
    strava_id: String(activity.id),
    distance_km: Math.round((Number(activity.distance) || 0) / 10) / 100,
    duration_minutes: Math.round((moving / 60) * 10) / 10,
    elevation_gain_m: Math.round(Number(activity.total_elevation_gain) || 0),
  };
  if (activity.average_heartrate) fields.average_heart_rate = Math.round(activity.average_heartrate);
  return fields;
}

function findExisting(app, ownerId, stravaId) {
  try {
    return app.findFirstRecordByFilter("workouts", "owner = {:owner} && strava_id = {:id}", {
      owner: ownerId,
      id: stravaId,
    });
  } catch (_) {
    return null;
  }
}

// Finds an unlinked planned running workout on the same local day.
function findPlanned(app, ownerId, activity) {
  var start = new Date(activity.start_date).getTime();
  var offset = new Date(activity.start_date_local).getTime() - start;
  var day = activity.start_date_local.substring(0, 10);
  var candidates = app.findRecordsByFilter(
    "workouts",
    "owner = {:owner} && strava_id = '' && (status = 'planned' || status = 'in_progress') && cardio_mode = 'running' && (type = 'cardio' || type = 'interval') && performed_at >= {:from} && performed_at <= {:to}",
    "performed_at",
    20,
    0,
    {
      owner: ownerId,
      from: new Date(start - 36 * 3600000).toISOString().replace("T", " "),
      to: new Date(start + 36 * 3600000).toISOString().replace("T", " "),
    }
  );
  for (var i = 0; i < candidates.length; i++) {
    var performed = new Date(candidates[i].getString("performed_at").replace(" ", "T")).getTime();
    if (new Date(performed + offset).toISOString().substring(0, 10) === day) return candidates[i];
  }
  return null;
}

function upsertActivity(app, ownerId, activity) {
  var fields = activityFields(activity);
  var record = findExisting(app, ownerId, fields.strava_id);
  var result = "updated";
  if (!record) {
    record = findPlanned(app, ownerId, activity);
    result = record ? "linked" : "created";
    if (!record) {
      record = new Record(app.findCollectionByNameOrId("workouts"));
      record.set("owner", ownerId);
      record.set("title", activity.name || "Hardlopen");
      record.set("type", "cardio");
      record.set("cardio_mode", "running");
      record.set("notes", "Imported from Strava");
    }
    record.set("status", "completed");
    record.set("performed_at", activity.start_date);
  }
  for (var key in fields) record.set(key, fields[key]);
  app.save(record);
  return result;
}

function fetchActivities(token, after) {
  var all = [];
  for (var page = 1; page <= 10; page++) {
    var res = $http.send({
      url: API + "/athlete/activities?per_page=100&page=" + page + "&after=" + after,
      method: "GET",
      headers: { Authorization: "Bearer " + token },
      timeout: 30,
    });
    if (res.statusCode === 401) throw new BadRequestError("Strava access has expired. Reconnect Strava.");
    if (res.statusCode === 429) throw new BadRequestError("Strava rate limit reached. Try again later.");
    if (res.statusCode !== 200 || !Array.isArray(res.json)) {
      throw new BadRequestError("Could not fetch Strava activities (HTTP " + res.statusCode + ").");
    }
    all = all.concat(res.json);
    if (res.json.length < 100) break;
  }
  return all;
}

function sync(app, record) {
  var ownerId = record.getString("owner");
  var token = accessToken(app, record);
  var last = record.getString("last_synced_at");
  var base = last ? new Date(last.replace(" ", "T")).getTime() - 7 * DAY_MS : Date.now() - 90 * DAY_MS;
  var startedAt = new Date().toISOString();
  var activities = fetchActivities(token, Math.floor(base / 1000));
  var counts = { created: 0, linked: 0, updated: 0 };
  activities.forEach(function (activity) {
    var type = activity.sport_type || activity.type;
    if (!RUN_TYPES[type] || !activity.start_date || !activity.start_date_local) return;
    counts[upsertActivity(app, ownerId, activity)] += 1;
  });
  record.set("last_synced_at", startedAt.replace("T", " "));
  app.save(record);
  return counts;
}

module.exports = {
  config: config,
  isConfigured: isConfigured,
  saveConfig: saveConfig,
  findConnection: findConnection,
  connect: connect,
  sync: sync,
};
