import { useState, useCallback, useEffect, useRef } from 'react';
import type { ExcalidrawImperativeAPI } from '@excalidraw/excalidraw/types';
import { useAgent } from 'agents/react';
import { useAgentChat } from '@cloudflare/ai-chat/react';
import {
  CaptureUpdateAction,
  convertToExcalidrawElements,
  newElementWith,
} from '@excalidraw/excalidraw';
import Canvas from './components/Canvas';
import ChatPanel from './components/chat/ChatPanel';
import './App.css';

// AIChatAgent persists chat history in the durable object's SQLite database,
// however the canvas state only lives in the browser. When a user refreshes,
// the canvas resets but the chat history still references the same conversation.
//
// Create a unique session for each page load.
// Keeps the browser canvas and chat history in sync.
// (consider restoring canvas state in the future)
const sessionId = crypto.randomUUID();

function App() {
  const [excalidrawAPI, setExcalidrawAPI] =
    useState<ExcalidrawImperativeAPI | null>(null);
  const [theme, setTheme] = useState<'light' | 'dark'>('light');

  const handleApiReady = useCallback((api: ExcalidrawImperativeAPI) => {
    setExcalidrawAPI(api);
  }, []);

  // Apply each tool output once. Messages re render every time a chunk arrives
  // If we naively apply the tool output every time the effect runs, we'll replay
  // the same diagram on every render. Track applied tool calls by toolCallId
  const appliedToolCalls = useRef(new Set<string>());

  // The Cloudflare Agents SDK provides two React hooks that handle the entire
  // WebSocket connection and chat protocol for us:
  //
  // * useAgent from agents/react opens and manages the WebSocket connection to
  //   the agent Durable Object
  // * useAgentChat from @cloudflare/ai-chat/react sits on top of useAgent and
  //   gives us a familiar chat interface: a messages array, a sendMessage
  //   function, and a status string that tells us whether the agent is idle,
  //   submitted, streaming, or errored
  //
  // https://developers.cloudflare.com/agents/communication-channels/chat/chat-agents/#how-it-works
  //
  // This is the entire connection layer. No manual WebSockets code, no message parsing,
  // no reconnect logic. The hooks handle stream resumption and the entire wire protocol.
  //
  // Connect to a fresh agent instance for this page load.
  const agent = useAgent({ agent: 'design-agent', name: sessionId });
  // useAgentChat manages the chat protocol and message history on top of the agent connection.
  const { messages, sendMessage, status } = useAgentChat({ agent });

  // Watch messages for tool outputs and apply them to the canvas. We handle
  // both tools the agent has: generateDiagram (replace canvas) and
  // modifyDiagram (patch a single existing element by id).
  useEffect(() => {
    if (!excalidrawAPI) {
      return;
    }

    for (const message of messages) {
      // Only `assistant` messages have tool calls associated with them (per AI SDK's UIMessage)
      // We only want to apply messages that contain tool calls, not `user` or
      // `system` messages.
      if (message.role !== 'assistant') {
        continue;
      }

      for (const part of message.parts ?? []) {
        if (
          part.type !== 'tool-generateDiagram' &&
          part.type !== 'tool-modifyDiagram'
        ) {
          continue;
        }

        if (part.state !== 'output-available') {
          continue;
        }

        // This entire effect (most specifically the message history looping) can/will likely
        // run many times over some old `message`s we had already processed in an earlier
        // effect run. In that case, skip over that message as we have already applied its tool.
        //
        // Remember the shape of the UIMessage (see MessageBubble.tsx or log it here)
        // console.log(message);
        if (appliedToolCalls.current.has(part.toolCallId)) {
          continue;
        }

        if (part.type === 'tool-generateDiagram') {
          appliedToolCalls.current.add(part.toolCallId);
          const output = part.output as { elements?: any };
          const skeletonElements = output.elements;

          if (Array.isArray(skeletonElements) && skeletonElements.length > 0) {
            // The agent returns simplified element shapes. Excalidraw needs
            // full element data (seed, versionNonce, etc.) which this helper
            // fills in from a skeleton. Pass `regenerateIds: false` so the
            // ids the agent picked survive — otherwise the canvas ends up
            // with random uuids and any later modifyDiagram call (which uses
            // the agent's chosen ids) silently misses every element.
            const elements = convertToExcalidrawElements(skeletonElements, {
              regenerateIds: false,
            });
            excalidrawAPI.updateScene({ elements });
            // zooms and pans the canvas so newly generated elements are centered and visible
            excalidrawAPI.scrollToContent(elements, { fitToContent: true });
          }
        } else if (part.type === 'tool-modifyDiagram') {
          appliedToolCalls.current.add(part.toolCallId);
          const output = part.output as {
            elementId?: string;
            updates?: Record<string, any>;
          };

          if (output?.elementId && output.updates) {
            // Use Excalidraw's `newElementWith` helper to merge updates into
            // the matching element. It bumps version + versionNonce + the
            // updated timestamp the way the reconciler expects.
            // CaptureUpdateAction.IMMEDIATELY forces the change into the
            // scene store right away instead of deferring to a future tick.
            const current = excalidrawAPI.getSceneElements();
            const next = current.map((el) => {
              return el.id === output.elementId
                ? newElementWith(el, output.updates as any)
                : el;
            });

            excalidrawAPI.updateScene({
              elements: next,
              captureUpdate: CaptureUpdateAction.IMMEDIATELY,
            });
          }
        }
      }
    }
  }, [messages, excalidrawAPI]);

  return (
    <div className={`app ${theme}`}>
      <div className='canvas-container'>
        <Canvas onApiReady={handleApiReady} onThemeChange={setTheme} />
      </div>
      <ChatPanel
        messages={messages}
        sendMessage={sendMessage}
        status={status}
      />
    </div>
  );
}

export default App;
