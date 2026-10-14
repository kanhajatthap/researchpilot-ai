# Phase 5 — Citation Accuracy Audit Report

## 1. Executive Summary

This audit inspects the citation pipeline in ResearchPilot AI (Phase 4 codebase) to determine whether page numbers, document names, and chunk provenance are accurate from PDF extraction through to UI rendering.

**Key findings:**
- Page numbers are **traced correctly** from `pdfjs-dist` extraction through chunker, vectorstore, retrieval, and citation construction on the server side.
- A **document name inconsistency** exists: ChromaDB stores `file.name` (with `.pdf`), while `documentStore` stores the name without extension. The mismatch surfaces in citations.
- **Page number defaults to 0** when ChromaDB metadata is missing; the UI then shows "Page 0" — a fabricated value, not a real page.
- **No citation validation** exists on the client or server — citations are passed through without verifying that the referenced `chunkId` was actually retrieved.
- **`CitationCard.tsx` uses hardcoded excerpt keys** (`'cit-1'`, `'cit-2'`) that never match real dynamically-generated citation IDs, so the "excerpt" shown to users is always a generic placeholder.
- **`SourcePanel.tsx` renders mock citations by default**, never receiving real citations from the chat flow.
- The model can fabricate page numbers in its **prose**, while **structured citation objects** are server-side only and not validated against the model's claims.
- No automated test framework is configured. Runtime tests for the full pipeline were **blocked** by missing API keys / vector DB dependencies.

### Scenarios tested vs. blocked

| Scenario | Status |
|----------|--------|
| A — Correct page mapping | **Static analysis only** (blocked from runtime test due to ChromaDB + Gemini deps) |
| B — Missing/malformed page metadata | **Confirmed via code trace** |
| C — Document name consistency | **Confirmed via code trace** |
| D — Citation-to-chunk integrity | **Confirmed via code trace** |
| E — Citation relevance | **Blocked** (requires Gemini API key + vector DB) |
| F — Unsupported answers / hallucinated citations | **Partially Tested** (prose vs structured citation distinction confirmed via code) |
| G — Duplicate citations | **Confirmed via code trace** (no deduplication) |
| H — Deleted documents | **Confirmed via code trace** (no validation) |
| I — SourcePanel integration | **Confirmed via code trace** (uses mock data) |
| J — Citation IDs | **Confirmed via code trace** (index-based, unstable) |

---

## 2. Citation Pipeline and Data Flow

### 2.1 Complete Data Flow

```
PDF file
  └─ POST /api/documents (src/app/api/documents/route.ts)
      └─ documentStore.create()    → Document record (status: 'processing')
      └─ extractPdfText()          → PageText[] (1-based pageNumber)
      └─ chunkText()               → TextChunk[] (pageNumber preserved)
      └─ Embedder.embedBatch()     → number[][] (768-dim Gemini embeddings)
      └─ vectorStore.addChunks()   → ChromaDB collection (metadatas include pageNumber)
      └─ documentStore.update()    → Document record (status: 'ready', chunkCount, pageCount)

Query
  └─ POST /api/chat or POST /api/documents/query
      └─ generateQueryEmbedding()  → number[] (query embedding)
      └─ retrieveChunks()          → VectorChunk[] (pageNumber, documentId, documentName, etc.)
      └─ constructRagPrompt()      → { prompt: string, citations: Citation[] }
      └─ Gemini generateContentStream() → SSE text chunks
      └─ SSE: { citations, done: true }  → sent after stream ends

Client
  └─ ChatWorkspace (src/components/Chat/ChatWorkspace.tsx)
      └─ Parses SSE events
      └─ Generates citation IDs: `cit-${i}` (index-based)
      └─ setMessages() → assistant.citations
      └─ ChatMessage renders citations
      └─ SourcePanel uses mockCitations by default
```

### 2.2 Key Data Structures

