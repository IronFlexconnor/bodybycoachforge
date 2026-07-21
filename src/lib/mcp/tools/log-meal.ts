import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { supabaseForUser } from "../supabase";

export default defineTool({
  name: "log_meal",
  title: "Log a meal",
  description: "Insert a meal into the signed-in user's food log with macros.",
  inputSchema: {
    name: z.string().min(1).describe("Meal name, e.g. 'Chicken rice bowl'."),
    calories: z.number().nonnegative().describe("Total kcal."),
    protein_g: z.number().nonnegative().describe("Protein in grams."),
    carbs_g: z.number().nonnegative().describe("Carbs in grams."),
    fat_g: z.number().nonnegative().describe("Fat in grams."),
    eaten_at: z.string().datetime().optional().describe("ISO timestamp; defaults to now."),
  },
  annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
  handler: async (input, ctx) => {
    if (!ctx.isAuthenticated()) return { content: [{ type: "text", text: "Not authenticated" }], isError: true };
    const sb = supabaseForUser(ctx);
    const { data, error } = await sb
      .from("meal_logs")
      .insert({ ...input, user_id: ctx.getUserId()!, eaten_at: input.eaten_at ?? new Date().toISOString() })
      .select()
      .single();
    if (error) return { content: [{ type: "text", text: error.message }], isError: true };
    return { content: [{ type: "text", text: `Logged: ${data.name}` }], structuredContent: { meal: data } };
  },
});
