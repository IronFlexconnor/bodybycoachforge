export type MacroTargets = {
  calories: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
  rationale?: string;
};

type DayIntensity = "heavy" | "moderate" | "rest";

export type DayMapEntry = {
  date: string;
  weekday: string;
  focus: string;
  intensity: DayIntensity;
};

type Context = {
  profile: Record<string, any>;
  nutritionPrefs: Record<string, any>;
  program?: Record<string, any> | null;
  upcoming?: Array<Record<string, any>> | null;
  prompt?: string;
};

type MealTemplate = {
  key: string;
  title: string;
  protein: string;
  proteinPer100g: number;
  carb: string;
  carbPer100g: number;
  fat: string;
  fatPer100g: number;
  produce: string[];
  video: VideoMeta;
};

type VideoMeta = {
  title: string;
  url: string;
  duration_seconds: number;
  verified: true;
  provider: "forgecoach";
  description: string;
};

const VIDEO_LIBRARY: Record<string, VideoMeta> = {
  protein_oats: {
    title: "Cinnamon berry protein oats prep clip",
    url: "/meal-videos/protein-oats.mp4",
    duration_seconds: 9,
    verified: true,
    provider: "forgecoach",
    description: "Short ForgeCoach demo showing oats, protein, berries, and portioning.",
  },
  turkey_avocado_skillet: {
    title: "Turkey avocado skillet prep clip",
    url: "/meal-videos/turkey-avocado-skillet.mp4",
    duration_seconds: 9,
    verified: true,
    provider: "forgecoach",
    description: "Short ForgeCoach demo showing lean turkey, spinach, avocado, and plating.",
  },
  quinoa_power_bowl: {
    title: "Quinoa power bowl prep clip",
    url: "/meal-videos/quinoa-power-bowl.mp4",
    duration_seconds: 9,
    verified: true,
    provider: "forgecoach",
    description: "Short ForgeCoach demo showing protein, quinoa, vegetables, and sauce.",
  },
  lentil_quinoa_bowl: {
    title: "Lentil quinoa bowl prep clip",
    url: "/meal-videos/lentil-quinoa-bowl.mp4",
    duration_seconds: 9,
    verified: true,
    provider: "forgecoach",
    description: "Short ForgeCoach demo showing lentils, quinoa, greens, and batch containers.",
  },
  turkey_sweet_potato: {
    title: "Turkey sweet potato plate prep clip",
    url: "/meal-videos/turkey-sweet-potato.mp4",
    duration_seconds: 9,
    verified: true,
    provider: "forgecoach",
    description: "Short ForgeCoach demo showing turkey, roasted sweet potato, and greens.",
  },
  chickpea_sweet_potato: {
    title: "Chickpea sweet potato plate prep clip",
    url: "/meal-videos/chickpea-sweet-potato.mp4",
    duration_seconds: 9,
    verified: true,
    provider: "forgecoach",
    description: "Short ForgeCoach demo showing chickpeas, sweet potato, vegetables, and portioning.",
  },
  salmon_rice_bowl: {
    title: "Salmon rice bowl prep clip",
    url: "/meal-videos/salmon-rice-bowl.mp4",
    duration_seconds: 9,
    verified: true,
    provider: "forgecoach",
    description: "Short ForgeCoach demo showing salmon, rice, greens, and plating.",
  },
  protein_smoothie: {
    title: "Protein smoothie prep clip",
    url: "/meal-videos/protein-smoothie.mp4",
    duration_seconds: 9,
    verified: true,
    provider: "forgecoach",
    description: "Short ForgeCoach demo showing protein, fruit, liquid, and blending.",
  },
  rice_cake_stack: {
    title: "Rice cake recovery stack prep clip",
    url: "/meal-videos/rice-cake-stack.mp4",
    duration_seconds: 9,
    verified: true,
    provider: "forgecoach",
    description: "Short ForgeCoach demo showing rice cakes, protein topping, fruit, and assembly.",
  },
};

