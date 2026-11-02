routerAdd("POST", "/api/top-trainer/catalog", function (e) {
  var lib = require(__hooks + "/catalog_lib.js");
  lib.requireAdmin(e.app, e.auth.id);
  var body = e.requestInfo().body || {};
  var name = typeof body.label === "string" ? body.label.trim() : "";
  var kind = body.kind;
  var allowed = { movement: ["cardio", "interval", "life"], recovery: ["recovery"], sport: ["sport"], equipment: ["strength"] };
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
    if (body.id && entry.getString("kind") !== kind) throw new BadRequestError("The entry type cannot be changed.");
    var duplicates = app.findRecordsByFilter("training_catalog", "kind = {:kind} && label ~ {:label}", "", 0, 0, { kind: kind, label: name });
    if (duplicates.some(function (item) { return item.id !== entry.id && item.getString("label").toLowerCase() === name.toLowerCase(); })) {
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
  lib.requireAdmin(e.app, e.auth.id);
  var body = e.requestInfo().body || {};
  if (typeof body.name !== "string" || !body.name.trim() || body.name.trim().length > 120 ||
      !Array.isArray(body.equipment_options) || !body.equipment_options.length ||
      body.equipment_options.length > 8 || typeof body.active !== "boolean") {
    throw new BadRequestError("Enter an exercise name and select between one and eight materials or machines.");
  }
  var result;
  e.app.runInTransaction(function (app) {
    var exercise = body.id ? app.findRecordById("exercises", body.id) : new Record(app.findCollectionByNameOrId("exercises"));
    if (exercise.getString("owner")) throw new ForbiddenError("Personal exercises cannot be edited in the shared catalog.");
    var duplicates = app.findRecordsByFilter("exercises", "owner = '' && name ~ {:name}", "", 0, 0, { name: body.name.trim() });
    if (duplicates.some(function (item) { return item.id !== exercise.id && item.getString("name").toLowerCase() === body.name.trim().toLowerCase(); })) {
      throw new BadRequestError("A shared exercise with this name already exists.");
    }
    var previous = exercise.getStringSlice("equipment_options");
    body.equipment_options.forEach(function (key) {
      if (typeof key !== "string") throw new BadRequestError("Choose valid equipment.");
      lib.validateChoice(app, "equipment", key, "strength", previous.indexOf(key) >= 0 ? key : "");
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
    : type === "recovery" ? "recovery_activity" : type === "sport" ? "sport_activity" : "";
  if (field) {
    if (!e.record.getString(field)) throw new BadRequestError("Choose an activity for this category.");
    var original = e.record.original();
    var previous = !e.record.isNew() && original.getString("type") === type ? original.getString(field) : "";
    lib.validateChoice(e.app, field === "cardio_mode" ? "movement" : type, e.record.getString(field), type, previous);
  }
  e.next();
}, "workout_templates");

onRecordValidate(function (e) {
  var type = e.record.getString("type");
  var kind = type === "cardio" || type === "interval" || type === "life" ? "movement" : type;
  var field = kind === "movement" ? "cardio_mode" : type === "recovery" ? "recovery_activity" : type === "sport" ? "sport_activity" : "";
  if (field && e.record.getString(field)) {
    var previous = !e.record.isNew() && e.record.original().getString("type") === type ? e.record.original().getString(field) : "";
    if (e.record.isNew() && e.record.getString("template")) {
      var template = e.app.findRecordById("workout_templates", e.record.getString("template"));
      if (template.getString("owner") === e.record.getString("owner") && template.getString("type") === type) {
        previous = template.getString(field);
      }
    }
    require(__hooks + "/catalog_lib.js").validateChoice(e.app, kind, e.record.getString(field), type, previous);
  }
  e.next();
}, "workouts");

onRecordValidate(function (e) {
  var lib = require(__hooks + "/catalog_lib.js");
  var previous = e.record.isNew() ? [] : e.record.original().getStringSlice("equipment_options");
  e.record.getStringSlice("equipment_options").forEach(function (key) {
    lib.validateChoice(e.app, "equipment", key, "strength", previous.indexOf(key) >= 0 ? key : "");
  });
  e.next();
}, "exercises");
