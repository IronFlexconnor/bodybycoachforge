// Curated, REAL embeddable YouTube meal-prep videos.
// We deterministically pick the most relevant clip per recipe so every card
// shows a working, on-topic video.

const CURATED_VIDEOS: { id: string; title: string; tags: string[] }[] = [
  {
    id: "w_Ja6PilPNg",
    title: "High-Protein Meal Prep for Busy People",
    tags: ["high-protein", "lunch", "dinner", "chicken", "rice", "bowl", "busy", "weeknight"],
  },
  {
    id: "0GNfATCkS8g",
    title: "Budget-Friendly High-Protein Week Meal Prep",
    tags: ["high-protein", "budget", "lunch", "dinner", "chicken", "rice", "beans", "bowl"],
  },
  {
    id: "8VM4Df5fBlA",
    title: "12 Quick & Easy High-Protein Recipes",
    tags: ["high-protein", "quick", "easy", "lunch", "dinner", "snack", "chicken", "egg", "tuna"],
  },
  {
    id: "vqZkRTslHwE",
    title: "Healthy High-Protein + Fiber Meal Prep Ideas",
    tags: ["high-protein", "fiber", "healthy", "lunch", "dinner", "bowl", "salad", "quinoa", "beans"],
  },
  {
    id: "5XscNlXwZDw",
    title: "10 Easy High-Protein Meal Prep Recipes",
    tags: ["high-protein", "easy", "lunch", "dinner", "chicken", "beef", "turkey", "bowl"],
  },
  {
    id: "y1uQwAlPYaI",
    title: "One-Pot Healthy High-Protein Dinners",
    tags: ["high-protein", "dinner", "one-pot", "skillet", "chicken", "beef", "pasta", "stew", "soup"],
  },
  {
    id: "Dqf-uc_-R6I",
    title: "6 Amazing Real-Life High-Protein Recipes",
    tags: ["high-protein", "lunch", "dinner", "snack", "chicken", "salmon", "egg"],
  },
  {
    id: "K1CJOhPM_4Q",
    title: "30-Minute High-Protein Meal Prep",
    tags: ["high-protein", "quick", "30-minute", "lunch", "dinner", "chicken", "rice", "bowl"],
  },
  {
    id: "ltaz1HVgktQ",
    title: "Healthy Meal Prep with 6 Ingredients",
    tags: ["healthy", "easy", "simple", "lunch", "dinner", "bowl", "minimal"],
  },
  {
    id: "gvJuykYhy5s",
    title: "Full Week Meal Prep in 1 Hour",
    tags: ["meal-prep", "week", "lunch", "dinner", "breakfast", "batch"],
  },
  {
    id: "J8PGVR9Rn1o",
    title: "High-Protein Plant-Based Meal Prep",
    tags: [
      "vegan",
      "vegetarian",
      "plant-based",
      "tofu",
      "tempeh",
      "lentil",
      "chickpea",
      "bean",
      "high-protein",
      "lunch",
      "dinner",
    ],
  },
  {
    id: "XiuRe95_8Uo",
    title: "High-Protein Freezer Meal Prep (Breakfast/Lunch/Dinner)",
    tags: [
      "high-protein",
      "freezer",
      "breakfast",
      "lunch",
      "dinner",
      "egg",
      "burrito",
      "oats",
      "pancake",
      "muffin",
    ],
  },
];

function hashString(s: string): number {
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0;
  return Math.abs(h);
}

export type MealVideoMeta = {
  id: string;
  embedUrl: string;
  watchUrl: string;
  title: string;
};

type RecipeLike = {
  slug?: string | null;
  title?: string | null;
  meal_type?: string | null;
  dietary_tags?: string[] | null;
  cuisine?: string | null;
};

function pickVideo(opts: RecipeLike, offset = 0) {
  const tags = (opts.dietary_tags ?? []).map((t) => t.toLowerCase());
  const text = `${opts.title ?? ""} ${opts.meal_type ?? ""} ${tags.join(" ")} ${opts.cuisine ?? ""}`.toLowerCase();

  const isVegan = tags.includes("vegan") || /\bvegan\b/.test(text);
  const isVegetarian = isVegan || tags.includes("vegetarian") || /\bvegetarian\b/.test(text);
  const isBreakfast = (opts.meal_type ?? "").toLowerCase() === "breakfast" || /\bbreakfast\b/.test(text);

  const scored = CURATED_VIDEOS.map((v) => {
    let score = v.tags.reduce((acc, t) => acc + (text.includes(t) ? 1 : 0), 0);
    // Strong boosts so dietary intent wins over keyword noise
    if (isVegan && v.tags.includes("vegan")) score += 10;
    if (isVegetarian && (v.tags.includes("vegan") || v.tags.includes("vegetarian"))) score += 4;
    if (!isVegetarian && v.tags.includes("vegan")) score -= 5; // don't push plant-based on meaty recipes
    if (isBreakfast && v.tags.includes("breakfast")) score += 6;
    return { v, score };
  });

  const max = Math.max(...scored.map((s) => s.score));
  const top = max > 0 ? scored.filter((s) => s.score === max).map((s) => s.v) : CURATED_VIDEOS;
  const seed = hashString(opts.slug || opts.title || "meal") + offset;
  return top[seed % top.length];
}

export function videoForRecipe(opts: RecipeLike, offset = 0): MealVideoMeta {
  const pick = pickVideo(opts, offset);
  return {
    id: pick.id,
    embedUrl: `https://www.youtube.com/embed/${pick.id}?rel=0&modestbranding=1&playsinline=1`,
    watchUrl: `https://www.youtube.com/watch?v=${pick.id}`,
    title: pick.title,
  };
}

export function thumbForRecipe(opts: RecipeLike, offset = 0): string {
  const pick = pickVideo(opts, offset);
  // mqdefault is small (~10KB) and loads instantly on mobile.
  return `https://i.ytimg.com/vi/${pick.id}/mqdefault.jpg`;
}

// Used by chat "regenerate video" intent — pick a different real video.
export function nextVideoForRecipe(opts: RecipeLike, currentOffset = 0): MealVideoMeta {
  return videoForRecipe(opts, currentOffset + 1);
}