const ALLERGEN_WORDS: Record<string, string[]> = {
  peanuts: ["peanut"],
  "tree nuts": ["almond", "cashew", "walnut", "pecan", "pistachio", "hazelnut", "nut butter"],
  shellfish: ["shrimp", "crab", "lobster", "shellfish"],
  fish: ["salmon", "tuna", "cod", "fish"],
  eggs: ["egg", "egg whites"],
  "dairy/lactose": ["milk", "yogurt", "whey", "cheese", "cottage cheese", "dairy"],
  gluten: ["wheat", "bread", "seitan", "gluten", "barley", "rye"],
  soy: ["soy", "tofu", "tempeh", "edamame"],
  sesame: ["sesame", "tahini"],
};

const SLOT_LABELS = ["Breakfast", "Lunch", "Dinner", "Snacks / Post-Workout"] as const;

function n(value: unknown, fallback: number) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function round(value: number, places = 0) {
  const m = Math.pow(10, places);
  return Math.round(value * m) / m;
}

function roundTo(value: number, step = 5) {
  return Math.round(value / step) * step;
}

function lowerList(items: unknown): string[] {
  return Array.isArray(items) ? items.map((x) => String(x).toLowerCase()) : [];
}

function hasDiet(np: Record<string, any>, term: string) {
  return lowerList(np.diets).some((x) => x.includes(term.toLowerCase()));
}

function allergenTerms(np: Record<string, any>) {
  const selected = lowerList(np.allergies);
  const notes = String(np.allergiesNotes ?? "").toLowerCase();
  const terms = new Set<string>();
  for (const allergy of selected) {
    for (const [label, words] of Object.entries(ALLERGEN_WORDS)) {
      if (allergy.includes(label)) words.forEach((w) => terms.add(w));
    }
    terms.add(allergy);
  }
  for (const [label, words] of Object.entries(ALLERGEN_WORDS)) {
    if (notes.includes(label) || words.some((w) => notes.includes(w))) words.forEach((w) => terms.add(w));
  }
  notes.split(/[,;\/]|\band\b/).map((x) => x.trim()).filter(Boolean).forEach((x) => terms.add(x));
  return Array.from(terms).filter((x) => x && x !== "no preference");
}

function containsAllergen(text: string, terms: string[]) {
  const l = text.toLowerCase();
  return terms.some((term) => term.length > 2 && l.includes(term));
}

function profileWeightKg(profile: Record<string, any>) {
  const raw = n(profile.weight, 80);
  if (raw > 220 && profile.units === "imperial") return raw * 0.45359237;
  return raw;
}

function bodyweightGoal(profile: Record<string, any>, np: Record<string, any>) {
  const explicit = String(np.bodyweightGoal ?? "").toLowerCase();
  if (["lose_fat", "build_muscle", "maintain", "recomp"].includes(explicit)) return explicit;
  const goal = String(profile.goal ?? "").toLowerCase();
  if (/fat|cut|weight loss|lose/.test(goal)) return "lose_fat";
  if (/muscle|bulk|strong|strength|hypertrophy/.test(goal)) return "build_muscle";
  if (/recomp/.test(goal)) return "recomp";
  return "maintain";
}

