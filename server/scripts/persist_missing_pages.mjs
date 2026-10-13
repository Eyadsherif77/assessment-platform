import dotenv from 'dotenv';
import path from 'path';
dotenv.config({ path: path.resolve(process.cwd(), '.env') });
import { db } from '../dist/db/db.js';
import { v4 as uuidv4 } from 'uuid';

const bookId = 'f19276d3-4adb-4297-bb77-5ed87ba638b9';

const page42Text = `الفصل الدراسي الأول
تولية «محمد علي» حكم مصر وتثبيت دعائم حكمه الدرس الأول
٢ حملة فريزر (١٨٠٧م)
أرسلت إنجلترا حملة عسكرية إلى مصر بقيادة فريزر عام ١٨٠٧م؛ بهدف احتلال مصر ومساعدة محمد بك الألفي (أحد زعماء المماليك الموالين للإنجليز) لإقامة حكم موال لها في مصر، لكنه تُوفّي قبل وصول الحملة، وقد استولت تلك الحملة على الإسكندرية، ثم أرسل فريزر فرقتين عسكريتين إلى كل من رشيد والحماد، ولكنهما فشلتا في السيطرة عليهما؛ لبسالة الأهالي في الدفاع عنهما، وانضمام جيش «محمد علي» لأهالي الحماد؛ فاضطر فريزر للانسحاب إلى الإسكندرية، ثم انسحبت الحملة من مصر في نفس العام بعد فشلها في تحقيق أهدافها.
تعاون وتوقَّع:
توقَّع النتائج المترتبة إذا نجحت حملة فريزر في احتلال مصر.
٣ الزعامة الشعبية (١٨٠٩م)
واجه «محمد علي» أزمة مالية كبيرة لتوفير رواتب الجنود، وذلك بسبب تدهور الأوضاع الاقتصادية في البلاد، فاتجه إلى فرض ضرائب جديدة ومصادرة بعض الممتلكات؛ فتضامن المشايخ والعلماء، بزعامة نقيب الأشراف السيد عمر مكرم، مع الأهالي الذين تجمهروا في الجامع الأزهر احتجاجًا على ذلك، واتفقوا على الدفاع عن حقوق الشعب، فلما بلغ خبر اجتماعهم إلى «محمد علي» أرسل إليهم يدعوهم لمقابلته والتفاوض معه، لكنهم رفضوا حتى يُلغي الضرائب التي أثقلت كاهل الأهالي، وهنا أدرك «محمد علي» خطورة الزعامة الشعبية على مكانته، ورغب في التخلص منهم للانفراد بحكم مصر؛ فعزل عمر مكرم من منصبه، وأصدر حكمًا بنفيه إلى دمياط عام ١٨٠٩م، وعيّن الشيخ السادات نقيبًا للأشراف.
فكر وقارن:
قارن بين: موقف «محمد علي» من الزعامة الشعبية عامي ١٨٠٥م و١٨٠٩م، مُعَبِّرًا عن رأيك في كل موقف.
٤ خطر المماليك (١٨١١م)
أدرك «محمد علي» أن المماليك يمثلون تهديدًا لحكمه؛ فسعى للتخلص منهم خلال عدة معارك، وفي مارس ١٨١١م أقام حفلًا كبيرًا في القلعة دعا إليه كبار رجال الدولة وأمراء المماليك، وبعد انتهاء الاحتفال أغلقت أبواب القلعة وتخلَّص جنوده من أمراء المماليك، وعُرفت هذه الحادثة باسم «مذبح القلعة»، ثم أرسل «محمد علي» قواته لمطاردة مَن تبقَّى من المماليك الذين لم يحضروا الحفل وكانوا في الصعيد حتى أجلاهم بعيدًا عن البلاد.
٤١`;

