import { routeAgentRequest } from "agents";
import { JamRoom } from "./agents/JamRoom";
import { handleJamHttp } from "./routes/jam";

export { JamRoom };

export default {
  async fetch(
    request: Request,
    env: Env,
    _ctx: ExecutionContext,
  ): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname.startsWith("/api/")) {
      return handleJamHttp(request, env);
    }

    const routed = await routeAgentRequest(request, env);
    if (routed) return routed;

    return env.ASSETS.fetch(request);
  },
} satisfies ExportedHandler<Env>;