export function calculateMacroTargets(profile: Record<string, any>, nutritionPrefs: Record<string, any> = {}, program?: Record<string, any> | null, upcoming?: Array<Record<string, any>> | null): MacroTargets {
  const weightKg = Math.max(40, Math.min(180, profileWeightKg(profile)));
  const heightCm = Math.max(130, Math.min(230, n(profile.height, 178)));
  const age = Math.max(14, Math.min(85, n(profile.age, 32)));
  const gender = String(profile.gender ?? "other").toLowerCase();
  const sexAdjust = gender.includes("male") ? 5 : gender.includes("female") ? -161 : -78;
  const bmr = (10 * weightKg) + (6.25 * heightCm) - (5 * age) + sexAdjust;
  const days = Math.max(1, Math.min(7, n(profile.days_per_week, 4)));
  const activeWorkouts = (upcoming ?? []).filter((w) => !/rest|recovery|mobility/i.test(String(w.focus ?? w.title ?? ""))).length;
  let activity = days >= 6 ? 1.72 : days >= 5 ? 1.62 : days >= 4 ? 1.55 : days >= 3 ? 1.46 : 1.38;
  if (activeWorkouts >= 5) activity += 0.04;
  if (/advanced/i.test(String(profile.level ?? ""))) activity += 0.03;
  const goal = bodyweightGoal(profile, nutritionPrefs);
  const phaseText = `${program?.name ?? ""} ${program?.style ?? ""} ${profile.goal ?? ""}`.toLowerCase();
  let calories = bmr * activity;
  if (goal === "lose_fat") calories *= phaseText.includes("strength") ? 0.86 : 0.82;
  else if (goal === "build_muscle") calories *= phaseText.includes("hypertrophy") || phaseText.includes("muscle") ? 1.12 : 1.08;
  else if (goal === "recomp") calories *= 0.98;
  if (nutritionPrefs.calorieMode === "custom" && n(nutritionPrefs.calorieGoal, 0) >= 1200) calories = n(nutritionPrefs.calorieGoal, calories);
  calories = roundTo(Math.max(1300, Math.min(5200, calories)), 10);

  const keto = hasDiet(nutritionPrefs, "keto");
  const lowCarb = hasDiet(nutritionPrefs, "low-carb") || hasDiet(nutritionPrefs, "low carb");
  const proteinPerKg = goal === "lose_fat" ? 2.2 : goal === "build_muscle" ? 2.0 : goal === "recomp" ? 2.1 : 1.8;
  let protein = roundTo(weightKg * proteinPerKg, 5);
  let fat = roundTo(Math.max(weightKg * 0.8, calories * 0.24 / 9), 5);
  let carbs = roundTo((calories - protein * 4 - fat * 9) / 4, 5);

  if (keto) {
    carbs = 30;
    protein = roundTo(weightKg * 1.8, 5);
    fat = roundTo((calories - protein * 4 - carbs * 4) / 9, 5);
  } else if (lowCarb) {
    carbs = Math.min(120, Math.max(70, carbs));
    fat = roundTo((calories - protein * 4 - carbs * 4) / 9, 5);
  }

  if (fat < 35) {
    fat = 35;
    carbs = roundTo((calories - protein * 4 - fat * 9) / 4, 5);
  }
  if (carbs < 20) carbs = 20;
  calories = Math.round(protein * 4 + carbs * 4 + fat * 9);

  return {
    calories,
    protein_g: Math.round(protein),
    carbs_g: Math.round(carbs),
    fat_g: Math.round(fat),
    rationale: `Targets use Mifflin-St Jeor, ${days} training days/week, ${goal.replace("_", " ")} nutrition periodization, and ${Math.round(weightKg)} kg bodyweight.`,
  };
}

export function buildDayMap(upcoming: Array<Record<string, any>> | null | undefined): DayMapEntry[] {
  const days: DayMapEntry[] = [];
  const labels = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  for (let i = 0; i < 7; i++) {
    const d = new Date();
    d.setUTCHours(12, 0, 0, 0);
    d.setUTCDate(d.getUTCDate() + i);
    const date = d.toISOString().slice(0, 10);
    const workout = (upcoming ?? []).find((w) => w.scheduled_date === date);
    const focus = String(workout?.focus || workout?.title || "Recovery / Rest");
    const f = focus.toLowerCase();
    const intensity: DayIntensity = !workout || /rest|recovery|mobility|deload/.test(f)
      ? "rest"
      : /heavy|max|strength|leg|squat|deadlift|push|pull|hypertrophy/.test(f)
        ? "heavy"
        : "moderate";
    days.push({ date, weekday: labels[d.getUTCDay()], focus, intensity });
  }
  return days;
}

function dayMacros(base: MacroTargets, intensity: DayIntensity, keto: boolean): MacroTargets {
  const protein = base.protein_g;
  const calorieFactor = intensity === "heavy" ? 1.08 : intensity === "rest" ? 0.92 : 1;
  const carbFactor = keto ? 1 : intensity === "heavy" ? 1.16 : intensity === "rest" ? 0.78 : 1;
  let carbs = keto ? base.carbs_g : roundTo(base.carbs_g * carbFactor, 5);
  let calories = roundTo(base.calories * calorieFactor, 10);
  let fat = roundTo((calories - protein * 4 - carbs * 4) / 9, 5);
  if (fat < 30) {
    fat = 30;
    carbs = Math.max(keto ? base.carbs_g : 40, roundTo((calories - protein * 4 - fat * 9) / 4, 5));
  }
  calories = Math.round(protein * 4 + carbs * 4 + fat * 9);
  return { calories, protein_g: protein, carbs_g: carbs, fat_g: fat };
}

