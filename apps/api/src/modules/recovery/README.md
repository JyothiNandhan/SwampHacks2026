# T07 and T11 — Recovery cases, recommendations and audit artifacts

The state machine encodes the only accepted recovery transitions. Approval requires an explicit `USER` actor and submission accepts only a user or staff actor; an agent can draft a recommendation but can never approve or submit it.

Recommendations require every cited evidence record, verified eligibility and positive savings before becoming ready for user approval. Missing evidence or uncertain eligibility produces review rather than invented certainty. Approval creates canonical event and notification records, while merchant submission remains a separate operation.

This module is pure domain logic. Authenticated persistence and route registration remain T20 integration work.

Gate 2 adds evidence-correlated refund reconciliation and policy-backed deadline/timeline
artifacts. Equal dollar amounts never establish a refund match by themselves.
