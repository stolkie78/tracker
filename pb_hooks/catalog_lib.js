function requireAdmin(app, user) {
  var profiles = app.findRecordsByFilter("profiles", "user = {:user} && role = 'admin'", "", 1, 0, { user: user });
  if (!profiles.length) throw new ForbiddenError("Only administrators can change standard catalog entries.");
}

function requireEditable(app, record, user) {
  var owner = record.getString("owner");
  if (owner) {
    if (owner !== user) throw new NotFoundError("Catalog entry not found.");
  } else {
    requireAdmin(app, user);
  }
}

function validateChoice(app, kind, key, category, previous, owner) {
  if (!key) return;
  var records = app.findRecordsByFilter("training_catalog", "kind = {:kind} && key = {:key} && (owner = '' || owner = {:owner})", "-owner", 1, 0, { kind: kind, key: key, owner: owner || "" });
  if (!records.length) {
    var foreign = app.findRecordsByFilter("training_catalog", "kind = {:kind} && key = {:key}", "", 1, 0, { kind: kind, key: key });
    if (!foreign.length && key === previous) return;
    throw new BadRequestError("Choose an available catalog entry.");
  }
  var entry = records[0];
  if (entry.getString("owner") && entry.getString("owner") !== owner) {
    throw new BadRequestError("Choose an available catalog entry.");
  }
  if ((!entry.getBool("active") || (category && entry.getStringSlice("categories").indexOf(category) < 0)) && key !== previous) {
    throw new BadRequestError("This catalog entry is not available for new selections.");
  }
}

function effective(records, identity) {
  var personal = {};
  records.forEach(function (record) {
    if (record.getString("owner")) personal[identity(record)] = true;
  });
  return records.filter(function (record) { return record.getString("owner") || !personal[identity(record)]; });
}

function extendSchema(app, kind, key) {
  var targets = kind === "equipment"
    ? [["exercises", "equipment_options"], ["template_exercises", "equipment"], ["workout_exercises", "equipment"]]
    : [["workout_templates", kind === "movement" ? "cardio_mode" : kind === "recovery" ? "recovery_activity" : "sport_activity"],
       ["workouts", kind === "movement" ? "cardio_mode" : kind === "recovery" ? "recovery_activity" : "sport_activity"]];
  targets.forEach(function (target) {
    var collection = app.findCollectionByNameOrId(target[0]);
    var field = collection.fields.getByName(target[1]);
    if (field.values.indexOf(key) < 0) {
      field.values = field.values.concat([key]);
      app.save(collection);
    }
  });
}

module.exports = { requireEditable: requireEditable, validateChoice: validateChoice, extendSchema: extendSchema, effective: effective };
