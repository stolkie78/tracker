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
      throw new BadRequestError("Enter a valid API endpoint, model, and API key.");
    }
    if (
      !/^https:\/\//i.test(endpoint) &&
      !/^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?(\/|$)/i.test(endpoint)
    ) {
      throw new BadRequestError("Use an HTTPS endpoint or a local endpoint on localhost.");
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
        throw new BadRequestError("Enter an API key first.");
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
      fail(400, "Choose a valid start and end date for the period.");
    }
    if (!isIntegerInRange(weeks, 1, 12)) {
      fail(400, "A plan can last between 1 and 12 weeks.");
    }
    var requestedDays = (new Date(endDate + "T12:00:00Z").getTime() - new Date(startDate + "T12:00:00Z").getTime()) / 86400000;
    if (requestedDays !== weeks * 7 - 1) {
      fail(400, "The start and end dates must match the selected number of weeks.");
    }

    var strengthCount = preferences.strength_sessions;
    var cardioCount = preferences.cardio_sessions;
    var intervalCount = preferences.interval_sessions;
    var recoveryCount = preferences.recovery_sessions;
    var counts = [strengthCount, cardioCount, intervalCount, recoveryCount];
    var weeklyTotal = 0;

    for (var i = 0; i < counts.length; i++) {
      if (!isIntegerInRange(counts[i], 0, 7)) {
        fail(400, "Workout frequencies must be whole numbers from 0 to 7.");
      }
      weeklyTotal += counts[i];
    }
    if (weeklyTotal < 1 || weeklyTotal > 7) {
      fail(400, "Choose between 1 and 7 workouts per week.");
    }
    var allowedDays = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
    var selectedDays = Array.isArray(body.available_days) ? body.available_days : [];
    if (selectedDays.length < weeklyTotal || selectedDays.length > 7) {
      fail(400, "Select enough available days for the chosen training frequency.");
    }
    for (var dayIndex = 0; dayIndex < selectedDays.length; dayIndex++) {
      if (allowedDays.indexOf(selectedDays[dayIndex]) < 0 || selectedDays.indexOf(selectedDays[dayIndex]) !== dayIndex) {
        fail(400, "The list of available days is invalid.");
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
      fail(400, "Configure your AI provider on the settings page first.");
    }

    var apiKey = settings.getString("api_key");
    var endpoint = settings.getString("endpoint").replace(/\/+$/, "");
    var model = settings.getString("model").trim();
    if (!apiKey || !endpoint || !model) {
      fail(400, "Enter the AI provider, API key, and model in settings.");
    }
    if (
      !/^https:\/\//i.test(endpoint) &&
      !/^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?(\/|$)/i.test(endpoint)
    ) {
      fail(400, "Use an HTTPS endpoint or a local endpoint on localhost.");
    }

    var exercises = $app.findRecordsByFilter("exercises", 'active = true && (owner = "" || owner = {:owner})', "name", 500, 0, { owner: e.auth.id });
    if (exercises.length === 0) {
      fail(400, "No exercises are available yet. Add exercises and try again.");
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
                "You are a cautious workout planner. Create a practical, varied weekly plan for the requested period and match exactly the requested number of workouts for each type per week. Distribute sessions across the available days, schedule rest between demanding strength sessions, and build cardio and intervals gradually. For strength, use only exercises from available_exercises, choose equipment from each exercise's equipment_options, and provide sets, a realistic rep range, starting_weight 0 unless the user explicitly provided a training weight, and a small weight_increment. Do not diagnose or prescribe rehabilitation; advise users with symptoms to stop and seek professional guidance. Return only valid JSON with title, summary, and workouts; do not use markdown. Write all user-facing text in English.",
            },
            { role: "user", content: JSON.stringify(userPrompt) },
          ],
        }),
      });
    } catch (_) {
      fail(502, "The AI provider is unreachable. Check the endpoint and network, then try again.");
    }

    if (response.statusCode < 200 || response.statusCode >= 300) {
      $app.logger().error("AI planner provider request failed", "status", response.statusCode);
      fail(502, "The AI provider rejected the request. Check the model and API key.");
    }

    var messageContent = "";
    try {
      messageContent = response.json.choices[0].message.content;
    } catch (_) {
      fail(502, "The AI provider returned an unrecognized chat completion response.");
    }

    var generated;
    try {
      generated = JSON.parse(messageContent);
    } catch (_) {
      fail(502, "The AI provider did not return a valid JSON plan.");
    }

    if (!generated || !Array.isArray(generated.workouts) || generated.workouts.length === 0) {
      fail(502, "The AI did not create any workouts for this period.");
    }
    if (generated.workouts.length !== weeks * weeklyTotal) {
      fail(502, "The AI plan does not contain the exact requested number of workouts; try again.");
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
        fail(502, "The AI plan contains an invalid date or workout.");
      }
      if (selectedDays.indexOf(weekdayNames[new Date(item.date + "T12:00:00Z").getUTCDay()]) < 0) {
        fail(502, "The AI plan contains a date on an unavailable day.");
      }
      var dayOffset = (new Date(item.date + "T12:00:00Z").getTime() - new Date(startDate + "T12:00:00Z").getTime()) / 86400000;
      var itemWeek = Math.floor(dayOffset / 7);
      if (itemWeek < 0 || itemWeek >= weeks) {
        fail(502, "The AI plan contains a session outside the selected week.");
      }
      actualTypeCounts[itemWeek][item.type]++;

      var normalized = {
        date: item.date,
        type: item.type,
        title: cleanText(item.title, 120, "Workout"),
        duration_minutes: item.duration_minutes,
        notes: cleanText(item.notes, 1200, ""),
      };

      if (item.type === "strength") {
        if (!Array.isArray(item.strength_exercises) || item.strength_exercises.length < 1 || item.strength_exercises.length > 12) {
          fail(502, "A strength workout must contain between 1 and 12 exercises.");
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
            fail(502, "The AI plan contains an invalid strength exercise or set.");
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
          fail(502, "The AI plan contains an invalid cardio distance.");
        }
        normalized.distance_km = item.distance_km || 0;
      } else if (item.type === "interval") {
        normalized.cardio_mode = validEnum(item.cardio_mode, validCardio, "running");
        if (
          !isIntegerInRange(item.interval_work_seconds, 1, 3600) ||
          !isIntegerInRange(item.interval_rest_seconds, 0, 3600) ||
          !isIntegerInRange(item.interval_rounds, 1, 100)
        ) {
          fail(502, "The AI plan contains invalid interval settings.");
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
          fail(502, "The AI plan does not contain the requested mix for each week; try again.");
        }
      }
    }

    return e.json(200, {
      title: cleanText(generated.title, 120, "Training plan"),
      summary: cleanText(generated.summary, 2000, ""),
      workouts: normalizedWorkouts,
    });
  },
  $apis.requireAuth()
);
