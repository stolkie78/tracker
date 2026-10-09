routerAdd(
  "GET",
  "/api/top-trainer/ai-settings",
  function (e) {
    var records = e.app.findRecordsByFilter(
      "ai_settings",
      "owner = {:owner}",
      "",
      1,
      0,
      { owner: e.auth.id }
    );
    if (records.length === 0) {
      return e.json(200, null);
    }
    var record = records[0];
    return e.json(200, {
      endpoint: record.getString("endpoint"),
      model: record.getString("model"),
      api_key_set: record.getBool("api_key_set"),
    });
  },
  $apis.requireAuth()
);

routerAdd(
  "POST",
  "/api/top-trainer/ai-settings",
  function (e) {
    var body = e.requestInfo().body || {};
    var endpoint = typeof body.endpoint === "string" ? body.endpoint.trim().replace(/\/+$/, "") : "";
    var model = typeof body.model === "string" ? body.model.trim() : "";
    var apiKey = typeof body.api_key === "string" ? body.api_key.trim() : "";

    if (!endpoint || !model || model.length > 160 || apiKey.length > 4096) {
      throw new BadRequestError("Vul een geldig API-endpoint, model en API-sleutel in.");
    }
    if (
      !/^https:\/\//i.test(endpoint) &&
      !/^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?(\/|$)/i.test(endpoint)
    ) {
      throw new BadRequestError("Gebruik een HTTPS-endpoint of een lokaal endpoint op localhost.");
    }

    var records = e.app.findRecordsByFilter(
      "ai_settings",
      "owner = {:owner}",
      "",
      1,
      0,
      { owner: e.auth.id }
    );
    var record;
    if (records.length > 0) {
      record = records[0];
    } else {
      if (!apiKey) {
        throw new BadRequestError("Vul eerst een API-sleutel in.");
      }
      record = new Record(e.app.findCollectionByNameOrId("ai_settings"));
      record.set("owner", e.auth.id);
    }

    record.set("endpoint", endpoint);
    record.set("model", model);
    if (apiKey) {
      record.set("api_key", apiKey);
      record.set("api_key_set", true);
    }
    e.app.save(record);

    return e.json(200, {
      endpoint: record.getString("endpoint"),
      model: record.getString("model"),
      api_key_set: record.getBool("api_key_set"),
    });
  },
  $apis.requireAuth()
);

