### How to design test cases

Spread cases across difficulties so the baseline score has room to improve:

- **Simple:** single shapes, basic flowcharts. The agent should ace these.
- **Medium:** multi step flows, entity relationships, sequence diagrams. Layout becomes a challenge.
- **Hard:** dense org charts, microservices architectures, network topologies. The naive agent will struggle.
- **Edge cases:** vague requests ("draw something"), contradictions ("a square that is also a circle"), very long inputs. These test how gracefully the agent fails.

The scores of the hard and edge cases should start low and climb as we improve context, tools, and architecture.
