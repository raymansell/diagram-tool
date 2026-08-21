// Label keyword scorer: for cases that declare expectedKeywords, check how
// many of those keywords appear (case insensitive) anywhere in the agent's
// text response or in any element's text/label fields. This is the deterministic
// stand-in for "did the agent use the right vocabulary".
//
// Cases without expectedKeywords return null so they don't count toward this
// metric. That keeps the score meaningful for the categories that need it
// (domain knowledge, structure-with-named-parts) without polluting the rest.

import type { EvalScorer } from 'braintrust';
import type { TaskOutput } from './schema';
import type { GoldenTestCase } from '../buildModelMessages';

const TEXT_FIELDS = ['text', 'label'] as const;

function collectText(output: TaskOutput): string {
  const parts: string[] = [output.text ?? ''];
  for (const el of output.elements) {
    if (!el || typeof el !== 'object') continue;
    const e = el as Record<string, unknown>;
    for (const field of TEXT_FIELDS) {
      const v = e[field];
      if (typeof v === 'string') parts.push(v);
    }
  }
  return parts.join(' ').toLowerCase();
}

export const labelKeywordScorer: EvalScorer<
  GoldenTestCase,
  TaskOutput,
  GoldenTestCase
  // `output.elements` is the final canvas state
> = ({ output, expected }) => {
  const keywords = expected?.expectedKeywords;
  if (!keywords || keywords.length === 0) {
    return null;
  }

  const haystack = collectText(output);
  const matched: string[] = [];
  const missing: string[] = [];

  for (const kw of keywords) {
    if (haystack.includes(kw.toLowerCase())) {
      matched.push(kw);
    } else {
      missing.push(kw);
    }
  }

  return {
    name: 'LabelKeywords',
    score: matched.length / keywords.length,
    metadata: { matched, missing, total: keywords.length },
  };
};
