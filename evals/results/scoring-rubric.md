## A Scoring Rubric

A good eval needs a clear rubric so different reviewers (or different LLM judges) score the same way. Here is a 1-5 rubric we will use for this agent.

| Score | Meaning                                                                                                                         |
| ----- | ------------------------------------------------------------------------------------------------------------------------------- |
| **5** | Excellent. Matches all expected characteristics. Layout is clean, labels are correct, connections are right.                    |
| **4** | Good. Matches most characteristics. Minor issues like a slightly off label or imperfect spacing.                                |
| **3** | Acceptable. The basic structure is there but has noticeable issues: overlapping elements, wrong connections, or missing labels. |
| **2** | Poor. Recognizable as an attempt but with major problems. Mostly wrong shapes, broken layout, or missing key elements.          |
| **1** | Failed. Empty result, error, or completely wrong (drew a flowchart when asked for an org chart).                                |

Once we have a rubric, anyone (or anything) scoring the agent's output applies the same criteria. Without one, scores drift and runs aren't comparable.
