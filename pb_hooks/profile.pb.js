onRecordValidate(function (e) {
  var birth = e.record.getString("birth_date");
  // A calendar date may be today in any timezone, including UTC+14.
  var today = new Date(Date.now() + 14 * 3600000).toISOString().slice(0, 10);
  if (birth && birth.slice(0, 10) > today) {
    throw new BadRequestError("Date of birth cannot be in the future.");
  }
  var height = e.record.getFloat("height_cm");
  if (height !== 0 && (height < 30 || height > 300)) {
    throw new BadRequestError("Enter a height between 30 and 300 cm.");
  }
  var rawGoals = e.record.getString("weekly_goals");
  if (rawGoals && rawGoals !== "null") {
    var goals;
    try {
      goals = JSON.parse(rawGoals);
    } catch (_) {
      throw new BadRequestError("Weekly goals must be a list.");
    }
    if (!Array.isArray(goals) || goals.length > 5200) {
      throw new BadRequestError("Weekly goals must be a list of at most 5200 weeks.");
    }
    var seen = {};
    goals.forEach(function (goal) {
      if (!goal || typeof goal.week !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(goal.week)
        || !Number.isInteger(goal.target) || goal.target < 1 || goal.target > 7) {
        throw new BadRequestError("Choose a weekly goal between 1 and 7 sessions.");
      }
      var date = new Date(goal.week + "T12:00:00Z");
      if (!Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== goal.week
        || date.getUTCDay() !== 1 || seen[goal.week]) {
        throw new BadRequestError("Weekly goals must use unique Monday dates.");
      }
      seen[goal.week] = true;
    });
  }
  e.next();
}, "profiles");

onRecordValidate(function (e) {
  var today = new Date(Date.now() + 14 * 3600000).toISOString().slice(0, 10);
  if (e.record.getString("measured_at").slice(0, 10) > today) {
    throw new BadRequestError("A measurement date cannot be in the future.");
  }
  e.next();
}, "body_measurements");
