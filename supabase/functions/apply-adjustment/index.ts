// Apply or reject a pending AI Coach adjustment.
// Approve → applies training exercise updates and macro target updates, sets status=approved.
// Reject → marks status=rejected, no changes applied.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });
  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: cors });

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } },
    );
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: cors });

    const { adjustment_id, action, training_exercises } = await req.json();
    if (!adjustment_id || !["approve", "reject"].includes(action)) {
      return new Response(JSON.stringify({ error: "Bad request" }), { status: 400, headers: cors });
    }

    const { data: adj } = await supabase.from("program_adjustments").select("*").eq("id", adjustment_id).eq("user_id", user.id).maybeSingle();
    if (!adj) return new Response(JSON.stringify({ error: "Not found" }), { status: 404, headers: cors });
    if (adj.status !== "pending") return new Response(JSON.stringify({ error: "Already reviewed" }), { status: 409, headers: cors });

    if (action === "reject") {
      await supabase.from("program_adjustments").update({ status: "rejected", reviewed_at: new Date().toISOString() }).eq("id", adjustment_id);
      return new Response(JSON.stringify({ ok: true, status: "rejected" }), { headers: { ...cors, "Content-Type": "application/json" } });
    }

    // Approve — apply changes
    if (Array.isArray(training_exercises) && training_exercises.length && adj.workout_id) {
      await supabase.from("workouts").update({ exercises: training_exercises }).eq("id", adj.workout_id);
    }

    if (adj.macro_changes && Object.keys(adj.macro_changes).length) {
      const { data: profile } = await supabase.from("profiles").select("macro_targets").eq("user_id", user.id).maybeSingle();
      await supabase.from("profiles").update({
        macro_targets: { ...(profile?.macro_targets ?? {}), ...adj.macro_changes }
      }).eq("user_id", user.id);
    }

    await supabase.from("program_adjustments").update({ status: "approved", reviewed_at: new Date().toISOString() }).eq("id", adjustment_id);

    return new Response(JSON.stringify({ ok: true, status: "approved" }), { headers: { ...cors, "Content-Type": "application/json" } });
  } catch (e) {
    console.error("apply-adjustment error", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : String(e) }), { status: 500, headers: cors });
  }
});
