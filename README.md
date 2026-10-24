# Local AI Resume Tailor

โปรเจกต์ NestJS + Vue 3 + Ollama + PostgreSQL สำหรับนำเข้า Resume เดิม แยกประวัติและดีไซน์ สร้างฉบับเฉพาะงาน และเชื่อม Job-Watcher

ซอร์สนี้มีเส้นทางใช้งานครอบคลุม Phase 1–4 แต่ยังต้องทดสอบกับ Ollama, CV และ Job-Watcher บนเครื่องของคุณก่อนใช้งานจริง ไม่ใช่คำรับประกันความถูกต้องของ AI หรือการกู้ดีไซน์เหมือนต้นฉบับทุกจุด

## เริ่มบน Windows / Docker Desktop

ต้องมี Docker Desktop ที่เปิด Linux containers และ Ollama บน Windows

```powershell
cd D:\GitPoom\local-ai-resume-tailor
powershell -ExecutionPolicy Bypass -File .\scripts\setup.ps1
notepad .env
```

แก้ `JOB_WATCHER_BASE_URL` ให้เป็นพอร์ตจริงของ API เดิม เช่น `http://host.docker.internal:3000/api` โดยตรวจจาก `docker ps` หรือ compose ของ Job-Watcher ไม่ใช่พอร์ตเว็บ 5173

ตรวจชื่อโมเดลที่ติดตั้ง:

```powershell
ollama list
```

ตั้ง `OLLAMA_MODEL` ใน `.env` ให้ตรงชื่อรุ่นที่มีอยู่และรองรับภาพ ค่าเริ่มต้นคือ `qwen3.5:4b-q4_K_M` หากไม่มีรุ่นนี้ ใช้ `ollama pull qwen3.5:4b-q4_K_M` (ต้องมี tag นี้ใน registry ที่คุณใช้งาน)

```powershell
docker compose up -d --build
docker compose ps
```

เปิด **http://localhost:5180** แล้วนำค่า `API_TOKEN` จาก `.env` มาใส่ครั้งแรก Token เก็บใน session ของแท็บ ไม่รวมใน frontend build

```powershell
docker compose logs --tail=100 api document
# หยุดโดยเก็บข้อมูล
docker compose down
# เปิดครั้งต่อไป
docker compose up -d
```

อย่าใช้ `docker compose down -v` ถ้าต้องการเก็บฐานข้อมูลและไฟล์ เพราะ `-v` จะลบ volumes

Linux/macOS: `bash scripts/setup.sh` แล้วใช้คำสั่ง Docker เดียวกัน

### Ollama ใน Windows และ Docker

API ใน Docker เรียก `http://host.docker.internal:11434` ไม่ใช่ `localhost:11434` ใน container หากเชื่อมไม่ได้ ให้ตรวจการ bind ของ Ollama และ Windows firewall ก่อน หากต้องเปิดให้ Docker เข้าถึง:

```powershell
[Environment]::SetEnvironmentVariable('OLLAMA_HOST', '0.0.0.0:11434', 'User')
```

ปิดและเปิด Ollama ใหม่ จำกัด firewall ให้อยู่เฉพาะเครือข่ายที่ไว้ใจได้ ไม่ forward พอร์ต 11434 ออกอินเทอร์เน็ต

### ใช้บนมือถือ

ตั้ง `WEB_BIND=0.0.0.0` ใน `.env` แล้ว `docker compose up -d web` เปิด `http://<IPv4-เครื่องคุณ>:5180` และกรอก API token เดียวกัน เว็บเรียก `/v1` ผ่าน Nginx ใน origin เดียว จึงไม่ฝัง localhost ใน API URL และไม่ต้องตั้ง CORS หลายพอร์ต หลีกเลี่ยงเครือข่ายสาธารณะเพราะตัวอย่างนี้ใช้ HTTP

## วิธีใช้งาน

