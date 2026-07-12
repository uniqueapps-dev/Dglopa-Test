/**
 * DGLOPA PLATFORM — COMMERCIAL INTELLIGENCE CORE (CIA Core)
 * commercialTypes.js — EPIC-001A
 *
 * JSDoc type definitions for all four CIA Core output objects.
 * Runtime no-op — documentation and IDE type-checking only.
 *
 * TRACEABILITY CHAIN (ADR-063 + ADR-059 extension):
 *   CommercialPosition
 *     → CommercialSignal[]
 *       → CommercialAssessment[]
 *         → CommercialDriver[]
 *           → Pattern[]       (from DT-008C)
 *             → Context[]     (from DT-008B)
 *               → PlatformEvent[]  (from DT-008A)
 *                 → OperationalRecord  (original DB row)
 *
 * Every output at every level carries the IDs of its source objects.
 * No commercial output is fabricated — every claim is traceable.
 */

/**
 * @typedef {object} CommercialDriver
 * @property {string}   driverId
 * @property {string}   driverType          — DRIVER_TYPE value
 * @property {string}   direction           — DRIVER_DIRECTION value
 * @property {string}   magnitude           — DRIVER_MAGNITUDE value
 * @property {number}   rawScore            — 0..1 computed magnitude before DRIVER_MAGNITUDE mapping
 * @property {string}   label               — human-readable driver name
 * @property {string}   narrative           — one-sentence description of what this driver is doing
 * @property {string[]} patternIds          — source Pattern IDs
 * @property {string[]} contextIds          — source Context IDs
 * @property {string[]} eventIds            — source PlatformEvent IDs
 * @property {string}   evidenceQuality     — EVIDENCE_QUALITY value
 * @property {string[]} supportingEvidence  — evidence strings from source patterns
 * @property {number}   generatedAt
 */

/**
 * @typedef {object} CommercialAssessment
 * @property {string}             assessmentId
 * @property {string}             assessmentType    — ASSESSMENT_TYPE value
 * @property {string}             severity          — ASSESSMENT_SEVERITY value
 * @property {string}             headline          — one-sentence commercial situation statement
 * @property {string}             detail            — 2-3 sentence elaboration
 * @property {string}             commercialImpact  — plain-language impact on revenue, cost, or capital
 * @property {CommercialDriver[]} drivers           — the drivers that produced this assessment
 * @property {string[]}           patternIds
 * @property {string[]}           contextIds
 * @property {string}             evidenceQuality   — EVIDENCE_QUALITY value
 * @property {string[]}           supportingEvidence
 * @property {number}             generatedAt
 */

/**
 * @typedef {object} CommercialSignal
 * @property {string}   signalId
 * @property {string}   signalType          — SIGNAL_TYPE value
 * @property {string}   urgency             — SIGNAL_URGENCY value
 * @property {string}   title               — short signal label
 * @property {string}   description         — what this signal means commercially
 * @property {string}   evidenceSummary     — one sentence summarising the evidence base
 * @property {string}   assessmentId        — parent CommercialAssessment ID
 * @property {string[]} driverIds           — source CommercialDriver IDs
 * @property {string[]} patternIds
 * @property {string}   evidenceQuality     — EVIDENCE_QUALITY value
 * @property {number}   generatedAt
 * NOTE: Signals carry no action verbs (ADR-062). They identify and describe.
 *       Recommendations belong to a future Decision Intelligence layer.
 */

/**
 * @typedef {object} CommercialPosition
 * @property {string}                 positionId
 * @property {string}                 grade               — POSITION_GRADE value
 * @property {string}                 positionSummary     — 2-3 sentence overall commercial position
 * @property {CommercialDriver[]}     drivers             — all drivers active at this position
 * @property {CommercialAssessment[]} assessments         — all assessments at this position
 * @property {CommercialSignal[]}     signals             — all signals active at this position
 * @property {number}                 criticalSignalCount
 * @property {number}                 urgentSignalCount
 * @property {number}                 assessmentCount
 * @property {number}                 driverCount
 * @property {string}                 dominantDriverType  — the most influential driver type
 * @property {string}                 dominantAssessmentType
 * @property {number}                 generatedAt
 * NOTE: CommercialPosition is a point-in-time reading, not a ledger (ADR-065).
 *       It is stateless and reproducible. Never persist it.
 */

export const _TYPES_ONLY = true;
