/**
 * DGLOPA PLATFORM — COMMERCIAL INTELLIGENCE CORE (CIA Core)
 * commercialFactory.js — EPIC-001A
 *
 * Creates immutable typed value objects for all four CIA Core outputs.
 * ADR-063: Commercial outputs are typed value objects, not raw primitives.
 *
 * All objects are Object.freeze()d.
 * enrichCommercial*() creates a new frozen copy — consumers never mutate.
 */

import { CIA_VERSION, FRAMEWORK_VERSION } from './commercialConstants.js';

let _seq = 0;
const _id = (p) => `${p}-${Date.now()}-${(++_seq).toString().padStart(5,'0')}`;

// ================================================================
// COMMERCIAL DRIVER
// ================================================================

export function createDriver({
  driverType,
  direction,
  magnitude,
  rawScore       = 0,
  label,
  narrative,
  patternIds     = [],
  contextIds     = [],
  eventIds       = [],
  evidenceQuality,
  supportingEvidence = [],
}) {
  if (!driverType)   throw new Error('[CommercialFactory] driverType is required.');
  if (!direction)    throw new Error('[CommercialFactory] direction is required.');
  if (!magnitude)    throw new Error('[CommercialFactory] magnitude is required.');
  if (!label)        throw new Error('[CommercialFactory] label is required.');
  if (!narrative)    throw new Error('[CommercialFactory] narrative is required.');
  if (!evidenceQuality) throw new Error('[CommercialFactory] evidenceQuality is required.');

  return Object.freeze({
    driverId:           _id('DRV'),
    ciaVersion:         CIA_VERSION,
    driverType,
    direction,
    magnitude,
    rawScore:           Math.max(0, Math.min(1, rawScore)),
    label,
    narrative,
    patternIds:         Object.freeze([...patternIds]),
    contextIds:         Object.freeze([...contextIds]),
    eventIds:           Object.freeze([...eventIds]),
    evidenceQuality,
    supportingEvidence: Object.freeze([...supportingEvidence]),
    generatedAt:        Date.now(),
    _frameworkVersion:  FRAMEWORK_VERSION,
  });
}

// ================================================================
// COMMERCIAL ASSESSMENT
// ================================================================

export function createAssessment({
  assessmentType,
  severity,
  headline,
  detail,
  commercialImpact,
  drivers          = [],
  patternIds       = [],
  contextIds       = [],
  evidenceQuality,
  supportingEvidence = [],
}) {
  if (!assessmentType)    throw new Error('[CommercialFactory] assessmentType is required.');
  if (!severity)          throw new Error('[CommercialFactory] severity is required.');
  if (!headline)          throw new Error('[CommercialFactory] headline is required.');
  if (!detail)            throw new Error('[CommercialFactory] detail is required.');
  if (!commercialImpact)  throw new Error('[CommercialFactory] commercialImpact is required.');
  if (!evidenceQuality)   throw new Error('[CommercialFactory] evidenceQuality is required.');

  return Object.freeze({
    assessmentId:       _id('ASS'),
    ciaVersion:         CIA_VERSION,
    assessmentType,
    severity,
    headline,
    detail,
    commercialImpact,
    drivers:            Object.freeze([...drivers]),
    driverIds:          Object.freeze(drivers.map((d) => d.driverId)),
    patternIds:         Object.freeze([...patternIds]),
    contextIds:         Object.freeze([...contextIds]),
    evidenceQuality,
    supportingEvidence: Object.freeze([...supportingEvidence]),
    generatedAt:        Date.now(),
    _frameworkVersion:  FRAMEWORK_VERSION,
  });
}

// ================================================================
// COMMERCIAL SIGNAL
// ================================================================

export function createSignal({
  signalType,
  urgency,
  title,
  description,
  evidenceSummary,
  assessmentId,
  driverIds      = [],
  patternIds     = [],
  evidenceQuality,
}) {
  if (!signalType)      throw new Error('[CommercialFactory] signalType is required.');
  if (!urgency)         throw new Error('[CommercialFactory] urgency is required.');
  if (!title)           throw new Error('[CommercialFactory] title is required.');
  if (!description)     throw new Error('[CommercialFactory] description is required.');
  if (!evidenceSummary) throw new Error('[CommercialFactory] evidenceSummary is required.');
  if (!assessmentId)    throw new Error('[CommercialFactory] assessmentId is required.');
  if (!evidenceQuality) throw new Error('[CommercialFactory] evidenceQuality is required.');

  return Object.freeze({
    signalId:        _id('SIG'),
    ciaVersion:      CIA_VERSION,
    signalType,
    urgency,
    title,
    description,
    evidenceSummary,
    assessmentId,
    driverIds:       Object.freeze([...driverIds]),
    patternIds:      Object.freeze([...patternIds]),
    evidenceQuality,
    generatedAt:     Date.now(),
    _frameworkVersion: FRAMEWORK_VERSION,
    // ADR-062: no action verbs — signals describe, never prescribe
    _noRecommendation: true,
  });
}

// ================================================================
// COMMERCIAL POSITION
// ================================================================

export function createPosition({
  grade,
  positionSummary,
  drivers      = [],
  assessments  = [],
  signals      = [],
  now          = Date.now(),
}) {
  if (!grade)          throw new Error('[CommercialFactory] grade is required.');
  if (!positionSummary)throw new Error('[CommercialFactory] positionSummary is required.');

  const typeCounts = {};
  const asTypeCounts = {};
  for (const d of drivers)    typeCounts[d.driverType]       = (typeCounts[d.driverType]       || 0) + 1;
  for (const a of assessments) asTypeCounts[a.assessmentType] = (asTypeCounts[a.assessmentType] || 0) + 1;

  const dominantDriverType     = Object.entries(typeCounts).sort((a,b)=>b[1]-a[1])[0]?.[0]   || null;
  const dominantAssessmentType = Object.entries(asTypeCounts).sort((a,b)=>b[1]-a[1])[0]?.[0] || null;

  return Object.freeze({
    positionId:              _id('POS'),
    ciaVersion:              CIA_VERSION,
    grade,
    positionSummary,
    drivers:                 Object.freeze([...drivers]),
    assessments:             Object.freeze([...assessments]),
    signals:                 Object.freeze([...signals]),
    criticalSignalCount:     signals.filter((s) => s.urgency === 'Immediate' || s.urgency === 'Urgent').length,
    urgentSignalCount:       signals.filter((s) => s.urgency === 'Urgent').length,
    assessmentCount:         assessments.length,
    driverCount:             drivers.length,
    dominantDriverType,
    dominantAssessmentType,
    generatedAt:             now,
    _frameworkVersion:       FRAMEWORK_VERSION,
    // ADR-065: stateless, reproducible, never persist
    _snapshot:               true,
  });
}

// ================================================================
// ENRICH (presentation-only copies without mutation)
// ================================================================

export function enrichDriver(driver, enrichment)     { return Object.freeze({ ...driver,     ...enrichment }); }
export function enrichAssessment(a, enrichment)      { return Object.freeze({ ...a,           ...enrichment }); }
export function enrichSignal(signal, enrichment)     { return Object.freeze({ ...signal,      ...enrichment }); }
export function enrichPosition(position, enrichment) { return Object.freeze({ ...position,    ...enrichment }); }

/**
 * Reset sequence counter (tests only).
 */
export function _resetSeq() { _seq = 0; }
