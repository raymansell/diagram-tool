// The Diagram Agent eval. One eval definition (dataset + task + scorers)
// that we run many times as we improve the agent. Every run becomes a new
// experiment in Braintrust, automatically tagged with the current git
// branch, commit, dirty flag, and commit message — no manual naming needed.
// You compare experiments in the dashboard via the auto collected metadata.
//
// Run with:
//   npm run eval

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { config } from 'dotenv';
import { createOpenAI } from '@ai-sdk/openai';
import { Eval } from 'braintrust';

import { runAgent } from '../src/agent-core';
import { buildModelMessages, type GoldenTestCase } from './buildModelMessages';
import { schemaScorer, type TaskOutput } from './scorers/schema';
import { structureScorer } from './scorers/structure';
import { preservationScorer } from './scorers/preservation';
import { labelKeywordScorer } from './scorers/labelKeyword';

config({ path: '.dev.vars' });

if (!process.env.OPENAI_API_KEY || !process.env.OPENAI_MODEL) {
  console.error('incomplete .dev.vars provide both api key and model name');
  process.exit(1);
}

const openai = createOpenAI({ apiKey: process.env.OPENAI_API_KEY });

const testCases: GoldenTestCase[] = JSON.parse(
  readFileSync(join('evals', 'datasets', 'golden.json'), 'utf-8'),
);

// TaskOutput's `output.elements` is the final canvas state
Eval<GoldenTestCase, TaskOutput, GoldenTestCase>('Diagram Agent', {
  // The data function specifies where test cases come from. It maps over test cases
  // and transforms them to include the input, expected values, and metadata (like id,
  // difficulty, and categories) that will be used for filtering and tagging in the dashboard.
  data: () =>
    testCases.map((tc) => ({
      // Notice we pass the whole test case as both input and expected. The scorers
      // reach into whichever fields they care about. That's simpler than mapping
      // the dataset onto a flat shape and then fighting Braintrust's generic types.
      input: tc,
      expected: tc,
      metadata: { id: tc.id, difficulty: tc.difficulty, category: tc.category },
    })),

  task: async (testCase): Promise<TaskOutput> => {
    const result = await runAgent({
      model: openai(process.env.OPENAI_MODEL!),
      messages: buildModelMessages(testCase),
      canvasState: testCase.seed?.elements ?? [],
    });
    return { text: result.text, elements: result.elements };
  },

  scores: [
    schemaScorer,
    structureScorer,
    preservationScorer,
    labelKeywordScorer,
  ],
});
