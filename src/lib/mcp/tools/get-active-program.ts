import { defineTool } from "@lovable.dev/mcp-js";
import { supabaseForUser } from "../supabase";

export default defineTool({
  name: "get_active_program",
  title: "Get active training program",
  description: "Return the signed-in user's currently active training program with upcoming workouts.",
  inputSchema: {},
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async (_input, ctx) => {
    if (!ctx.isAuthenticated()) return { content: [{ type: "text", text: "Not authenticated" }], isError: true };
    const sb = supabaseForUser(ctx);
    const { data: programs, error } = await sb
      .from("programs")
      .select("*, workouts(*)")
      .eq("user_id", ctx.getUserId()!)
      .eq("is_active", true)
      .order("created_at", { ascending: false })
      .limit(1);
    if (error) return { content: [{ type: "text", text: error.message }], isError: true };
    const program = programs?.[0] ?? null;
    return { content: [{ type: "text", text: JSON.stringify(program) }], structuredContent: { program } };
  },
});
