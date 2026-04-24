// Ghost data layer — Task #3 (scaffold-data)
// Zero-copy fork of dependency-state DB + pgvector Memory Engine.
// - client.ts: createFork, deleteFork, queryDeps, writePatchResult
// - memory.ts: recordCve, findSimilarCves, recordRemediation, findSimilarRemediations
export * from './client';
export * from './memory';
export * from './types';
