routerAdd(
  "GET",
  "/api/top-trainer/calendar",
  function (e) {
    var lib = require(`${__hooks}/calendar_lib.js`);
    var record = lib.ensureFeed(e.app, e.auth.id, false);
    return e.json(200, { url: lib.feedUrl(e, record.getString("token")) });
  },
  $apis.requireAuth()
);

routerAdd(
  "POST",
  "/api/top-trainer/calendar/reset",
  function (e) {
    var lib = require(`${__hooks}/calendar_lib.js`);
    var record = lib.ensureFeed(e.app, e.auth.id, true);
    return e.json(200, { url: lib.feedUrl(e, record.getString("token")) });
  },
  $apis.requireAuth()
);

// Publiek, maar alleen bereikbaar met het geheime token van de gebruiker.
routerAdd("GET", "/api/top-trainer/calendar/{token}/timeline.ics", function (e) {
  var lib = require(`${__hooks}/calendar_lib.js`);
  var feed = lib.findFeedByToken(e.app, e.request.pathValue("token"));
  if (!feed) throw new NotFoundError("Unknown calendar.");
  var body = lib.buildCalendar(e.app, lib.appUrl(e), feed.getString("owner"));
  e.response.header().set("Content-Type", "text/calendar; charset=utf-8");
  e.response.header().set("Content-Disposition", 'inline; filename="top-trainer.ics"');
  e.response.header().set("Cache-Control", "private, max-age=300");
  return e.string(200, body);
});