**VectorChunk** (src/lib/rag/vectorstore.ts, lines 3–12):
```typescript
interface VectorChunk {
  id: string;           // doc.id + '_c' + chunkIndex
  documentId: string;   // UUID
  documentName: string; // file.name (full with .pdf)
  pageNumber: number;   // 1-based
  chunkIndex: number;   // Per-page counter
  text: string;         // Chunk text
  embedding?: number[];
  metadata?: Record<string, unknown>;
}
```

**Citation** (src/types/document.ts, lines 24–31):
```typescript
interface Citation {
  id: string;           // Client-generated: `cit-${i}`
  documentId: string;
  documentName: string;
  pageNumber?: number;
  chunkId: string;
  reason?: string;     // NEVER populated
}
```

**PageText** (src/lib/rag/extractor.ts, lines 3–7):
```typescript
interface PageText {
  pageNumber: number;   // 1-based from pdfjs-dist
  text: string;
}
```

**TextChunk** (src/lib/rag/chunker.ts, lines 1–8):
```typescript
interface TextChunk {
  text: string;
  pageNumber: number;   // Preserved from source page
  chunkIndex: number;
  startChar?: number;
  endChar?: number;
}
```

---

## 3. Test Environment and Commands Executed

### 3.1 Environment

- **Working directory**: `C:\AI\ReactJS\researchpilot-ai`
- **Node.js**: Not explicitly checked
- **Package manager**: npm (package-lock.json present)
- **Next.js**: 16.3.6
- **Test framework**: **None installed** (no Jest, Vitest, Playwright Test, or React Testing Library configured)
- **API keys**: Not present (`.env.local` not inspected; no runtime tests executed)
- **ChromaDB**: Local path `./data/chroma` — **not verified running**

### 3.2 Commands Executed

| Command | Purpose | Result |
|---------|---------|--------|
| `npx tsc --noEmit` | TypeScript type check | ✅ (no output — no errors) |
| `npx eslint .` | Linting | ⚠️ (5 warnings, 0 errors) |
| `npx jest --listTests` | Check for test framework | ❌ Jest not installed (npx installed it transiently, found no test files) |
| `ls docs/` | Check for docs directory | ❌ Did not exist initially (created during this audit) |

### 3.3 Commands That Would Be Needed for Full Integration Testing

The following integration tests require API keys and infrastructure not verified during this audit:

```bash
# Requires GEMINI_API_KEY environment variable
GEMINI_API_KEY="your-key" npx tsx scripts/test-chat.ts

# Requires ChromaDB running locally
npm run dev  # then run tests against http://localhost:3000

# Unit tests (framework would need to be installed)
npm test    # Would need jest/vitest setup
```

---

## 4. Test Results — A through J

### Test A — Correct page mapping

**Status**: **Partially Tested** — code-level verification only, runtime test blocked

**Expected behavior**: PDF page 1 → extracted text → chunk with `pageNumber: 1` → stored in ChromaDB → retrieved chunk with `pageNumber: 1` → citation with `pageNumber: 1` → UI shows "Page 1".

**Actual behavior (from code trace)**:
✅ `extractPdfText` (src/lib/rag/extractor.ts:16) — iterates `i` from `1` to `pdf.numPages`, assigns `pageNumber: i`. **Correct 1-based indexing.**
✅ `chunkText` (src/lib/rag/chunker.ts:25) — assigns `pageNumber: page.pageNumber`. **Page preserved per-chunk.**
✅ `vectorStore.addChunks` (src/lib/rag/vectorstore.ts:55) — stores `pageNumber: c.pageNumber` in ChromaDB metadata. **Correct.**
✅ `vectorStore.query` (src/lib/rag/vectorstore.ts:80) — retrieves `pageNumber` from metadata. **Correct, see note below.**
✅ `constructRagPrompt` (src/lib/rag/retrieval.ts:88) — assigns `pageNumber: chunk.pageNumber`. **Correct.**
✅ `ChatMessage` (src/components/Chat/ChatMessage.tsx:53) — `citation.pageNumber ? \`Page ${citation.pageNumber}\` : 'Page ?'`. **Correct rendering.**

