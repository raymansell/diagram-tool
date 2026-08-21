// This ƒile centralizes the agent loop in one place, so that we can re-use it with
// the same arguments (same tools, same SYSTEM_PROMPT, same stepCountIs()) in both
// the Cloudflare worker (streming chat) as well as the eval harness (batch generateText)

import {
  generateText,
  streamText,
  stepCountIs,
  type LanguageModel,
  type ModelMessage,
} from 'ai';
import { tools } from './tools';

// Shared system prompt used by both the agent (worker side) and the eval
// harness (node side). Keeping it in its own file means the eval doesn't have
// to import the agent class and pull in Cloudflare-specific dependencies.
export const SYSTEM_PROMPT = `You are a diagram design assistant. You help users create and modify diagrams on an Excalidraw canvas.

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

interface AgentArgs {
  model: LanguageModel;
  messages: ModelMessage[];
  // Seed canvas state for the headless simulator. The eval passes this so
  // modify cases can be scored against the post application canvas. The
  // worker leaves it undefined; the browser handles the real mutation.
  canvasState?: any[];
  system?: string;
  maxSteps?: number;
}

// Streaming variant. Used by the worker for the live chat experience.
export function streamAgent({
  model,
  messages,
  system = SYSTEM_PROMPT,
  maxSteps = 5,
}: AgentArgs) {
  return streamText({
    model,
    system,
    messages,
    tools,
    // The stopWhen parameter controls how many times the agent loop can execute
    // before stopping. It tells the AI SDK to perform the internal agent loop and
    // limits the number of iterations. Without this parameter, the AI SDK would
    // only generate once and not perform the loop automatically.
    stopWhen: stepCountIs(maxSteps),
  });
}

// Non streaming variant. Used by the eval so we can collect the full result
// and pull out elements for scoring.
export async function runAgent({
  model,
  messages,
  canvasState,
  system = SYSTEM_PROMPT,
  maxSteps = 5,
}: AgentArgs) {
  const result = await generateText({
    model,
    system,
    messages,
    tools,
    // The stopWhen parameter controls how many times the agent loop can execute
    // before stopping. It tells the AI SDK to perform the internal agent loop and
    // limits the number of iterations. Without this parameter, the AI SDK would
    // only generate once and not perform the loop automatically.
    stopWhen: stepCountIs(maxSteps),
  });
  return {
    text: result.text,
    // Final canvas state built by merging tool call step results from
    // the full message history. The model never saw _current_ canvas state
    // at any particular moment in time. The model relied on what had been said
    // through its own tool call history.
    elements: extractElements(result.steps, canvasState ?? []),
    steps: result.steps,
  };
}

// Walk the agent's tool calls in order and simulate what the canvas would
// look like after they were all applied. This mirrors what the client does
// in the browser: generateDiagram replaces the canvas, modifyDiagram merges
// updates into the matching element by id.
interface StepLike {
  toolResults?: { toolName: string; output: unknown }[];
}

// A model can take multiple steps (up to 5) to complete a task and if
// tools are called, there's no single place to view all the results
// of all tool calls. You must iterate through each message, extract all
// tool results, and consolidate them into a single array to view all
// results in one place. Headlessly simulates canvas state.
export function extractElements(
  steps: StepLike[],
  initial: any[] = [],
): unknown[] {
  let canvas = [...initial];

  for (const step of steps) {
    for (const toolResult of step.toolResults ?? []) {
      if (toolResult.toolName === 'generateDiagram') {
        const output = toolResult.output as any;
        if (Array.isArray(output?.elements)) {
          // Recall this comes from that inputSchema trick still! (tools.ts)
          canvas = [...output.elements];
        }
      } else if (toolResult.toolName === 'modifyDiagram') {
        const output = toolResult.output as any;
        if (typeof output?.elementId === 'string' && output.updates) {
          const target = canvas.find((el) => el.id === output.elementId);
          if (target) {
            Object.assign(target, output.updates);
          }
        }
      }
    }
  }

  return canvas;
}