1. **ประวัติจริง**: อัปโหลด PDF / DOCX / PNG / JPG ระบบ OCR ภาษาไทยและอังกฤษเมื่อจำเป็น วิเคราะห์ข้อมูลและดีไซน์ผ่าน Ollama
2. ตรวจชื่อ ติดต่อ และ facts ทุกข้อ แก้ชื่อบริษัท ตำแหน่งเดิม และช่วงเวลาใน group/heading ติ๊กยืนยันเฉพาะสิ่งที่จริง แล้วบันทึก Master Resume
3. **ดีไซน์**: ปรับคอลัมน์ สี ฟอนต์ ระยะ ขอบ และลำดับ section บันทึกเป็นเวอร์ชันใหม่ หรือล็อกดีไซน์
4. **สร้าง Resume**: วางข้อความ / Ctrl+V ภาพ / อัปโหลดภาพหรือ PDF / URL แล้ววิเคราะห์งาน เลือก Master Resume และ Template
5. ใส่คำสั่ง กด Generate ดู A4 Preview, View Changes และหลักฐานของ Summary/แต่ละข้อความ ดูทักษะที่ยังขาด
6. ส่งคำสั่งใน Chat เพื่อแก้ไข แต่ละคำสั่งสร้างฉบับใหม่โดยไม่ทับต้นฉบับ
7. ตรวจข้อความและหลักฐาน กดยืนยันฉบับนั้น แล้ว Export PDF / DOCX หาก PDF เกินหน้าที่กำหนด ระบบจะให้ย่อเนื้อหาหรือปรับ Template ก่อน
8. **GitHub / หลักฐาน**: ใส่ `owner/repository` อ่าน README ที่ผูก commit SHA และให้ AI เสนอ facts ที่ยังไม่ยืนยัน ตรวจว่าเป็นส่วนที่คุณทำจริงก่อนนำไปใช้
9. **Job-Watcher**: ค้นหางาน กดนำเข้าวิเคราะห์ หรือ **สร้าง Resume งานนี้** หลังเลือกโปรไฟล์และ Template แล้ว ระบบอ่านรายละเอียดจริงจาก API เดิม
10. **ประวัติ / สมัครงาน**: เปิด Resume เก่า ดาวน์โหลดไฟล์ที่สร้างไว้ บันทึกสถานะ prepared/applied/interview/offer/rejected ระบบไม่ส่งใบสมัครเอง

## สิ่งที่มีในแต่ละ Phase

| Phase | Implementation |
|---|---|
| 1 | Upload + OCR, Master Resume confirmation, text/image/URL JD, evidence-constrained tailoring, A4 preview, PDF export |
| 2 | DOCX import/export, editable design reconstruction (single/sidebar), template lock and versions, chat revisions, source diff, first-page visual comparison |
| 3 | GitHub README + pinned commit evidence, AI-proposed facts awaiting confirmation, skill gap matching, immutable profile/resume snapshots |
| 4 | Adapter for actual Job-Watcher `/api/jobs` response (`items`, `pagination`), detail import, one-click tailoring, application status history |

## ขอบเขตที่ต้องเข้าใจ

- **Truth Guard ไม่ใช่เครื่องพิสูจน์ความจริง**: บังคับอ้าง fact ที่ยืนยันแล้ว ตรวจ ID ซ้ำและตัวเลขที่ไม่มีในหลักฐาน แต่ยังตรวจความหมายทุกประโยคไม่ได้ ผู้ใช้ต้องอ่านและอนุมัติแต่ละฉบับก่อน export โดยเฉพาะการเพิ่มชื่อเทคโนโลยีหรือขยายระดับความรับผิดชอบ
- การมี repo / README ไม่พิสูจน์ว่าเป็นผลงานผู้สมัครทั้งหมด AI จึงเพิ่มได้เฉพาะ draft ที่ verified=false
- **Rebuild Similar** เป็นการถอดรูปแบบลง schema ที่รองรับ 1 คอลัมน์ / Sidebar ไม่ใช่ arbitrary PDF editor หรือการแก้ PDF ต้นฉบับแบบ pixel-perfect
- เก็บพิกัด ขนาด สี ฟอนต์ เส้นและตำแหน่งรูปจาก PDF ไว้ แต่ยังไม่สร้างรูปถ่าย โลโก้ ไอคอน และกราฟิกอิสระกลับเข้า template อัตโนมัติ ฟอนต์ที่ไม่มีอาจถูกแทนด้วยฟอนต์ระบบ
- **DOCX ใช้รูปแบบหนึ่งคอลัมน์ที่แก้ไขได้** เก็บเนื้อหา สี ฟอนต์ กระดาษและขอบ ไม่รับประกันตำแหน่งเท่ากับ PDF
- Visual comparison เปรียบเทียบหน้าแรกของ PDF/ภาพเท่านั้น DOCX ไม่มีภาพต้นฉบับ การเปลี่ยนข้อความและพื้นที่ขาวมีผลต่อ pixel agreement จึงไม่ใช่ ATS score
- Matching เป็น exact phrase lookup ในหลักฐาน ไม่ใช่โมเดลให้คะแนน ATS และอาจพลาดชื่อทักษะที่ใช้คำต่างกัน
- URL อ่านเฉพาะ HTTPS สาธารณะ ไม่ตาม redirect / ไม่ login / ไม่ bypass anti-bot ถ้าอ่านไม่ได้ให้วางข้อความหรือภาพ
- จำกัดไฟล์ 15 MB / 12 หน้า และ prompt 4,000 ตัวอักษร เอกสารยาวอาจเกิน context ของโมเดล 4B ควรเริ่ม CV 1–3 หน้า
- จำกัด worker หนึ่งตัวต่อฐานข้อมูล งาน AI วิ่งทีละงานเพื่อลด VRAM บน 4060 8GB งานที่ค้างตอน process restart จะแสดง failed และ Retry ได้ ไม่มีการแอบรันซ้ำ
- ไม่ใช้ Redis และไม่ติดตั้ง Docling ใน build นี้ ใช้ PostgreSQL task queue, PyMuPDF, OOXML/python-docx และ Tesseract เพื่อให้ installation เบากว่า
- Prisma ใช้ 6.19.3 เพื่อใช้ schema/client แบบเดิมในชุดนี้ ไม่ได้เปลี่ยนระบบอื่นของคุณ
- เป็น single-user local application ยังไม่มี multi-user tenancy, cloud deployment, automatic backups, arbitrary page editor หรือระบบส่งใบสมัคร

