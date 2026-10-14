import { validateCitations } from '@/lib/rag/retrieval';

// Test data from the audit
const retrievedChunks = [
  { id: 'chunk-1', documentId: 'doc-1', documentName: 'Doc 1', pageNumber: 1 },
  { id: 'chunk-2', documentId: 'doc-1', documentName: 'Doc 1', pageNumber: 2 },
  { id: 'chunk-3', documentId: 'doc-2', documentName: 'Doc 2', pageNumber: 1 },
];

// Valid citations (should pass)
const validCitations = [
  { documentId: 'doc-1', documentName: 'Doc 1', pageNumber: 1, chunkId: 'chunk-1' },
  { documentId: 'doc-1', documentName: 'Doc 1', pageNumber: 2, chunkId: 'chunk-2' },
  { documentId: 'doc-2', documentName: 'Doc 2', pageNumber: 1, chunkId: 'chunk-3' },
];

// Invalid citations (should be filtered out)
const invalidCitations = [
  { documentId: 'doc-1', documentName: 'Doc 1', pageNumber: 1, chunkId: 'chunk-3' }, // invalid chunk
  { documentId: 'doc-3', documentName: 'Doc 3', pageNumber: 1, chunkId: 'chunk-1' }, // invalid document
  { documentId: 'doc-1', documentName: 'Doc 1', pageNumber: -1, chunkId: 'chunk-1' }, // invalid page number
  { documentId: 'doc-1', documentName: 'Doc 1', pageNumber: 0, chunkId: 'chunk-1' }, // page number 0
  { documentId: 'doc-1', documentName: 'Doc 1', pageNumber: 1, chunkId: '' }, // empty chunkId
];

// Test 1: Valid citations should be returned
const validatedValid = validateCitations(validCitations, retrievedChunks);
console.log('Valid citations:', validatedValid.length);
console.log('Expected: 3, Got:', validatedValid.length);
console.log('Validation 1:', validatedValid.length === 3);

// Test 2: Empty citations should return empty array
const validatedEmpty = validateCitations([], retrievedChunks);
console.log('Empty citations:', validatedEmpty.length);
console.log('Expected: 0, Got:', validatedEmpty.length);
console.log('Validation 2:', validatedEmpty.length === 0);

// Test 3: Empty chunks should return empty array
const validatedEmptyChunks = validateCitations([], []);
console.log('Empty chunks:', validatedEmptyChunks.length);
console.log('Expected: 0, Got:', validatedEmptyChunks.length);
console.log('Validation 3:', validatedEmptyChunks.length === 0);

// Test 4: Invalid citations should be filtered out
const validatedInvalid = validateCitations(invalidCitations, retrievedChunks);
console.log('Invalid citations:', validatedInvalid.length);
console.log('Expected: 0, Got:', validatedInvalid.length);
console.log('Validation 4:', validatedInvalid.length === 0);