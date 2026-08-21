// Preservation scorer: for modify cases, every element id the test case
// declares as preserved must still exist in the agent's output. This is
// the deterministic measure of "did the agent patch the canvas or did
// it nuke it and start over."
//
// No-ops on cases without preservedIds (returns null so Braintrust skips it).
// That keeps create cases out of this metric entirely.

import type { EvalScorer } from 'braintrust';
import type { TaskOutput } from './schema';
import type { GoldenTestCase } from '../buildModelMessages';

export const preservationScorer: EvalScorer<
  GoldenTestCase,
  TaskOutput,
  GoldenTestCase
  // `output.elements` is the final canvas state
> = ({ output, expected }) => {
  const preservedIds = expected?.preservedIds;
  if (!preservedIds || preservedIds.length === 0) {
    return null; // skip cases that don't care about preservation
  }

  const seedElements = expected?.seed?.elements ?? [];
  const outputIds = new Set(
    output.elements
      .filter(
        (el): el is { id: string } =>
          !!el && typeof el === 'object' && 'id' in el,
      )
      .map((el) => el.id),
  );

  // Build a lookup of seed elements so we can also check that key fields
  // (type) survived for the elements we care about, so an agent that
  // "preserves" rect_login by changing it to an ellipse gets penalized.
  const seedById = new Map<string, Record<string, unknown>>();
  for (const el of seedElements) {
    if (el && typeof el === 'object' && 'id' in el) {
      const e = el as Record<string, unknown>;
      seedById.set(String(e.id), e);
    }
  }

  const outputById = new Map<string, Record<string, unknown>>();
  for (const el of output.elements) {
    if (el && typeof el === 'object' && 'id' in el) {
      const e = el as Record<string, unknown>;
      outputById.set(String(e.id), e);
    }
  }

  let kept = 0;
  const missing: string[] = [];
  const typeChanged: string[] = [];

  for (const id of preservedIds) {
    if (!outputIds.has(id)) {
      missing.push(id);
      continue;
    }
    kept += 1;
    const seedEl = seedById.get(id);
    const outEl = outputById.get(id);
    if (seedEl && outEl && seedEl.type !== outEl.type) {
      typeChanged.push(id);
    }
  }

  // Penalty: missing element costs a full point, type change costs half.
  const total = preservedIds.length;
  const score = Math.max(0, (kept - typeChanged.length * 0.5) / total);

  return {
    name: 'Preservation',
    score,
    metadata: { kept, missing, typeChanged, total },
  };
};
