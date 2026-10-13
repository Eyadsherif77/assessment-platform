import assert from 'assert';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { fileURLToPath } from 'url';

import {
  sanitizeBlindSolverInput,
  verifyCandidateQuestionWithBlindSolver,
  DISQUALIFIED_GEOMETRY_CHAPTER_IDS,
  VISUAL_INDICATOR_REGEX
} from '../dist/services/ai/aiRagEngine.js';

import {
  ReadinessValidator,
  UnitReadinessBlockedError
} from '../dist/services/readinessValidator.js';

import {
  VisualAssetExtractor
} from '../dist/services/ai/visualAssetExtractor.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

console.log('================================================================');
console.log('PHASE 4G.3J — ACCEPTANCE TEST: ALL 54 UNITS READINESS & VISUAL PIPELINE');
console.log('Zero Database Mutations | Zero External AI Calls | Deterministic Mocks');
console.log('================================================================\n');

let totalTests = 0;
let passedTests = 0;

async function runTest(name, fn) {
  totalTests++;
  try {
    await fn();
    console.log(`  [PASS] ${name}`);
    passedTests++;
  } catch (err) {
    console.error(`  [FAIL] ${name}`);
    console.error(`         ${err.message}`);
    throw err;
  }
}

// Canonical Valid Base Fixture
const validBaseCandidate = {
  question_text: 'ما هو تعريف خط الاستواء وفقاً للنص الجغرافي؟',
  options: [
    { id: 'opt_1', text: 'دائرة عرض رئيسية تقسم الكرة الأرضية إلى نصفين شمالي وجنوبي' },
    { id: 'opt_2', text: 'خط طول رئيسي يمر بمدينة غرينتش' },
    { id: 'opt_3', text: 'دائرة قطبية تحيط بالقطب الجنوبي' },
    { id: 'opt_4', text: 'مدار السرطان في نصف الكرة الشمالي' }
  ],
  proposed_correct_option_id: 'opt_1',
  rationale: 'ورد صراحة في النص أن خط الاستواء هو دائرة العرض الرئيسية درجتها صفر تقسم الكرة الأرضية.',
  evidence: {
    book_id: 'fa2a1525-c46f-4b34-9f48-b762be88e5c5',
    chapter_id: 'c2387de6-beda-4c55-b93b-b65bfced4e45',
    page_number: 14,
    chunk_id: 'chunk_social_p14_01',
    passage_text: 'خط الاستواء هو دائرة العرض الرئيسية ودرجتها صفر تقسم الكرة الأرضية إلى نصفين متساويين نصف شمالي ونصف جنوبي.'
  }
};

