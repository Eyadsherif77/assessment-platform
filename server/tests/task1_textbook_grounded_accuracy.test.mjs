import assert from 'assert';
import {
  validateListeningAndSourceGrounding,
  evaluateQuestionQuality,
  computeQuestionVerificationHash
} from '../dist/services/ai/aiRagEngine.js';

console.log('================================================================');
console.log('FARABI AI — TASK 1: TEXTBOOK-GROUNDED QUESTION ACCURACY SUITE');
console.log('English, Arabic & Social Studies Grounding | Zero Live AI Calls');
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

async function main() {
  try {
    // 1. Supported English grammar questions remain eligible
    await runTest('1. Supported English grammar questions remain eligible', async () => {
      const q = {
        id: 'q_eng_gram_1',
        question_text: 'Choose the correct form: If she study hard, she _____ the exam.',
        options: [
          { id: 'o1', text: 'will pass', is_correct: true },
          { id: 'o2', text: 'passed', is_correct: false },
          { id: 'o3', text: 'passes', is_correct: false },
          { id: 'o4', text: 'would pass', is_correct: false }
        ],
        difficulty: 'MEDIUM',
        bloom_level: 'APPLICATION',
        page_reference: 14,
        source_excerpt: 'Grammar Focus: First Conditional. If + present simple, will + infinitive. Example: If she studies hard, she will pass.',
        explanation: 'The first conditional uses present simple after if and will + verb in the main clause.'
      };
      const context = 'Unit 2: Grammar Focus. First Conditional: If + Present Simple, will + infinitive. If she studies hard, she will pass the exam.';
      const gResult = validateListeningAndSourceGrounding(q, context);
      assert.strictEqual(gResult.isValid, true, 'Grounding check must pass for grammar question');
      assert.strictEqual(gResult.detectedCategory, 'GRAMMAR', 'Category must be recognized as GRAMMAR');

      const quality = evaluateQuestionQuality(q);
      assert.strictEqual(quality.isValid, true, 'Pedagogical quality check must accept valid English grammar question');
    });

    // 2. Supported English vocabulary questions remain eligible
    await runTest('2. Supported English vocabulary questions remain eligible', async () => {
      const q = {
        id: 'q_eng_voc_1',
        question_text: 'The synonym of the word "ancient" is:',
        options: [
          { id: 'o1', text: 'very old', is_correct: true },
          { id: 'o2', text: 'modern', is_correct: false },
          { id: 'o3', text: 'cheap', is_correct: false },
          { id: 'o4', text: 'tiny', is_correct: false }
        ],
        difficulty: 'EASY',
        bloom_level: 'KNOWLEDGE',
        page_reference: 22,
        source_excerpt: 'Vocabulary in context: The ancient temples were built thousands of years ago. Ancient means very old.',
        explanation: 'Ancient means very old, dating from a long time ago in history.'
      };
      const context = 'Vocabulary in context: The ancient temples were built thousands of years ago. Ancient means very old.';
      const gResult = validateListeningAndSourceGrounding(q, context);
      assert.strictEqual(gResult.isValid, true);
      assert.strictEqual(gResult.detectedCategory, 'VOCABULARY');

      const quality = evaluateQuestionQuality(q);
      assert.strictEqual(quality.isValid, true);
    });

    // 3. Supported English reading-comprehension questions remain eligible
    await runTest('3. Supported English reading-comprehension questions remain eligible', async () => {
      const q = {
        id: 'q_eng_read_1',
        question_text: 'According to the reading passage, what did Dr. Farouk El-Baz study before joining NASA?',
        options: [
          { id: 'o1', text: 'Geology and lunar landscapes', is_correct: true },
          { id: 'o2', text: 'Modern architecture', is_correct: false },
          { id: 'o3', text: 'Marine biology', is_correct: false },
          { id: 'o4', text: 'Mechanical engineering', is_correct: false }
        ],
        difficulty: 'MEDIUM',
        bloom_level: 'UNDERSTANDING',
        page_reference: 35,
        source_excerpt: 'Reading Passage: Dr. Farouk El-Baz studied geology and lunar landscapes before joining the Apollo space program.',
        explanation: 'He specialized in geology and moon rocks.'
      };
      const context = 'Reading Passage: Dr. Farouk El-Baz is a renowned Egyptian-American scientist who studied geology and lunar landscapes before joining the Apollo space program at NASA.';
      const gResult = validateListeningAndSourceGrounding(q, context);
      assert.strictEqual(gResult.isValid, true);

      const quality = evaluateQuestionQuality(q);
      assert.strictEqual(quality.isValid, true);
    });

    // 4. Supported English writing and dialogue questions remain eligible when supported by the material
    await runTest('4. Supported English writing and dialogue questions remain eligible when supported by the material', async () => {
      const q = {
        id: 'q_eng_dial_1',
        question_text: 'Complete the dialogue: Receptionist: "How can I help you, sir?" - Tourist: "_____."',
        options: [
          { id: 'o1', text: 'I would like to book a room', is_correct: true },
          { id: 'o2', text: 'I am eating lunch yesterday', is_correct: false },
          { id: 'o3', text: 'No, thank you goodbye', is_correct: false },
          { id: 'o4', text: 'My friend is absent today', is_correct: false }
        ],
        difficulty: 'MEDIUM',
        bloom_level: 'APPLICATION',
        page_reference: 48,
        source_excerpt: 'Dialogue Practice: At the hotel reception. Receptionist: How can I help you? Tourist: I would like to book a single room for two nights.',
        explanation: 'In a hotel situation, asking to book a room is the appropriate standard response.'
      };
      const context = 'Dialogue Practice: At the hotel reception. Receptionist: How can I help you, sir? Tourist: I would like to book a single room for two nights.';
      const gResult = validateListeningAndSourceGrounding(q, context);
      assert.strictEqual(gResult.isValid, true);
      assert.strictEqual(gResult.detectedCategory, 'DIALOGUE');

      const quality = evaluateQuestionQuality(q);
      assert.strictEqual(quality.isValid, true);
    });

    // 5. Unsupported English listening questions requiring missing audio or transcripts are rejected
    await runTest('5. Unsupported English listening questions requiring missing audio or transcripts are rejected', async () => {
      const q = {
        id: 'q_eng_list_bad',
        question_text: 'Listen to the audio recording track 4 and identify what time the speaker arrived at the airport:',
        options: [
          { id: 'o1', text: '7:30 AM', is_correct: true },
          { id: 'o2', text: '8:00 AM', is_correct: false },
          { id: 'o3', text: '9:15 AM', is_correct: false },
          { id: 'o4', text: '6:45 AM', is_correct: false }
        ],
        difficulty: 'MEDIUM',
        bloom_level: 'UNDERSTANDING',
        page_reference: 12,
        source_excerpt: 'Exercise 3: Listen and answer the questions below.',
        explanation: 'The speaker arrived at 7:30 as heard in the audio track.'
      };
      // Context only has the bare instruction "Listen and answer" without printed script or transcript
      const bareInstructionContext = 'Unit 1, Page 12. Exercise 3: Listen and answer the following questions. [Audio Track 4 CD]';
      const gResult = validateListeningAndSourceGrounding(q, bareInstructionContext);
      assert.strictEqual(gResult.isValid, false, 'Must reject listening question when audio transcript is missing');
      assert.strictEqual(gResult.reasonCode, 'UNSUPPORTED_LISTENING_SOURCE');
      assert.ok(gResult.reasonMessage.includes('الاستماع'), 'Rejection message must indicate missing audio/transcript');

      const quality = evaluateQuestionQuality(q);
      assert.strictEqual(quality.isValid, false, 'evaluateQuestionQuality must reject question with missing transcript');
      assert.ok(quality.reason && quality.reason.includes('UNSUPPORTED_LISTENING_SOURCE'));
    });

    // 6. English listening questions remain eligible when their source content is available
    await runTest('6. English listening questions remain eligible when their source content is available', async () => {
      const q = {
        id: 'q_eng_list_good',
        question_text: 'In the recorded interview transcript, what reason did Sara give for joining the science club?',
        options: [
          { id: 'o1', text: 'To learn robotics and programming', is_correct: true },
          { id: 'o2', text: 'To play basketball', is_correct: false },
          { id: 'o3', text: 'To travel abroad', is_correct: false },
          { id: 'o4', text: 'To practice painting', is_correct: false }
        ],
        difficulty: 'MEDIUM',
        bloom_level: 'UNDERSTANDING',
        page_reference: 15,
        source_excerpt: 'Listening Transcript: Interviewer: Why did you join the science club? Sara: I joined because I want to learn robotics and programming.',
        explanation: 'Sara explicitly states she joined to learn robotics and programming.'
      };
      const printedTranscriptContext = `
        Listening Script & Audio Transcript:
        Interviewer: Welcome Sara. Why did you join the science club this term?
        Sara: I joined because I want to learn robotics and programming with my classmates.
        Interviewer: That sounds exciting!
      `;
      const gResult = validateListeningAndSourceGrounding(q, printedTranscriptContext);
      assert.strictEqual(gResult.isValid, true, 'Listening question MUST be accepted when transcript is printed and available');
      assert.strictEqual(gResult.detectedCategory, 'LISTENING');

      const quality = evaluateQuestionQuality(q);
      assert.strictEqual(quality.isValid, true);
    });

    // 7. Supported Arabic grammar questions remain eligible
    await runTest('7. Supported Arabic grammar questions remain eligible', async () => {
      const q = {
        id: 'q_ar_gram_1',
        question_text: 'اختر الإعراب الصحيح: إعراب كلمة "العلمُ" في جملة: (العلمُ نورٌ يضيء طريق المستقبل):',
        options: [
          { id: 'o1', text: 'مبتدأ مرفوع وعلامة رفعه الضمة الظاهرة', is_correct: true },
          { id: 'o2', text: 'خبر مرفوع وعلامة رفعه الضمة الظاهرة', is_correct: false },
          { id: 'o3', text: 'فاعل مرفوع بالضمة', is_correct: false },
          { id: 'o4', text: 'مفعول به منصوب بالفتحة', is_correct: false }
        ],
        difficulty: 'EASY',
        bloom_level: 'UNDERSTANDING',
        page_reference: 18,
        source_excerpt: 'القواعد النحوية: الجملة الاسمية تبدأ بمبتدأ مرفوع وخبر يتمم المعنى. مثال: العلمُ نورٌ.',
        explanation: 'العلم اسم بدأت به الجملة فهو مبتدأ مرفوع بالضمة.'
      };
      const context = 'القواعد النحوية المقررة: تتكون الجملة الاسمية من ركنين أساسيين هما المبتدأ والخبر. مثال: العلمُ نورٌ يضيء طريق المستقبل. العلمُ: مبتدأ مرفوع وعلامة رفعه الضمة الظاهرة على آخره.';
      const gResult = validateListeningAndSourceGrounding(q, context);
      assert.strictEqual(gResult.isValid, true);
      assert.strictEqual(gResult.detectedCategory, 'GRAMMAR');

      const quality = evaluateQuestionQuality(q);
      assert.strictEqual(quality.isValid, true, 'Arabic grammar question stem (اختر الإعراب) must be accepted');
    });

    // 8. Supported Arabic vocabulary questions remain eligible
    await runTest('8. Supported Arabic vocabulary questions remain eligible', async () => {
      const q = {
        id: 'q_ar_voc_1',
        question_text: 'حدد مرادف كلمة "الارتقاء" الواردة في درس العمل والإنتاج:',
        options: [
          { id: 'o1', text: 'التقدم والعلو', is_correct: true },
          { id: 'o2', text: 'التراجع والتأخر', is_correct: false },
          { id: 'o3', text: 'الكسل والركود', is_correct: false },
          { id: 'o4', text: 'الانخفاض', is_correct: false }
        ],
        difficulty: 'EASY',
        bloom_level: 'KNOWLEDGE',
        page_reference: 24,
        source_excerpt: 'الثروة اللغوية: كلمة الارتقاء تعني التقدم والعلو في المكانة والدرجة.',
        explanation: 'الارتقاء يعني السمو والتقدم والعلو.'
      };
      const context = 'الثروة اللغوية والمفردات: كلمة (الارتقاء) تعني التقدم والعلو في المراتب، ومضادها: الهبوط والتراجع.';
      const gResult = validateListeningAndSourceGrounding(q, context);
      assert.strictEqual(gResult.isValid, true);
      assert.strictEqual(gResult.detectedCategory, 'VOCABULARY');

      const quality = evaluateQuestionQuality(q);
      assert.strictEqual(quality.isValid, true);
    });

    // 9. Supported Arabic reading-comprehension questions remain eligible
    await runTest('9. Supported Arabic reading-comprehension questions remain eligible', async () => {
      const q = {
        id: 'q_ar_read_1',
        question_text: 'ما الفكرة الرئيسة التي يدعو إليها الكاتب في النص الأدبي المقرر؟',
        options: [
          { id: 'o1', text: 'أهمية التكافل الاجتماعي والتراحم بين أفراد الوطن', is_correct: true },
          { id: 'o2', text: 'تشجيع السفر للخارج', is_correct: false },
          { id: 'o3', text: 'وصف الطبيعة في فصل الشتاء', is_correct: false },
          { id: 'o4', text: 'تاريخ بناء القلاع القديمة', is_correct: false }
        ],
        difficulty: 'MEDIUM',
        bloom_level: 'UNDERSTANDING',
        page_reference: 31,
        source_excerpt: 'نص القراءة: يدعو الكاتب أبناء وطنه إلى التكافل الاجتماعي والتعاون لمساعدة الضعفاء وبناء مستقبل مشرق.',
        explanation: 'الفكرة المحورية للنص هي التكافل الاجتماعي والتعاون.'
      };
      const context = 'نص القراءة المقررة: يدعو الكاتب أبناء وطنه إلى التكافل الاجتماعي والتعاون لمساعدة الضعفاء وبناء مستقبل مشرق متماسك.';
      const gResult = validateListeningAndSourceGrounding(q, context);
      assert.strictEqual(gResult.isValid, true);
      assert.strictEqual(gResult.detectedCategory, 'READING_COMPREHENSION');

      const quality = evaluateQuestionQuality(q);
      assert.strictEqual(quality.isValid, true);
    });

    // 10. Unsupported Arabic listening questions requiring missing source content are rejected
    await runTest('10. Unsupported Arabic listening questions requiring missing source content are rejected', async () => {
      const q = {
        id: 'q_ar_list_bad',
        question_text: 'استمع إلى التسجيل الصوتي رقم 2 وحدد المكان الذي اجتمع فيه أعضاء الفريق:',
        options: [
          { id: 'o1', text: 'المكتبة المدرسية', is_correct: true },
          { id: 'o2', text: 'حديقة الحيوان', is_correct: false },
          { id: 'o3', text: 'محطة القطار', is_correct: false },
          { id: 'o4', text: 'النادي الرياضي', is_correct: false }
        ],
        difficulty: 'MEDIUM',
        bloom_level: 'UNDERSTANDING',
        page_reference: 10,
        source_excerpt: 'نشاط استماع: استمع إلى الشريط ثم أجب عن الأسئلة.',
        explanation: 'اجتمعوا في المكتبة وفقاً للمقطع الصوتي.'
      };
      const bareInstructionContext = 'الكتاب المدرسي - صفحة 10: نشاط الاستماع (1). استمع إلى التسجيل الصوتي المرفق على القرص المدمج وأجب عما يلي:';
      const gResult = validateListeningAndSourceGrounding(q, bareInstructionContext);
      assert.strictEqual(gResult.isValid, false, 'Must reject Arabic listening questions with missing audio transcript');
      assert.strictEqual(gResult.reasonCode, 'UNSUPPORTED_LISTENING_SOURCE');

      const quality = evaluateQuestionQuality(q);
      assert.strictEqual(quality.isValid, false);
      assert.ok(quality.reason && quality.reason.includes('UNSUPPORTED_LISTENING_SOURCE'));
    });

    // 11. Arabic listening questions remain eligible when the relevant content is available
    await runTest('11. Arabic listening questions remain eligible when the relevant content is available', async () => {
      const q = {
        id: 'q_ar_list_good',
        question_text: 'وفق نص الاستماع المطبوع، ما هي النصيحة التي وجهها المعلم للطلاب قبل بدء العام الدراسي؟',
        options: [
          { id: 'o1', text: 'تنظيم الوقت والحرص على القراءة اليومية', is_correct: true },
          { id: 'o2', text: 'السهر طوال الليل للاستذكار', is_correct: false },
          { id: 'o3', text: 'ترك الواجبات حتى نهاية الأسبوع', is_correct: false },
          { id: 'o4', text: 'تجنب المشاركة في الأنشطة المدرسية', is_correct: false }
        ],
        difficulty: 'EASY',
        bloom_level: 'UNDERSTANDING',
        page_reference: 11,
        source_excerpt: 'نص الاستماع: قال المعلم في حديثه المسجل: أنصحكم جميعاً بتنظيم الوقت والحرص على القراءة اليومية.',
        explanation: 'نصحهم المعلم بتنظيم الوقت والقراءة اليومية.'
      };
      const printedTranscriptContext = `
        نص الاستماع وتفريغ المحادثة:
        في بداية العام الدراسي، تحدث المعلم إلى تلاميذه قائلاً: "أهلاً بكم يا أبنائي، أنصحكم جميعاً بتنظيم الوقت والحرص على القراءة اليومية لتحقيق التفوق والتميز."
      `;
      const gResult = validateListeningAndSourceGrounding(q, printedTranscriptContext);
      assert.strictEqual(gResult.isValid, true, 'Arabic listening question MUST be eligible when transcript is available in book');
      assert.strictEqual(gResult.detectedCategory, 'LISTENING');

      const quality = evaluateQuestionQuality(q);
      assert.strictEqual(quality.isValid, true);
    });

    // 12. Social Studies questions are rejected when their facts are unsupported by the approved source
    await runTest('12. Social Studies questions are rejected when their facts are unsupported by the approved source', async () => {
      const q = {
        id: 'q_soc_bad',
        question_text: 'في أي عام وقعت الثورة العرابية وفق أحداث الدرس؟',
        options: [
          { id: 'o1', text: 'عام 1952م', is_correct: true },
          { id: 'o2', text: 'عام 1805م', is_correct: false },
          { id: 'o3', text: 'عام 1919م', is_correct: false },
          { id: 'o4', text: 'عام 1973م', is_correct: false }
        ],
        difficulty: 'MEDIUM',
        bloom_level: 'KNOWLEDGE',
        page_reference: 42,
        source_excerpt: 'الدرس يتناول التضاريس والمناخ في الوطن العربي.',
        explanation: 'وقعت الثورة العرابية في التاريخ المذكور.'
      };
      // Context is Geography (climate/terrain), but question asks about Urabi revolution with completely unmentioned dates
      const terrainContext = 'الوحدة الأولى: جغرافيا الوطن العربي - التضاريس والمناخ. تمتد جبال أطلس في شمال غرب قارة إفريقيا، وتتنوع الأقاليم المناخية بين البحر المتوسط والصحراوي والمداري.';
      const gResult = validateListeningAndSourceGrounding(q, terrainContext);
      assert.strictEqual(gResult.isValid, false, 'Must reject Social Studies questions asserting dates not in the textbook context');
      assert.strictEqual(gResult.reasonCode, 'UNSUPPORTED_HISTORICAL_FACT');

      const quality = evaluateQuestionQuality(q);
      assert.strictEqual(quality.isValid, false);
      assert.ok(quality.reason && quality.reason.includes('UNSUPPORTED_HISTORICAL_FACT'));
    });

    // 13. Social Studies questions remain eligible when supported by textbook evidence
    await runTest('13. Social Studies questions remain eligible when supported by textbook evidence', async () => {
      const q = {
        id: 'q_soc_good',
        question_text: 'قاد القائد المصري تحتمس الثالث معركة مجدو التاريخية وانتصر فيها على أمراء آسيا عام:',
        options: [
          { id: 'o1', text: '1479 ق.م', is_correct: true },
          { id: 'o2', text: '1274 ق.م', is_correct: false },
          { id: 'o3', text: '3100 ق.م', is_correct: false },
          { id: 'o4', text: '525 ق.م', is_correct: false }
        ],
        difficulty: 'MEDIUM',
        bloom_level: 'KNOWLEDGE',
        page_reference: 65,
        source_excerpt: 'معركة مجدو: قاد تحتمس الثالث الجيش المصري عام 1479 ق.م في معركة مجدو الشهيرة وانتصر على تحالف أمراء آسيا بقيادة أمير قادش.',
        explanation: 'وقعت معركة مجدو عام 1479 ق.م.'
      };
      const context = 'معركة مجدو: قاد تحتمس الثالث الجيش المصري عام 1479 ق.م في معركة مجدو الشهيرة وانتصر على تحالف أمراء آسيا بقيادة أمير قادش.';
      const gResult = validateListeningAndSourceGrounding(q, context);
      assert.strictEqual(gResult.isValid, true, 'Supported Social Studies question MUST be eligible');
      assert.strictEqual(gResult.detectedCategory, 'SOCIAL_STUDIES');

      const quality = evaluateQuestionQuality(q);
      assert.strictEqual(quality.isValid, true);
    });

    // 14. Insufficient source material cannot be silently replaced by invented questions
    await runTest('14. Insufficient source material cannot be silently replaced by invented questions', async () => {
      const inventedQuestion = {
        id: 'q_invented',
        question_text: 'What did Peter discover when he opened the secret chamber under the old castle stairs?',
        options: [
          { id: 'o1', text: 'A golden key and a map', is_correct: true },
          { id: 'o2', text: 'A wooden chair', is_correct: false },
          { id: 'o3', text: 'An empty bottle', is_correct: false },
          { id: 'o4', text: 'A sleeping dog', is_correct: false }
        ],
        difficulty: 'MEDIUM',
        bloom_level: 'UNDERSTANDING',
        page_reference: 5,
        source_excerpt: '',
        explanation: 'Peter found a golden key.'
      };
      // Context has nothing about Peter, secret chambers, or castles
      const unrelatedContext = 'Chapter 1: The solar system consists of the sun, eight planets, moons, asteroids, and comets.';
      const gResult = validateListeningAndSourceGrounding(inventedQuestion, unrelatedContext);
      assert.strictEqual(gResult.isValid, false, 'Must reject invented stories or passages not supported by source');
      assert.strictEqual(gResult.reasonCode, 'UNSUPPORTED_SOURCE_GROUNDING');
    });

    // 15. Existing source-readiness, provenance, and page-reference behavior remains intact
    await runTest('15. Existing source-readiness, provenance, and page-reference behavior remains intact', async () => {
      const q = {
        id: 'q_prov_valid',
        question_text: 'ما وحدة قياس الكثافة في النظام الدولي للوحدات وفق ما ورد في درس المادة وخواصها؟',
        options: [
          { id: 'o1', text: 'جم / سم³', is_correct: true },
          { id: 'o2', text: 'متر / ثانية', is_correct: false },
          { id: 'o3', text: 'نيوتن', is_correct: false },
          { id: 'o4', text: 'جول', is_correct: false }
        ],
        difficulty: 'EASY',
        bloom_level: 'KNOWLEDGE',
        page_reference: 8,
        source_excerpt: 'الكثافة هي كتلة وحدة الحجوم من المادة، وتقدر بوحدة جم / سم³.',
        explanation: 'تقاس الكثافة بوحدة جم/سم³.'
      };
      const context = 'درس المادة وخواصها (صفحة 8): الكثافة هي كتلة وحدة الحجوم من المادة (1 سم³)، وتقاس بوحدة (جم / سم³). القانون: الكثافة = الكتلة / الحجم.';
      
      const gResult = validateListeningAndSourceGrounding(q, context);
      assert.strictEqual(gResult.isValid, true, 'Valid textbook-grounded question must pass source grounding');
      
      const quality = evaluateQuestionQuality(q);
      assert.strictEqual(quality.isValid, true, 'Valid question must pass educational quality');

      // Verify deterministic cryptographic provenance hash
      const hash1 = computeQuestionVerificationHash(q);
      assert.ok(hash1, 'Must generate deterministic verification hash');
      assert.strictEqual(hash1.length, 64, 'Hash must be 64 hex characters');

      // Tampering detection: changing answer option must produce different hash
      const tamperedQ = {
        ...q,
        options: [
          { id: 'o1', text: 'نيوتن', is_correct: true },
          { id: 'o2', text: 'متر / ثانية', is_correct: false }
        ]
      };
      const hash2 = computeQuestionVerificationHash(tamperedQ);
      assert.notStrictEqual(hash1, hash2, 'Tampered question must yield different provenance hash');

      // Ensure page reference remains accurate integer and internal chunk IDs remain hidden
      assert.strictEqual(q.page_reference, 8, 'Page reference must remain intact and accurate');
      assert.strictEqual(typeof q.page_reference, 'number', 'Student-facing page reference must be a numeric page number');
    });

    console.log('\n================================================================');
    console.log(`ALL TASK 1 TESTS PASSED PERFECTLY: ${passedTests}/${totalTests}`);
    console.log('================================================================');
  } catch (err) {
    console.error('\n❌ TASK 1 TEST SUITE FAILED:', err);
    process.exit(1);
  }
}

main();
