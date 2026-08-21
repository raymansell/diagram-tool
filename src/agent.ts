import {
  convertToModelMessages,
  createUIMessageStreamResponse,
  toUIMessageStream,
} from 'ai';
import { createOpenAI } from '@ai-sdk/openai';
import { AIChatAgent } from '@cloudflare/ai-chat';
import { streamAgent } from './agent-core';

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
    const result = streamAgent({
      model: openai(this.env.OPENAI_MODEL),
      // The convertToModelMessages function ensures that message history is sent to the LLM in the
      // specific format required by the API. It converts messages from the Cloudflare formats that
      // might be useful for UI-related things, to the format that OpenAI expects, preventing API
      // errors caused by incorrectly formatted messages.
      messages: await convertToModelMessages(this.messages),
    });

    return createUIMessageStreamResponse({
      stream: toUIMessageStream({ stream: result.stream }),
    });
  }
}