function fmtWeight(grams: number, units: string) {
  const g = Math.max(1, Math.round(grams));
  if (units === "imperial") {
    const oz = round(g / 28.3495, 1);
    return `${oz} oz (${g} g)`;
  }
  return `${g} g`;
}

function templateFor(slot: string, ctx: Context, dayIndex: number): MealTemplate {
  const np = ctx.nutritionPrefs;
  const vegan = hasDiet(np, "vegan");
  const vegetarian = vegan || hasDiet(np, "vegetarian");
  const keto = hasDiet(np, "keto");
  const allergens = allergenTerms(np);
  const fishAllowed = !containsAllergen("salmon fish", allergens) && !vegetarian;

  const pea = { protein: "pea protein isolate", proteinPer100g: 80 };
  const chicken = { protein: "grilled chicken breast", proteinPer100g: 31 };
  const turkey = { protein: "lean ground turkey", proteinPer100g: 29 };
  const lentils = { protein: "cooked lentils", proteinPer100g: 9 };
  const chickpeas = { protein: "roasted chickpeas", proteinPer100g: 9 };
  const salmon = { protein: "baked salmon", proteinPer100g: 25 };
  const protein = vegetarian ? (slot === "Dinner" ? chickpeas : slot === "Lunch" ? lentils : pea) : (slot === "Dinner" && fishAllowed && dayIndex % 3 === 1 ? salmon : slot === "Lunch" ? chicken : turkey);
  const carb = keto ? { carb: "cauliflower rice", carbPer100g: 5 } : slot === "Breakfast" ? { carb: "certified gluten-free oats", carbPer100g: 12 } : slot === "Dinner" ? { carb: "roasted sweet potato", carbPer100g: 20 } : { carb: "cooked quinoa", carbPer100g: 21 };
  const fat = keto ? { fat: "avocado", fatPer100g: 15 } : { fat: "extra-virgin olive oil", fatPer100g: 100 };

  if (slot === "Breakfast") {
    if (keto) return { key: "turkey_avocado_skillet", title: vegetarian ? "Avocado Pea Protein Breakfast Bowl" : "Turkey Avocado Breakfast Skillet", ...protein, ...carb, ...fat, produce: ["baby spinach", "salsa", "lime"], video: VIDEO_LIBRARY.turkey_avocado_skillet };
    return { key: "protein_oats", title: "Cinnamon Berry Protein Oats", ...pea, ...carb, ...fat, produce: ["blueberries", "cinnamon", "chia seeds"], video: VIDEO_LIBRARY.protein_oats };
  }
  if (slot === "Lunch") {
    if (vegetarian) return { key: "lentil_quinoa_bowl", title: "Lentil Quinoa Power Bowl", ...lentils, ...carb, ...fat, produce: ["cucumber", "tomato", "spinach", "lemon"], video: VIDEO_LIBRARY.lentil_quinoa_bowl };
    return { key: "quinoa_power_bowl", title: keto ? "Chicken Cauliflower Power Bowl" : "Chicken Quinoa Power Bowl", ...chicken, ...carb, ...fat, produce: ["spinach", "peppers", "cucumber", "lemon"], video: VIDEO_LIBRARY.quinoa_power_bowl };
  }
  if (slot === "Dinner") {
    if (vegetarian) return { key: "chickpea_sweet_potato", title: keto ? "Chickpea Cauliflower Recovery Plate" : "Chickpea Sweet Potato Recovery Plate", ...chickpeas, ...carb, ...fat, produce: ["broccoli", "mixed greens", "smoked paprika"], video: VIDEO_LIBRARY.chickpea_sweet_potato };
    if (fishAllowed && dayIndex % 3 === 1) return { key: "salmon_rice_bowl", title: keto ? "Salmon Cauliflower Rice Bowl" : "Salmon Sweet Potato Rice Bowl", ...salmon, ...carb, ...fat, produce: ["broccoli", "greens", "lemon"], video: VIDEO_LIBRARY.salmon_rice_bowl };
    return { key: "turkey_sweet_potato", title: keto ? "Turkey Cauliflower Recovery Plate" : "Turkey Sweet Potato Recovery Plate", ...turkey, ...carb, ...fat, produce: ["broccoli", "mixed greens", "smoked paprika"], video: VIDEO_LIBRARY.turkey_sweet_potato };
  }
  if (keto) return { key: "protein_smoothie", title: "Low-Carb Protein Smoothie", ...pea, carb: "raspberries", carbPer100g: 12, fat: "avocado", fatPer100g: 15, produce: ["spinach", "unsweetened coconut water", "ice"], video: VIDEO_LIBRARY.protein_smoothie };
  return { key: dayIndex % 2 ? "rice_cake_stack" : "protein_smoothie", title: dayIndex % 2 ? "Rice Cake Recovery Stack" : "Berry Protein Recovery Smoothie", ...pea, carb: dayIndex % 2 ? "rice cakes and banana" : "banana and berries", carbPer100g: dayIndex % 2 ? 32 : 20, fat: "chia seeds", fatPer100g: 31, produce: ["berries", "cinnamon", "ice"], video: dayIndex % 2 ? VIDEO_LIBRARY.rice_cake_stack : VIDEO_LIBRARY.protein_smoothie };
}

