routerAdd(
  "GET",
  "/api/top-trainer/strava",
  function (e) {
    var strava = require(`${__hooks}/strava_lib.js`);
    var record = strava.findConnection(e.app, e.auth.id);
    return e.json(200, {
      configured: strava.isConfigured(e.app),
      client_id: strava.config(e.app).clientId,
      connected: !!record,
      athlete_name: record ? record.getString("athlete_name") : "",
      last_synced_at: record ? record.getString("last_synced_at") : "",
    });
  },
  $apis.requireAuth()
);

routerAdd(
  "GET",
  "/api/top-trainer/strava-config",
  function (e) {
    var admins = e.app.findRecordsByFilter(
      "profiles",
      "user = {:user} && role = 'admin'",
      "",
      1,
      0,
      { user: e.auth.id }
    );
    if (!admins.length) throw new ForbiddenError("Alleen een beheerder kan Strava configureren.");
    var strava = require(`${__hooks}/strava_lib.js`);
    var config = strava.config(e.app);
    return e.json(200, {
      configured: strava.isConfigured(e.app),
      client_id: config.clientId,
      client_secret_set: !!config.clientSecret,
    });
  },
  $apis.requireAuth()
);

routerAdd(
  "POST",
  "/api/top-trainer/strava-config",
  function (e) {
    var admins = e.app.findRecordsByFilter(
      "profiles",
      "user = {:user} && role = 'admin'",
      "",
      1,
      0,
      { user: e.auth.id }
    );
    if (!admins.length) throw new ForbiddenError("Alleen een beheerder kan Strava configureren.");

    var body = e.requestInfo().body || {};
    var clientId = typeof body.client_id === "string" ? body.client_id.trim() : "";
    var clientSecret = typeof body.client_secret === "string" ? body.client_secret.trim() : "";
    var strava = require(`${__hooks}/strava_lib.js`);
    if (!clientId || clientId.length > 100 || clientSecret.length > 4096) {
      throw new BadRequestError("Vul een geldige Strava Client ID en Client Secret in.");
    }
    if (!clientSecret && !strava.isConfigured(e.app)) {
      throw new BadRequestError("Vul de Strava Client Secret in.");
    }
    var record = strava.saveConfig(e.app, clientId, clientSecret);
    return e.json(200, {
      configured: strava.isConfigured(e.app),
      client_id: record.getString("strava_client_id"),
      client_secret_set: !!record.getString("strava_client_secret"),
    });
  },
  $apis.requireAuth()
);

routerAdd(
  "POST",
  "/api/top-trainer/strava/connect",
  function (e) {
    var strava = require(`${__hooks}/strava_lib.js`);
    if (!strava.isConfigured(e.app)) throw new BadRequestError("Strava is niet geconfigureerd.");
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
  if (!strava.isConfigured($app)) return;
  $app.findAllRecords("strava_connections").forEach(function (record) {
    try {
      strava.sync($app, record);
    } catch (err) {
      console.log("Strava sync failed for " + record.getString("owner") + ": " + err);
    }
  });
});
