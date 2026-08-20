// Eval harness. Runs every test case in evals/datasets/golden.json through
// the agent's core logic (no infra like websockets or durable objects, just
// straight inference calls) and writes raw results to evals/results/<timestamp>.json.
//
// Usage:
//   npm run eval
//
// Score the results by hand. These will be the baseline to improve agains.

import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { generateText, stepCountIs } from 'ai';
import { createOpenAI } from '@ai-sdk/openai';

import { tools } from '../src/tools';
import { SYSTEM_PROMPT } from '../src/system-prompt';
import { EvalResult, TestCase } from './types';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');

const apiKey = process.env.OPENAI_API_KEY;
const model = process.env.OPENAI_MODEL;

if (!apiKey || !model) {
  console.error('incomplete .dev.vars provide both api key and model name');
  process.exit(1);
}

const openai = createOpenAI({ apiKey: process.env.OPENAI_API_KEY });

async function runTestCase(testCase: TestCase): Promise<EvalResult> {
  const start = Date.now();
  try {
    const result = await generateText({
      model: openai(model!),
      system: SYSTEM_PROMPT,
      prompt: testCase.input,
      tools,
      stopWhen: stepCountIs(5),
    });

    const elements = [];

    // A model can take multiple steps (up to 5) to complete a task and if
    // tools are called, there's no single place to view all the results
    // of all tool calls. You must iterate through each message, extract all
    // tool results, and consolidate them into a single array to view all
    // results in one place. TBD: eval tools other than `generateDiagram`
    for (const step of result.steps) {
      for (const toolResult of step.toolResults) {
        if (toolResult.toolName === 'generateDiagram') {
          const output = toolResult.output as any;
          if (Array.isArray(output?.elements)) {
            elements.push(...output.elements);
          }
        }
      }
    }

    return {
      testCaseId: testCase.id,
      input: testCase.input,
      response: result.text,
      elements,
      durationMs: Date.now() - start,
    };
  } catch (error) {
    return {
      testCaseId: testCase.id,
      input: testCase.input,
      response: '',
      elements: [],
      durationMs: 0,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

async function main() {
  const datasetPath = join(ROOT, 'evals/datasets/golden.json');
  const testCases: TestCase[] = JSON.parse(readFileSync(datasetPath, 'utf-8'));

  console.log(`Running ${testCases.length} test case... \n`);

  const results: EvalResult[] = [];
  for (const testCase of testCases) {
    process.stdout.write(`[${testCase.id}] ${testCase.difficulty.padEnd(6)} `);
    const result = await runTestCase(testCase);
    results.push(result);
    if (result.error) {
      console.log(`ERROR: ${result.error}`);
    } else {
      console.log(`${result.elements.length} elements, ${result.durationMs}ms`);
    }
  }

  // Write timestamped results for manual scoring
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const resultsDir = join(ROOT, 'evals/results');
  mkdirSync(resultsDir, { recursive: true });
  const outPath = join(resultsDir, `${timestamp}.json`);
  writeFileSync(outPath, JSON.stringify(results, null, 2));

  console.log(`\nResults written to ${outPath}`);
  console.log(
    `\nNext: open the file, review each result, and add score (1-5) and notes.`,
  );

  // Quick summary
  console.log('\n=== Summary ===');
  console.log(`Total: ${results.length}`);
  console.log(`Errors: ${results.filter((r) => r.error).length}`);
  console.log(
    `Empty results (no elements): ${results.filter((r) => !r.error && r.elements.length === 0).length}`,
  );
  const avgDuration = Math.round(
    results.reduce((sum, r) => sum + r.durationMs, 0) / results.length,
  );
  console.log(`Average duration: ${avgDuration}ms`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
