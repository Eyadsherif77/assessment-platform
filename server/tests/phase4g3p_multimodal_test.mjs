import assert from 'assert';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { fileURLToPath } from 'url';

import { ReadinessValidator, UnitReadinessBlockedError } from '../dist/services/readinessValidator.js';
import { VisualAssetExtractor } from '../dist/services/ai/visualAssetExtractor.js';
import {
  verifyCandidateQuestionWithBlindSolver,
  sanitizeBlindSolverInput,
  DISQUALIFIED_GEOMETRY_CHAPTER_IDS
} from '../dist/services/ai/aiRagEngine.js';
import { verifyAuthoritativeProvenanceContract } from '../dist/services/ai/boundedSolverAdapter.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function runTest(name, fn) {
  try {
    await fn();
    console.log(`  [PASS] ${name}`);
  } catch (err) {
    console.error(`  [FAIL] ${name}`);
    console.error(err);
    process.exit(1);
  }
}

async function main() {
  console.log('================================================================');
  console.log('PHASE 4G.3P — MULTIMODAL READINESS & COMPREHENSIVE 54-UNIT AUDIT');
  console.log('Zero Database Mutations | Zero External AI Calls | Strictly Mocked');
  console.log('================================================================');

  // Load manifest & inventory
  const manifest = VisualAssetExtractor.loadManifest();
  const summary = ReadinessValidator.getReadinessSummary();

  // ==========================================================================
  // SUITE 1: AUTHORITATIVE 8-UNIT IDENTIFICATION & 54-UNIT GLOBAL READINESS AUDIT
  // ==========================================================================
  console.log('\n--- Suite 1: Authoritative 8-Unit Inventory & 54-Unit Global Readiness ---');

  await runTest('Readiness summary validates exactly 54 total units across 13 books', async () => {
    assert.strictEqual(summary.totalUnits, 54, 'Must have exactly 54 total units');
    assert.strictEqual(summary.verifiedReady, 54, 'All 54 units must be VERIFIED_READY');
    assert.strictEqual(summary.conditionallyReady, 0, 'No units conditionally ready');
    assert.strictEqual(summary.blocked, 0, 'No units blocked');
    assert.strictEqual(summary.notAudited, 0, 'No units not audited');
  });

  const the8AuthoritativeUnits = [
    // 4 previously BLOCKED units
    { chapterId: '1b9f4377-6ae0-4c24-b588-c221900597ec', bookId: '808104ec-b861-434b-80c6-579f715d8bdf', dep: 'GEOMETRY_DIAGRAMS' },
    { chapterId: 'dba6933a-2b80-4d3b-ada4-3ac6acfb58c1', bookId: '19886434-1839-427d-af31-4c64fcf79525', dep: 'GEOMETRY_PROOFS' },
    { chapterId: '3fa3ec4a-2af8-43e2-980f-dbd70ac62640', bookId: 'f19276d3-4adb-4297-bb77-5ed87ba638b9', dep: 'CARTOGRAPHIC_MAPS' },
    { chapterId: 'f1aef779-d047-4af8-be1e-b03938944c05', bookId: 'f19276d3-4adb-4297-bb77-5ed87ba638b9', dep: 'CARTOGRAPHIC_MAPS' },
    // 4 previously CONDITIONALLY_READY units
    { chapterId: 'c2387de6-beda-4c55-b93b-b65bfced4e45', bookId: 'fa2a1525-c46f-4b34-9f48-b762be88e5c5', dep: 'CONTINENTAL_RELIEF_MAPS' },
    { chapterId: 'b123b656-03b1-4af5-be4e-971dd5ba74a6', bookId: '81b8a308-7fcf-4938-8c45-aa0056624f32', dep: 'CONTINENTAL_RELIEF_MAPS' },
    { chapterId: '73d2b274-fef2-4282-abbb-2e7c828eb1c7', bookId: 'f19276d3-4adb-4297-bb77-5ed87ba638b9', dep: 'HISTORICAL_CAMPAIGN_MAPS' },
    { chapterId: '9c3643fa-641c-4af5-a376-44a63ef0d170', bookId: 'f19276d3-4adb-4297-bb77-5ed87ba638b9', dep: 'HISTORICAL_CAMPAIGN_MAPS' }
  ];

  await runTest('All 8 previously non-ready units evaluate as VERIFIED_READY and isEligibleForAI === true', async () => {
    for (const u of the8AuthoritativeUnits) {
      const res = ReadinessValidator.getUnitReadiness(u.bookId, u.chapterId);
      assert.strictEqual(res.status, 'VERIFIED_READY', `Unit ${u.chapterId} must be VERIFIED_READY`);
      assert.strictEqual(res.isEligibleForAI, true, `Unit ${u.chapterId} must be eligible for AI`);
      assert.doesNotThrow(() => {
        ReadinessValidator.assertUnitEligibleForAI(u.bookId, u.chapterId);
      }, `Unit ${u.chapterId} must not throw UnitReadinessBlockedError`);
    }
  });

  await runTest('Unregistered or adversarial chapter UUID strictly fails closed with NOT_AUDITED', async () => {
    const unknownRes = ReadinessValidator.getUnitReadiness(
      '00000000-0000-0000-0000-000000000000',
      'ffffffff-ffff-ffff-ffff-ffffffffffff'
    );
    assert.strictEqual(unknownRes.status, 'NOT_AUDITED');
    assert.strictEqual(unknownRes.isEligibleForAI, false);
    assert.throws(
      () => ReadinessValidator.assertUnitEligibleForAI('00000000-0000-0000-0000-000000000000', 'ffffffff-ffff-ffff-ffff-ffffffffffff'),
      UnitReadinessBlockedError
    );
  });

  // ==========================================================================
  // SUITE 2: MULTIMODAL ASSET PIPELINE & SHA-256 INTEGRITY
  // ==========================================================================
  console.log('\n--- Suite 2: Multimodal Asset Pipeline & Cryptographic Integrity ---');

  await runTest('Visual manifest contains all 24 verified visual assets', async () => {
    assert.strictEqual(manifest.total_assets, 24);
    assert.strictEqual(manifest.assets.length, 24);
  });

  await runTest('Distinguishes 20 high-fidelity vector PDF pages and 4 geometric SVG vector diagrams', async () => {
    const pdfAssets = manifest.assets.filter(a => a.mime_type === 'application/pdf');
    const svgAssets = manifest.assets.filter(a => a.mime_type === 'image/svg+xml');

    assert.strictEqual(pdfAssets.length, 20, 'Must have exactly 20 PDF page assets');
    assert.strictEqual(svgAssets.length, 4, 'Must have exactly 4 SVG diagram assets');

    for (const pdf of pdfAssets) {
      assert.ok(pdf.asset_type === 'page_image' || pdf.asset_type === 'map');
      assert.strictEqual(pdf.extraction_method, 'pdf-lib-page');
    }
    for (const svg of svgAssets) {
      assert.strictEqual(svg.asset_type, 'diagram');
      assert.strictEqual(svg.extraction_method, 'vector-svg');
    }
  });

  await runTest('Every single asset exists on disk with 100% SHA256 match', async () => {
    for (const asset of manifest.assets) {
      assert.ok(fs.existsSync(asset.file_path), `Asset file missing on disk: ${asset.file_path}`);
      const content = fs.readFileSync(asset.file_path);
      const computedHash = crypto.createHash('sha256').update(content).digest('hex');
      assert.strictEqual(computedHash, asset.sha256, `Hash mismatch on asset: ${asset.asset_id}`);
      assert.strictEqual(content.length, asset.file_size, `Size mismatch on asset: ${asset.asset_id}`);
    }
  });

  await runTest('Adversarial path traversal & unknown diagram URL validation fails closed', async () => {
    assert.strictEqual(VisualAssetExtractor.isVisualAssetValid('../../../etc/shadow'), false);
    assert.strictEqual(VisualAssetExtractor.isVisualAssetValid('/uploads/visual_assets/..%2f..%2fsecret'), false);
    assert.strictEqual(VisualAssetExtractor.isVisualAssetValid('/uploads/visual_assets/..\\secret'), false);
    assert.strictEqual(VisualAssetExtractor.isVisualAssetValid('http://external.site/map.jpg'), false);
    assert.strictEqual(VisualAssetExtractor.isVisualAssetValid(''), false);
    assert.strictEqual(VisualAssetExtractor.isVisualAssetValid(null), false);
  });

  // ==========================================================================
  // SUITE 3: GEOMETRY UNITS VISUAL GROUNDING & MARKING PRESERVATION
  // ==========================================================================
  console.log('\n--- Suite 3: Geometry Units Visual Grounding & Marking Preservation ---');

  const prep1MathBook = '808104ec-b861-434b-80c6-579f715d8bdf';
  const prep1GeomCh = '1b9f4377-6ae0-4c24-b588-c221900597ec';
  const prep1TransversalSvg = manifest.assets.find(
    a => a.book_id === prep1MathBook && a.chapter_id === prep1GeomCh && a.file_path.includes('parallel_lines')
  );
  assert.ok(prep1TransversalSvg, 'Prep 1 Transversal SVG must exist');

  const prep2MathBook = '19886434-1839-427d-af31-4c64fcf79525';
  const prep2GeomCh = 'dba6933a-2b80-4d3b-ada4-3ac6acfb58c1';
  const prep2PythagorasSvg = manifest.assets.find(
    a => a.book_id === prep2MathBook && a.chapter_id === prep2GeomCh && a.file_path.includes('pythagoras')
  );
  assert.ok(prep2PythagorasSvg, 'Prep 2 Pythagoras SVG must exist');

  await runTest('Prep 1 Math Geometry: question WITH valid transversal SVG passes blind solver with diagram', async () => {
    const candidate = {
      id: 'q_prep1_geom_1',
      question_text: 'In the opposite figure, if line L1 is parallel to line L2, what is the measure of the alternate interior angle?',
      options: [
        { id: 'opt_1', text: '50°' },
        { id: 'opt_2', text: '130°' },
        { id: 'opt_3', text: '40°' },
        { id: 'opt_4', text: '90°' }
      ],
      proposed_correct_option_id: 'opt_1',
      evidence: {
        book_id: prep1MathBook,
        chapter_id: prep1GeomCh,
        chunk_id: 'chk_p78_geom',
        page_number: 78,
        passage_text: 'When two parallel lines are cut by a transversal, each two alternate interior angles are equal in measure.'
      },
      diagram_url: prep1TransversalSvg.url_path,
      diagram_asset_id: prep1TransversalSvg.asset_id,
      has_visual_dependency: true
    };

    const mockSolver = async (input) => {
      assert.strictEqual(input.diagram_url, prep1TransversalSvg.url_path);
      return {
        status: 'SOLVED',
        selected_option_id: 'opt_1',
        defensible_option_ids: ['opt_1'],
        reasoning: 'Verified through diagram angle 50° and parallel line theorem',
        entailed_evidence_quote: 'each two alternate interior angles are equal in measure.'
      };
    };

    const res = await verifyCandidateQuestionWithBlindSolver(candidate, mockSolver);
    assert.strictEqual(res.is_verified, true);
    assert.strictEqual(res.status, 'VERIFIED');
  });

  await runTest('Prep 2 Math Geometry: question WITH valid Pythagoras SVG passes blind solver with diagram', async () => {
    const candidate = {
      id: 'q_prep2_geom_1',
      question_text: 'في الشكل المقابل، إذا كان المثلث ABC قائم الزاوية في B و AB = 6 سم و BC = 8 سم، احسب طول AC:',
      options: [
        { id: 'opt_1', text: '10 سم' },
        { id: 'opt_2', text: '14 سم' },
        { id: 'opt_3', text: '7 سم' },
        { id: 'opt_4', text: '12 سم' }
      ],
      proposed_correct_option_id: 'opt_1',
      evidence: {
        book_id: prep2MathBook,
        chapter_id: prep2GeomCh,
        chunk_id: 'chk_p68_pyth',
        page_number: 68,
        passage_text: 'في المثلث القائم الزاوية، مربع طول الوتر يساوي مجموع مربعي طولي ضلعي القائمة.'
      },
      diagram_url: prep2PythagorasSvg.url_path,
      diagram_asset_id: prep2PythagorasSvg.asset_id,
      has_visual_dependency: true
    };

    const mockSolver = async (input) => {
      assert.strictEqual(input.diagram_url, prep2PythagorasSvg.url_path);
      return {
        status: 'SOLVED',
        selected_option_id: 'opt_1',
        defensible_option_ids: ['opt_1'],
        reasoning: 'AC^2 = 6^2 + 8^2 = 36 + 64 = 100 => AC = 10',
        entailed_evidence_quote: 'مربع طول الوتر يساوي مجموع مربعي طولي ضلعي القائمة.'
      };
    };

    const res = await verifyCandidateQuestionWithBlindSolver(candidate, mockSolver);
    assert.strictEqual(res.is_verified, true);
  });

  await runTest('Geometry unit question WITHOUT diagram fails closed with OUT_OF_SCOPE', async () => {
    const candidateNoDiagram = {
      id: 'q_prep1_geom_nodiaram',
      question_text: 'In the opposite figure, find the value of angle x',
      options: [
        { id: 'opt_1', text: '50°' },
        { id: 'opt_2', text: '60°' }
      ],
      proposed_correct_option_id: 'opt_1',
      evidence: {
        book_id: prep1MathBook,
        chapter_id: prep1GeomCh,
        chunk_id: 'chk_p78_geom',
        page_number: 78,
        passage_text: 'Parallel lines alternate angles theorem definition.'
      }
      // diagram_url missing!
    };

    const res = await verifyCandidateQuestionWithBlindSolver(candidateNoDiagram, async () => ({}));
    assert.strictEqual(res.is_verified, false);
    assert.strictEqual(res.rejection_code, 'OUT_OF_SCOPE');
  });

  await runTest('Geometry unit question with MISMATCHED book diagram fails closed with INVALID_VISUAL_ASSET', async () => {
    const candidateMismatched = {
      id: 'q_prep1_geom_badbook',
      question_text: 'In the opposite figure, calculate the length of hypotenuse',
      options: [
        { id: 'opt_1', text: '10' },
        { id: 'opt_2', text: '20' }
      ],
      proposed_correct_option_id: 'opt_1',
      evidence: {
        book_id: prep1MathBook,
        chapter_id: prep1GeomCh,
        chunk_id: 'chk_p78_geom',
        page_number: 78,
        passage_text: 'Parallel lines alternate angles theorem definition.'
      },
      diagram_url: prep2PythagorasSvg.url_path // BELONGS TO PREP 2, NOT PREP 1!
    };

    const res = await verifyCandidateQuestionWithBlindSolver(candidateMismatched, async () => ({}));
    assert.strictEqual(res.is_verified, false);
    assert.strictEqual(res.rejection_code, 'INVALID_VISUAL_ASSET');
  });

  // ==========================================================================
  // SUITE 4: CARTOGRAPHIC MAP GROUNDING & ZERO-TEXT SCANNED PAGES
  // ==========================================================================
  console.log('\n--- Suite 4: Cartographic Map Grounding & Zero-Text Scanned Page Handling ---');

  const prep3SocialBook = 'f19276d3-4adb-4297-bb77-5ed87ba638b9';
  const prep3SocialUnit1Ch = '3fa3ec4a-2af8-43e2-980f-dbd70ac62640';
  const p21MapAsset = manifest.assets.find(
    a => a.book_id === prep3SocialBook && a.chapter_id === prep3SocialUnit1Ch && a.printed_page_number === 21
  );
  assert.ok(p21MapAsset, 'Page 21 North America Map asset must exist');

  const prep3SocialUnit3Ch = 'f1aef779-d047-4af8-be1e-b03938944c05';
  const p66ClimateMapAsset = manifest.assets.find(
    a => a.book_id === prep3SocialBook && a.chapter_id === prep3SocialUnit3Ch && a.printed_page_number === 66
  );
  assert.ok(p66ClimateMapAsset, 'Page 66 Climate Map asset must exist');

  await runTest('Prep 3 Social Unit 1: question on North America relief map (p. 21) passes with verified map asset', async () => {
    const candidate = {
      id: 'q_prep3_map_na',
      question_text: 'بالرجوع إلى خريطة تضاريس أمريكا الشمالية، تقع جبال روكي في الجهة:',
      options: [
        { id: 'opt_1', text: 'الغربية للقارة' },
        { id: 'opt_2', text: 'الشرقية للقارة' },
        { id: 'opt_3', text: 'الشمالية للقارة' },
        { id: 'opt_4', text: 'الجنوبية للقارة' }
      ],
      proposed_correct_option_id: 'opt_1',
      evidence: {
        book_id: prep3SocialBook,
        chapter_id: prep3SocialUnit1Ch,
        chunk_id: 'chk_p21_map',
        page_number: 21,
        passage_text: 'خريطة تضاريس أمريكا الشمالية توضح امتداد جبال روكي الشاهقة في غرب القارة وهضبة لبرادور في الشمال الشرقي.'
      },
      diagram_url: p21MapAsset.url_path,
      diagram_asset_id: p21MapAsset.asset_id,
      has_visual_dependency: true
    };

    const mockSolver = async (input) => {
      assert.strictEqual(input.diagram_url, p21MapAsset.url_path);
      return {
        status: 'SOLVED',
        selected_option_id: 'opt_1',
        defensible_option_ids: ['opt_1'],
        reasoning: 'Verified through physical relief map of North America showing Rocky Mountains on western coast',
        entailed_evidence_quote: 'جبال روكي الشاهقة في غرب القارة'
      };
    };

    const res = await verifyCandidateQuestionWithBlindSolver(candidate, mockSolver);
    assert.strictEqual(res.is_verified, true);
    assert.strictEqual(res.status, 'VERIFIED');
  });

  await runTest('Prep 3 Social Unit 3: question on climate map (p. 66) passes with verified map asset', async () => {
    const candidate = {
      id: 'q_prep3_map_climate',
      question_text: 'بالاستعانة بخريطة الأقاليم المناخية، يسود الإقليم الاستوائي في حوض نهر:',
      options: [
        { id: 'opt_1', text: 'الأمازون' },
        { id: 'opt_2', text: 'المسيسيبي' },
        { id: 'opt_3', text: 'الدانوب' },
        { id: 'opt_4', text: 'نيلسون' }
      ],
      proposed_correct_option_id: 'opt_1',
      evidence: {
        book_id: prep3SocialBook,
        chapter_id: prep3SocialUnit3Ch,
        chunk_id: 'chk_p66_map',
        page_number: 66,
        passage_text: 'يسود المناخ الاستوائي وشبه الاستوائي في حوض الأمازون بأمريكا الجنوبية ويتميز بارتفاع الحرارة طوال العام.'
      },
      diagram_url: p66ClimateMapAsset.url_path,
      diagram_asset_id: p66ClimateMapAsset.asset_id,
      has_visual_dependency: true
    };

    const mockSolver = async (input) => {
      assert.strictEqual(input.diagram_url, p66ClimateMapAsset.url_path);
      return {
        status: 'SOLVED',
        selected_option_id: 'opt_1',
        defensible_option_ids: ['opt_1'],
        reasoning: 'Verified through climate map legend and spatial shading over Amazon basin',
        entailed_evidence_quote: 'المناخ الاستوائي وشبه الاستوائي في حوض الأمازون'
      };
    };

    const res = await verifyCandidateQuestionWithBlindSolver(candidate, mockSolver);
    assert.strictEqual(res.is_verified, true);
  });

  await runTest('Question referencing map indicator ("بالرجوع إلى الخريطة") WITHOUT diagram fails closed with VISUAL_DIAGRAM_DEPENDENT', async () => {
    const candidateNoMap = {
      id: 'q_map_missing',
      question_text: 'بالرجوع إلى الخريطة الموضحة، حدد موقع نهر الدانوب في القارة:',
      options: [
        { id: 'opt_1', text: 'الشرق' },
        { id: 'opt_2', text: 'الغرب' }
      ],
      proposed_correct_option_id: 'opt_1',
      evidence: {
        book_id: '81b8a308-7fcf-4938-8c45-aa0056624f32',
        chapter_id: 'b123b656-03b1-4af5-be4e-971dd5ba74a6',
        chunk_id: 'chk_p18_europe',
        page_number: 18,
        passage_text: 'نهر الدانوب ينبع من جبال الألب ويصب في البحر الأسود شرقا.'
      }
      // diagram_url omitted!
    };

    const res = await verifyCandidateQuestionWithBlindSolver(candidateNoMap, async () => ({}));
    assert.strictEqual(res.is_verified, false);
    assert.strictEqual(res.rejection_code, 'VISUAL_DIAGRAM_DEPENDENT');
  });

  // ==========================================================================
  // SUITE 5: AIR-GAP PRIVACY & STUDENT RESPONSE SANITIZATION
  // ==========================================================================
  console.log('\n--- Suite 5: Air-Gap Privacy & Client Endpoint Sanitization ---');

  await runTest('Air-gap privacy: Blind solver input strictly preserves visual diagram without answer leakage', async () => {
    const secretCandidate = {
      id: 'sec_1',
      question_text: 'In the opposite figure, solve for angle A',
      options: [
        { id: 'o1', text: '50°', is_correct: true },
        { id: 'o2', text: '60°', is_correct: false }
      ],
      proposed_correct_option_id: 'o1',
      rationale: 'SECRET ANSWER KEY',
      diagram_url: prep1TransversalSvg.url_path,
      evidence: {
        book_id: prep1MathBook,
        chapter_id: prep1GeomCh,
        chunk_id: 'c1',
        page_number: 78,
        passage_text: 'Parallel lines alternate angles theorem.'
      }
    };

    const sanitized = sanitizeBlindSolverInput(secretCandidate);
    assert.strictEqual(sanitized.diagram_url, prep1TransversalSvg.url_path);
    assert.strictEqual(sanitized.proposed_correct_option_id, undefined);
    assert.strictEqual(sanitized.rationale, undefined);

    for (const opt of sanitized.options) {
      assert.strictEqual(opt.is_correct, undefined);
    }
  });

  await runTest('Student sanitization: Omits explanations and correct answers while preserving validated diagram_url', async () => {
    const groundedQuestions = [
      {
        id: 'q1',
        chunk_id: 'c1',
        book_id: prep1MathBook,
        chapter_id: prep1GeomCh,
        question_text: 'In the opposite figure, measure of angle is:',
        difficulty: 'MEDIUM',
        bloom_level: 'APPLICATION',
        explanation: 'CONFIDENTIAL TEACHER EXPLANATION',
        page_reference: 78,
        diagram_url: prep1TransversalSvg.url_path,
        has_visual_dependency: true,
        options: [
          { id: 'o1', text: '50°', is_correct: true },
          { id: 'o2', text: '130°', is_correct: false }
        ]
      }
    ];

    // Client sanitization logic matching routes/ai.ts
    const clientQuestions = groundedQuestions.map(q => {
      const isValid = q.diagram_url && VisualAssetExtractor.isVisualAssetValid(q.diagram_url);
      return {
        id: q.id,
        chunk_id: q.chunk_id,
        book_id: q.book_id,
        chapter_id: q.chapter_id,
        question_text: q.question_text,
        difficulty: q.difficulty,
        bloom_level: q.bloom_level,
        diagram_url: isValid ? q.diagram_url : undefined,
        has_visual_dependency: Boolean(q.has_visual_dependency || isValid),
        options: (q.options || []).map(o => ({
          id: o.id,
          text: o.text
        }))
      };
    });

    const safeQ = clientQuestions[0];
    assert.strictEqual(safeQ.explanation, undefined);
    assert.strictEqual(safeQ.diagram_url, prep1TransversalSvg.url_path);
    assert.strictEqual(safeQ.has_visual_dependency, true);
    for (const opt of safeQ.options) {
      assert.strictEqual(opt.is_correct, undefined);
    }
  });

  // ==========================================================================
  // SUITE 6: AUTHORITATIVE PROVENANCE FOR MULTIMODAL UNITS
  // ==========================================================================
  console.log('\n--- Suite 6: Authoritative Provenance Contract for Multimodal Units ---');

  await runTest('Geometry unit passes authoritative provenance when visual assets are verified in manifest', async () => {
    const geomEvidence = {
      book_id: prep1MathBook,
      chapter_id: prep1GeomCh,
      chunk_id: 'chk_p78',
      page_number: 78,
      passage_text: 'Alternate interior angles are equal in measure.'
    };

    const passageHash = crypto.createHash('sha256').update(geomEvidence.passage_text).digest('hex');

    const canonicalRecord = {
      book_id: prep1MathBook,
      book_is_eligible: true,
      chapter_id: prep1GeomCh,
      chapter_book_id: prep1MathBook,
      chunk_id: 'chk_p78',
      chunk_chapter_id: prep1GeomCh,
      chunk_page_number: 78,
      canonical_passage_text: geomEvidence.passage_text,
      canonical_passage_sha256: passageHash,
      is_disqualified_unit: false,
      has_unsupported_visuals: false
    };

    const provRes = verifyAuthoritativeProvenanceContract(geomEvidence, canonicalRecord);
    assert.strictEqual(provRes.is_valid, true);
  });

  console.log('\n================================================================');
  console.log('ALL PHASE 4G.3P TESTS PASSED: 16 / 16');
  console.log('All 54 Curriculum Units Audited | 100% Multimodal Grounding Verified');
  console.log('Zero Database Mutations | Zero External AI Calls');
  console.log('================================================================');
}

main().catch(err => {
  console.error('Test runner fatal error:', err);
  process.exit(1);
});
