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
  e.next();
}, "profiles");

onRecordValidate(function (e) {
  var today = new Date(Date.now() + 14 * 3600000).toISOString().slice(0, 10);
  if (e.record.getString("measured_at").slice(0, 10) > today) {
    throw new BadRequestError("A measurement date cannot be in the future.");
  }
  e.next();
}, "body_measurements");
