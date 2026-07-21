import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { supabaseForUser } from "../supabase";

export default defineTool({
  name: "list_recent_workouts",
  title: "List recent completed workouts",
  description: "Return the user's most recent completed workouts with every logged set (weight, reps, RPE).",
  inputSchema: {
    limit: z.number().int().min(1).max(30).optional().describe("How many recent workouts to return (default 5)."),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ limit }, ctx) => {
    if (!ctx.isAuthenticated()) return { content: [{ type: "text", text: "Not authenticated" }], isError: true };
    const sb = supabaseForUser(ctx);
    const { data, error } = await sb
      .from("workout_logs")
      .select("*, set_logs(*)")
      .eq("user_id", ctx.getUserId()!)
      .not("completed_at", "is", null)
      .order("started_at", { ascending: false })
      .limit(limit ?? 5);
    if (error) return { content: [{ type: "text", text: error.message }], isError: true };
    return { content: [{ type: "text", text: JSON.stringify(data) }], structuredContent: { workouts: data } };
  },
});
