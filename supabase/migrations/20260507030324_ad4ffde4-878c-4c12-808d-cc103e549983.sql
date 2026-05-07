
CREATE TABLE IF NOT EXISTS public.recipes (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  slug TEXT NOT NULL UNIQUE,
  title TEXT NOT NULL,
  description TEXT,
  cuisine TEXT,
  meal_type TEXT NOT NULL,
  dietary_tags TEXT[] NOT NULL DEFAULT '{}',
  allergens TEXT[] NOT NULL DEFAULT '{}',
  mood_tags TEXT[] NOT NULL DEFAULT '{}',
  prep_minutes INTEGER NOT NULL DEFAULT 15,
  cook_minutes INTEGER NOT NULL DEFAULT 15,
  difficulty TEXT NOT NULL DEFAULT 'easy',
  servings INTEGER NOT NULL DEFAULT 1,
  calories INTEGER NOT NULL DEFAULT 0,
  protein_g NUMERIC NOT NULL DEFAULT 0,
  carbs_g NUMERIC NOT NULL DEFAULT 0,
  fat_g NUMERIC NOT NULL DEFAULT 0,
  ingredients JSONB NOT NULL DEFAULT '[]'::jsonb,
  instructions JSONB NOT NULL DEFAULT '[]'::jsonb,
  swaps JSONB NOT NULL DEFAULT '[]'::jsonb,
  shopping_list JSONB NOT NULL DEFAULT '[]'::jsonb,
  highlights TEXT[] NOT NULL DEFAULT '{}',
  image_url TEXT,
  hero_emoji TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.recipes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "recipes_read_all" ON public.recipes;
CREATE POLICY "recipes_read_all" ON public.recipes FOR SELECT TO authenticated USING (true);

CREATE INDEX IF NOT EXISTS idx_recipes_meal_type ON public.recipes(meal_type);
CREATE INDEX IF NOT EXISTS idx_recipes_cuisine ON public.recipes(cuisine);
CREATE INDEX IF NOT EXISTS idx_recipes_dietary_tags ON public.recipes USING GIN(dietary_tags);
CREATE INDEX IF NOT EXISTS idx_recipes_mood_tags ON public.recipes USING GIN(mood_tags);
CREATE INDEX IF NOT EXISTS idx_recipes_allergens ON public.recipes USING GIN(allergens);
