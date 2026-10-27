<svelte:head><title>Insights · T.O.P. Trainer</title></svelte:head>

<div class="space-y-5">
  <div>
    <p class="text-sm font-bold uppercase tracking-[0.18em] text-overload-signal">Progress</p>
    <h2 class="mt-1 text-3xl font-black">Insights</h2>
    <p class="mt-1 text-gray-600 dark:text-gray-300">Explore your progress by topic. Choose a section to see its statistics and trends.</p>
  </div>

  <div class="grid gap-3 sm:grid-cols-2">
    <a class="card transition hover:border-primary-300" href="/stats/training">
      <h3 class="text-xl font-bold">Training</h3>
      <p class="mt-1 text-gray-600 dark:text-gray-300">Workout frequency, duration, running, cycling, Life activities (walking and hiking), and breakdown by type.</p>
      <span class="mt-3 inline-block font-bold text-overload-signal">View training insights →</span>
    </a>
    <a class="card transition hover:border-primary-300" href="/stats/exercises">
      <h3 class="text-xl font-bold">Exercises</h3>
      <p class="mt-1 text-gray-600 dark:text-gray-300">Track your weight, reps, estimated 1RM, and progress for each exercise.</p>
      <span class="mt-3 inline-block font-bold text-overload-signal">View exercise trends →</span>
    </a>
    <a class="card transition hover:border-primary-300" href="/stats/body">
      <h3 class="text-xl font-bold">Body</h3>
      <p class="mt-1 text-gray-600 dark:text-gray-300">View weight, BMI, and waist trends over a selected period.</p>
      <span class="mt-3 inline-block font-bold text-overload-signal">View body measurements →</span>
    </a>
    <a class="card transition hover:border-primary-300" href="/health/fasting">
      <h3 class="text-xl font-bold">Fasting</h3>
      <p class="mt-1 text-gray-600 dark:text-gray-300">Your fasting program, daily check-ins, and streaks are in Health.</p>
      <span class="mt-3 inline-block font-bold text-overload-signal">Go to Health · Fasting →</span>
    </a>
  </div>
</div>
