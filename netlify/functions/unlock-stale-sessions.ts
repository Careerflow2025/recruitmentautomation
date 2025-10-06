import type { Config } from "@netlify/functions";
import { createServiceClient } from "../../src/lib/supabase/server";

export default async () => {
  const supabase = createServiceClient();
  const { error } = await supabase.rpc('unlock_stale_locks');

  if (error) {
    console.error("Error unlocking stale sessions:", error);
    return new Response("Error unlocking stale sessions", { status: 500 });
  }

  console.log("Successfully unlocked stale sessions.");
  return new Response("OK");
};

export const config: Config = {
  schedule: "*/2 * * * *",
};
