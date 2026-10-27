routerAdd("POST", "/api/top-trainer/templates", function (e) {
  var body = e.requestInfo().body || {};
  var data = body.template;
  var entries = body.exercises;
  if (!data || typeof data !== "object" || Array.isArray(data) || !Array.isArray(entries) || entries.length > 100) {
    throw new BadRequestError("Enter a valid workout with no more than 100 exercises.");
  }
  var result;
  e.app.runInTransaction(function (app) {
    var record;
    if (body.id) {
      record = app.findRecordById("workout_templates", body.id);
      if (record.getString("owner") !== e.auth.id) throw new NotFoundError("Workout not found.");
    } else {
      record = new Record(app.findCollectionByNameOrId("workout_templates"));
      record.set("owner", e.auth.id);
    }
    var fields = [
      "title", "type", "duration_minutes", "notes", "level", "goal", "tags",
      "cardio_mode", "distance_km", "interval_work_seconds", "interval_rest_seconds",
      "interval_rounds", "recovery_activity", "sport_activity"
    ];
    for (var i = 0; i < fields.length; i++) {
      if (Object.prototype.hasOwnProperty.call(data, fields[i])) record.set(fields[i], data[fields[i]]);
    }
    var type = record.getString("type");
    var duration = record.getFloat("duration_minutes");
    if (!Number.isFinite(duration) || duration < 1 || duration > 600) {
      throw new BadRequestError("Enter a workout duration between 1 and 600 minutes.");
    }
    if (type === "life" && ["walking", "hiking"].indexOf(record.getString("cardio_mode")) < 0) {
      throw new BadRequestError("Choose walking or hiking for a Life activity.");
    }
    if (type !== "cardio" && type !== "interval" && type !== "life") record.set("cardio_mode", "");
    if (type !== "cardio" && type !== "life") record.set("distance_km", 0);
    if (type !== "interval") {
      record.set("interval_work_seconds", 0);
      record.set("interval_rest_seconds", 0);
      record.set("interval_rounds", 0);
    }
    if (type !== "recovery") record.set("recovery_activity", "");
    if (type !== "sport") record.set("sport_activity", "");
    if (record.getString("type") === "strength" && entries.length === 0) {
      throw new BadRequestError("Add at least one exercise.");
    }
    if (record.getString("type") !== "strength" && entries.length !== 0) {
      throw new BadRequestError("Only strength workouts can contain exercises.");
    }
    app.save(record);
    var previous = app.findAllRecords("template_exercises", $dbx.hashExp({ template: record.id }));
    for (var oldIndex = 0; oldIndex < previous.length; oldIndex++) {
      if (previous[oldIndex].getString("owner") !== e.auth.id) {
        throw new BadRequestError("The exercise owner does not match the workout owner.");
      }
      app.delete(previous[oldIndex]);
    }
    for (var index = 0; index < entries.length; index++) {
      var entry = entries[index];
      if (!entry || typeof entry.exercise !== "string") throw new BadRequestError("Choose a valid exercise.");
      var exercise = app.findRecordById("exercises", entry.exercise);
      var exerciseOwner = exercise.getString("owner");
      if (exerciseOwner && exerciseOwner !== e.auth.id) throw new NotFoundError("Exercise not found.");
      if (entry.equipment && exercise.getStringSlice("equipment_options").indexOf(entry.equipment) < 0) {
        throw new BadRequestError("Choose valid equipment for the exercise.");
      }
      if (
        !Number.isInteger(entry.target_sets) || entry.target_sets < 1 ||
        !Number.isInteger(entry.reps_min) || entry.reps_min < 1 ||
        !Number.isInteger(entry.reps_max) || entry.reps_max < entry.reps_min ||
        typeof entry.starting_weight !== "number" || !Number.isFinite(entry.starting_weight) || entry.starting_weight < 0 ||
        typeof entry.weight_increment !== "number" || !Number.isFinite(entry.weight_increment) || entry.weight_increment <= 0 ||
        typeof entry.rest_seconds !== "number" || !Number.isFinite(entry.rest_seconds) || entry.rest_seconds < 0
      ) {
        throw new BadRequestError("Check the sets, reps, weight, weight increment, and rest period.");
      }
      var child = new Record(app.findCollectionByNameOrId("template_exercises"));
      child.set("owner", e.auth.id);
      child.set("template", record.id);
      child.set("exercise", exercise.id);
      child.set("set_order", index + 1);
      var childFields = ["equipment", "target_sets", "reps_min", "reps_max", "starting_weight", "weight_increment", "rest_seconds", "tempo"];
      for (var fieldIndex = 0; fieldIndex < childFields.length; fieldIndex++) {
        child.set(childFields[fieldIndex], entry[childFields[fieldIndex]]);
      }
      app.save(child);
    }
    result = { id: record.id, title: record.getString("title") };
  });
  return e.json(200, result);
}, $apis.requireAuth());
