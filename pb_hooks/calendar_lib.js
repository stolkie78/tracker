var COLLECTION = "calendar_feeds";
var TYPE_LABELS = { strength: "Strength", cardio: "Cardio", interval: "Interval", recovery: "Recovery" };
var STATUS_LABELS = { planned: "Planned", in_progress: "In progress", completed: "Completed" };

function randomToken() {
  return $security.randomString(40);
}

function findFeed(app, ownerId) {
  try {
    return app.findFirstRecordByData(COLLECTION, "owner", ownerId);
  } catch (err) {
    return null;
  }
}

function findFeedByToken(app, token) {
  if (!token || token.length < 32) return null;
  try {
    return app.findFirstRecordByData(COLLECTION, "token", token);
  } catch (err) {
    return null;
  }
}

function ensureFeed(app, ownerId, rotate) {
  var record = findFeed(app, ownerId);
  if (!record) {
    record = new Record(app.findCollectionByNameOrId(COLLECTION));
    record.set("owner", ownerId);
  } else if (!rotate) {
    return record;
  }
  record.set("token", randomToken());
  app.save(record);
  return record;
}

function appUrl(e) {
  var configured = ($os.getenv("APP_URL") || "").replace(/\/+$/, "");
  if (configured) return configured;
  var proto = e.request.header.get("X-Forwarded-Proto") || (e.request.tls ? "https" : "http");
  return proto + "://" + e.request.host;
}

function feedUrl(e, token) {
  return appUrl(e) + "/api/top-trainer/calendar/" + token + "/timeline.ics";
}

function escapeText(value) {
  return String(value || "")
    .replace(/\\/g, "\\\\")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,")
    .replace(/\r?\n/g, "\\n");
}

function fold(line) {
  var out = [];
  while (line.length > 74) {
    out.push(line.substring(0, 74));
    line = " " + line.substring(74);
  }
  out.push(line);
  return out.join("\r\n");
}

function stamp(date) {
  return date.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
}

function parseDate(value) {
  var iso = String(value).replace(" ", "T");
  return new Date(/Z$/.test(iso) ? iso : iso + "Z");
}

function detailLines(w) {
  var lines = [];
  var type = w.getString("type");
  lines.push((TYPE_LABELS[type] || type) + " - " + (STATUS_LABELS[w.getString("status")] || w.getString("status")));
  var part = { morning: "Morning", afternoon: "Afternoon", evening: "Evening" }[w.getString("day_part")];
  if (part) lines.push("Day part: " + part);
  if (type === "cardio" && w.getFloat("distance_km")) lines.push("Distance: " + w.getFloat("distance_km") + " km");
  if (type === "interval" && w.getInt("interval_rounds")) {
    lines.push(
      w.getInt("interval_rounds") + " x " + w.getInt("interval_work_seconds") + "s work / " + w.getInt("interval_rest_seconds") + "s rest"
    );
  }
  if (w.getString("notes")) lines.push(w.getString("notes"));
  return lines;
}

function buildCalendar(app, base, ownerId) {
  var from = new Date(Date.now() - 90 * 86400000).toISOString().replace("T", " ");
  var workouts = app.findRecordsByFilter(
    "workouts",
    "owner = {:owner} && status != 'skipped' && performed_at >= {:from}",
    "performed_at",
    1000,
    0,
    { owner: ownerId, from: from }
  );
  var now = stamp(new Date());
  var lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//T.O.P. Trainer//Timeline//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "X-WR-CALNAME:T.O.P. Trainer",
    "REFRESH-INTERVAL;VALUE=DURATION:PT1H",
    "X-PUBLISHED-TTL:PT1H",
  ];
  workouts.forEach(function (w) {
    var start = parseDate(w.getString("performed_at"));
    if (isNaN(start.getTime())) return;
    var minutes = w.getInt("duration_minutes") || 45;
    var end = new Date(start.getTime() + minutes * 60000);
    var link = base + "/workouts/" + w.id;
    var description = detailLines(w).concat(["", "Start workout: " + link]).join("\n");
    var summary = (w.getString("status") === "completed" ? "✓ " : "") + w.getString("title");
    [
      "BEGIN:VEVENT",
      "UID:" + w.id + "@top-trainer",
      "DTSTAMP:" + now,
      "DTSTART:" + stamp(start),
      "DTEND:" + stamp(end),
      "SUMMARY:" + escapeText(summary),
      "DESCRIPTION:" + escapeText(description),
      "URL:" + link,
      "CATEGORIES:" + escapeText(TYPE_LABELS[w.getString("type")] || w.getString("type")),
      "END:VEVENT",
    ].forEach(function (l) {
      lines.push(l);
    });
  });
  lines.push("END:VCALENDAR");
  return lines.map(fold).join("\r\n") + "\r\n";
}

module.exports = {
  ensureFeed: ensureFeed,
  findFeedByToken: findFeedByToken,
  feedUrl: feedUrl,
  appUrl: appUrl,
  buildCalendar: buildCalendar,
};