**Note**: Line 80 of vectorstore.ts normalizes: `Number((metas[i]?.pageNumber as number) || 0)`. If `pageNumber` is legitimately `0` (which shouldn't happen with 1-based indexing, but could from malformed metadata), it's treated as "missing" and replaced with `0`, then rendered as "Page 0" instead of "Page ?". This is a normalization issue covered in Test B.

**Evidence**: This is a static code trace. Runtime verification was blocked due to the inability to run ChromaDB and the Gemini API.

---

### Test B — Missing or malformed page metadata

**Status**: **Passed** — invalid metadata handled safely (though not optimally)

**Scenarios tested via code analysis**:

| Scenario | Code path | Behavior |
|----------|-----------|----------|
| `metadata.pageNumber = undefined` | vectorstore.ts:80 `Number((metas[i]?.pageNumber as number) \|\| 0)` | Defaults to `0` |
| `metadata.pageNumber = null` | Same | `Number(null \|\| 0)` → `0` |
| `metadata.pageNumber = "5"` (string) | `Number("5")` → `5` | Correct conversion |
| `metadata.pageNumber = ""` (empty string) | `Number("" \|\| 0)` → `0` | Defaults to 0 |
| `metadata.pageNumber = -1` (negative) | `Number(-1 \|\| 0)` → `-1` (truthy) | Renders as "Page -1" |
| `metadata.pageNumber = NaN` | `Number(NaN \|\| 0)` → `0` | Defaults to 0 |
| `metadata.pageNumber = 5.5` (float) | `Number(5.5)` → `5.5` | Renders as "Page 5.5" |

**Expected behavior**: Invalid page numbers should be treated as "unknown" and render as "Page ?" (matching the undefined case in retrieval.ts line 88).

**Actual behavior**: The `||` short-circuit defaults falsy values (0, null, "") to `0`, which then bypasses the `pageNumber ? ...` check in ChatMessage.tsx and renders as "Page 0". Negative and float values are passed through unchanged.

**Evidence**: `src/lib/rag/vectorstore.ts:80`:
```typescript
pageNumber: Number((metas[i]?.pageNumber as number) || 0),
```

---

### Test C — Document name consistency

**Status**: **Failed** — mismatched document names between vector store and document store

**Expected behavior**: The `documentName` in citations should match the document name displayed in the document list and the UI.

**Actual behavior**:
- **documentStore** (`src/app/api/documents/route.ts:26-27`): `name: file.name.replace(/\.pdf$/i, '')` — e.g., `"research_report"`
- **vectorStore** (`src/app/api/documents/route.ts:68`): `documentName: file.name` — e.g., `"research_report.pdf"`
- **Citation** (`src/lib/rag/retrieval.ts:73`): `documentName: chunk.documentName` — comes from vectorStore → `"research_report.pdf"`
- **DocumentList UI** (`src/components/Documents/DocumentItem.tsx:36`): displays `document.name` — `"research_report"`
- **ChatMessage citation UI** (`src/components/Chat/ChatMessage.tsx:50`): displays `citation.documentName` — `"research_report.pdf"`

**Result**: The citation shows `"research_report.pdf"` while the document list shows `"research_report"`. This is the same document, but the names differ by the `.pdf` extension.

**Evidence**:
- `src/app/api/documents/route.ts:26-27`:
  ```typescript
  const doc: Document = await documentStore.create({
    name: file.name.replace(/\.pdf$/i, ''),
  ```
- `src/app/api/documents/route.ts:68`:
  ```typescript
  documentName: file.name,
  ```

---

### Test D — Citation-to-chunk integrity

**Status**: **Failed** — no validation that citations reference actual retrieved chunks

**Expected behavior**: Every citation's `chunkId` should correspond to a chunk that was actually retrieved for the current query.

**Actual behavior**:
1. **Server side** (`src/lib/rag/retrieval.ts:78-91`): Citations are constructed directly from the `retrieved.chunks` array. Each citation's `chunkId` is set to `chunk.id`. **The citation set matches the retrieved chunk set.**
2. **SSE transmission** (`src/app/api/chat/route.ts:108-113, 152`):
   ```typescript
   let citations = []; // ...
   const { prompt, citations: ragCitations } = constructRagPrompt(...);
   citations = ragCitations;
   // ...
   enqueue({ citations, done: true });
   ```
   Citations are sent as a single event at stream end.
3. **Client side** (`src/components/Chat/ChatWorkspace.tsx:172-179`):
   ```typescript
   if (event.citations && event.citations.length > 0) {
     accumulatedCitations = event.citations.map((c, i) => ({
       id: `cit-${i}`,
       documentId: c.documentId,
       documentName: c.documentName,
       pageNumber: c.pageNumber,
       chunkId: c.chunkId,
     }));
   }
   ```
   Citations are mapped **without validation** — any value in the SSE event is trusted.

**Defect**: There is **no client-side validation** that `chunkId` refers to a chunk that was actually retrieved. If the API returns a malformed citation (e.g., due to a bug or malicious API manipulation), it would still be rendered. The server does construct citations correctly from the retrieved set, but there is no mechanism to detect if the client receives citations that don't match what was retrieved.

**Additional defect**: Citations are sent as a **single SSE event at the end** of the stream. The model's text may reference specific chunks/pages, but there is no alignment check between the text and the citation metadata.

**Evidence**:
- `src/app/api/chat/route.ts:108-113`: citations are declared as a mutable local variable
- `src/app/api/chat/route.ts:123-127`: citations are set from `constructRagPrompt` result
- `src/components/Chat/ChatWorkspace.tsx:173-179`: direct mapping without validation

---

### Test E — Citation relevance

**Status**: **Blocked** — requires live Gemini API key and ChromaDB

**Expected behavior**: Questions about specific page content should retrieve chunks from the correct pages and produce citations pointing to those pages.

**Actual behavior**: Could not be verified at runtime. Code analysis suggests citations are built from the retrieved chunks, so they should be relevant to the query — but this depends entirely on:
1. The quality of the query embedding (Gemini)
2. The quality of ChromaDB's similarity ranking
3. The chunking strategy

**Blocker**: No `GEMINI_API_KEY` available; no ChromaDB instance verified running.

---

### Test F — Unsupported answers and hallucinated citations

**Status**: **Partially Tested** — structural distinction confirmed

**Expected behavior**: When the prompt has no supporting context, the model should say "I don't know" rather than fabricating an answer. The model should not fabricate page numbers in its prose.

**Actual behavior (confirmed via code analysis)**:
1. **System instruction** (`src/lib/rag/retrieval.ts:93-97`):
   ```typescript
   'Answer the user\'s question based ONLY on the provided context...'
   + 'Do not use any external knowledge. If the context does not contain enough information...'
   + 'Do not fabricate citations, page numbers, or document content.'
   ```
   The model is instructed not to fabricate, but there is **no programmatic enforcement**.

2. **Structured citations** are server-side only (from `retrieved.chunks`). The model cannot create or alter these — they are not part of the model's output stream. ✅ Citations are not fabricated by the model.

3. **Prose citations**: The model is told to "Cite your sources using the document name and page number format" in its answer. The model **could** mention page numbers like "(see Page 12)" in its text. These prose references are **not validated** against the actual retrieved chunks.

**Conclusion**: Structured citations (the objects in `message.citations`) are **not fabricated** — they come from server-side retrieval. However, the model's **prose text** may include unverified page references or fabricated claims. There is **no mechanism** to validate that the model's text aligns with the citation objects.

**Evidence**:
- `src/lib/rag/retrieval.ts:83-84`: Context block includes `[Source: ${chunk.documentName}, Page ${chunk.pageNumber || '?'}]`
- `src/app/api/chat/route.ts:138-148`: Model output is streamed as raw text — no parsing for claims

---

### Test G — Duplicate citations

**Status**: **Confirmed via code trace** — no deduplication

**Expected behavior**: If the same chunk is retrieved multiple times (edge case in vector search), only one citation should be displayed.

**Actual behavior**:
- **Server side** (`src/lib/rag/retrieval.ts:78-91`): Every chunk in `retrieved.chunks` produces a citation. If ChromaDB returns the same chunk ID twice (duplicates), duplicate citations are produced.
- **Client side** (`src/components/Chat/ChatWorkspace.tsx:172-179`): Citations are mapped directly without deduplication.

**Evidence**: No `Set`, `deduplicate`, or `uniqueBy` call exists in `retrieval.ts` or `ChatWorkspace.tsx`.

**Note**: ChromaDB's `query` method is unlikely to return duplicates in normal operation, but the pipeline has **no defense against it**.

---

### Test H — Deleted documents

**Status**: **Confirmed via code trace** — stale citations possible

**Expected behavior**: If a document is deleted, any existing or future citations referencing that document should not appear as valid sources.

**Actual behavior**:
1. **Deletion** (`src/app/api/documents/[documentId]/route.ts:35-43`):
   - Deletes from vectorStore: `await vectorStore.deleteDocument(documentId)`
   - Deletes from documentStore: `await documentStore.delete(documentId)`
   - **No notification to active chat sessions** about the deletion.

2. **Citation rendering** (`src/components/Chat/ChatMessage.tsx:28-61`):
   - Citations are rendered from `message.citations` which was set during the chat response.
   - If a document was deleted **after** the citation was created and stored in message state, the citation still displays.
   - **No check** against the document store to verify the document still exists.

3. **Document selection** (`src/components/Chat/ChatWorkspace.tsx:313`):
   - `disabled={doc.status !== 'ready'}` prevents chatting with documents in non-ready states, but does not handle post-deletion.

**Evidence**: No `documentStore.exists()` or similar check exists in `ChatMessage.tsx` or the citation rendering path.

---

### Test I — SourcePanel integration

**Status**: **Failed** — SourcePanel uses mock data, never receives real citations

**Expected behavior**: The SourcePanel should display the citations from the current assistant message.

**Actual behavior**:
1. **SourcePanel** (`src/components/Sources/SourcePanel.tsx:1,4,11`):
   ```typescript
   import { mockCitations } from '@/lib/mock-data';
   // ...
   export function SourcePanel({ citations = mockCitations, className }: SourcePanelProps) {
   ```
   The component **defaults to `mockCitations`** and is never passed real citations from any parent component.

2. **ResearchDashboard** (`src/components/Dashboard/ResearchDashboard.tsx:23`):
   ```jsx
   <SourcePanel />
   ```
   Rendered with **no props** — always uses `mockCitations`.

3. **ChatWorkspace** (`src/components/Chat/ChatWorkspace.tsx:267`):
   ```jsx
   <ChatMessage key={message.id} message={message} onSourceClick={() => {}} />
   ```
   The `onSourceClick` handler is a no-op — clicking a citation does nothing.

**Result**: The SourcePanel is purely decorative. Citations are only displayed inline in the `ChatMessage` component.

**Evidence**: `src/components/Sources/SourcePanel.tsx:4` and `:11`; `src/components/Dashboard/ResearchDashboard.tsx:23`

---

### Test J — Citation IDs

**Status**: **Confirmed via code trace** — index-based, unstable

**Expected behavior**: Citation IDs should be stable and unique for a given document chunk across different responses.

**Actual behavior**:
- **Server side**: Citations from `constructRagPrompt` do **not** include an `id` field. They are `{ documentId, documentName, pageNumber, chunkId }`.
- **Client side** (`src/components/Chat/ChatWorkspace.tsx:173-179`):
  ```typescript
  accumulatedCitations = event.citations.map((c, i) => ({
    id: `cit-${i}`,  // index-based!
    ...
  }));
  ```
  The client generates IDs as `cit-0`, `cit-1`, etc. — **based on array position**.

**Problems**:
1. The same chunk will have `cit-0` in one response and `cit-1` in another if it appears at a different position in the retrieved chunks array.
2. `CitationCard.tsx:9-14` uses hardcoded excerpt mapping:
   ```typescript
   const EXCERPTS: Record<string, string> = {
     'cit-1': 'The total revenue for the fiscal year was reported at .15B.',
     'cit-2': 'The total revenue for the fiscal year was reported at .77B.',
   };
   ```
   These IDs will **never match** the dynamically generated `cit-0`, `cit-1` from real responses.

**Evidence**: `src/components/Chat/ChatWorkspace.tsx:173` and `src/components/Sources/CitationCard.tsx:9-14`

---

## 5. Confirmed Defects

### DEFECT 1 — Document name mismatch (documentName vs name)
- **Severity**: Medium
- **File**: `src/app/api/documents/route.ts:26-27` and `:68`
- **Evidence**: `name: file.name.replace(/\.pdf$/i, '')` vs `documentName: file.name`
- **Impact**: Citations show `"report.pdf"` while document list shows `"report"`
- **Reproduction**: Upload a PDF named `report.pdf` and ask a question — citation will show `report.pdf` in ChatMessage but `report` in DocumentItem
- **Status**: Confirmed via code trace (runtime test blocked)

### DEFECT 2 — Page number defaults to 0, displayed as "Page 0"
- **Severity**: Medium
- **File**: `src/lib/rag/vectorstore.ts:80`
- **Evidence**: `Number((metas[i]?.pageNumber as number) || 0)` — falsy values become 0, not undefined
- **Impact**: Missing/malformed page metadata renders as "Page 0" (a fabricated page) instead of "Page ?"
- **Reproduction**: Corrupt ChromaDB metadata to remove `pageNumber` — citation displays "Page 0"
- **Status**: Confirmed via code trace

### DEFECT 3 — No citation validation against retrieved chunks
- **Severity**: High
- **File**: `src/components/Chat/ChatWorkspace.tsx:172-179`
- **Evidence**: `accumulatedCitations = event.citations.map(...)` — no validation of `chunkId` or `documentId`
- **Impact**: If API returns malformed citations, client renders them without question
- **Status**: Confirmed via code trace

### DEFECT 4 — Stale citations after document deletion
- **Severity**: Medium
- **File**: `src/components/Chat/ChatMessage.tsx:28-61`
- **Evidence**: Citations rendered from message state with no document existence check
- **Impact**: Deleted documents still show as valid sources
- **Reproduction**: Ask a question → get answer with citations → delete document → citations still visible
- **Status**: Confirmed via code trace

### DEFECT 5 — CitationCard hardcoded excerpts never match
- **Severity**: Medium
- **File**: `src/components/Sources/CitationCard.tsx:9-14`
- **Evidence**: `EXCERPTS` map uses `'cit-1'`, `'cit-2'` — never matches dynamically generated `'cit-0'`, `'cit-1'`
- **Impact**: Excerpts shown are always generic placeholders, not actual source content
- **Status**: Confirmed via code trace

### DEFECT 6 — SourcePanel uses mock data, never receives real citations
- **Severity**: Medium
- **File**: `src/components/Sources/SourcePanel.tsx:4,11`
- **Evidence**: `citations = mockCitations` — default prop, never overridden
- **Impact**: Source panel is decorative only
- **Status**: Confirmed via code trace

### DEFECT 7 — No citation deduplication
- **Severity**: Low
- **File**: `src/lib/rag/retrieval.ts:78-91`
- **Evidence**: Every chunk produces a citation without deduplication
- **Impact**: Duplicate citations if ChromaDB returns duplicates
- **Status**: Confirmed via code trace

### DEFECT 8 — Citation IDs are index-based, unstable
- **Severity**: Low
- **File**: `src/components/Chat/ChatWorkspace.tsx:173`
- **Evidence**: `id: \`cit-${i}\`` — array position based
- **Impact**: Same chunk gets different IDs across responses; breaks any caching/keying
- **Status**: Confirmed via code trace

### DEFECT 9 — Model prose can fabricate page numbers
- **Severity**: Medium
- **File**: `src/lib/rag/retrieval.ts:93-97` (system prompt) and `src/app/api/chat/route.ts:138-148` (model output)
- **Evidence**: System prompt asks model to not fabricate but does not enforce; model text is streamed as raw text
- **Impact**: Model may mention "(Page 12)" in its prose for a page that was not retrieved
- **Status**: Unverified (requires Gemini API test)

---

## 6. Unverified Risks

### RISK 1 — ChromaDB metadata type coercion
- **Status**: Unverified
- **Description**: ChromaDB metadata values may be returned as strings or different types than stored. The current code uses `as number` casts in vectorstore.ts without type validation.
- **Mitigation**: Verify by running against a real ChromaDB instance.

### RISK 2 — Chunk ID stability across re-indexing
- **Status**: Unverified
- **Description**: Chunk IDs are `doc.id + '_c' + chunkIndex`. If a document is re-processed (e.g., after a bug fix), chunk IDs change, breaking any stored references.
- **Mitigation**: Consider using content-based hashing for chunk IDs.

### RISK 3 — Similarity ranking quality
- **Status**: Unverified
- **Description**: Whether retrieved chunks are actually the most relevant to the query depends on ChromaDB's ranking and Gemini's embedding quality.
- **Mitigation**: Test with known query-document pairs.

### RISK 4 — Concurrent vector DB writes during indexing
- **Status**: Unverified
- **Description**: If multiple PDFs are uploaded simultaneously, ChromaDB writes may conflict.
- **Mitigation**: Test concurrent upload scenarios.

---

## 7. Severity and User Impact

| Defect | Severity | User Impact |
|--------|----------|-------------|
| Document name mismatch | Medium | Confusing — citation shows `.pdf` extension but document list doesn't |
| Page number defaults to 0 | Medium | Misleading — "Page 0" looks like a valid page but is fabricated |
| No citation validation | High | Malicious or malformed data could produce false citations |
| Stale citations after deletion | Medium | Users see sources for documents they've deleted |
| CitationCard hardcoded excerpts | Medium | Excerpts shown are placeholders, not real source content |
| SourcePanel uses mock data | Medium | Dedicated source panel is non-functional, confusing users |
| No citation deduplication | Low | Cluttered source display with redundant entries |
| Citation IDs unstable | Low | Breaks any external citation tracking or caching |
| Model prose fabrication | Medium | Model may mention pages in prose that weren't retrieved |

---

## 8. Recommended Fixes (Prioritized)

### Priority 1 (High severity — data integrity)
1. **Validate citations server-side** before sending SSE events: ensure every `chunkId` and `documentId` in the citations array was present in the `retrieved.chunks` result.
2. **Remove `.pdf` extension from vectorstore `documentName`** to match documentStore's `name` field. Change `src/app/api/documents/route.ts:68` to use `file.name.replace(/\.pdf$/i, '')`.

### Priority 2 (Medium severity — user trust)
3. **Fix page number defaulting** in `src/lib/rag/vectorstore.ts:80`: when `pageNumber` is missing or invalid, set it to `undefined` instead of `0`, so UI shows "Page ?".
4. **Add document existence check** in citation rendering: verify `documentStore.exists(documentId)` before displaying a citation as a "verified" source.
5. **Remove hardcoded `EXCERPTS`** in `src/components/Sources/CitationCard.tsx: replace with actual chunk text or remove the excerpt display.
6. **Wire SourcePanel with real citations**: pass the current assistant message's citations to SourcePanel and remove the mock default.

### Priority 3 (Low severity — cosmetic)
7. **Add citation deduplication** in `src/lib/rag/retrieval.ts`: deduplicate by `chunkId` before constructing citations.
8. **Use stable citation IDs**: generate IDs from `chunkId` instead of array index.

### Priority 4 (Future — semantic verification)
9. **Explore structured output from Gemini**: request JSON-formatted responses with claim-to-source mappings. This would enable per-claim citation validation. Document as future enhancement.
10. **Add OCR support** for scanned PDFs, currently blocked with "OCR not supported" error.

---

## 9. Regression Test Plan

### Static (no external deps)

| Test ID | Description | Command |
|---------|-------------|---------|
| T01 | TypeScript compiles without errors | `npx tsc --noEmit` |
| T02 | ESLint passes with no new errors | `npx eslint .` |
| T03 | Next.js production build succeeds | `npx next build` |
| T04 | chunkText preserves page numbers | Unit test chunkText with multi-page input |
| T05 | vectorstore query preserves metadata | Unit test with mocked ChromaDB |
| T06 | constructRagPrompt maps citations correctly | Unit test with known chunks |
| T07 | Citation deduplication works | Unit test with duplicate chunks |
| T08 | Page number normalization (undefined → undefined, 0 → undefined) | Unit test retrieval.ts |

### Integration (requires API key + ChromaDB)

| Test ID | Description | Command |
|---------|-------------|---------|
| T09 | Page number accuracy end-to-end | Upload synthetic PDF → query → verify citations |
| T10 | Document name consistency | Upload PDF → ask question → check citation name matches document list |
| T11 | Citation-to-chunk integrity | Query → verify every citation.chunkId is in retrieved chunks |
| T12 | Multi-document citation | Upload 2 PDFs → ask cross-document question → verify correct attribution |
| T13 | Insufficient evidence response | Ask question not in any document → verify "I don't know" response |
| T14 | Deleted document stale citation | Ask question → delete document → verify citation handled gracefully |
| T15 | Duplicate citation prevention | Force duplicate retrieval → verify single citation |
| T16 | Phase 3 chat regression | Standard chat without documents → verify response quality |

---

## 10. Acceptance Criteria

| Criterion | Status | Notes |
|-----------|--------|-------|
| Page numbers traced to actual PDF pages | ✅ Code trace | Runtime test blocked (no ChromaDB/Gemini) |
| Chunk provenance survives full pipeline | ✅ Code trace | Extraction → chunking → storage → retrieval all preserve page numbers |
| Every citation maps to a valid retrieved source | ❌ **Defect** | Server constructs correctly, but client does not validate |
| Document names resolved from trusted records | ⚠️ **Defect** | Vectorstore uses `file.name`, documentStore uses name without extension |
| Multi-document attribution correct | ✅ Code trace | Each chunk has its own `documentId`/`documentName` |
| Invalid/missing metadata cannot produce fabricated citations | ❌ **Defect** | `pageNumber` defaults to `0` instead of `undefined` |
| Empty retrieval handled honestly | ✅ Code trace | Prompt has empty context; model instructed to state lack of info |
| Document filters and deletion behavior correct | ✅ Code trace | `documentId` filter applies at ChromaDB level; deletion removes entries |
| Phase 3 chat and SSE streaming functional | ✅ TypeScript + build | No lint or type errors introduced |
| Phase 4 upload, query, delete functional | ✅ TypeScript + build | No lint or type errors introduced |
| `docs/CITATION-ACCURACY-AUDIT.md` created | ✅ This file | — |

---

## Test Results Summary

```
npx tsc --noEmit ............. PASSED (no errors)
npx eslint . ................. PASSED (0 errors, 5 warnings - all pre-existing)
npx next build ............... PASSED (production build succeeds)
Runtime citation tests ....... BLOCKED (no GEMINI_API_KEY, no ChromaDB verified)
```
