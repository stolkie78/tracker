routerAdd(
  "GET",
  "/api/top-trainer/strava",
  function (e) {
    var strava = require(`${__hooks}/strava_lib.js`);
    var record = strava.findConnection(e.app, e.auth.id);
    return e.json(200, {
      configured: strava.isConfigured(),
      client_id: strava.config().clientId,
      connected: !!record,
      athlete_name: record ? record.getString("athlete_name") : "",
      last_synced_at: record ? record.getString("last_synced_at") : "",
    });
  },
  $apis.requireAuth()
);

routerAdd(
  "POST",
  "/api/top-trainer/strava/connect",
  function (e) {
    var strava = require(`${__hooks}/strava_lib.js`);
    if (!strava.isConfigured()) throw new BadRequestError("Strava is niet geconfigureerd op de server.");
    var body = e.requestInfo().body || {};
    var code = typeof body.code === "string" ? body.code.trim() : "";
    if (!code || code.length > 256) throw new BadRequestError("Ongeldige Strava-code.");
    var record = strava.connect(e.app, e.auth.id, code);
    var counts = strava.sync(e.app, record);
    return e.json(200, { connected: true, athlete_name: record.getString("athlete_name"), counts: counts });
  },
  $apis.requireAuth()
);

routerAdd(
  "POST",
  "/api/top-trainer/strava/sync",
  function (e) {
    var strava = require(`${__hooks}/strava_lib.js`);
    var record = strava.findConnection(e.app, e.auth.id);
    if (!record) throw new BadRequestError("Strava is nog niet gekoppeld.");
    return e.json(200, { counts: strava.sync(e.app, record) });
  },
  $apis.requireAuth()
);

routerAdd(
  "DELETE",
  "/api/top-trainer/strava",
  function (e) {
    var strava = require(`${__hooks}/strava_lib.js`);
    var record = strava.findConnection(e.app, e.auth.id);
    if (record) e.app.delete(record);
    return e.json(200, { connected: false });
  },
  $apis.requireAuth()
);

cronAdd("strava_sync", "*/30 * * * *", function () {
  var strava = require(`${__hooks}/strava_lib.js`);
  if (!strava.isConfigured()) return;
  $app.findAllRecords("strava_connections").forEach(function (record) {
    try {
      strava.sync($app, record);
    } catch (err) {
      console.log("Strava sync failed for " + record.getString("owner") + ": " + err);
    }
  });
});