const page84Text = `الفصل الدراسي الأول التغير المناخي وتأثيره على النظم البيئية والموارد المائية الدرس الثالث
يؤثر التغير المناخي على كل من النظم البيئية والموارد المائية والجوانب الاقتصادية والاجتماعية كما يلي:
١ تأثيره على النظم البيئية والموارد المائية:
يعد التغير المناخي من أكبر التهديدات التي تواجه النظم البيئية والتنوع الحيوي في العالم، ويتضح ذلك فيما يلي:
• ارتفاع درجة حرارة سطح المحيطات: مما يؤدي إلى هجرة بعض الكائنات البحرية نحو المناطق الباردة؛ مما تسبب في ضعف بعضها وموتها، وهو ما يؤثر سلباً على أنشطة الصيد والسياحة.
• موجات الحر والجفاف المتكررة: تؤدي إلى نقص الموارد المائية العذبة.
٢ تأثيره على الأنشطة الاقتصادية:
• الزراعة: يؤدي التغير المناخي إلى انخفاض إنتاجية بعض المحاصيل الزراعية، وانتشار الآفات الزراعية وتدهور التربة، كما يؤدي إلى تراجع إنتاج الثروة الحيوانية؛ مما يُهدد الأمن الغذائي.
• النقل والتجارة: تتعرض البنية التحتية للنقل والطاقة لمخاطر متزايدة بسبب التغير المناخي؛ حيث تؤدي حرائق الغابات إلى تعطيل الطرق وشبكات الكهرباء، ويؤدي ذوبان الجليد إلى تدمير الطرق وخطوط الأنابيب، كما يؤدي ارتفاع مستوى سطح البحر وزيادة شدة العواصف البحرية إلى تعطيل حركة النقل البحري والجوي وتآكل السواحل.
حرائق الغابات`;

async function persistMissingPages() {
  // Get book & chapter info
  const bRes = await db.query('SELECT * FROM books WHERE id = $1', [bookId]);
  const book = bRes.rows[0];

  const chRes = await db.query('SELECT id, chapter_number, start_page, end_page FROM book_chapters WHERE book_id = $1', [bookId]);
  const chMap = {};
  for (const c of chRes.rows) {
    chMap[c.chapter_number] = c;
  }

  // Page 42 belongs to Unit 2 (chapter_number = 2, start: 30, end: 63)
  const unit2 = chMap[2];
  // Page 84 belongs to Unit 3 (chapter_number = 3, start: 64, end: 91)
  const unit3 = chMap[3];

  console.log(`Inserting Page 42 (Unit 2 ID: ${unit2.id})...`);
  await db.query(
    `INSERT INTO book_pages (id, book_id, page_number, raw_text, char_count)
     VALUES ($1, $2, $3, $4, $5)
     ON DUPLICATE KEY UPDATE raw_text = VALUES(raw_text), char_count = VALUES(char_count)`,
    [uuidv4(), bookId, 42, page42Text, page42Text.length]
  );

  // Insert chunk for Page 42
  await db.query('DELETE FROM book_chunks WHERE book_id = $1 AND page_number = $2', [bookId, 42]);
  await db.query(
    `INSERT INTO book_chunks (
      id, book_id, chapter_id, academic_stage_id, grade_id, subject_id, page_number, chunk_index, content, metadata
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
    [
      uuidv4(), bookId, unit2.id, book.academic_stage_id, book.grade_id, book.subject_id,
      42, 0, page42Text, JSON.stringify({ unit_number: 2, pdf_page: 42, printed_page: 41 })
    ]
  );

  console.log(`Inserting Page 84 (Unit 3 ID: ${unit3.id})...`);
  await db.query(
    `INSERT INTO book_pages (id, book_id, page_number, raw_text, char_count)
     VALUES ($1, $2, $3, $4, $5)
     ON DUPLICATE KEY UPDATE raw_text = VALUES(raw_text), char_count = VALUES(char_count)`,
    [uuidv4(), bookId, 84, page84Text, page84Text.length]
  );

  // Insert chunk for Page 84
  await db.query('DELETE FROM book_chunks WHERE book_id = $1 AND page_number = $2', [bookId, 84]);
  await db.query(
    `INSERT INTO book_chunks (
      id, book_id, chapter_id, academic_stage_id, grade_id, subject_id, page_number, chunk_index, content, metadata
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
    [
      uuidv4(), bookId, unit3.id, book.academic_stage_id, book.grade_id, book.subject_id,
      84, 0, page84Text, JSON.stringify({ unit_number: 3, pdf_page: 84, printed_page: 83 })
    ]
  );

  // Check new total
  const countRes = await db.query('SELECT count(*) as total, sum(length(raw_text)) as total_chars FROM book_pages WHERE book_id = $1', [bookId]);
  const chunkRes = await db.query('SELECT count(*) as total_chunks FROM book_chunks WHERE book_id = $1', [bookId]);
  console.log('✅ Final Database Verification:');
  console.log(`Pages stored in book_pages: ${countRes.rows[0].total}/113`);
  console.log(`Total characters: ${countRes.rows[0].total_chars}`);
  console.log(`Total chunks: ${chunkRes.rows[0].total_chunks}`);

  process.exit(0);
}

persistMissingPages().catch(err => {
  console.error(err);
  process.exit(1);
});
