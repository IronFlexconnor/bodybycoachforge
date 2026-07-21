import { auth, defineMcp } from "@lovable.dev/mcp-js";
import getProfile from "./tools/get-profile";
import getActiveProgram from "./tools/get-active-program";
import listRecentWorkouts from "./tools/list-recent-workouts";
import listMealsToday from "./tools/list-meals-today";
import logMeal from "./tools/log-meal";

const projectRef = import.meta.env.VITE_SUPABASE_PROJECT_ID ?? "project-ref-unset";

export default defineMcp({
  name: "body-forge-mcp",
  title: "Body Forge Coach",
  version: "0.1.0",
  instructions:
    "Tools for Body Forge — an AI fitness and nutrition coach. Read the user's profile, active training program, recent completed workouts (with sets/weights/RPE), and today's meals; log new meals with macros. All tools act as the signed-in Body Forge user.",
  auth: auth.oauth.issuer({
    issuer: `https://${projectRef}.supabase.co/auth/v1`,
    acceptedAudiences: "authenticated",
  }),
  tools: [getProfile, getActiveProgram, listRecentWorkouts, listMealsToday, logMeal],
});