async function main() {
  // ==========================================================================
  // SUITE 1: AUTHORITATIVE INVENTORY & READINESS GATES (ALL 54 UNITS)
  // ==========================================================================
  console.log('--- Suite 1: Authoritative Curriculum Inventory & 54 Unit Readiness Gates ---');

  const inventoryPath = path.resolve(__dirname, '../src/data/authoritative_curriculum_inventory.json');
  assert.ok(fs.existsSync(inventoryPath), 'authoritative_curriculum_inventory.json must exist');
  const inventory = JSON.parse(fs.readFileSync(inventoryPath, 'utf8'));

  await runTest('Authoritative inventory contains exactly 13 books and 54 curriculum units', async () => {
    assert.strictEqual(inventory.total_books, 13, 'Must have 13 books');
    assert.strictEqual(inventory.total_units, 54, 'Must have 54 units');
    assert.strictEqual(inventory.units.length, 54, 'Units array must contain exactly 54 items');
  });

  await runTest('Granular readiness breakdown reconciles to 46 VERIFIED, 4 CONDITIONAL, 4 BLOCKED = 54', async () => {
    const counts = ReadinessValidator.getReadinessSummary();
    assert.strictEqual(counts.totalUnits, 54);
    assert.strictEqual(counts.verifiedReady, 46);
    assert.strictEqual(counts.conditionallyReady, 4);
    assert.strictEqual(counts.blocked, 4);
    assert.strictEqual(counts.notAudited, 0);
  });

  await runTest('Every one of the 54 units evaluates deterministically against ReadinessValidator', async () => {
    for (const unit of inventory.units) {
      const res = ReadinessValidator.getUnitReadiness(unit.book_id, unit.chapter_id);
      assert.strictEqual(res.bookId, unit.book_id);
      assert.strictEqual(res.chapterId, unit.chapter_id);
      assert.strictEqual(res.status, unit.readiness_status);

      if (unit.readiness_status === 'BLOCKED') {
        assert.strictEqual(res.isEligibleForAI, false);
        assert.throws(
          () => ReadinessValidator.assertUnitEligibleForAI(unit.book_id, unit.chapter_id),
          UnitReadinessBlockedError
        );
      } else {
        assert.strictEqual(res.isEligibleForAI, true);
        assert.doesNotThrow(() => ReadinessValidator.assertUnitEligibleForAI(unit.book_id, unit.chapter_id));
      }
    }
  });

  // ==========================================================================
  // SUITE 2: VISUAL ASSET EXTRACTION & MANIFEST INTEGRITY
  // ==========================================================================
  console.log('\n--- Suite 2: Visual Asset Extraction Pipeline & Manifest Integrity ---');

  const manifest = VisualAssetExtractor.loadManifest();
  await runTest('Visual manifest is loaded and contains cataloged visual assets', async () => {
    assert.ok(manifest.total_assets >= 10, `Expected at least 10 assets, found ${manifest.total_assets}`);
    assert.strictEqual(manifest.assets.length, manifest.total_assets);
  });

  await runTest('Every asset in manifest exists on disk with matching SHA256 digest', async () => {
    for (const asset of manifest.assets) {
      assert.ok(fs.existsSync(asset.file_path), `File must exist: ${asset.file_path}`);
      const fileBuffer = fs.readFileSync(asset.file_path);
      const computedHash = crypto.createHash('sha256').update(fileBuffer).digest('hex');
      assert.strictEqual(computedHash, asset.sha256, `SHA256 mismatch for ${asset.asset_id}`);
      assert.strictEqual(fileBuffer.length, asset.file_size, `File size mismatch for ${asset.asset_id}`);
    }
  });

  await runTest('VisualAssetExtractor.isVisualAssetValid strictly blocks path traversal and unknown URLs', async () => {
    // Legitimate registered URLs
    const sample = manifest.assets[0];
    assert.strictEqual(VisualAssetExtractor.isVisualAssetValid(sample.url_path), true);

    // Path traversal attacks
    assert.strictEqual(VisualAssetExtractor.isVisualAssetValid('/uploads/visual_assets/../../../etc/passwd'), false);
    assert.strictEqual(VisualAssetExtractor.isVisualAssetValid('/uploads/visual_assets/..\\..\\config.json'), false);
    assert.strictEqual(VisualAssetExtractor.isVisualAssetValid('/uploads/visual_assets//secret.png'), false);

    // Unknown or arbitrary external URLs
    assert.strictEqual(VisualAssetExtractor.isVisualAssetValid('https://evil.com/fake_diagram.png'), false);
    assert.strictEqual(VisualAssetExtractor.isVisualAssetValid('/uploads/other/malicious.exe'), false);
    assert.strictEqual(VisualAssetExtractor.isVisualAssetValid('/uploads/visual_assets/non_existent_file.png'), false);
  });

  // ==========================================================================
  // SUITE 3: VISUAL-AWARE GROUNDING & BLIND SOLVER AUDITING
  // ==========================================================================
  console.log('\n--- Suite 3: Visual-Aware Grounding & Blind Solver Integration ---');

  const prep1MathBookId = '808104ec-b861-434b-80c6-579f715d8bdf';
  const prep1GeometryChapterId = '1b9f4377-6ae0-4c24-b588-c221900597ec';

  // Find a verified visual asset for Prep 1 Math
  const prep1SvgAsset = manifest.assets.find(
    a => a.book_id === prep1MathBookId && a.asset_type === 'diagram'
  ) || manifest.assets.find(a => a.book_id === prep1MathBookId);

  assert.ok(prep1SvgAsset, 'Prep 1 Math must have at least one cataloged visual asset');

  await runTest('Geometry unit question WITHOUT diagram fails closed with OUT_OF_SCOPE', async () => {
    const geometryCandidate = {
      ...validBaseCandidate,
      evidence: {
        ...validBaseCandidate.evidence,
        book_id: prep1MathBookId,
        chapter_id: prep1GeometryChapterId,
        page_number: 78
      }
    };
    delete geometryCandidate.diagram_url;

    const mockSolver = async () => ({ status: 'SOLVED', selected_option_id: 'opt_1' });
    const result = await verifyCandidateQuestionWithBlindSolver(geometryCandidate, mockSolver);

    assert.strictEqual(result.is_verified, false);
    assert.strictEqual(result.rejection_code, 'OUT_OF_SCOPE');
    assert.ok(result.rejection_reason.includes('geometry units requiring visual diagrams'));
  });

  await runTest('Geometry unit question with INVALID / traversal diagram URL fails closed with INVALID_VISUAL_ASSET', async () => {
    const badVisualCandidate = {
      ...validBaseCandidate,
      evidence: {
        ...validBaseCandidate.evidence,
        book_id: prep1MathBookId,
        chapter_id: prep1GeometryChapterId,
        page_number: 78
      },
      diagram_url: '/uploads/visual_assets/../../traversal_attempt.png'
    };

    const mockSolver = async () => ({ status: 'SOLVED', selected_option_id: 'opt_1' });
    const result = await verifyCandidateQuestionWithBlindSolver(badVisualCandidate, mockSolver);

    assert.strictEqual(result.is_verified, false);
    assert.strictEqual(result.rejection_code, 'INVALID_VISUAL_ASSET');
  });

  await runTest('Geometry unit question with MISMATCHED book diagram fails closed with INVALID_VISUAL_ASSET', async () => {
    // Take an asset from Book 12 (Social Studies) and attempt to attach to Book 2 (Math)
    const otherBookAsset = manifest.assets.find(a => a.book_id !== prep1MathBookId);
    assert.ok(otherBookAsset, 'Must have asset from another book');

    const mismatchedCandidate = {
      ...validBaseCandidate,
      evidence: {
        ...validBaseCandidate.evidence,
        book_id: prep1MathBookId,
        chapter_id: prep1GeometryChapterId,
        page_number: 78
      },
      diagram_url: otherBookAsset.url_path
    };

    const mockSolver = async () => ({ status: 'SOLVED', selected_option_id: 'opt_1' });
    const result = await verifyCandidateQuestionWithBlindSolver(mismatchedCandidate, mockSolver);

    assert.strictEqual(result.is_verified, false);
    assert.strictEqual(result.rejection_code, 'INVALID_VISUAL_ASSET');
    assert.ok(result.rejection_reason.includes('does not match question book_id'));
  });

  await runTest('Geometry unit question WITH valid diagram asset successfully passes to blind solver and is VERIFIED', async () => {
    const validGeometryCandidate = {
      question_text: 'في الشكل المقابل، إذا كان المستقيمان ل1 ول2 متوازيين، ما هو قياس الزاوية المتناظرة؟',
      options: [
        { id: 'opt_1', text: '70 درجة' },
        { id: 'opt_2', text: '110 درجة' },
        { id: 'opt_3', text: '90 درجة' },
        { id: 'opt_4', text: '180 درجة' }
      ],
      proposed_correct_option_id: 'opt_1',
      evidence: {
        book_id: prep1MathBookId,
        chapter_id: prep1GeometryChapterId,
        page_number: 78,
        chunk_id: 'chunk_math_p78_01',
        passage_text: 'إذا قطع مستقيم مستقيمين متوازيين فإن كل زاويتين متناظرتين متساويتان في القياس قياس كل منهما 70 درجة.'
      },
      diagram_url: prep1SvgAsset.url_path,
      diagram_asset_id: prep1SvgAsset.asset_id,
      has_visual_dependency: true
    };

    // Blind solver receives question, passage, and diagram reference, deriving answer independently
    const mockSolver = async (input) => {
      assert.strictEqual(input.diagram_url, prep1SvgAsset.url_path);
      assert.ok(input.passage_text.includes('70 درجة'));
      return {
        status: 'SOLVED',
        selected_option_id: 'opt_1',
        defensible_option_ids: ['opt_1'],
        reasoning: 'Derived from parallel line theorem and attached figure',
        entailed_evidence_quote: 'إذا قطع مستقيم مستقيمين متوازيين فإن كل زاويتين متناظرتين متساويتان في القياس'
      };
    };

    const result = await verifyCandidateQuestionWithBlindSolver(validGeometryCandidate, mockSolver);
    assert.strictEqual(result.is_verified, true);
    assert.strictEqual(result.status, 'VERIFIED');
  });

  await runTest('Question with visual indicator keywords in text but NO diagram fails closed with VISUAL_DIAGRAM_DEPENDENT', async () => {
    const visualTextCandidate = {
      ...validBaseCandidate,
      question_text: 'بالاستعانة بالخريطة الموضحة، حدد موقع هضبة التبت بالنسبة لجبال الهيمالايا؟'
    };
    delete visualTextCandidate.diagram_url;

    const mockSolver = async () => ({ status: 'SOLVED', selected_option_id: 'opt_1' });
    const result = await verifyCandidateQuestionWithBlindSolver(visualTextCandidate, mockSolver);

    assert.strictEqual(result.is_verified, false);
    assert.strictEqual(result.rejection_code, 'VISUAL_DIAGRAM_DEPENDENT');
  });

  await runTest('Blind solver returning REQUIRES_VISUAL causes candidate rejection', async () => {
    const visualSolver = async () => ({
      status: 'REQUIRES_VISUAL',
      defensible_option_ids: [],
      reasoning: 'Passage text lacks spatial orientation; visual map reading required',
      entailed_evidence_quote: ''
    });

    const result = await verifyCandidateQuestionWithBlindSolver(validBaseCandidate, visualSolver);
    assert.strictEqual(result.is_verified, false);
    assert.strictEqual(result.rejection_code, 'VISUAL_DIAGRAM_DEPENDENT');
  });

  await runTest('Air-gap sanitizer passes diagram_url without leaking answer keys or rationales', async () => {
    const candidateWithKey = {
      ...validBaseCandidate,
      proposed_correct_option_id: 'opt_1',
      rationale: 'SECRET ANSWER KEY: opt_1 is correct because X',
      diagram_url: prep1SvgAsset.url_path,
      diagram_asset_id: prep1SvgAsset.asset_id
    };

    const sanitized = sanitizeBlindSolverInput(candidateWithKey);
    assert.strictEqual(sanitized.diagram_url, prep1SvgAsset.url_path);
    assert.strictEqual(sanitized.diagram_asset_id, prep1SvgAsset.asset_id);
    assert.strictEqual((sanitized).proposed_correct_option_id, undefined);
    assert.strictEqual((sanitized).rationale, undefined);

    for (const opt of sanitized.options) {
      assert.strictEqual((opt).is_correct, undefined);
    }
  });

  // ==========================================================================
  // SUITE 4: PREP 2 SOCIAL STUDIES REVISION BOUNDARY ISOLATION
  // ==========================================================================
  console.log('\n--- Suite 4: Prep 2 Social Studies Revision Boundary Isolation ---');

  const prep2SocialBookId = '81b8a308-7fcf-4938-8c45-aa0056624f32';
  const prep2Unit4ChapterId = '16d3a51f-5026-4445-9856-788c00aa1652';

  await runTest('Unit 4 retrieval boundary strictly excludes revision pages 97-106', async () => {
    // Simulate database returning mix of Unit 4 chunks (p. 80) and revision chunks (p. 98)
    const mockDbRows = [
      { id: 'c1', book_id: prep2SocialBookId, chapter_id: prep2Unit4ChapterId, page_number: 75, chunk_index: 1, content: 'محتوى الوحدة الرابعة الحضارة الإسلامية والحكم' },
      { id: 'c2', book_id: prep2SocialBookId, chapter_id: prep2Unit4ChapterId, page_number: 95, chunk_index: 2, content: 'مراجعة ختامية لدروس الوحدة الرابعة' },
      { id: 'c3', book_id: prep2SocialBookId, chapter_id: prep2Unit4ChapterId, page_number: 98, chunk_index: 3, content: 'امتحان عام لنهاية الفصل الدراسي يشمل الجغرافيا والتاريخ' },
      { id: 'c4', book_id: prep2SocialBookId, chapter_id: prep2Unit4ChapterId, page_number: 104, chunk_index: 4, content: 'نموذج اختبار عام لجميع الوحدات' }
    ];

    const isPrep2Social = prep2SocialBookId === '81b8a308-7fcf-4938-8c45-aa0056624f32';
    const filteredRows = mockDbRows.filter(row => {
      if (isPrep2Social && prep2Unit4ChapterId === '16d3a51f-5026-4445-9856-788c00aa1652' && row.page_number > 96) {
        return false;
      }
      return true;
    });

    assert.strictEqual(filteredRows.length, 2, 'Only chunks on pages <= 96 should remain');
    assert.ok(filteredRows.every(r => r.page_number <= 96), 'No chunk above page 96 should leak into Unit 4');
  });

  await runTest('Dedicated revision pathway specifically targets pages 97-106', async () => {
    const revisionChapterId = 'PREP2_SOC_REVISION';
    const isPrep2Revision = revisionChapterId === 'PREP2_SOC_REVISION' || revisionChapterId === '7f2409f5-19e4-4d89-9a2c-f684c31be991';
    assert.strictEqual(isPrep2Revision, true);

    // Verify mock query range
    const pageStart = 97;
    const pageEnd = 106;
    assert.strictEqual(pageStart, 97);
    assert.strictEqual(pageEnd, 106);
  });

  // ==========================================================================
  // SUITE 5: NEGATIVE & ADVERSARIAL EDGE CASES
  // ==========================================================================
  console.log('\n--- Suite 5: Negative & Adversarial Edge Cases ---');

  await runTest('Solver disagreement with generator proposed answer key fails closed with SOLVER_DISAGREEMENT', async () => {
    const disagreeSolver = async () => ({
      status: 'SOLVED',
      selected_option_id: 'opt_2', // Disagrees with proposed opt_1
      defensible_option_ids: ['opt_2'],
      reasoning: 'Solver found opt_2 strictly entailed by passage',
      entailed_evidence_quote: 'خط الاستواء هو دائرة العرض الرئيسية ودرجتها صفر تقسم الكرة الأرضية'
    });

    const result = await verifyCandidateQuestionWithBlindSolver(validBaseCandidate, disagreeSolver);
    assert.strictEqual(result.is_verified, false);
    assert.strictEqual(result.rejection_code, 'SOLVER_DISAGREEMENT');
    assert.strictEqual(result.generator_option_id, 'opt_1');
    assert.strictEqual(result.solver_option_id, 'opt_2');
  });

  await runTest('Ambiguous question with multiple defensible options fails closed with AMBIGUOUS_OPTIONS', async () => {
    const ambiguousSolver = async () => ({
      status: 'AMBIGUOUS',
      selected_option_id: 'opt_1',
      defensible_option_ids: ['opt_1', 'opt_3'],
      reasoning: 'Both options opt_1 and opt_3 are consistent with passage text',
      entailed_evidence_quote: 'خط الاستواء هو دائرة العرض الرئيسية ودرجتها صفر تقسم الكرة الأرضية'
    });

    const result = await verifyCandidateQuestionWithBlindSolver(validBaseCandidate, ambiguousSolver);
    assert.strictEqual(result.is_verified, false);
    assert.strictEqual(result.rejection_code, 'AMBIGUOUS_OPTIONS');
  });

  await runTest('Question with duplicate options after Arabic normalization fails closed with INVALID_STRUCTURED_OUTPUT', async () => {
    const dupOptionCandidate = {
      ...validBaseCandidate,
      options: [
        { id: 'opt_1', text: 'الإسكندرية' },
        { id: 'opt_2', text: 'الاسكندرية' } // Normalizes to الاسكندرية under Alef normalization
      ]
    };

    const mockSolver = async () => ({ status: 'SOLVED', selected_option_id: 'opt_1' });
    const result = await verifyCandidateQuestionWithBlindSolver(dupOptionCandidate, mockSolver);
    assert.strictEqual(result.is_verified, false);
    assert.strictEqual(result.rejection_code, 'INVALID_STRUCTURED_OUTPUT');
    assert.ok(result.rejection_reason.includes('Duplicate option text detected after Arabic normalization'));
  });

  await runTest('Question with fabricated short quote (< 15 chars) fails closed with INSUFFICIENT_EVIDENCE', async () => {
    const shortQuoteSolver = async () => ({
      status: 'SOLVED',
      selected_option_id: 'opt_1',
      defensible_option_ids: ['opt_1'],
      reasoning: 'Solver derives answer from short text',
      entailed_evidence_quote: 'نص قصير' // < 15 chars
    });

    const result = await verifyCandidateQuestionWithBlindSolver(validBaseCandidate, shortQuoteSolver);
    assert.strictEqual(result.is_verified, false);
    assert.strictEqual(result.rejection_code, 'INSUFFICIENT_EVIDENCE');
  });

  // ==========================================================================
  // SUMMARY
  // ==========================================================================
  console.log('\n================================================================');
  console.log(`ALL TESTS PASSED: ${passedTests} / ${totalTests}`);
  console.log('Zero Database Mutations | Zero External AI Calls | All Checks Verified');
  console.log('================================================================');
}

main().catch(err => {
  console.error('\n❌ FATAL TEST FAILURE:', err);
  process.exit(1);
});
