/**
 * DGLOPA PLATFORM — COMMERCIAL INTELLIGENCE CORE (CIA Core)
 * commercialAssessmentEngine.js (main orchestrator) — EPIC-001A
 *
 * buildCommercialIntelligence() is the single entry point for the CIA Core.
 * It orchestrates the four-stage pipeline:
 *
 *   Stage 1: computeDrivers()     → CommercialDriver[]
 *   Stage 2: buildAssessments()   → CommercialAssessment[]
 *   Stage 3: deriveSignals()      → CommercialSignal[]
 *   Stage 4: computePosition()    → CommercialPosition
 *
 * ADR-062: No DB reads. Consumes only PatternGraph[], ContextGraph[], PlatformEvent[].
 * ADR-063: Outputs CommercialDriver[], CommercialAssessment[], CommercialSignal[], CommercialPosition.
 * ADR-064: Each stage is independent — drivers don't know about assessments, etc.
 * ADR-065: CommercialPosition is a snapshot — stateless, reproducible, never persisted.
 *
 * The pipeline is deterministic: same inputs always produce same outputs.
 * The pipeline is lightweight: all computation is in-memory, no async DB calls.
 */

import { computeDrivers }        from './driverEngine.js';
import { buildAssessments }      from './commercialAssessmentEngine.js';
import { deriveSignals }         from './commercialSignalEngine.js';
import { computePosition }       from './commercialScoringEngine.js';

// ================================================================
// PUBLIC ENTRY POINT
// ================================================================

/**
 * Run the full Commercial Intelligence pipeline.
 *
 * @param {object} inputs
 *   patternGraphs:  PatternGraph[]    — from DT-008C correlatePatterns()
 *   contextGraphs:  ContextGraph[]    — from DT-008B correlate()
 *   events:         PlatformEvent[]   — from DT-008A assembleSemanticEvents()
 * @param {number} [now]              — current epoch ms (for snapshot timestamp)
 *
 * @returns {CommercialIntelligenceResult}
 *   {
 *     drivers:    CommercialDriver[],
 *     assessments:CommercialAssessment[],
 *     signals:    CommercialSignal[],
 *     position:   CommercialPosition,
 *     pipeline:   { durationMs, stageTimings }
 *   }
 */
export function buildCommercialIntelligence({
  patternGraphs = [],
  contextGraphs = [],
  events        = [],
}, now = Date.now()) {

  const t0 = Date.now();

  // ---- Flatten inputs ----
  const patterns  = patternGraphs.flatMap((g) => g.patterns  || []);
  const contexts  = contextGraphs.flatMap((g) => g.contexts  || []);

  // ---- Stage 1: Drivers ----
  const t1      = Date.now();
  const drivers = computeDrivers(patterns, contexts, events);
  const t1end   = Date.now();

  // ---- Stage 2: Assessments ----
  const t2          = Date.now();
  const assessments = buildAssessments(drivers);
  const t2end       = Date.now();

  // ---- Stage 3: Signals ----
  const t3      = Date.now();
  const signals = deriveSignals(assessments);
  const t3end   = Date.now();

  // ---- Stage 4: Position ----
  const t4       = Date.now();
  const position = computePosition(drivers, assessments, signals, now);
  const t4end    = Date.now();

  const totalMs = Date.now() - t0;

  return Object.freeze({
    drivers:     Object.freeze(drivers),
    assessments: Object.freeze(assessments),
    signals:     Object.freeze(signals),
    position,
    pipeline: Object.freeze({
      durationMs:   totalMs,
      stageTimings: Object.freeze({
        drivers:     t1end - t1,
        assessments: t2end - t2,
        signals:     t3end - t3,
        position:    t4end - t4,
      }),
      inputSummary: Object.freeze({
        patternCount: patterns.length,
        contextCount: contexts.length,
        eventCount:   events.length,
      }),
    }),
  });
}