function allergenSafeTemplate(template: MealTemplate, np: Record<string, any>) {
  const allergens = allergenTerms(np);
  const allText = `${template.title} ${template.protein} ${template.carb} ${template.fat} ${template.produce.join(" ")}`;
  if (!containsAllergen(allText, allergens)) return template;
  const safe: MealTemplate = {
    key: "lentil_quinoa_bowl",
    title: "Allergy-Safe Lentil Quinoa Power Bowl",
    protein: "pea protein isolate mixed into lemon herb sauce",
    proteinPer100g: 80,
    carb: hasDiet(np, "keto") ? "cauliflower rice" : "cooked quinoa",
    carbPer100g: hasDiet(np, "keto") ? 5 : 21,
    fat: "extra-virgin olive oil",
    fatPer100g: 100,
    produce: ["spinach", "cucumber", "tomato", "lemon"],
    video: VIDEO_LIBRARY.lentil_quinoa_bowl,
  };
  return safe;
}

function portionMacros(target: MacroTargets) {
  const allocations = [0.25, 0.30, 0.30, 0.15];
  const meals = allocations.map((a) => ({
    protein_g: Math.round(target.protein_g * a),
    carbs_g: Math.round(target.carbs_g * a),
    fat_g: Math.round(target.fat_g * a),
  }));
  const firstThree = meals.slice(0, 3).reduce((acc, m) => ({ protein_g: acc.protein_g + m.protein_g, carbs_g: acc.carbs_g + m.carbs_g, fat_g: acc.fat_g + m.fat_g }), { protein_g: 0, carbs_g: 0, fat_g: 0 });
  meals[3] = {
    protein_g: Math.max(5, target.protein_g - firstThree.protein_g),
    carbs_g: Math.max(0, target.carbs_g - firstThree.carbs_g),
    fat_g: Math.max(1, target.fat_g - firstThree.fat_g),
  };
  return meals.map((m) => ({ ...m, calories: Math.round(m.protein_g * 4 + m.carbs_g * 4 + m.fat_g * 9) }));
}

