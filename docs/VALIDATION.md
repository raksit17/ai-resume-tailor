# Validation record — 2026-10-24

## Passed in the implementation environment

- NestJS TypeScript compilation and Vue type checking / Vite production build.
- Prisma 6.19.3 client generation and initial migration SQL generation.
- 15 Node tests: verified/unknown evidence, numeric invention including numeric substrings, duplicate references, CSS injection, font constraints, section uniqueness, HTML escaping, original employment title preservation, skill gaps, DOCX ZIP integrity, unsafe URL rejection, mocked-Ollama workflow with immutable snapshots, revisions, approvals, template lock, application history and one-click Job-Watcher integration with a local fixture server.
- 6 Python tests: real PDF text/font/geometry/vector extraction, DOCX paragraph/table extraction, page count limit, invalid upload handling, identical-document visual comparison and selectable PDF text inspection.
- Chromium UI smoke: API-token screen, workspace, template locking, adding facts, Job-Watcher screen, 390px mobile layout with no horizontal overflow, no JavaScript runtime errors. API responses were fixtures, not a running PostgreSQL-backed API.
- Actual Chromium PDF generation for single-column and sidebar templates; both reopened as one-page PDFs with expected selectable text. DOCX export reopened with python-docx and verified original job title.
- Desktop screenshot inspected after bundling Thai fonts. PDF sample page rendered and inspected.
- `npm audit`: 0 vulnerabilities reported at validation time. Root overrides pin multer 2.5.0 and deepmerge-ts 8.0.0; Prisma generation and tests passed with these overrides. This is a point-in-time dependency check, not a security guarantee.
- Clean lockfile install checked with `npm ci --ignore-scripts`. Install scripts / container OS packages are separately used by Docker and were not exercised by this check.

## Not executed here

- Full `docker compose up --build`, real PostgreSQL migrations/queue recovery against a running database, and Windows Docker networking. Docker is unavailable in this workspace and PostgreSQL could not be installed here.
- A real Ollama model invocation: AI contract and workflow tests use a local fixture server. Actual Qwen extraction quality, vision support, Thai performance, JSON-schema compliance and VRAM consumption must be validated on the user's computer.
- The user's live Job-Watcher server and live GitHub evidence acquisition. The Job-Watcher adapter was implemented from the actual repository controller/service and exercised with a contract fixture.
- Real scanned Thai CV accuracy, complex multi-page templates, floating graphics, custom fonts, and content reconstruction fidelity across diverse files.
- Real DOCX pagination in Microsoft Word or Google Docs; generated DOCX uses a single-column layout.
- Real browser clipboard on Android / LAN upload and token flow; mobile layout and JavaScript were checked in Chromium.

## Reproduce

```bash
npm ci
npm run db:generate
npm run build
npm test
npx playwright install chromium
node scripts/ui-smoke.cjs
node scripts/pdf-smoke.cjs
pip install -r services/document/requirements.txt httpx
cd services/document
python -m unittest -v
```

The smoke scripts write temporary outputs to `/tmp` and are intended for Linux/WSL. They do not create user resume data or send applications. The application itself is designed to run in Docker on Windows.

## First live acceptance run

1. Start Docker services and confirm all health checks pass.
2. Import a known short CV and manually compare text/facts against the source.
3. Confirm facts, choose a template, analyze a real JD, and generate.
4. Check source diff and missing skills; verify that no new facts or metrics appear.
5. Approve and export PDF/DOCX; inspect all pages for text flow and Thai glyphs.
6. Import one real Job-Watcher listing and use one-click tailoring.
7. Read one owned GitHub repo, correct candidate facts to your actual contribution, and save a new profile version.
8. Restart services and verify profiles, revisions, original files and generated documents persist.
