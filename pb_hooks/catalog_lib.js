function requireAdmin(app, user) {
  var profiles = app.findRecordsByFilter("profiles", "user = {:user} && role = 'admin'", "", 1, 0, { user: user });
  if (!profiles.length) throw new ForbiddenError("Only administrators can manage the training catalog.");
}

function validateChoice(app, kind, key, category, previous) {
  if (!key) return;
  var records = app.findRecordsByFilter("training_catalog", "kind = {:kind} && key = {:key}", "", 1, 0, { kind: kind, key: key });
  if (!records.length) {
    if (key === previous) return;
    throw new BadRequestError("Choose an available catalog entry.");
  }
  var entry = records[0];
  if ((!entry.getBool("active") || (category && entry.getStringSlice("categories").indexOf(category) < 0)) && key !== previous) {
    throw new BadRequestError("This catalog entry is not available for new selections.");
  }
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

module.exports = { requireAdmin: requireAdmin, validateChoice: validateChoice, extendSchema: extendSchema };
