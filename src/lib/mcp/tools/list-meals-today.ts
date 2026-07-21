import { defineTool } from "@lovable.dev/mcp-js";
import { supabaseForUser } from "../supabase";

export default defineTool({
  name: "list_meals_today",
  title: "List today's meals",
  description: "Return every meal the signed-in user has logged since midnight local server time, with macros.",
  inputSchema: {},
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async (_input, ctx) => {
    if (!ctx.isAuthenticated()) return { content: [{ type: "text", text: "Not authenticated" }], isError: true };
    const sb = supabaseForUser(ctx);
    const since = new Date(); since.setHours(0, 0, 0, 0);
    const { data, error } = await sb
      .from("meal_logs")
      .select("id, name, calories, protein_g, carbs_g, fat_g, eaten_at")
      .eq("user_id", ctx.getUserId()!)
      .gte("eaten_at", since.toISOString())
      .order("eaten_at", { ascending: true });
    if (error) return { content: [{ type: "text", text: error.message }], isError: true };
    const totals = (data ?? []).reduce(
      (a, m) => ({
        calories: a.calories + (m.calories ?? 0),
        protein_g: a.protein_g + (m.protein_g ?? 0),
        carbs_g: a.carbs_g + (m.carbs_g ?? 0),
        fat_g: a.fat_g + (m.fat_g ?? 0),
      }),
      { calories: 0, protein_g: 0, carbs_g: 0, fat_g: 0 },
    );
    return {
      content: [{ type: "text", text: JSON.stringify({ meals: data, totals }) }],
      structuredContent: { meals: data, totals },
    };
  },
});
