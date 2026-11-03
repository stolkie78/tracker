onRecordValidate(function (e) {
  if (e.record.getString("schedule_mode") === "free_period") {
    var weeks = e.record.getInt("weeks");
    if (weeks < 1 || weeks > 4 || e.record.getFloat("weeks") !== weeks) {
      throw new BadRequestError("A free period must last between one and four weeks.");
    }
    var start = new Date(e.record.getString("start_date").replace(" ", "T"));
    var end = new Date(e.record.getString("end_date").replace(" ", "T"));
    if (end.getTime() - start.getTime() !== (weeks * 7 - 1) * 86400000) {
      throw new BadRequestError("The period dates must match its duration.");
    }
  }
  e.next();
}, "training_plans");

onRecordValidate(function (e) {
  var free = e.record.getBool("free_period");
  var original = e.record.original();
  if (!e.record.isNew() && original.getBool("free_period") !== free) {
    throw new BadRequestError("The workout planning mode cannot be changed.");
  }
  var planId = e.record.getString("plan");
  if (planId) {
    var plan = e.app.findRecordById("training_plans", planId);
    if ((plan.getString("schedule_mode") === "free_period") !== free) {
      throw new BadRequestError("The workout planning mode must match its program.");
    }
  } else if (free && (e.record.isNew() || e.record.getString("status") === "planned" || e.record.getString("status") === "in_progress")) {
    throw new BadRequestError("An open free workout needs a period. Deleted periods retain completed history only.");
  }
  if (free) {
    e.record.set("day_part", "");
    var status = e.record.getString("status");
    if (status === "skipped") e.record.set("due_date", "");
    if (status === "planned" || status === "skipped") {
      e.record.set("performed_at", "");
    } else if (!e.record.getString("performed_at")) {
      e.record.set("performed_at", new Date().toISOString());
    }
  } else if (!e.record.getString("performed_at")) {
    throw new BadRequestError("A scheduled workout needs a date.");
  }
  if (e.record.getString("day_part") === "all_day") {
    if (!e.record.getString("all_day_date")) {
      throw new BadRequestError("An all-day activity needs a calendar date.");
    }
  } else {
    e.record.set("all_day_date", "");
  }
  e.next();
}, "workouts");

onRecordDeleteRequest(function (e) {
  if (e.record.getString("schedule_mode") === "free_period") {
    var active = e.app.findRecordsByFilter("workouts", "plan = {:plan} && status = 'in_progress'", "", 1, 0, { plan: e.record.id });
    if (active.length) {
      throw new BadRequestError("Finish or reset in-progress workouts before deleting their period.");
    }
  }
  e.next();
}, "training_plans");