## โครงสร้าง

```text
apps/api/src/        NestJS API, local AI, snapshots, queue, evidence, renderers
apps/api/prisma/     PostgreSQL schema and initial migration
apps/web/src/        Vue workspace, profile/template editors, version/application UI
services/document/  FastAPI, PDF geometry, DOCX, Thai/English OCR, visual comparison
scripts/            Environment setup, UI smoke and PDF tests
```

ข้อมูล snapshots อยู่ใน `Record` แยกด้วย `kind` และตรวจโครงสร้างด้วย Zod ส่วนงาน background อยู่ใน `Task` ทุก Resume เก็บ profile, job, template snapshots, IDs ต้นทาง, parent revision, model tag/digest, prompt และ promptVersion การแก้ Master Resume ไม่เปลี่ยน PDF เก่า

## พัฒนาแบบไม่ใช้ Docker

Node 22+, Python 3.12, PostgreSQL 16 และ Tesseract eng/tha:

```bash
npm ci
npm run db:generate
# ตั้ง DATABASE_URL ให้ชี้ Postgres ของคุณ
npm run db:push
npx playwright install chromium
# ตั้ง API_TOKEN, DOCUMENT_URL=http://127.0.0.1:8002,
# OLLAMA_BASE_URL=http://127.0.0.1:11434 และ STORAGE_DIR เป็น absolute path
npm run dev:api
npm run dev:web
```

เปิดอีก terminal:

```bash
python -m venv .venv
# Windows: .venv\Scripts\Activate.ps1
# Unix: source .venv/bin/activate
pip install -r services/document/requirements.txt
cd services/document
uvicorn main:app --port 8002
```

ตัวอย่าง `dev:api` ใช้ `tsx` ใน watch mode และระบุ dependency injection token ชัดเจน Docker ใช้ compiled JavaScript จาก TypeScript build

## ทดสอบ

```bash
npm run build
npm test
# document tests ใช้ httpx เพิ่ม
pip install httpx
cd services/document
python -m unittest -v
```

ดู [docs/VALIDATION.md](docs/VALIDATION.md) สำหรับผลตรวจจริงและส่วนที่ยังไม่ได้ทดสอบบนเครื่องผู้ใช้
ดู [docs/API.md](docs/API.md) สำหรับ API และ integration contract

## แหล่งอ้างอิงเทคนิค

- Ollama structured outputs: https://docs.ollama.com/capabilities/structured-outputs
- Playwright PDF: https://playwright.dev/docs/api/class-page#page-pdf
- PyMuPDF: https://pymupdf.readthedocs.io/en/latest/page.html
- Job-Watcher contract checked from `raksit17/job-watcher/src/jobs/jobs.controller.ts` and `jobs.service.ts` on 2026-10-24

PyMuPDF มีเงื่อนไข AGPL/commercial licensing ตรวจความเหมาะสมก่อนนำโปรเจกต์ไปเผยแพร่หรือขาย
