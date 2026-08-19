import { DesignAgent } from './agent';
import { routeAgentRequest } from 'agents';

// The agent class must be re-exported from the route worker file to be exposed and accessible.
// This makes the Durable Object namespace available for routing, allowing the WebSocket
// connections and agent requests to be properly routed to the agent instance.
export { DesignAgent };

export default {
  // The fetch function is part of the web worker spec for writing JavaScript in Edge environments.
  // It gets executed whenever there's a request coming into your server.
  // It handles both HTTP requests and WebSocket requests, making it the root API route handler for incoming traffic.
  async fetch(request: Request, env: Env) {
    return (
      // routeAgentRequest inspects the request, finds the right Durable Object, and handles the WebSocket upgrade.
      // If the request is not for an agent, it returns null and we fall through to a 404 (or the Vite plugin serves the React app).
      (await routeAgentRequest(request, env)) ||
      new Response('Not found', { status: 404 })
    );
  },
} satisfies ExportedHandler<Env>;
