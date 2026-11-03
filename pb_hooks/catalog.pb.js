routerAdd("POST", "/api/top-trainer/catalog", function (e) {
  var lib = require(__hooks + "/catalog_lib.js");
  var body = e.requestInfo().body || {};
  var name = typeof body.label === "string" ? body.label.trim() : "";
  var kind = body.kind;
  var allowed = { movement: ["cardio", "interval", "life"], recovery: ["recovery"], sport: ["sport"], wellness: ["wellness"], equipment: ["strength"] };
  if (!name || name.length > 80 || !Object.prototype.hasOwnProperty.call(allowed, kind)) {
    throw new BadRequestError("Enter a name of at most 80 characters and a valid entry type.");
  }
  if (!Array.isArray(body.categories) || !body.categories.length || body.categories.some(function (category) { return allowed[kind].indexOf(category) < 0; })) {
    throw new BadRequestError("Choose at least one valid category.");
  }
  if (typeof body.active !== "boolean") throw new BadRequestError("Choose whether the entry is active.");
  var result;
  e.app.runInTransaction(function (app) {
    var entry = body.id ? app.findRecordById("training_catalog", body.id) : new Record(app.findCollectionByNameOrId("training_catalog"));
    var source = null;
    if (body.id && body.personalize === true && !entry.getString("owner")) {
      source = entry;
      var overrides = app.findRecordsByFilter("training_catalog", "owner = {:owner} && kind = {:kind} && key = {:key}", "", 1, 0,
        { owner: e.auth.id, kind: source.getString("kind"), key: source.getString("key") });
      entry = overrides.length ? overrides[0] : new Record(app.findCollectionByNameOrId("training_catalog"));
      entry.set("owner", e.auth.id);
      entry.set("kind", source.getString("kind"));
      entry.set("key", source.getString("key"));
    }
    if (body.id) lib.requireEditable(app, entry, e.auth.id);
    else entry.set("owner", e.auth.id);
    if (body.id && entry.getString("kind") !== kind) throw new BadRequestError("The entry type cannot be changed.");
    var duplicates = app.findRecordsByFilter("training_catalog", "kind = {:kind} && label ~ {:label} && (owner = '' || owner = {:owner})", "", 0, 0, { kind: kind, label: name, owner: entry.getString("owner") });
    if (duplicates.some(function (item) { return item.id !== entry.id && item.getString("key") !== entry.getString("key") && item.getString("label").toLowerCase() === name.toLowerCase(); })) {
      throw new BadRequestError("An entry with this name already exists.");
    }
    if (!body.id) {
      entry.set("key", "custom_" + $security.randomString(16).toLowerCase());
      entry.set("kind", kind);
    }
    entry.set("label", name);
    entry.set("categories", body.categories);
    entry.set("active", body.active);
    lib.extendSchema(app, kind, entry.getString("key"));
    app.save(entry);
    result = entry;
  });
  return e.json(200, result);
}, $apis.requireAuth());

routerAdd("POST", "/api/top-trainer/catalog/exercises", function (e) {
  var lib = require(__hooks + "/catalog_lib.js");
  var body = e.requestInfo().body || {};
  if (typeof body.name !== "string" || !body.name.trim() || body.name.trim().length > 120 ||
      !Array.isArray(body.equipment_options) || !body.equipment_options.length ||
      body.equipment_options.length > 8 || typeof body.active !== "boolean") {
    throw new BadRequestError("Enter an exercise name and select between one and eight materials or machines.");
  }
  var result;
  e.app.runInTransaction(function (app) {
    var exercise = body.id ? app.findRecordById("exercises", body.id) : new Record(app.findCollectionByNameOrId("exercises"));
    var source = null;
    if (body.id && body.personalize === true && !exercise.getString("owner")) {
      source = exercise;
      var overrides = app.findRecordsByFilter("exercises", "owner = {:owner} && source_id = {:source}", "", 1, 0, { owner: e.auth.id, source: source.id });
      exercise = overrides.length ? overrides[0] : new Record(app.findCollectionByNameOrId("exercises"));
      exercise.set("owner", e.auth.id);
      exercise.set("source_id", source.id);
    }
    if (body.id) lib.requireEditable(app, exercise, e.auth.id);
    else exercise.set("owner", e.auth.id);
    var duplicates = app.findRecordsByFilter("exercises", "(owner = '' || owner = {:owner}) && name ~ {:name}", "", 0, 0, { name: body.name.trim(), owner: exercise.getString("owner") });
    if (duplicates.some(function (item) { return item.id !== exercise.id && item.id !== exercise.getString("source_id") && item.getString("name").toLowerCase() === body.name.trim().toLowerCase(); })) {
      throw new BadRequestError("An exercise with this name already exists.");
    }
    var previous = source && exercise.isNew() ? source.getStringSlice("equipment_options") : exercise.getStringSlice("equipment_options");
    body.equipment_options.forEach(function (key) {
      if (typeof key !== "string") throw new BadRequestError("Choose valid equipment.");
      lib.validateChoice(app, "equipment", key, "strength", previous.indexOf(key) >= 0 ? key : "", exercise.getString("owner"));
    });
    exercise.set("name", body.name.trim());
    exercise.set("category", body.category);
    exercise.set("muscle_group", body.muscle_group);
    exercise.set("equipment_options", body.equipment_options);
    exercise.set("active", body.active);
    exercise.set("catalog_managed", true);
    app.save(exercise);
    result = exercise;
  });
  return e.json(200, result);
}, $apis.requireAuth());

