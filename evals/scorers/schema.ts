// Simplest scorer: deterministic check to test if the agent produced valid
// Excalidraw element data. Every element needs all REQUIRED_FIELDS and one
// of VALID_TYPES in order to be renderable.
//
// This catches the worst class of failures (no elements, garbage shape, missing
// fields) Score 1 if every element has the required fields. 0 otherwise.
//
// Recall we used that `inputSchema` pass-through trick at the LLM tool exec level
// (see tools.ts), but it is still not real structured output. If this scorer
// starts failing too much, it proves that we need structured output rather than
// that clever trick.
//
// Braintrust scorer signature: ({ input, output, expected }) => Score | number
// Notice this scorer does not depend on an `expected` value from the
// golden dataset (golden.json doesn't include Excalidraw elements to test their
// schema against), we test for that manually with REQUIRED_FIELDS and VALID_TYPES.

import type { EvalScorer } from 'braintrust';
import type { GoldenTestCase } from '../buildModelMessages';

const REQUIRED_FIELDS = ['id', 'type', 'x', 'y', 'width', 'height'] as const;
const VALID_TYPES = [
  'rectangle',
  'ellipse',
  'diamond',
  'text',
  'arrow',
  'line',
];

// Custom Output format for each eval `Task` run.
// Built on top of the agent's output.
export interface TaskOutput {
  text: string;
  elements: unknown[]; // headlessly simulated canvas state (see `extractElements()`)
}

export const schemaScorer: EvalScorer<
  GoldenTestCase,
  TaskOutput,
  GoldenTestCase
  // `output.elements` is the final canvas state
> = ({ output }) => {
  // no elements, score 0
  if (!Array.isArray(output.elements) || output.elements.length === 0) {
    return {
      name: 'Schema',
      score: 0,
      metadata: { reason: 'no elements' },
    };
  }
  for (const element of output.elements) {
    if (!element || typeof element !== 'object') {
      // element is not an object, score 0
      return {
        name: 'Schema',
        score: 0,
        metadata: { reason: 'element is not an object' },
      };
    }
    const el = element as Record<string, unknown>;
    for (const field of REQUIRED_FIELDS) {
      if (!(field in el)) {
        // required field missing, score 0
        return {
          name: 'Schema',
          score: 0,
          metadata: { reason: `${el.id} missing ${field}` },
        };
      }
    }
    if (typeof el.type !== 'string' || !VALID_TYPES.includes(el.type)) {
      // invalid type, score 0
      return {
        name: 'Schema',
        score: 0,
        metadata: { reason: `${el.id} invalid type ${el.type}` },
      };
    }
  }
  // valid element, score 1
  return {
    name: 'Schema',
    score: 1,
    metadata: { elementCount: output.elements.length },
  };
};