routerAdd(
  "POST",
  "/api/top-trainer/generate-plan",
  function (e) {
    var fail = function (status, message) {
      throw new ApiError(status, message);
    };
    var isIntegerInRange = function (value, min, max) {
      return typeof value === "number" && value % 1 === 0 && value >= min && value <= max;
    };
    var isNumberInRange = function (value, min, max) {
      return typeof value === "number" && isFinite(value) && value >= min && value <= max;
    };
    var isDate = function (value) {
      if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
        return false;
      }
      var parsed = new Date(value + "T12:00:00Z");
      return !isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
    };
    var cleanText = function (value, maxLength, fallback) {
      if (typeof value !== "string") {
        return fallback;
      }
      return value.trim().slice(0, maxLength);
    };
    var validEnum = function (value, values, fallback) {
      return values.indexOf(value) >= 0 ? value : fallback;
    };

    var body = e.requestInfo().body || {};
    var startDate = body.start_date;
    var endDate = body.end_date;
    var weeks = body.weeks;
    var preferences = body.preferences || {};

    if (!isDate(startDate) || !isDate(endDate) || startDate > endDate) {
      fail(400, "Kies een geldige start- en einddatum voor de periode.");
    }
    if (!isIntegerInRange(weeks, 1, 12)) {
      fail(400, "Een plan kan 1 tot en met 12 weken duren.");
    }
    var requestedDays = (new Date(endDate + "T12:00:00Z").getTime() - new Date(startDate + "T12:00:00Z").getTime()) / 86400000;
    if (requestedDays !== weeks * 7 - 1) {
      fail(400, "De begin- en einddatum moeten overeenkomen met het gekozen aantal weken.");
    }

    var strengthCount = preferences.strength_sessions;
    var cardioCount = preferences.cardio_sessions;
    var intervalCount = preferences.interval_sessions;
    var recoveryCount = preferences.recovery_sessions;
    var counts = [strengthCount, cardioCount, intervalCount, recoveryCount];
    var weeklyTotal = 0;

    for (var i = 0; i < counts.length; i++) {
      if (!isIntegerInRange(counts[i], 0, 7)) {
        fail(400, "Trainingsfrequenties moeten gehele aantallen van 0 tot en met 7 zijn.");
      }
      weeklyTotal += counts[i];
    }
    if (weeklyTotal < 1 || weeklyTotal > 7) {
      fail(400, "Kies 1 tot en met 7 trainingen per week.");
    }
    var allowedDays = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
    var selectedDays = Array.isArray(body.available_days) ? body.available_days : [];
    if (selectedDays.length < weeklyTotal || selectedDays.length > 7) {
      fail(400, "Selecteer voldoende beschikbare dagen voor de gekozen trainingsfrequentie.");
    }
    for (var dayIndex = 0; dayIndex < selectedDays.length; dayIndex++) {
      if (allowedDays.indexOf(selectedDays[dayIndex]) < 0 || selectedDays.indexOf(selectedDays[dayIndex]) !== dayIndex) {
        fail(400, "De lijst met beschikbare dagen is ongeldig.");
      }
    }

    var settings;
    try {
      settings = $app.findFirstRecordByFilter(
        "ai_settings",
        "owner = {:owner}",
        { owner: e.auth.id }
      );
    } catch (_) {
      fail(400, "Stel eerst je AI-provider in op de instellingenpagina.");
    }

    var apiKey = settings.getString("api_key");
    var endpoint = settings.getString("endpoint").replace(/\/+$/, "");
    var model = settings.getString("model").trim();
    if (!apiKey || !endpoint || !model) {
      fail(400, "Vul de AI-provider, API-sleutel en het model in bij instellingen.");
    }
    if (
      !/^https:\/\//i.test(endpoint) &&
      !/^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?(\/|$)/i.test(endpoint)
    ) {
      fail(400, "Gebruik een HTTPS-endpoint of een lokaal endpoint op localhost.");
    }

    var exercises = $app.findRecordsByFilter("exercises", "active = true", "name", 500, 0);
    if (exercises.length === 0) {
      fail(400, "Er zijn nog geen oefeningen beschikbaar. Voeg oefeningen toe en probeer opnieuw.");
    }

    var allowedExercises = {};
    var exerciseList = [];
    for (var exerciseIndex = 0; exerciseIndex < exercises.length; exerciseIndex++) {
      var exercise = exercises[exerciseIndex];
      var options = exercise.getStringSlice("equipment_options");
      allowedExercises[exercise.id] = options.length > 0 ? options : ["other"];
      exerciseList.push({
        id: exercise.id,
        name: exercise.getString("name"),
        category: exercise.getString("category"),
        equipment_options: options,
      });
    }

    var userPrompt = {
      period: {
        start_date: startDate,
        end_date: endDate,
        weeks: weeks,
      },
      goal: cleanText(body.goal, 500, ""),
      experience: validEnum(body.experience, ["beginner", "intermediate", "advanced"], "beginner"),
      available_days: Array.isArray(body.available_days) ? body.available_days : [],
      equipment: cleanText(body.equipment, 500, ""),
      preferences: {
        strength_sessions: strengthCount,
        cardio_sessions: cardioCount,
        interval_sessions: intervalCount,
        recovery_sessions: recoveryCount,
      },
      available_exercises: exerciseList,
      required_output: {
        title: "string",
        summary: "string",
        workouts: [
          {
            date: "YYYY-MM-DD",
            type: "strength | cardio | interval | recovery",
            title: "string",
            duration_minutes: 1,
            notes: "string",
            strength_exercises: [
              {
                exercise_id: "one id from available_exercises",
                equipment: "one value from that exercise's equipment_options",
                sets: 3,
                reps_min: 8,
                reps_max: 12,
                starting_weight: 0,
                weight_increment: 2.5,
              },
            ],
            cardio_mode: "running | cycling | rowing | swimming | walking | other",
            distance_km: 0,
            interval_work_seconds: 30,
            interval_rest_seconds: 60,
            interval_rounds: 8,
            recovery_activity: "rest | mobility | yoga | walking | stretching | other",
          },
        ],
      },
    };

    var apiUrl = endpoint;
    if (!/\/chat\/completions$/i.test(apiUrl)) {
      apiUrl += "/chat/completions";
    }

    var response;
    try {
      response = $http.send({
        url: apiUrl,
        method: "POST",
        timeout: 120,
        headers: {
          "Content-Type": "application/json",
          Authorization: "Bearer " + apiKey,
        },
        body: JSON.stringify({
          model: model,
          temperature: 0.4,
          max_tokens: 16000,
          response_format: { type: "json_object" },
          messages: [
            {
              role: "system",
              content:
                "Je bent een voorzichtige trainingsplanner. Maak een praktisch, gevarieerd weekschema voor de opgegeven periode en respecteer exact de opgegeven aantallen per trainingstype per week. Verdeel sessies over de beschikbare dagen, plan rust tussen zware krachtsessies en bouw cardio en intervallen geleidelijk op. Gebruik voor kracht alleen oefeningen uit available_exercises, kies per oefening een apparaat uit de equipment_options en geef per oefening sets, een realistisch repbereik, starting_weight 0 tenzij de gebruiker expliciet een trainingsgewicht meegaf, en weight_increment (kleine stap). Adviseer geen diagnose of revalidatie; vermeld bij klachten stoppen en deskundig advies vragen. Geef uitsluitend geldige JSON terug met title, summary en workouts; geen markdown.",
            },
            { role: "user", content: JSON.stringify(userPrompt) },
          ],
        }),
      });
    } catch (_) {
      fail(502, "De AI-provider is niet bereikbaar. Controleer endpoint en netwerk en probeer opnieuw.");
    }

    if (response.statusCode < 200 || response.statusCode >= 300) {
      $app.logger().error("AI planner provider request failed", "status", response.statusCode);
      fail(502, "De AI-provider heeft het verzoek geweigerd. Controleer model en API-sleutel.");
    }

    var messageContent = "";
    try {
      messageContent = response.json.choices[0].message.content;
    } catch (_) {
      fail(502, "De AI-provider stuurde geen herkenbaar chat-completionantwoord terug.");
    }

    var generated;
    try {
      generated = JSON.parse(messageContent);
    } catch (_) {
      fail(502, "De AI-provider stuurde geen geldige JSON-planning terug.");
    }

    if (!generated || !Array.isArray(generated.workouts) || generated.workouts.length === 0) {
      fail(502, "De AI heeft geen trainingen voor deze periode aangemaakt.");
    }
    if (generated.workouts.length !== weeks * weeklyTotal) {
      fail(502, "De AI-planning bevat niet exact het gevraagde aantal trainingen; probeer opnieuw.");
    }

    var validTypes = ["strength", "cardio", "interval", "recovery"];
    var validCardio = ["running", "cycling", "rowing", "swimming", "walking", "other"];
    var validRecovery = ["rest", "mobility", "yoga", "walking", "stretching", "other"];
    var weekdayNames = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
    var expectedTypeCounts = {
      strength: strengthCount * weeks,
      cardio: cardioCount * weeks,
      interval: intervalCount * weeks,
      recovery: recoveryCount * weeks,
    };
    var actualTypeCounts = [];
    for (var weekIndex = 0; weekIndex < weeks; weekIndex++) {
      actualTypeCounts.push({ strength: 0, cardio: 0, interval: 0, recovery: 0 });
    }
    var normalizedWorkouts = [];

    for (var workoutIndex = 0; workoutIndex < generated.workouts.length; workoutIndex++) {
      var item = generated.workouts[workoutIndex];
      if (
        !item ||
        !isDate(item.date) ||
        item.date < startDate ||
        item.date > endDate ||
        validTypes.indexOf(item.type) < 0 ||
        !isIntegerInRange(item.duration_minutes, 1, 360)
      ) {
        fail(502, "De AI-planning bevat een ongeldige datum of training.");
      }
      if (selectedDays.indexOf(weekdayNames[new Date(item.date + "T12:00:00Z").getUTCDay()]) < 0) {
        fail(502, "De AI-planning bevat een datum op een niet-beschikbare dag.");
      }
      var dayOffset = (new Date(item.date + "T12:00:00Z").getTime() - new Date(startDate + "T12:00:00Z").getTime()) / 86400000;
      var itemWeek = Math.floor(dayOffset / 7);
      if (itemWeek < 0 || itemWeek >= weeks) {
        fail(502, "De AI-planning bevat een sessie buiten de gekozen weekindeling.");
      }
      actualTypeCounts[itemWeek][item.type]++;

      var normalized = {
        date: item.date,
        type: item.type,
        title: cleanText(item.title, 120, "Training"),
        duration_minutes: item.duration_minutes,
        notes: cleanText(item.notes, 1200, ""),
      };

      if (item.type === "strength") {
        if (!Array.isArray(item.strength_exercises) || item.strength_exercises.length < 1 || item.strength_exercises.length > 12) {
          fail(502, "Een krachttraining moet 1 tot en met 12 oefeningen bevatten.");
        }
        normalized.strength_exercises = [];
        for (var strengthIndex = 0; strengthIndex < item.strength_exercises.length; strengthIndex++) {
          var strength = item.strength_exercises[strengthIndex];
          if (
            !strength ||
            !allowedExercises[strength.exercise_id] ||
            !isIntegerInRange(strength.sets, 1, 10) ||
            !isIntegerInRange(strength.reps_min, 1, 30) ||
            !isIntegerInRange(strength.reps_max, strength.reps_min, 30) ||
            !isNumberInRange(strength.starting_weight, 0, 500) ||
            !isNumberInRange(strength.weight_increment, 0.25, 25)
          ) {
            fail(502, "De AI-planning bevat een ongeldige krachtoefening of set.");
          }
          var allowedEquipment = allowedExercises[strength.exercise_id];
          var chosenEquipment = allowedEquipment.indexOf(strength.equipment) >= 0 ? strength.equipment : allowedEquipment[0];
          normalized.strength_exercises.push({
            exercise_id: strength.exercise_id,
            equipment: chosenEquipment,
            sets: strength.sets,
            reps_min: strength.reps_min,
            reps_max: strength.reps_max,
            starting_weight: strength.starting_weight,
            weight_increment: strength.weight_increment,
          });
        }
      } else if (item.type === "cardio") {
        normalized.cardio_mode = validEnum(item.cardio_mode, validCardio, "other");
        if (item.distance_km !== undefined && !isNumberInRange(item.distance_km, 0, 1000)) {
          fail(502, "De AI-planning bevat een ongeldige cardio-afstand.");
        }
        normalized.distance_km = item.distance_km || 0;
      } else if (item.type === "interval") {
        normalized.cardio_mode = validEnum(item.cardio_mode, validCardio, "running");
        if (
          !isIntegerInRange(item.interval_work_seconds, 1, 3600) ||
          !isIntegerInRange(item.interval_rest_seconds, 0, 3600) ||
          !isIntegerInRange(item.interval_rounds, 1, 100)
        ) {
          fail(502, "De AI-planning bevat ongeldige intervalinstellingen.");
        }
        normalized.interval_work_seconds = item.interval_work_seconds;
        normalized.interval_rest_seconds = item.interval_rest_seconds;
        normalized.interval_rounds = item.interval_rounds;
      } else {
        normalized.recovery_activity = validEnum(item.recovery_activity, validRecovery, "mobility");
      }

      normalizedWorkouts.push(normalized);
    }

    for (var weekCheck = 0; weekCheck < weeks; weekCheck++) {
      for (var typeIndex = 0; typeIndex < validTypes.length; typeIndex++) {
        var workoutType = validTypes[typeIndex];
        if (actualTypeCounts[weekCheck][workoutType] !== counts[typeIndex]) {
          fail(502, "De AI-planning bevat niet de gevraagde mix per week; probeer opnieuw.");
        }
      }
    }

    return e.json(200, {
      title: cleanText(generated.title, 120, "Trainingsplan"),
      summary: cleanText(generated.summary, 2000, ""),
      workouts: normalizedWorkouts,
    });
  },
  $apis.requireAuth()
);
