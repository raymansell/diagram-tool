import {
  streamText,
  convertToModelMessages,
  stepCountIs,
  createUIMessageStreamResponse,
  toUIMessageStream,
} from 'ai';
import { createOpenAI } from '@ai-sdk/openai';
import { AIChatAgent } from '@cloudflare/ai-chat';
import { tools } from './tools';

const SYSTEM_PROMPT = `You are a diagram design assistant. You help users create and modify diagrams on an Excalidraw canvas.

When the user asks you to create a diagram, use the generateDiagram tool to produce Excalidraw elements.

Guidelines for generating diagrams:
- Give each element a unique id (e.g. "rect-1", "text-1", "arrow-1")
- Position elements with reasonable spacing (at least 20px gap between elements)
- Use rectangles for boxes/containers, ellipses for circles, diamonds for decision points
- Add text labels inside or near shapes
- Connect related elements with arrows
- Use a clean layout: left to right or top to bottom
- Default to strokeColor "#1e1e1e" and backgroundColor "transparent"
- Set roughness to 1 for a hand-drawn look

When the user asks to modify an element, use the modifyDiagram tool with the element's id.`;

// https://developers.cloudflare.com/agents/runtime/agents-api/#agent-class
// A Cloudflare Agent is a stateful, long lived server side object built on top of Cloudflare's
// Durable Objects. Each agent instance:
// - Is a separate micro-server that runs independently, allowing horizontal scaling.
// - Is globally unique.
// - Has its own isolated storage (SQLite)
// - Handles WebSocket connections for real time communication
// - Persists across requests (it is not a stateless function)
// - Runs on Cloudflare's edge network (or locally via wrangler dev)+
//
// Cloudflare offers different types of agents. We are using an AIChatAgent which gives us
// built in message history, streaming and tool handling.
// https://developers.cloudflare.com/agents/communication-channels/chat/chat-agents/#how-it-works
// The AIChatAgent base class gives us:
// - this.messages - the full chat history, persisted in the durable object's SQLite storage.
// - this.env - access to environment variables (our API key).
// - Websocket handling, message serialization and the chat protocol.
export class DesignAgent extends AIChatAgent<Env> {
  async onChatMessage() {
    const openai = createOpenAI({ apiKey: this.env.OPENAI_API_KEY });

    // With streaming, tool calls are sent back chunk by chunk as deltas, including the tool name,
    // ID, and partial JSON arguments being generated incrementally. Without streaming, you would
    // receive one complete message at the end with all the tool call information already assembled.
    // Streaming allows you to see the generation process in real-time.
    const result = streamText({
      model: openai(this.env.OPENAI_MODEL),
      system: SYSTEM_PROMPT,
      //The convertToModelMessages function ensures that message history is sent to the LLM in the
      // specific format required by the API. It converts messages from the Cloudflare formats that
      // might be useful for UI-related things, to the format that OpenAI expects, preventing API
      // errors caused by incorrectly formatted messages.
      messages: await convertToModelMessages(this.messages),
      tools,
      // The stopWhen parameter controls how many times the agent loop can execute before stopping.
      // It tells the AI SDK to perform the internal agent loop and limits the number of iterations.
      // Without this parameter, the AI SDK would only generate once and not perform the loop automatically.
      stopWhen: stepCountIs(5),
      // OpenAI's strict tool calling mode requires every property in a tool
      // input schema to be in `required` and rejects optional fields. Our
      // modifyDiagram updates are intentionally all optional, so we turn
      // strict mode off. We still get Zod validation locally.
      // we are doing this on purpose to eval non compliance of the JSON schema
      // (either because the model ignored it or because we switch LLM providers)
      providerOptions: { openai: { strictJsonSchema: false } },
    });

    return createUIMessageStreamResponse({
      stream: toUIMessageStream({ stream: result.stream }),
    });
  }
}
