# Local Reconciliation Proposal: Prep 1 Science 3-Legacy vs 4-Current Units

## 1. Summary of Identified Curriculum Mismatch
- **Book UUID:** `d7bbfca2-6d8f-461b-8e39-2015981e86ec`
- **Subject:** Science (English / لغات) — Preparatory 1 (الصف الأول الإعدادي) — Term 1
- **Current Checked-in Inventory Status:** 3 Legacy Units recorded (`authoritative_curriculum_inventory.json` & `final_read_only_audit_result.json`).
- **Physical Textbook Reality:** 4 New Curriculum Units verified in `server/uploads/book_d7bbfca2-6d8f-461b-8e39-2015981e86ec.pdf` (102 pages, official Ministry edition 2026/2027).

---

## 2. Evidence Comparison

### A. Checked-in Database Snapshot (Legacy 3 Units)
Derived from an older curriculum edition:
1. `1d68b948-4326-41cc-b9f9-51169b931c1f` — Unit 1: الوحدة الأولى: المادة وخواصها وتركيبها (pp. 1–36)
2. `9a2761f7-de4c-4d09-a455-ef33a2c0c3ce` — Unit 2: الوحدة الثانية: الطاقة ومصادرها وصورها (pp. 37–71)
3. `5095f4e7-3505-4bb3-a7ce-8cdd5b8ce0d3` — Unit 3: الوحدة الثالثة: التنوع والتكيف في الكائنات الحية (pp. 72–102)

### B. Physical 2026/2027 Textbook Content (Modern 4 Units)
Extracted directly from the PDF text layer and verified in `server/scripts/science_verified_toc.json`:
1. **Unit 1: The Matter / المادة** (pp. 1–32)
   - Lesson 1: Structure of the Atom (p. 2)
   - Lesson 2: Periodic Table of Elements (p. 10)
   - Lesson 3: Matter and Its Properties (p. 18)
   - Lesson 4: Chemical Bonds (p. 26)
   - *Existing Candidate ID from inspection:* `8bf8f8e5-09a7-4c42-a220-181f7f984cb9`
2. **Unit 2: Force Fields / مجالات القوى** (pp. 33–55)
   - Lesson 1: Electric Forces (p. 33)
   - Lesson 2: Magnetic Forces (p. 41)
   - Lesson 3: Gravitational Forces (p. 47)
   - *Existing Candidate ID from inspection:* `b9f1cf9a-61a1-4dc7-bccf-320291177934`
3. **Unit 3: Living Organisms, Their Structure and Processes / الكائنات الحية** (pp. 56–79)
   - Lesson 1: Cells and Life (p. 56)
   - Lesson 2: General Characteristics of Living Organisms (p. 64)
   - Lesson 3: Microbes (p. 72)
   - *Existing Candidate ID from inspection:* `90077bb5-2d35-4cde-8bf0-82d2d1a3e440`
4. **Unit 4: The (Earth - Sun - Moon) System / نظام الأرض والشمس والقمر** (pp. 80–95/102)
   - Lesson 1: The Earth and the Solar System (p. 80)
   - Lesson 2: Lunar Eclipse (p. 88)
   - *Existing Candidate ID from inspection:* `895ea0da-7a39-441a-ad0f-fd3a0acc1b03`

---

## 3. Impact & Risk Assessment
- **Curriculum Semantic Mismatch:** Questions generated for Unit 2 ("Force Fields") are currently cataloged under "الطاقة ومصادرها وصورها" (Energy and its forms), leading to incorrect categorization in student topic mastery and analytics.
- **Unit Boundary Truncation:** Unit 4 ("Earth - Sun - Moon") is completely missing from the checked-in inventory, preventing students from taking exams on lunar eclipse and planetary concepts.
- **Safety Policy:** Under Phase 4G.3O rules, **zero live database mutations** or migrations were executed. The real database records remain untouched.

---

## 4. Recommended Non-Destructive Resolution Workflow (When Authorized)
1. **Database Step (Authorized Mode Only):**
   Execute a scoped SQL transaction on TiDB to replace the 3 legacy rows in `book_chapters` for book `d7bbfca2-6d8f-461b-8e39-2015981e86ec` with the 4 verified units using the existing inspection UUIDs (`8bf8f8e5-...`, `b9f1cf9a-...`, `90077bb5-...`, `895ea0da-...`).
2. **Chunk Alignment Step:**
   Re-link existing `book_chunks` to the new 4 chapter IDs using exact page offsets (1–32, 33–55, 56–79, 80–102).
3. **Inventory Re-generation:**
   Re-run `node server/scripts/generate_authoritative_inventory.mjs` to update `authoritative_curriculum_inventory.json` from 54 to 55 units.
4. **Offline Test Verification:**
   Execute `server/tests/phase4g3k_verification_test.mjs` to confirm all 55 units pass validation.
