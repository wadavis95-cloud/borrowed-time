# Bounded catch-up trace

The public Wi-Fi forward-buffer test had two forward-excess candidates. Aggregate peaks could not show whether those were collision anchors or delayed-update recovery. This instrumentation annotates the existing own-presentation clock branch without changing its arithmetic or decisions.

A candidate is the same symptom used by existing diagnostics: forward advance beyond one physical frame by more than50ms equivalent at the larger adjacent reported speed. It is not a measured50ms freeze. The trace retains up to five preceding samples plus the triggering sample, at most four events per race, with at least200ms between events. Hidden/resumed views clear nearby samples without resetting the race budget. Long rendering stalls, backward movement and terminal states are excluded.

Each sample tuple contains `[frameMs, forwardAdvanceEquivalentMs, latestUpdateAgeMs, predictionMs, confirmedLagMs, flags]`. Numbers are rounded and bounded0–10000. Flags:1collision effect present,2collision anchor,4discontinuity anchor,8long-gap reanchor,16resume,32bounded recovery branch. Event reasons are fixed labels from the actual clock branch, or unclassified. They describe presentation context, not proof of the underlying network/GPU cause.

No player/lobby identifiers, names, raw errors, shader sources or full positions leave the browser. The round identifier is used only in local memory to reset the budget. Trace events use existing telemetry capture/flush and the2048-byte payload limit, four-request queue, no retries, backend validation/rate limits and thirty-minute retention. Up to24 latest trace events are exposed only through the existing protected metrics response and displayed alongside timing spikes. Trace entries are prioritized when packing telemetry, and lost reports retain existing drop accounting.

Verification: tests cover collision/recovery labels, capture limits, state exclusions, strict validation, telemetry serialization and protected monitoring ingestion. A601-frame software before/after comparison (late packets, collision anchors, suspension, terminal authority) produced identical game output and original provenance. It is not evidence that all events on real devices are already explained.

The125ms forward reserve and120ms prediction limit remain unchanged. Gameplay, prices and opponent interpolation are unchanged. Backup: `backups/pre-catchup-trace-20261029.zip`.