onRecordValidate(function (e) {
  var lib = require(__hooks + "/catalog_lib.js");
  var type = e.record.getString("type");
  var field = type === "cardio" || type === "interval" || type === "life" ? "cardio_mode"
    : type === "recovery" ? "recovery_activity" : type === "sport" ? "sport_activity"
    : type === "wellness" ? "wellness_activity" : "";
  if (field) {
    if (!e.record.getString(field)) throw new BadRequestError("Choose an activity for this category.");
    var original = e.record.original();
    var previous = !e.record.isNew() && original.getString("type") === type ? original.getString(field) : "";
    var kind = field === "cardio_mode" ? "movement" : type === "wellness" ? "wellness" : type;
    lib.validateChoice(e.app, kind, e.record.getString(field), type, previous, e.record.getString("owner"));
  }
  e.next();
}, "workout_templates");

onRecordValidate(function (e) {
  var type = e.record.getString("type");
  var kind = type === "cardio" || type === "interval" || type === "life" ? "movement" : type === "wellness" ? "wellness" : type;
  var field = kind === "movement" ? "cardio_mode" : type === "recovery" ? "recovery_activity" : type === "sport" ? "sport_activity" : type === "wellness" ? "wellness_activity" : "";
  if (type === "wellness" && !e.record.getString(field)) throw new BadRequestError("Choose a wellness activity.");
  if (field && e.record.getString(field)) {
    var previous = !e.record.isNew() && e.record.original().getString("type") === type ? e.record.original().getString(field) : "";
    if (e.record.isNew() && e.record.getString("template")) {
      var template = e.app.findRecordById("workout_templates", e.record.getString("template"));
      if (template.getString("owner") === e.record.getString("owner") && template.getString("type") === type) {
        previous = template.getString(field);
      }
    }
    require(__hooks + "/catalog_lib.js").validateChoice(e.app, kind, e.record.getString(field), type, previous, e.record.getString("owner"));
  }
  e.next();
}, "workouts");

onRecordValidate(function (e) {
  var lib = require(__hooks + "/catalog_lib.js");
  var previous = e.record.isNew() ? [] : e.record.original().getStringSlice("equipment_options");
  var sourceId = e.record.getString("source_id");
  if (sourceId) {
    var source = e.app.findRecordById("exercises", sourceId);
    if (source.getString("owner") || !e.record.getString("owner")) throw new BadRequestError("Choose a standard exercise to customize.");
    if (e.record.isNew()) previous = source.getStringSlice("equipment_options");
  }
  if (!e.record.isNew() && sourceId !== e.record.original().getString("source_id")) throw new BadRequestError("The original exercise cannot be changed.");
  e.record.getStringSlice("equipment_options").forEach(function (key) {
    lib.validateChoice(e.app, "equipment", key, "strength", previous.indexOf(key) >= 0 ? key : "", e.record.getString("owner"));
  });
  e.next();
}, "exercises");

onRecordValidate(function (e) {
  var key = e.record.getString("equipment");
  require(__hooks + "/catalog_lib.js").validateChoice(e.app, "equipment", key, "strength", key, e.record.getString("owner"));
  e.next();
}, "template_exercises", "workout_exercises");
