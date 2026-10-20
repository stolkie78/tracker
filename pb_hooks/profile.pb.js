onRecordValidate(function (e) {
  var birth = e.record.getString("birth_date");
  // Kalenderdagen mogen vandaag zijn in elke tijdzone, tot en met UTC+14.
  var today = new Date(Date.now() + 14 * 3600000).toISOString().slice(0, 10);
  if (birth && birth.slice(0, 10) > today) {
    throw new BadRequestError("De geboortedatum mag niet in de toekomst liggen.");
  }
  var height = e.record.getFloat("height_cm");
  if (height !== 0 && (height < 30 || height > 300)) {
    throw new BadRequestError("Vul een lengte tussen 30 en 300 cm in.");
  }
  e.next();
}, "profiles");

onRecordValidate(function (e) {
  var today = new Date(Date.now() + 14 * 3600000).toISOString().slice(0, 10);
  if (e.record.getString("measured_at").slice(0, 10) > today) {
    throw new BadRequestError("Een meting mag niet in de toekomst liggen.");
  }
  e.next();
}, "body_measurements");