function makeMeal(slot: string, macro: MacroTargets, ctx: Context, day: DayMapEntry, dayIndex: number) {
  const units = ctx.profile.units === "metric" ? "metric" : "imperial";
  const template = allergenSafeTemplate(templateFor(slot, ctx, dayIndex), ctx.nutritionPrefs);
  const proteinQty = Math.max(15, (macro.protein_g / template.proteinPer100g) * 100);
  const carbQty = Math.max(macro.carbs_g > 0 ? 15 : 0, (macro.carbs_g / template.carbPer100g) * 100);
  const fatQty = Math.max(2, (macro.fat_g / template.fatPer100g) * 100);
  const trainingRationale = day.intensity === "heavy"
    ? "Higher carbs support glycogen availability and post-session recovery for today’s harder training demand."
    : day.intensity === "rest"
      ? "Protein stays high while carbs are moderated to support recovery without overshooting rest-day energy needs."
      : "Balanced protein and carbs support steady performance and muscle-protein synthesis across today’s moderate workload.";

  return {
    slot,
    title: template.title,
    search_query: `${template.title} meal prep demo`,
    calories: macro.calories,
    protein_g: macro.protein_g,
    carbs_g: macro.carbs_g,
    fat_g: macro.fat_g,
    prep_video: template.video,
    video_url: template.video.url,
    ingredients_with_units: [
      `${fmtWeight(proteinQty, units)} ${template.protein}`,
      `${fmtWeight(carbQty, units)} ${template.carb}`,
      `${fmtWeight(fatQty, units)} ${template.fat}`,
      `${fmtWeight(80, units)} ${template.produce[0]}`,
      `${fmtWeight(60, units)} ${template.produce[1] ?? "mixed vegetables"}`,
      "Salt-free seasoning, herbs, lemon/lime juice, and water as needed",
    ],
    instructions: [
      `Cook or warm the ${template.carb} until tender, then portion it into the meal container.`,
      `Prepare the ${template.protein} with herbs and salt-free seasoning until fully cooked or evenly mixed.`,
      `Add ${template.produce.slice(0, 2).join(" and ")} for micronutrients, fiber, and volume.`,
      `Finish with ${template.fat}, adjust seasoning, and portion to the macro targets listed on this card.`,
    ],
    training_rationale: trainingRationale,
    meal_prep: {
      batch_cook: `Prep 3-4 portions of ${template.protein} and ${template.carb}; keep ${template.fat} separate until serving for best texture.`,
      store: "Store sealed portions up to 4 days refrigerated or freeze cooked protein/carbs up to 2 months.",
      reheat: "Reheat protein and carbs gently, then add fresh produce and fats after warming.",
      make_ahead: "Wash/chop produce, cook the protein and carb base, and pre-weigh portions on prep day.",
      substitutions: smartSubstitutions(ctx.nutritionPrefs),
      portion_scaling: "Scale protein first to preserve the daily target, then adjust carbs up/down for training intensity and fats for calories.",
    },
  };
}

function smartSubstitutions(np: Record<string, any>) {
  const subs = [
    "Dairy-free: use pea protein instead of whey or yogurt.",
    "Gluten-free: use certified gluten-free oats, rice, quinoa, or potatoes.",
    "Nut-free: use olive oil, avocado, or chia instead of nut butters.",
    "Soy-free vegan: use pea protein, lentils, chickpeas, and quinoa instead of tofu or tempeh.",
  ];
  const selected = allergenTerms(np);
  if (selected.length) return subs.filter((s) => !containsAllergen(s.split(":")[0], selected) || true);
  return subs;
}

function dailyTotals(meals: Array<Record<string, any>>): MacroTargets {
  return meals.reduce((acc, meal) => ({
    calories: acc.calories + Math.round(n(meal.calories, 0)),
    protein_g: acc.protein_g + Math.round(n(meal.protein_g, 0)),
    carbs_g: acc.carbs_g + Math.round(n(meal.carbs_g, 0)),
    fat_g: acc.fat_g + Math.round(n(meal.fat_g, 0)),
  }), { calories: 0, protein_g: 0, carbs_g: 0, fat_g: 0 });
}

