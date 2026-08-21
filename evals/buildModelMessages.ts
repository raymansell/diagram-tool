import type { ModelMessage } from 'ai';

export interface SeedData {
  userPrompt: string;
  assistantConfirmation: string;
  elements: unknown[];
}

export interface GoldenTestCase {
  id: string;
  input: string;
  seed?: SeedData;
  expectedCharacteristics: string[];
  expectedKeywords?: string[];
  preservedIds?: string[];
  difficulty: 'simple' | 'medium' | 'hard' | 'edge';
  category: 'create' | 'modify' | 'domain' | 'edge';
}

// `buildModelMessages` simulates a prior conversation state where another tool
// (generate diagram) was called first. Example:
// A modify case can't just be "make the login box red" — the agent has no idea
// what login box you're talking about. The test case carries a seed block that
// describes what the canvas already had on it before the user's modify request:
// see golden.json for examples with a seed. The eval does not pass this raw
// JSON data directly to the agent. That's the point of this helper.
//
// This helper allows us to build a fake conversation history that looks exactly
// like whatthe agent would see mid session: the original user request, the
// agent's tool call producing the seed elements, the matching tool result, the
// agent's confirmation, then the new user turn. This is gaslighting the agent into
// believing it has said this and has reached a state that is required for our
// update diagram eval. The agent should not be able to tell the difference between
// this fake history and a real session it lived through.
export function buildModelMessages(tc: GoldenTestCase): ModelMessage[] {
  if (!tc.seed) {
    // No previous history, first time generating a diagram
    return [{ role: 'user', content: tc.input }];
  }

  const callId = `seed_${tc.id}`;
  return [
    { role: 'user', content: tc.seed.userPrompt },
    {
      role: 'assistant',
      content: [
        {
          type: 'tool-call', // AI SDK shape
          toolCallId: callId,
          toolName: 'generateDiagram',
          input: { elements: tc.seed.elements },
        },
      ],
    },
    {
      role: 'tool',
      content: [
        {
          type: 'tool-result', // AI SDK shape
          toolCallId: callId,
          toolName: 'generateDiagram',
          // AI SDKs way of distinguishing JSON tool results from text or error variants
          output: {
            type: 'json',
            value: { elements: tc.seed.elements as never },
          },
        },
      ],
    },
    { role: 'assistant', content: tc.seed.assistantConfirmation },
    { role: 'user', content: tc.input },
  ];
}
