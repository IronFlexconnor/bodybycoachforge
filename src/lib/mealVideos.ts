// Curated short cooking/meal-prep YouTube videos.
// These are stable, embeddable, well-lit cooking shorts from public channels.
// We deterministically pick one per recipe slug so each card always shows the same clip.

const CURATED_VIDEOS: { id: string; title: string; tags: string[] }[] = [
  { id: "0xMRBvgX9KE", title: "High-protein meal prep", tags: ["chicken", "rice", "high-protein", "bowl", "lunch", "dinner"] },
  { id: "BHcyuzXRqLs", title: "Easy chicken meal prep", tags: ["chicken", "lunch", "dinner", "bowl"] },
  { id: "jnnFYjg8DiU", title: "Salmon dinner prep", tags: ["salmon", "fish", "dinner", "seafood"] },
  { id: "Rg9vP8hETVY", title: "Beef stir fry", tags: ["beef", "stir-fry", "dinner", "asian"] },
  { id: "QoQbR9k_Iz4", title: "Turkey skillet", tags: ["turkey", "skillet", "lunch", "dinner"] },
  { id: "tcRdfVLk9Aw", title: "Protein pancakes", tags: ["breakfast", "pancake", "oats", "protein"] },
  { id: "ZbcRkR9JF6s", title: "Overnight oats", tags: ["breakfast", "oats", "yogurt"] },
  { id: "DBTaPV-IRhU", title: "Egg breakfast bowl", tags: ["breakfast", "egg", "frittata"] },
  { id: "JMIHhE2EH0A", title: "Smoothie bowl", tags: ["smoothie", "snack", "berry", "shake"] },
  { id: "tIzF2tW0avk", title: "Greek yogurt parfait", tags: ["snack", "yogurt", "berry"] },
  { id: "Cflr97Iv9F8", title: "Quinoa bowl", tags: ["quinoa", "vegetarian", "bowl", "lunch"] },
  { id: "Jv2uxzhXFTw", title: "Lentil curry", tags: ["lentil", "curry", "vegetarian", "vegan", "indian"] },
  { id: "iCLI0V_jmws", title: "Chickpea power bowl", tags: ["chickpea", "vegan", "vegetarian", "mediterranean"] },
  { id: "KGS0PvCfV-Y", title: "Tofu stir fry", tags: ["tofu", "vegan", "vegetarian", "asian", "stir-fry"] },
  { id: "v7iIbkSWJEI", title: "Sweet potato plate", tags: ["sweet-potato", "dinner", "recovery"] },
  { id: "g2bX5Sd1xaM", title: "Cauliflower rice keto", tags: ["keto", "low-carb", "cauliflower"] },
  { id: "0vC6-hSBbVA", title: "Avocado toast", tags: ["breakfast", "avocado", "toast"] },
  { id: "L06xm0u_TbE", title: "Greek salad", tags: ["salad", "mediterranean", "lunch", "vegetarian"] },
  { id: "P53q-EuCWss", title: "Asian noodle bowl", tags: ["noodle", "asian", "dinner"] },
  { id: "Z9JiyeKqI1U", title: "Burrito bowl", tags: ["mexican", "rice", "beans", "lunch", "dinner"] },
  { id: "8FBHGfbBCAk", title: "Shrimp skillet", tags: ["shrimp", "seafood", "dinner"] },
  { id: "j09s0_lG2Bk", title: "Pasta with chicken", tags: ["pasta", "chicken", "italian", "dinner"] },
  { id: "Ms-uyjSFWFk", title: "Frittata muffins", tags: ["breakfast", "egg", "frittata", "muffin"] },
  { id: "QNGVsaTl_pE", title: "Energy balls snack", tags: ["snack", "energy", "ball", "no-bake"] },
];

function hashString(s: string): number {
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0;
  return Math.abs(h);
}

export type MealVideoMeta = { id: string; embedUrl: string; watchUrl: string; title: string };

export function videoForRecipe(opts: {
  slug?: string | null;
  title?: string | null;
  meal_type?: string | null;
  dietary_tags?: string[] | null;
  cuisine?: string | null;
}): MealVideoMeta {
  const text = `${opts.title ?? ""} ${opts.meal_type ?? ""} ${(opts.dietary_tags ?? []).join(" ")} ${opts.cuisine ?? ""}`.toLowerCase();
  // Score by tag matches
  const scored = CURATED_VIDEOS.map((v) => ({
    v,
    score: v.tags.reduce((acc, t) => acc + (text.includes(t) ? 1 : 0), 0),
  }));
  const max = Math.max(...scored.map((s) => s.score));
  const top = max > 0 ? scored.filter((s) => s.score === max).map((s) => s.v) : CURATED_VIDEOS;
  // Deterministic pick within top group
  const seed = hashString(opts.slug || opts.title || "meal");
  const pick = top[seed % top.length];
  return {
    id: pick.id,
    embedUrl: `https://www.youtube.com/embed/${pick.id}?rel=0&modestbranding=1&playsinline=1`,
    watchUrl: `https://www.youtube.com/watch?v=${pick.id}`,
    title: pick.title,
  };
}

export function thumbForRecipe(opts: Parameters<typeof videoForRecipe>[0]): string {
  return `https://img.youtube.com/vi/${videoForRecipe(opts).id}/hqdefault.jpg`;
}
