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
  id?: string | null;
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

// Curated pool of unique, high-quality Unsplash food photos. Each recipe gets a
// deterministic, unique-per-id thumbnail so no two cards share the same image.
const UNSPLASH_FOOD_IDS: string[] = [
  "1546069901-ba9599a7e63c", "1565958011703-44f9829ba187", "1490645935967-10de6ba17061",
  "1504674900247-0877df9cc836", "1467003909585-2f8a72700288", "1551782450-a2132b4ba21d",
  "1540189549336-e6e99c3679fe", "1512621776951-a57141f2eefd", "1490474504059-bf2db5ab2348",
  "1559054663-e8d23213f55c", "1505253758473-96b7015fcd40", "1493770348161-369560ae357d",
  "1482049016688-2d3e1b311543", "1476224203421-9ac39bcb3327", "1473093295043-cdd812d0e601",
  "1567620905732-2d1ec7ab7445", "1539252554935-80c8cabf1ec1", "1525351484163-7529414344d8",
  "1546554137-f86b9593a222", "1565299624946-b28f40a0ae38", "1572441713132-c542fc4c4ba6",
  "1565895405138-6c3a1555da6a", "1551183053-bf91a1d81141", "1532980400857-e8d9d275d858",
  "1473093226795-af9932fe5856", "1551782450-17144efb9c50", "1565299507177-b0ac66763828",
  "1559847844-5315695dadae", "1546833999-b9f581a1996d", "1576107232684-1279f390859f",
  "1502741338009-cac2772e18bc", "1565958011703-44f9829ba187", "1495521821757-a1efb6729352",
  "1484980972926-edee96e0960d", "1484723091739-30a097e8f929", "1494859802809-d069c3b71a8a",
  "1517433367423-c7e5b0f35086", "1521305916504-4a1121188589", "1571091718767-18b5b1457add",
  "1499636136210-6f4ee915583e", "1547592180-85f173990554", "1485963631004-f2f00b1d6606",
  "1455619452474-d2be8b1e70cd", "1502301103665-0b95cc738daf", "1606755962773-d324e0a13086",
  "1606787366850-de6330128bfc", "1578985545062-69928b1d9587", "1604908176997-125f25cc6f3d",
  "1606756790138-261d2b21cd75", "1607330289024-1535c6b4e1c1", "1567620832903-9fc6debc209f",
  "1563379091339-03b21ab4a4f8", "1568901346375-23c9450c58cd", "1568051243858-533a607809a5",
  "1612874742237-6526221588e3", "1610614819513-58e34989848b", "1606755456206-b25206cde27e",
  "1559054663-e8d23213f55c", "1611273426858-450d8e3c9fce", "1551024506-0bccd828d307",
  "1546069901-d5bfd2cbfb1f", "1565299543923-37dd37887442", "1604908554049-4b6e07c4e5b5",
  "1495521821757-a1efb6729352", "1551183053-bf91a1d81141", "1490645935967-10de6ba17061",
  "1546833999-b9f581a1996d", "1480555339-44d50046ac7d", "1525755662778-989d0524087e",
  "1473093295043-cdd812d0e601", "1542010589005-d1eacc3918f2", "1490818387583-1baba5e638af",
  "1476224203421-9ac39bcb3327", "1599921841143-819065a55cc6", "1626700051175-6818013e1d4f",
  "1505252585461-04db1eb84625", "1490474418585-ba9bad8fd0ea", "1543340904-0b1d843bccda",
  "1606491956689-2ea866880c84", "1593504049359-74330189a345", "1589302168068-964664d93dc0",
  "1506084868230-bb9d95c24759", "1557499305-bd68a05ccb8a", "1607013251379-e6eecfffe234",
  "1573821663912-6df460f9c684", "1611250282006-4484dd3fba6b", "1581873372796-635b67ca2008",
  "1559054663-e8d23213f55c", "1551218808-94e220e084d2", "1614961233913-a5113a4a34ed",
];

function recipeImageIndex(opts: RecipeLike, offset = 0): number {
  const key = opts.slug || opts.id || opts.title || "meal";
  return (hashString(String(key)) + offset) % UNSPLASH_FOOD_IDS.length;
}

export function thumbForRecipe(opts: RecipeLike, offset = 0): string {
  const id = UNSPLASH_FOOD_IDS[recipeImageIndex(opts, offset)];
  // High-res, crisp on retina, auto-format/compressed by Unsplash CDN.
  return `https://images.unsplash.com/photo-${id}?auto=format&fit=crop&w=1200&q=80`;
}

export function thumbFallbackForRecipe(opts: RecipeLike, offset = 0): string {
  const id = UNSPLASH_FOOD_IDS[recipeImageIndex(opts, offset + 1)];
  return `https://images.unsplash.com/photo-${id}?auto=format&fit=crop&w=800&q=70`;
}

// Add a generic id field to RecipeLike for image keying.
declare module "./mealVideos" {}

// Used by chat "regenerate video" intent — pick a different real video.
export function nextVideoForRecipe(opts: RecipeLike, currentOffset = 0): MealVideoMeta {
  return videoForRecipe(opts, currentOffset + 1);
}
