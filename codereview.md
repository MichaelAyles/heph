# Code Review Report

Date: 2026-02-05  
Scope: Entire repository (`frontend`, `kicad-service`, `platformio-service`)  
Method: Static review + automated checks (`pnpm --dir frontend typecheck`, `pnpm --dir frontend lint`, `pnpm --dir frontend test:run`, service `npm run build`)

## Findings (ordered by severity)

### [P1] Path traversal in firmware compile service allows writes outside temp project directory
- File: `/Users/tribune/Desktop/Projects/heph/platformio-service/src/compiler.ts:206`
- Issue: User-controlled `file.path` is joined directly into `projectDir` and written without normalization/boundary checks.
- Why it matters: A request can send paths like `../../...` or absolute paths, causing writes outside the sandboxed project workspace.
- Evidence:
  - Path source and normalization gap: `/Users/tribune/Desktop/Projects/heph/platformio-service/src/compiler.ts:201`
  - Unsafe write: `/Users/tribune/Desktop/Projects/heph/platformio-service/src/compiler.ts:206`
- Recommendation: Normalize and reject absolute/traversal paths, then enforce `resolvedPath.startsWith(projectDir + path.sep)`.

### [P1] Lost-update risk when saving enclosure spec can drop iterations
- File: `/Users/tribune/Desktop/Projects/heph/frontend/src/pages/workspace/EnclosureStageView.tsx:196`
- Issue: `saveEnclosureMutation` builds a full `spec` payload from a potentially stale snapshot and sends whole-object PUT updates.
- Why it matters: Multiple quick saves (e.g., raw draft then validated draft) can overwrite each other and lose appended `iterations`.
- Evidence:
  - Snapshot merge/write: `/Users/tribune/Desktop/Projects/heph/frontend/src/pages/workspace/EnclosureStageView.tsx:196`
  - Sequential saves in same flow: `/Users/tribune/Desktop/Projects/heph/frontend/src/pages/workspace/EnclosureStageView.tsx:322` and `/Users/tribune/Desktop/Projects/heph/frontend/src/pages/workspace/EnclosureStageView.tsx:368`
- Recommendation: Use server-side patch semantics for `enclosure.iterations` append, or re-fetch/rebase before each write with optimistic concurrency (etag/version).

### [P2] Compile-upload endpoint leaks temp directories on failure
- File: `/Users/tribune/Desktop/Projects/heph/platformio-service/src/index.ts:121`
- Issue: Uploaded temp directory is removed only in success path; catch path returns without cleanup.
- Why it matters: Repeated failures can accumulate files in `/tmp`, eventually causing disk pressure.
- Evidence:
  - Cleanup only in try block: `/Users/tribune/Desktop/Projects/heph/platformio-service/src/index.ts:152`
  - Catch block has no cleanup: `/Users/tribune/Desktop/Projects/heph/platformio-service/src/index.ts:173`
- Recommendation: Move temp cleanup to `finally`.

### [P2] Request size protection can be bypassed when `Content-Length` is absent
- File: `/Users/tribune/Desktop/Projects/heph/frontend/functions/api/_middleware.ts:35`
- Issue: Size checks run only if `Content-Length` header is present.
- Why it matters: Chunked requests or omitted headers bypass app-level limits and can still hit JSON parsing paths.
- Recommendation: Enforce size limits at body parser/ingress layer and reject oversized streams independent of `Content-Length`.

### [P2] Project update query omits `user_id` constraint in `WHERE` clause
- File: `/Users/tribune/Desktop/Projects/heph/frontend/functions/api/projects/[id].ts:145`
- Issue: Ownership is checked before update, but the update itself only filters on `id`.
- Why it matters: A race or future refactor could weaken authorization guarantees; safer pattern is ownership in the mutation query itself.
- Recommendation: Change to `WHERE id = ? AND user_id = ?` and bind both.

### [P2] Internal stack traces are returned to API clients on processing errors
- File: `/Users/tribune/Desktop/Projects/heph/kicad-service/src/index.ts:133`
- Issue: Error response includes stack content (`error.stack` first lines).
- Why it matters: This leaks internal implementation details and command paths to clients.
- Recommendation: Return sanitized error messages to clients and keep stack traces only in server logs.

### [P2] Frontend typecheck is currently broken by API/type mismatches
- File: `/Users/tribune/Desktop/Projects/heph/frontend/src/components/pcb/GerberViewer.tsx:146`
- Issue: `parser.result()` is called, but type definitions expose `results` (per TypeScript error).
- Why it matters: `pnpm --dir frontend typecheck` fails, blocking CI-quality gates.

### [P2] Frontend typecheck also fails in WebSerial integration typing
- File: `/Users/tribune/Desktop/Projects/heph/frontend/src/services/webserial-flash.ts:8`
- Issue: Type resolution errors for `w3c-web-serial`, `esptool-js`, and `SerialPort`/`navigator.serial`.
- Why it matters: The main frontend typecheck command fails and obscures regressions.
- Recommendation: Align tsconfig typing strategy and library typings (or add local ambient declarations).

### [P3] React hook dependency issue can cause stale debug behavior
- File: `/Users/tribune/Desktop/Projects/heph/frontend/src/pages/workspace/EnclosureStageView.tsx:389`
- Issue: `isDebugMode` is read in `handleGenerate` but missing from callback dependencies.
- Why it matters: Mode changes at runtime may not be reflected in generation flow until remount.
- Evidence: Also flagged by lint (`react-hooks/exhaustive-deps`).

## Additional observations

- `frontend` tests pass (`486` tests): `/Users/tribune/Desktop/Projects/heph/frontend`  
- Lint currently fails with additional errors/warnings beyond items above (unused vars, ref-in-render, setState-in-effect), including:
  - `/Users/tribune/Desktop/Projects/heph/frontend/src/components/blocks/BlockViewer.tsx:750`
  - `/Users/tribune/Desktop/Projects/heph/frontend/src/components/admin/blocks/BlockBOMEditor.tsx:49`
- Service builds (`kicad-service`, `platformio-service`) failed in current environment due missing type/dependency resolution during `npm run build`; this may include environment setup gaps, but they currently prevent clean local build verification.

## Commands run

- `pnpm --dir frontend typecheck`
- `pnpm --dir frontend lint`
- `pnpm --dir frontend test:run`
- `npm run build` (in `kicad-service`)
- `npm run build` (in `platformio-service`)

## Remediation Log

- 2026-02-05: Moved `pricing.test.ts` out of `/frontend/functions/api` route tree to `/frontend/tests/llm/pricing.test.ts` and updated imports to avoid accidental API route exposure.
- 2026-02-05: Hardened public-route auth bypass logic in middleware to exact-match route prefixes (`path === route || path.startsWith(route + '/')`) instead of raw `startsWith(route)`.
- 2026-02-05: Added optional bearer-token auth for internal microservice boundaries (`SERVICE_AUTH_TOKEN` on services, `INTERNAL_SERVICE_TOKEN` on frontend functions), and forwarded auth headers for KiCad/PlatformIO service calls.