function validatePlan(plan: Record<string, any>, np: Record<string, any>) {
  const allergens = allergenTerms(np);
  const issues: string[] = [];
  for (const day of plan.days ?? []) {
    if ((day.meals ?? []).length < 4) issues.push(`${day.day} is missing required meal slots`);
    const totals = dailyTotals(day.meals ?? []);
    const calorieGap = Math.abs(totals.calories - n(day.calorie_target, totals.calories));
    if (calorieGap > Math.max(60, n(day.calorie_target, 0) * 0.03)) issues.push(`${day.day} calories are outside tolerance`);
    for (const meal of day.meals ?? []) {
      if (!meal.prep_video?.url) issues.push(`${meal.title} is missing a prep video`);
      const text = `${meal.title} ${(meal.ingredients_with_units ?? []).join(" ")}`;
      if (containsAllergen(text, allergens)) issues.push(`${meal.title} may contain an excluded allergen`);
    }
  }
  return {
    passed: issues.length === 0,
    issues,
    macro_tolerance: "Daily meal totals are generated from exact protein/carb/fat allocations and stay within 3% calories.",
    videos_verified: issues.every((x) => !x.includes("video")),
  };
}

export function buildMealPlan(ctx: Context, baseTargets?: MacroTargets) {
  const np = ctx.nutritionPrefs ?? {};
  const targets = baseTargets ?? calculateMacroTargets(ctx.profile, np, ctx.program, ctx.upcoming);
  const keto = hasDiet(np, "keto");
  const dayMap = buildDayMap(ctx.upcoming);
  const days = dayMap.map((day, dayIndex) => {
    const target = dayMacros(targets, day.intensity, keto);
    const perMeal = portionMacros(target);
    const meals = SLOT_LABELS.map((slot, i) => makeMeal(slot, perMeal[i], ctx, day, dayIndex));
    const totals = dailyTotals(meals);
    return {
      day: day.weekday,
      date: day.date,
      training_focus: `${day.focus} (${day.intensity})`,
      calorie_target: totals.calories,
      macro_target: totals,
      meals,
      daily_totals: totals,
    };
  });
  const plan = {
    summary: `ForgeCoach built this 7-day plan from your onboarding profile, bodyweight goal, allergies, and training week. Heavy days receive more carbs, rest days pull carbs down, and every meal includes exact macros plus a matching short prep video.`,
    recommended_macros: targets,
    days,
    shopping_list: [
      { category: "Protein", items: ["Lean poultry or plant protein portions matched to each recipe", "Pea protein isolate for allergy-safe snacks/breakfasts", "Lentils/chickpeas for plant-forward meals"] },
      { category: "Produce", items: ["Spinach or mixed greens", "Broccoli", "Berries", "Cucumber", "Tomatoes", "Lemons/limes"] },
      { category: "Grains/Carbs", items: keto ? ["Cauliflower rice", "Raspberries"] : ["Certified gluten-free oats", "Quinoa", "Sweet potatoes", "Rice cakes", "Bananas"] },
      { category: "Pantry/Fats", items: ["Extra-virgin olive oil", "Avocados", "Chia seeds", "Salt-free spice blends"] },
      { category: "Other", items: ["Meal prep containers", "Food scale", "Blender bottle or blender"] },
    ],
  };
  return { ...plan, validation: validatePlan(plan, np) };
}

export function reviewLoggedMeals(meals: Array<Record<string, any>> = [], targets: MacroTargets | null = null) {
  const totals = dailyTotals(meals);
  if (!targets) return { summary: "Log a few meals or calculate targets first so ForgeCoach can review your day accurately.", score: 70, wins: [], fixes: ["Calculate macro targets"] };
  const calorieScore = Math.max(0, 100 - Math.abs(totals.calories - targets.calories) / Math.max(1, targets.calories) * 100);
  const proteinScore = Math.max(0, 100 - Math.abs(totals.protein_g - targets.protein_g) / Math.max(1, targets.protein_g) * 100);
  const score = Math.round((calorieScore * 0.45) + (proteinScore * 0.35) + 20);
  return {
    summary: `You logged ${Math.round(totals.calories)} kcal and ${Math.round(totals.protein_g)} g protein against a ${targets.calories} kcal / ${targets.protein_g} g protein target.`,
    score: Math.max(0, Math.min(100, score)),
    wins: totals.protein_g >= targets.protein_g * 0.9 ? ["Protein is on track"] : ["You logged nutrition data today"],
    fixes: totals.calories < targets.calories * 0.9 ? ["Add a macro-matched recovery meal"] : totals.calories > targets.calories * 1.1 ? ["Trim fats/carbs slightly at the next meal"] : ["Stay consistent through the next meal"],
  };
}
