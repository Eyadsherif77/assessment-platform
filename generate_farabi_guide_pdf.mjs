import fs from 'fs';
import { execFileSync } from 'child_process';
import path from 'path';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const { PDFDocument } = require('./server/node_modules/pdf-lib');

console.log('Building Farabi AI Platform User Guide PDF...');

const htmlContent = `<!DOCTYPE html>
<html dir="rtl" lang="ar">
<head>
<meta charset="utf-8">
<title>منصة التقييم من أجل التعلم · فارابي للذكاء الاصطناعي - دليل المستخدم</title>
<style>
  @import url('https://fonts.googleapis.com/css2?family=Cairo:wght@400;500;600;700;800;900&family=IBM+Plex+Sans+Arabic:wght@400;500;600;700&display=swap');

  :root {
    --primary: #2563EB;
    --primary-dark: #1D4ED8;
    --primary-light: #EFF6FF;
    --navy: #0F172A;
    --navy-light: #1E293B;
    --text-main: #1E293B;
    --text-muted: #64748B;
    --border: #E2E8F0;
    --border-light: #F1F5F9;
    --bg-subtle: #F8FAFC;
    --success: #16A34A;
    --warning-bg: #FEF2F2;
    --warning-border: #DC2626;
    --warning-text: #991B1B;
  }

  @page {
    size: A4 portrait;
    margin: 0;
  }

  * {
    box-sizing: border-box;
    -webkit-print-color-adjust: exact !important;
    print-color-adjust: exact !important;
  }

  body {
    margin: 0;
    padding: 0;
    direction: rtl;
    font-family: 'Cairo', 'IBM Plex Sans Arabic', -apple-system, BlinkMacSystemFont, 'Segoe UI', Tahoma, sans-serif;
    color: var(--text-main);
    background: #ffffff;
    -webkit-font-smoothing: antialiased;
  }

  .page {
    width: 210mm;
    height: 297mm;
    max-height: 297mm;
    padding: 18mm 16mm 22mm 16mm;
    position: relative;
    page-break-after: always;
    overflow: hidden;
    background: #ffffff;
  }

  .footer {
    position: absolute;
    bottom: 11mm;
    left: 16mm;
    right: 16mm;
    border-top: 1px solid var(--border);
    padding-top: 6px;
    display: flex;
    justify-content: space-between;
    align-items: center;
    font-size: 8.5pt;
    color: var(--text-muted);
    font-weight: 600;
  }

  .chapter-title {
    font-size: 23pt;
    font-weight: 900;
    color: var(--navy);
    border-bottom: 4px solid var(--primary);
    padding-bottom: 6px;
    margin-top: 0;
    margin-bottom: 10px;
    line-height: 1.25;
    letter-spacing: -0.02em;
  }

  .role-desc {
    font-size: 10.5pt;
    color: #475569;
    line-height: 1.6;
    margin-bottom: 14px;
    font-weight: 500;
  }

  .sidebar-strip {
    background: var(--bg-subtle);
    border: 1px solid var(--border);
    border-radius: 8px;
    padding: 9px 14px;
    font-size: 9.5pt;
    color: #334155;
    margin-bottom: 20px;
    line-height: 1.6;
  }

  .sidebar-strip strong {
    color: var(--navy);
    margin-left: 6px;
  }

  .task-title {
    font-size: 13.5pt;
    font-weight: 800;
    color: var(--navy-light);
    margin-top: 16px;
    margin-bottom: 11px;
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .step-item {
    margin-bottom: 11px;
  }

  .step-row {
    display: flex;
    align-items: flex-start;
    gap: 9px;
  }

  .step-badge {
    width: 21px;
    height: 21px;
    border-radius: 50%;
    background: var(--primary);
    color: #ffffff;
    font-size: 9.5pt;
    font-weight: 800;
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
    margin-top: 2px;
  }

  .step-text {
    font-size: 9.8pt;
    color: #1E293B;
    line-height: 1.55;
    flex: 1;
  }

  .step-result {
    margin-top: 2px;
    margin-right: 30px;
    font-size: 8.8pt;
    color: var(--text-muted);
    font-style: italic;
    line-height: 1.45;
  }

  .callout-note {
    background: #EFF6FF;
    border-right: 4px solid var(--primary);
    border-radius: 6px;
    padding: 8px 12px;
    margin: 10px 0;
    font-size: 8.9pt;
    color: #1E40AF;
    line-height: 1.5;
  }

  .callout-note strong {
    color: #1E3A8A;
    font-weight: 800;
  }

  .callout-warning {
    background: #FEF2F2;
    border-right: 4px solid #DC2626;
    border-radius: 6px;
    padding: 8px 12px;
    margin: 10px 0;
    font-size: 8.9pt;
    color: #991B1B;
    line-height: 1.5;
  }

  .callout-warning strong {
    color: #7F1D1D;
    font-weight: 800;
  }

  /* Browser & Mockup UI Cards */
  .mockup-window {
    background: #ffffff;
    border: 1px solid #CBD5E1;
    border-radius: 10px;
    box-shadow: 0 4px 16px rgba(15, 23, 42, 0.08);
    overflow: hidden;
    margin: 16px 0;
  }

  .mockup-titlebar {
    background: #F1F5F9;
    border-bottom: 1px solid #CBD5E1;
    padding: 8px 12px;
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .mockup-dots {
    display: flex;
    gap: 5px;
  }

  .mockup-dot {
    width: 9px;
    height: 9px;
    border-radius: 50%;
  }

  .mockup-dot.red { background: #EF4444; }
  .mockup-dot.yellow { background: #F59E0B; }
  .mockup-dot.green { background: #10B981; }

  .mockup-address {
    background: #ffffff;
    border: 1px solid #E2E8F0;
    border-radius: 6px;
    padding: 2px 12px;
    font-size: 8pt;
    color: #64748B;
    direction: ltr;
    text-align: left;
    flex: 1;
    max-width: 320px;
  }

  .mockup-content {
    padding: 16px;
    background: #FAFAFA;
  }

  .ui-badge {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    padding: 3px 8px;
    border-radius: 999px;
    font-size: 8pt;
    font-weight: 700;
  }

  .ui-badge-primary { background: #EFF6FF; color: #1D4ED8; border: 1px solid #BFDBFE; }
  .ui-badge-success { background: #F0FDF4; color: #15803D; border: 1px solid #BBF7D0; }
  .ui-badge-warning { background: #FFFBEB; color: #B45309; border: 1px solid #FDE68A; }
  .ui-badge-purple { background: #FAF5FF; color: #6B21A8; border: 1px solid #E9D5FF; }

  /* Key Metrics Grid */
  .metrics-grid {
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    gap: 10px;
    margin: 12px 0;
  }

  .metric-card {
    background: #ffffff;
    border: 1px solid #E2E8F0;
    border-radius: 8px;
    padding: 10px;
    text-align: center;
  }

  .metric-value {
    font-size: 15pt;
    font-weight: 900;
    color: var(--primary);
  }

  .metric-label {
    font-size: 8pt;
    color: var(--text-muted);
    font-weight: 600;
    margin-top: 2px;
  }
</style>
</head>
<body>

<!-- ==========================================
     PAGE 1: COVER PAGE
     ========================================== -->
<div class="page" style="display: flex; flex-direction: column; justify-content: space-between; padding-top: 35mm; padding-bottom: 25mm;">
  <div>
    <div style="display: flex; align-items: center; gap: 12px; margin-bottom: 25px;">
      <div style="width: 48px; height: 48px; background: #1E3A8A; border-radius: 12px; display: flex; align-items: center; justify-content: center; color: #ffffff; font-size: 24pt; font-weight: 900;">
        ف
      </div>
      <div>
        <div style="font-size: 11pt; font-weight: 800; color: #1E3A8A; letter-spacing: 0.05em;">FARABI AI · PLATFORM GUIDE</div>
        <div style="font-size: 9pt; color: #64748B;">المنظومة الوطنية الذكية للتقييم من أجل التعلم</div>
      </div>
    </div>

    <h1 style="font-size: 28pt; font-weight: 900; color: #0F172A; line-height: 1.25; margin: 0 0 10px 0;">
      منصة التقييم من أجل التعلم
    </h1>
    <div style="font-size: 20pt; font-weight: 700; color: #2563EB; margin-bottom: 18px;">
      فارابي للذكاء الاصطناعي · النسخة التجريبية
    </div>

    <div style="font-size: 14pt; font-weight: 700; color: #334155; margin-bottom: 14px;">
      دليل المستخدم الشامل لكل دور
    </div>

    <p style="font-size: 11pt; color: #475569; line-height: 1.7; max-width: 90%; margin-bottom: 30px;">
      كل فصل في هذا الدليل مخصص لدور وظيفي محدد في المنظومة التعليمية. ابحث عن دورك في جدول المحتويات ثم اتبع الخطوات الإجرائية المرقمة بدقة للوصول إلى أعلى كفاءة تعليمية وتقييمية.
    </p>

    <!-- Demo URL Highlighted Box -->
    <div style="background: #F8FAFC; border: 2px solid #2563EB; border-radius: 12px; padding: 18px 22px; max-width: 92%; margin-bottom: 20px;">
      <div style="font-size: 9.5pt; font-weight: 800; color: #1E3A8A; margin-bottom: 6px; letter-spacing: 0.05em;">
        عنوان المنصة والنسخة المعتمدة (OFFICIAL DOMAIN)
      </div>
      <div style="font-size: 14pt; font-weight: 800; color: #2563EB; font-family: monospace; direction: ltr; text-align: right;">
        https://farabi-ai.com
      </div>
      <div style="font-size: 8.5pt; color: #64748B; margin-top: 6px; direction: ltr; text-align: right;">
        Web Access: https://farabi-ai.com
      </div>
    </div>

    <!-- Credentials Note -->
    <div style="background: #EFF6FF; border-right: 4px solid #2563EB; border-radius: 8px; padding: 12px 18px; max-width: 92%;">
      <div style="font-size: 9.5pt; font-weight: 800; color: #1E3A8A; margin-bottom: 6px;">
        بيانات حساب الطالب التجريبي المعتمد (Prep 3):
      </div>
      <div style="background: #ffffff; border: 1px solid #BFDBFE; border-radius: 6px; padding: 8px 14px; margin-bottom: 6px; display: flex; justify-content: space-between; align-items: center;">
        <div>
          <span style="font-size: 8.5pt; color: #64748B;">الدور والمرحلة: </span>
          <strong style="font-size: 9pt; color: #1E293B;">طالب (الصف الثالث الإعدادي - Prep 3)</strong>
        </div>
        <div style="display: flex; gap: 14px; font-family: monospace;">
          <span>اسم المستخدم: <strong style="color: #2563EB; font-size: 11pt;">s</strong></span>
          <span>كلمة المرور: <strong style="color: #16A34A; font-size: 11pt;">1</strong></span>
        </div>
      </div>
      <div style="font-size: 8.5pt; color: #1E40AF; line-height: 1.5;">
        يمكنك تسجيل الدخول فوراً بهذا الحساب لتجربة بيئة الطالب وخوض الاختبارات واستعراض المناهج والتحليلات التراكمية الحية.
      </div>
    </div>
  </div>

  <div style="display: flex; justify-content: space-between; align-items: flex-end; border-top: 1px solid #E2E8F0; padding-top: 14px;">
    <div style="font-size: 8.5pt; color: #64748B;">
      وزارة التربية والتعليم والتعليم الفني · التطوير التكنولوجي والتقييم الذكي
    </div>
    <div style="font-size: 9pt; font-weight: 800; color: #0F172A;">
      1 / 38
    </div>
  </div>
</div>

<!-- ==========================================
     PAGE 2: HOW TO READ THIS GUIDE & TOC
     ========================================== -->
<div class="page">
  <h2 class="chapter-title" style="font-size: 20pt; border-bottom: 3px solid var(--primary); margin-bottom: 16px;">
    كيف تقرأ هذا الدليل
  </h2>

  <div style="background: #F8FAFC; border: 1px solid var(--border); border-radius: 10px; padding: 16px 20px; margin-bottom: 24px;">
    <div style="font-size: 10.5pt; font-weight: 800; color: var(--navy); margin-bottom: 12px;">
      ثلاث قواعد أساسية لتحقيق أقصى استفادة من الدليل:
    </div>

    <div style="display: flex; flex-direction: column; gap: 10px;">
      <div style="display: flex; align-items: flex-start; gap: 10px;">
        <div class="step-badge" style="background: #0F172A;">1</div>
        <div style="font-size: 9.8pt; color: #334155; line-height: 1.5;">
          <strong>نفّذ الخطوات بترتيب أرقامها التسلسلي،</strong> خطوة واحدة في كل مرة دون تخطي أي مرحلة لضمان استقرار المهام والتسليم.
        </div>
      </div>

      <div style="display: flex; align-items: flex-start; gap: 10px;">
        <div class="step-badge" style="background: #0F172A;">2</div>
        <div style="font-size: 9.8pt; color: #334155; line-height: 1.5;">
          <strong>الأسماء بالخط الغامق</strong> (مثل <b>تسجيل الدخول</b> أو <b>بدء تقييم تشخيصي</b>) هي التسميات والأزرار الموجودة على الشاشة بالضبط دون تغيير.
        </div>
      </div>

      <div style="display: flex; align-items: flex-start; gap: 10px;">
        <div class="step-badge" style="background: #0F172A;">3</div>
        <div style="font-size: 9.8pt; color: #334155; line-height: 1.5;">
          <strong>السطر المائل باللون الرمادي</strong> أسفل كل خطوة يخبرك بدقة بما سيظهر لك على الشاشة أو الإجراء الذي سينفذه النظام فور ضغط الزر.
        </div>
      </div>
    </div>
  </div>

  <h3 style="font-size: 15pt; font-weight: 800; color: var(--navy); margin-bottom: 14px;">
    فهرس المحتويات وتوزيع الأدوار
  </h3>

  <div style="display: flex; flex-direction: column; gap: 8px;">
    <div style="display: flex; justify-content: space-between; align-items: center; padding: 9px 14px; background: #F1F5F9; border-radius: 8px; font-weight: 700;">
      <span style="color: #0F172A;">ابدأ من هنا (إرشادات لجميع المستخدمين)</span>
      <span style="color: var(--primary); font-family: monospace; font-size: 10pt;">صفحة 3</span>
    </div>

    <div style="display: flex; justify-content: space-between; align-items: center; padding: 9px 14px; background: #ffffff; border: 1px solid var(--border); border-radius: 8px;">
      <span style="color: #1E293B; font-weight: 700;">الفصل الأول: دور الطالب (Student)</span>
      <span style="color: var(--text-muted); font-family: monospace; font-size: 10pt;">صفحة 7</span>
    </div>

    <div style="display: flex; justify-content: space-between; align-items: center; padding: 9px 14px; background: #ffffff; border: 1px solid var(--border); border-radius: 8px;">
      <span style="color: #1E293B; font-weight: 700;">الفصل الثاني: دور المعلم (Teacher)</span>
      <span style="color: var(--text-muted); font-family: monospace; font-size: 10pt;">صفحة 14</span>
    </div>

    <div style="display: flex; justify-content: space-between; align-items: center; padding: 9px 14px; background: #ffffff; border: 1px solid var(--border); border-radius: 8px;">
      <span style="color: #1E293B; font-weight: 700;">الفصل الثالث: دور المشرف التربوي وموجه المادة (Supervisor)</span>
      <span style="color: var(--text-muted); font-family: monospace; font-size: 10pt;">صفحة 21</span>
    </div>

    <div style="display: flex; justify-content: space-between; align-items: center; padding: 9px 14px; background: #ffffff; border: 1px solid var(--border); border-radius: 8px;">
      <span style="color: #1E293B; font-weight: 700;">الفصل الرابع: دور مدير المحافظة والمدير المركزي (Directors)</span>
      <span style="color: var(--text-muted); font-family: monospace; font-size: 10pt;">صفحة 26</span>
    </div>

    <div style="display: flex; justify-content: space-between; align-items: center; padding: 9px 14px; background: #ffffff; border: 1px solid var(--border); border-radius: 8px;">
      <span style="color: #1E293B; font-weight: 700;">الفصل الخامس: دور مدير المنظومة والمسؤول العام (General Admin)</span>
      <span style="color: var(--text-muted); font-family: monospace; font-size: 10pt;">صفحة 31</span>
    </div>

    <div style="display: flex; justify-content: space-between; align-items: center; padding: 9px 14px; background: #F8FAFC; border: 1px solid var(--border); border-radius: 8px;">
      <span style="color: #475569; font-weight: 700;">الخاتمة والميثاق الأمني والدعم الفني المعتمد</span>
      <span style="color: var(--text-muted); font-family: monospace; font-size: 10pt;">صفحة 38</span>
    </div>
  </div>

  <div class="footer">
    <span>منصة التقييم من أجل التعلم · دليل المستخدم</span>
    <span>2 / 38</span>
  </div>
</div>

<!-- ==========================================
     PAGE 3: START HERE - LOGIN & REGISTER
     ========================================== -->
<div class="page">
  <h2 class="chapter-title">ابدأ من هنا</h2>
  <div class="role-desc">
    منصة التقييم من أجل التعلم (فارابي للذكاء الاصطناعي) هي منظومة متقدمة تعمل عبر متصفح الويب على أجهزة الكمبيوتر والأجهزة اللوحية والهواتف الذكية. هذا الفصل يوضح الإجراءات المشتركة لجميع المستخدمين.
  </div>

  <div class="task-title">تسجيل الدخول إلى المنصة</div>

  <div class="step-item">
    <div class="step-row">
      <div class="step-badge">1</div>
      <div class="step-text">افتح رابط المنصة المعتمد في متصفحك: <b>https://farabi-ai.com</b>.</div>
    </div>
    <div class="step-result">تظهر لك الصفحة الرئيسية للمنصة مع شريط التنقل العلوي وبطاقات التعريف بالمنظومة.</div>
  </div>

  <div class="step-item">
    <div class="step-row">
      <div class="step-badge">2</div>
      <div class="step-text">اضغط زر <b>تسجيل الدخول</b> الموجود في أعلى يسار الصفحة الرئيسية أو في وسط الشاشة.</div>
    </div>
    <div class="step-result">تفتح نافذة تسجيل الدخول المنبثقة وتحتوي على حقلي البريد الإلكتروني وكلمة المرور.</div>
  </div>

  <div class="step-item">
    <div class="step-row">
      <div class="step-badge">3</div>
      <div class="step-text">اكتب في حقل <b>البريد الإلكتروني أو اسم المستخدم أو الكود</b> بياناتك المعتمدة.</div>
    </div>
    <div class="step-result">يمكن للطالب استخدام كوده التعريفي الدائم (مثل STU-49201) أو بريده الإلكتروني.</div>
  </div>

  <div class="step-item">
    <div class="step-row">
      <div class="step-badge">4</div>
      <div class="step-text">اكتب في حقل <b>كلمة المرور</b> كلمة السر الخاصة بحسابك، ثم اضغط زر <b>تسجيل الدخول</b>.</div>
    </div>
    <div class="step-result">يتحقق النظام من بياناتك ويقوم بنقلك فوراً إلى لوحة التحكم الخاصة بدورك.</div>
  </div>

  <div class="callout-note">
    <strong>ملاحظة هامة:</strong> يمكن للمعلمين ومدراء النظام أيضاً الدخول عبر بوابة المعلمين والإدارة المباشرة بالضغط على تبويب <b>بوابة المعلمين والمسؤولين</b>.
  </div>

  <div class="task-title">إنشاء حساب طالب جديد</div>

  <div class="step-item">
    <div class="step-row">
      <div class="step-badge">1</div>
      <div class="step-text">في نافذة تسجيل الدخول، اضغط على الرابط السفلي <b>إنشاء حساب جديد</b>.</div>
    </div>
    <div class="step-result">يتحول نموذج النافذة إلى استمارة تسجيل طالب جديد.</div>
  </div>

  <div class="step-item">
    <div class="step-row">
      <div class="step-badge">2</div>
      <div class="step-text">حدد <b>نوع التعليم</b> باختيار <b>عربى</b> أو <b>لغات</b>.</div>
    </div>
    <div class="step-result">يحدد هذا الخيار لغة الكتب والمناهج والامتحانات المخصصة لك.</div>
  </div>

  <div class="step-item">
    <div class="step-row">
      <div class="step-badge">3</div>
      <div class="step-text">اختر <b>المحافظة</b> من القائمة المنسدلة (تضم جميع محافظات جمهورية مصر العربية الـ 27).</div>
    </div>
    <div class="step-result">يتم ربط حسابك بالإدارة التعليمية والموجهين التابعين لمحافظتك.</div>
  </div>

  <div class="footer">
    <span>منصة التقييم من أجل التعلم · دليل المستخدم</span>
    <span>3 / 38</span>
  </div>
</div>

<!-- ==========================================
     PAGE 4: START HERE - STUDENT CODE & DEVICE LIMITS
     ========================================== -->
<div class="page">
  <h2 class="chapter-title">ابدأ من هنا</h2>

  <div class="task-title">استكمال تسجيل الطالب واستلام كود الطالب التعريفي</div>

  <div class="step-item">
    <div class="step-row">
      <div class="step-badge">4</div>
      <div class="step-text">اختر <b>الصف الدراسي</b> (مثل <b>الصف الأول الإعدادي</b>) واكتب <b>اسم المدرسة</b>.</div>
    </div>
    <div class="step-result">يضمن ذلك عرض الكتب والمقررات الخاصة بصفك الدراسي بدقة.</div>
  </div>

  <div class="step-item">
    <div class="step-row">
      <div class="step-badge">5</div>
      <div class="step-text">اكتب <b>البريد الإلكتروني</b> واسمك الكامل في حقل <b>اسم المستخدم</b>، ثم أدخل <b>كلمة المرور</b>.</div>
    </div>
    <div class="step-result">يجب أن تكون كلمة المرور قوية لحماية محاولاتك وتقارير نتائجك.</div>
  </div>

  <div class="step-item">
    <div class="step-row">
      <div class="step-badge">6</div>
      <div class="step-text">اضغط زر <b>إنشاء حساب طالب جديد</b>.</div>
    </div>
    <div class="step-result">تظهر لك شاشة الاحتفال الزرقاء الفورية متضمنة <b>كود الطالب التعريفي الدائم</b>.</div>
  </div>

  <div class="callout-warning">
    <strong>تنبيه بالغ الأهمية:</strong> احفظ <b>كود الطالب التعريفي</b> (مثال: <code>STU-298310</code>) في مكان آمن، فهو معرفك الرقمي الثابت في المنظومة، ويمكنك استخدامه دائماً لتسجيل الدخول بدلاً من البريد الإلكتروني.
  </div>

  <div class="task-title">تأمين الحساب والحد الأقصى للأجهزة النشطة (Device Limit)</div>

  <p style="font-size: 9.6pt; color: #475569; line-height: 1.6; margin-bottom: 12px;">
    لحماية نزاهة الاختبارات ومنع تداول ومشاركة الحسابات بين الطلاب، تطبق المنصة سياسة أمان صارمة تعتمد على البصمة الرقمية للأجهزة (Device Fingerprinting):
  </p>

  <div class="step-item">
    <div class="step-row">
      <div class="step-badge">1</div>
      <div class="step-text">يسمح النظام بربط الحساب بجهازين نشطين كحد أقصى (مثل جهاز كمبيوتر وهاتف شخصي).</div>
    </div>
    <div class="step-result">يقوم النظام بتسجيل معرّف الجهاز آلياً عند تسجيل الدخول الناجح.</div>
  </div>

  <div class="step-item">
    <div class="step-row">
      <div class="step-badge">2</div>
      <div class="step-text">إذا حاولت الدخول من جهاز ثالث، تظهر رسالة: <b>عذراً، لقد تجاوزت الحد الأقصى للأجهزة المسموح بها لهذا الحساب (جهازان فقط).</b></div>
    </div>
    <div class="step-result">يتم منع تسجيل الدخول لحين إخلاء أحد الأجهزة السابقة.</div>
  </div>

  <div class="step-item">
    <div class="step-row">
      <div class="step-badge">3</div>
      <div class="step-text">لحل هذه المشكلة، سجّل الخروج من أحد أجهزتك السابقة، أو تواصل مع مسؤول المنظومة في مدرستك لإعادة ضبط وتصفير قائمة أجهزتك بنقرة واحدة.</div>
    </div>
    <div class="step-result">يتاح لك بعدها تسجيل الدخول الفوري من جهازك الجديد.</div>
  </div>

  <div class="footer">
    <span>منصة التقييم من أجل التعلم · دليل المستخدم</span>
    <span>4 / 38</span>
  </div>
</div>

<!-- ==========================================
     PAGE 5: START HERE - TERM SWITCHING & NAVIGATION
     ========================================== -->
<div class="page">
  <h2 class="chapter-title">ابدأ من هنا</h2>

  <div class="task-title">التبديل بين الفصول الدراسية (الترم 1 / الترم 2)</div>

  <div class="step-item">
    <div class="step-row">
      <div class="step-badge">1</div>
      <div class="step-text">ابحث في أعلى شاشة لوحة التحكم أو في صفحة الكتب والامتحانات عن محوّل الفصول الدراسية.</div>
    </div>
    <div class="step-result">تظهر لك أزرار التبديل الدائري بين الفصلين.</div>
  </div>

  <div class="step-item">
    <div class="step-row">
      <div class="step-badge">2</div>
      <div class="step-text">اضغط على <b>📘 الفصل الدراسي الأول (الترم 1)</b> أو <b>📙 الفصل الدراسي الثاني (الترم 2)</b>.</div>
    </div>
    <div class="step-result">يقوم النظام فوراً بفلترة الكتب وبنوك الأسئلة والامتحانات والتحليلات المتوافقة مع الترم المحدد.</div>
  </div>

  <div class="callout-note">
    <strong>ملاحظة للمستخدمين:</strong> يتم حفظ اختيارك للفصل الدراسي محلياً في متصفحك لراحتك، مع إمكانية التبديل بينهما في أي وقت دون أي قيود.
  </div>

  <div class="task-title">تغيير لغة المنصة وتسجيل الخروج</div>

  <div class="step-item">
    <div class="step-row">
      <div class="step-badge">1</div>
      <div class="step-text">في الشريط العلوي (Navbar)، اضغط على زر تحويل اللغة <b>🌐 EN / عربي</b>.</div>
    </div>
    <div class="step-result">تتحول واجهة المنصة بالكامل فوراً بين الواجهة العربية (RTL) والواجهة الإنجليزية (LTR).</div>
  </div>

  <div class="step-item">
    <div class="step-row">
      <div class="step-badge">2</div>
      <div class="step-text">للعودة إلى الصفحة الرئيسية أو لوحة التحكم، اضغط على زر <b>لوحتي</b> أو <b>الرئيسية</b>.</div>
    </div>
    <div class="step-result">ينقلك النظام بين الصفحة التسويقية العامة ومساحة عملك التشغيلية.</div>
  </div>

  <div class="step-item">
    <div class="step-row">
      <div class="step-badge">3</div>
      <div class="step-text">لإنهاء جلستك بأمان، اضغط على زر <b>تسجيل الخروج</b> (أيقونة الباب مع السهم) في أقصى يسار الشريط العلوي.</div>
    </div>
    <div class="step-result">يتم مسح رمز الدخول الآمن (Token) من جلستك والعودة إلى الشاشة الرئيسية.</div>
  </div>

  <div class="callout-warning">
    <strong>تنبيه أمني:</strong> احرص دائماً على الضغط على زر <b>تسجيل الخروج</b> عند استخدام أجهزة مشتركة أو أجهزة المعامل المدرسية لمنع وصول أي مستخدم آخر لبياناتك.
  </div>

  <div class="footer">
    <span>منصة التقييم من أجل التعلم · دليل المستخدم</span>
    <span>5 / 38</span>
  </div>
</div>

<!-- ==========================================
     PAGE 6: SHOWCASE - LOGIN & STUDENT CODE UI
     ========================================== -->
<div class="page">
  <div style="font-size: 8.5pt; font-weight: 800; color: #2563EB; margin-bottom: 4px; letter-spacing: 0.05em;">معاينة الواجهة الرسمية · الشاشات التمهيدية</div>
  <h2 style="font-size: 16pt; font-weight: 900; color: #0F172A; margin: 0 0 12px 0;">واجهة تسجيل الدخول وشاشة كود الطالب الدائم</h2>

  <div class="mockup-window">
    <div class="mockup-titlebar">
      <div class="mockup-dots"><span class="mockup-dot red"></span><span class="mockup-dot yellow"></span><span class="mockup-dot green"></span></div>
      <div class="mockup-address">https://farabi-ai.com/#auth</div>
    </div>
    <div class="mockup-content" style="display: flex; gap: 16px; background: #0F172A; padding: 20px; border-radius: 0 0 10px 10px; color: #ffffff;">
      <!-- Login Card Mockup -->
      <div style="flex: 1; background: #1E293B; border: 1px solid #334155; border-radius: 10px; padding: 16px;">
        <div style="font-size: 11pt; font-weight: 800; color: #ffffff; margin-bottom: 4px;">تسجيل الدخول للمنظومة</div>
        <div style="font-size: 8pt; color: #94A3B8; margin-bottom: 14px;">أدخل بيانات حسابك المعتمد للمتابعة</div>

        <div style="margin-bottom: 10px;">
          <div style="font-size: 7.5pt; color: #CBD5E1; margin-bottom: 3px;">البريد الإلكتروني أو اسم المستخدم أو الكود</div>
          <div style="background: #0F172A; border: 1px solid #475569; border-radius: 6px; padding: 6px 10px; font-size: 8.5pt; color: #E2E8F0;">student@farabi-edu.eg</div>
        </div>

        <div style="margin-bottom: 14px;">
          <div style="font-size: 7.5pt; color: #CBD5E1; margin-bottom: 3px;">كلمة المرور</div>
          <div style="background: #0F172A; border: 1px solid #475569; border-radius: 6px; padding: 6px 10px; font-size: 8.5pt; color: #94A3B8;">••••••••••••</div>
        </div>

        <div style="background: #2563EB; color: #ffffff; text-align: center; padding: 8px; border-radius: 6px; font-weight: 800; font-size: 9pt;">
          تسجيل الدخول
        </div>
      </div>

      <!-- Celebration Code Mockup -->
      <div style="flex: 1; background: linear-gradient(135deg, #1E3A8A 0%, #1D4ED8 100%); border-radius: 10px; padding: 18px; text-align: center; display: flex; flex-direction: column; align-items: center; justify-content: center;">
        <div style="font-size: 26pt; margin-bottom: 4px;">🎉</div>
        <div style="font-size: 12pt; font-weight: 900; color: #ffffff; margin-bottom: 4px;">تم إنشاء حسابك بنجاح!</div>
        <div style="font-size: 8pt; color: #CBD5E1; margin-bottom: 12px; line-height: 1.4;">احتفظ بكودك التعريفي الدائم لتسجيل الدخول بأمان في أي وقت</div>
        
        <div style="background: rgba(255,255,255,0.15); border: 2px solid rgba(255,255,255,0.4); border-radius: 8px; padding: 8px 16px; width: 85%;">
          <div style="font-size: 7pt; color: #BFDBFE; font-weight: 700; text-transform: uppercase;">كود الطالب التعريفي</div>
          <div style="font-size: 16pt; font-weight: 900; color: #ffffff; font-family: monospace; letter-spacing: 2px;">STU-882941</div>
        </div>

        <div style="background: #ffffff; color: #1E3A8A; font-weight: 800; font-size: 8pt; padding: 6px 14px; border-radius: 6px; margin-top: 14px;">
          المتابعة إلى لوحة التحكم
        </div>
      </div>
    </div>
  </div>

  <div style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px; margin-top: 14px;">
    <div style="background: #F8FAFC; border: 1px solid #E2E8F0; border-radius: 8px; padding: 10px;">
      <div style="font-size: 9pt; font-weight: 800; color: #1E293B; margin-bottom: 4px;">🔐 حماية وتشفير الجلسات</div>
      <div style="font-size: 8pt; color: #64748B; line-height: 1.4;">توليد رموز JWT مشفرة تضمن بقاء محاولاتك آمنة ومحمية من التعديل.</div>
    </div>
    <div style="background: #F8FAFC; border: 1px solid #E2E8F0; border-radius: 8px; padding: 10px;">
      <div style="font-size: 9pt; font-weight: 800; color: #1E293B; margin-bottom: 4px;">📱 ربط ثنائي للأجهزة</div>
      <div style="font-size: 8pt; color: #64748B; line-height: 1.4;">حد أقصى جهازان نشطان لكل حساب طالب لمنع تداول الحسابات.</div>
    </div>
    <div style="background: #F8FAFC; border: 1px solid #E2E8F0; border-radius: 8px; padding: 10px;">
      <div style="font-size: 9pt; font-weight: 800; color: #1E293B; margin-bottom: 4px;">🏛️ توافق وزاري معتمد</div>
      <div style="font-size: 8pt; color: #64748B; line-height: 1.4;">ربط كامل بالمحافظات والإدارات والمناهج الرسمية لجمهورية مصر العربية.</div>
    </div>
  </div>

  <div class="footer">
    <span>منصة التقييم من أجل التعلم · دليل المستخدم</span>
    <span>6 / 38</span>
  </div>
</div>

<!-- ==========================================
     PAGE 7: STUDENT - OVERVIEW & TASK 1 (AI EXAMS)
     ========================================== -->
<div class="page">
  <h2 class="chapter-title">الطالب</h2>
  <div class="role-desc">
    يخوض الطالب التقييمات التشخيصية الذكية والامتحانات المدرسية المحددة بوقت، ويستعرض الكتب والمناهج المعتمدة، ويتابع تقارير نواتج التعلم ومستويات بلوم والتحليلات التراكمية الحية.
  </div>

  <div class="sidebar-strip">
    <strong>قائمة هذا الدور:</strong> مسار التعلم (الرئيسية) · امتحانات متغيرة · امتحانات ثابتة · تحليلات النتائج · كتبي ومناهجي المعتمدة
  </div>

  <div class="task-title">خوض تقييم تشخيصي ذكي (امتحان متغير بالذكاء الاصطناعي)</div>

  <div class="step-item">
    <div class="step-row">
      <div class="step-badge">1</div>
      <div class="step-text">اضغط في القائمة الجانبية على <b>امتحانات متغيرة</b> (أو اضغط <b>بدء تقييم تشخيصي</b> من الصفحة الرئيسية).</div>
    </div>
    <div class="step-result">تفتح لك صفحة مولد التقييم الذكي التكيفي المعتمد على نصوص الكتب المدرسية.</div>
  </div>

  <div class="step-item">
    <div class="step-row">
      <div class="step-badge">2</div>
      <div class="step-text">اختر المادة الدراسية المطلوبة (مثل <b>العلوم</b> أو <b>اللغة العربية</b> أو <b>الرياضيات</b>).</div>
    </div>
    <div class="step-result">يعرض لك النظام الوحدات والدروس المفهرسة المتاحة في الكتاب المعتمد.</div>
  </div>

  <div class="step-item">
    <div class="step-row">
      <div class="step-badge">3</div>
      <div class="step-text">حدد الوحدة الدراسية أو الموضوع الذي ترغب في اختبار نفسك به، ثم حدد مستوى الصعوبة المطلوب.</div>
    </div>
    <div class="step-result">يتم تهيئة بنك الأسئلة الموثقة بنصوص وفقرات الكتاب الوزاري.</div>
  </div>

  <div class="step-item">
    <div class="step-row">
      <div class="step-badge">4</div>
      <div class="step-text">اضغط زر <b>بدء التقييم الذكي</b>.</div>
    </div>
    <div class="step-result">يقوم محرك الذكاء الاصطناعي بتوليد نموذج تقييم فوري فريد لك ويبدأ الاختبار مباشرة.</div>
  </div>

  <div class="callout-note">
    <strong>ملاحظة هامة حول الامتحانات المتغيرة:</strong> الامتحانات المتغيرة صُممت خصيصاً للتدريب الذاتي والتشخيص المستمر؛ لا ترتبط بمؤقت مدرسي حاسم، وتتيح لك تجربة أسئلة متنوعة لا تتكرر في كل محاولة.
  </div>

  <div class="footer">
    <span>منصة التقييم من أجل التعلم · دليل المستخدم</span>
    <span>7 / 38</span>
  </div>
</div>

<!-- ==========================================
     PAGE 8: STUDENT - TASK 2 (FIXED TIMED EXAMS)
     ========================================== -->
<div class="page">
  <h2 class="chapter-title">الطالب</h2>

  <div class="task-title">أداء امتحان مدرسي موقوت والتعامل مع المؤقت الزمني (امتحان ثابت)</div>

  <div class="step-item">
    <div class="step-row">
      <div class="step-badge">1</div>
      <div class="step-text">اضغط من القائمة الجانبية على <b>امتحانات ثابتة</b>.</div>
    </div>
    <div class="step-result">تظهر قائمة الامتحانات المدرسية المجدولة التي أعدها معلمك مع تفاصيل المادة، عدد الأسئلة، والمدة الزمنية المحددة بالدقائق.</div>
  </div>

  <div class="step-item">
    <div class="step-row">
      <div class="step-badge">2</div>
      <div class="step-text">ابحث عن الامتحان المطلوب واضغط زر <b>بدء الامتحان</b>.</div>
    </div>
    <div class="step-result">تظهر نافذة تأكيد تفاعلية تطلب منك الاستعداد والتأكد من استقرار اتصالك بالإنترنت.</div>
  </div>

  <div class="callout-warning">
    <strong>تنبيه صارم بشأن المؤقت الزمني:</strong> فور ضغطك على <b>تأكيد البدء</b>، يبدأ المؤقت الزمني في العد التنازلي على خوادم المنصة المركزية. العد التنازلي مستمر ولن يتوقف حتى لو أغلقت المتصفح أو أعدت تحميل الصفحة. توجد مهلة سماح تقنية قدرها 90 ثانية فقط لتفادي انقطاع الشبكة، وبعدها يتم إغلاق المحاولة آلياً واعتماد الإجابات المحفوظة.
  </div>

  <div class="step-item">
    <div class="step-row">
      <div class="step-badge">3</div>
      <div class="step-text">اقرأ السؤال الحالي بعناية ثم اضغط على الخيار الذي تراه صحيحاً.</div>
    </div>
    <div class="step-result">يقوم النظام بتظليل اختيارك فوراً وإرساله للخادم لحفظه تلقائياً في الخلفية.</div>
  </div>

  <div class="step-item">
    <div class="step-row">
      <div class="step-badge">4</div>
      <div class="step-text">اضغط زر <b>التالي</b> للانتقال إلى السؤال اللاحق، أو اضغط <b>السابق</b> للعودة لمراجعة سؤال سابق.</div>
    </div>
    <div class="step-result">يتحرك شريط التقدم العلوي ليوضح لك عدد الأسئلة المنجزة والمتبقية.</div>
  </div>

  <div class="callout-note">
    <strong>ملاحظة حول الحفظ التلقائي الدوري:</strong> يتم حفظ إجاباتك باستمرار وبشكل فوري؛ في حال انقطاع التيار الكهربائي أو إغلاق الجهاز، يمكنك إعادة فتح الامتحان من نفس الجهاز واستئناف الحل من حيث توقفت ضمن الوقت المتبقي.
  </div>

  <div class="footer">
    <span>منصة التقييم من أجل التعلم · دليل المستخدم</span>
    <span>8 / 38</span>
  </div>
</div>

<!-- ==========================================
     PAGE 9: STUDENT - SUBMISSION & LOCKS
     ========================================== -->
<div class="page">
  <h2 class="chapter-title">الطالب</h2>

  <div class="task-title">مراجعة الإجابات وتسليم الامتحان وقفل التعديل</div>

  <div class="step-item">
    <div class="step-row">
      <div class="step-badge">5</div>
      <div class="step-text">بعد الإجابة على جميع الأسئلة، اضغط على زر <b>مراجعة الإجابات</b> أو توجّه إلى السؤال الأخير.</div>
    </div>
    <div class="step-result">تظهر لوحة ملخص توضح الأسئلة المجاب عنها باللون الأخضر وأي أسئلة متروكة باللون الرمادي.</div>
  </div>

  <div class="step-item">
    <div class="step-row">
      <div class="step-badge">6</div>
      <div class="step-text">اضغط على أي رقم سؤال غير مجاب عنه للانتقال إليه مباشرة وحله.</div>
    </div>
    <div class="step-result">ينقلك النظام مباشرة إلى نص السؤال المطلوب لاستكمال إجابته.</div>
  </div>

  <div class="step-item">
    <div class="step-row">
      <div class="step-badge">7</div>
      <div class="step-text">عند التأكد من كافة إجاباتك، اضغط الزر الأحمر <b>تسليم الإجابات وإنهاء الامتحان</b>.</div>
    </div>
    <div class="step-result">تفتح رسالة تأكيد نهائية تطلب منك إقرار إنهاء محاولتك التقييمية.</div>
  </div>

  <div class="step-item">
    <div class="step-row">
      <div class="step-badge">8</div>
      <div class="step-text">اضغط زر <b>تأكيد التسليم النهائي</b>.</div>
    </div>
    <div class="step-result">يتم إقفال الامتحان نهائياً وإيقاف المؤقت، وتظهر شاشة النتيجة الفورية.</div>
  </div>

  <div class="callout-warning">
    <strong>تنبيه نهائي:</strong> لا يمكن التراجع أو تعديل أي إجابة بعد الضغط على <b>تأكيد التسليم النهائي</b>، حيث يتم قفل المحاولة وتسجيل التوقيت الدقيق للتسليم في قاعدة البيانات المركزية.
  </div>

  <div class="callout-note">
    <strong>ملاحظة انتهاء الوقت:</strong> إذا انتهى الوقت المحدد للامتحان وأنت داخل شاشة الحل، يقوم النظام تلقائياً وبشكل إجباري بتسليم جميع إجاباتك المحفوظة دون أي تدخل منك واحتساب درجتك المكتسبة.
  </div>

  <div class="footer">
    <span>منصة التقييم من أجل التعلم · دليل المستخدم</span>
    <span>9 / 38</span>
  </div>
</div>

<!-- ==========================================
     PAGE 10: STUDENT - TASK 3 (CURRICULUM BOOKS)
     ========================================== -->
<div class="page">
  <h2 class="chapter-title">الطالب</h2>

  <div class="task-title">تصفح واستعراض الكتب المدرسية المعتمدة والقارئ المنهجي</div>

  <div class="step-item">
    <div class="step-row">
      <div class="step-badge">1</div>
      <div class="step-text">اضغط من القائمة الجانبية على <b>كتبي ومناهجي المعتمدة</b> (أو من مسار التعلم).</div>
    </div>
    <div class="step-result">تظهر شبكة الكتب الدراسية الرسمية المعتمدة الخاصة بصفك الدراسي ونوع تعليمك (عربي أو لغات).</div>
  </div>

  <div class="step-item">
    <div class="step-row">
      <div class="step-badge">2</div>
      <div class="step-text">استخدم محول الترم في الأعلى للتبديل بين <b>الفصل الدراسي الأول</b> و<b>الفصل الدراسي الثاني</b>.</div>
    </div>
    <div class="step-result">يعرض النظام الكتب والمناهج المرفوعة حصراً لهذا الفصل الدراسي المختار.</div>
  </div>

  <div class="step-item">
    <div class="step-row">
      <div class="step-badge">3</div>
      <div class="step-text">اضغط على بطاقة الكتاب المطلوب (مثل كتاب <b>العلوم للصف الأول الإعدادي</b>).</div>
    </div>
    <div class="step-result">تفتح نافذة القارئ المنهجي المدمج وتبدأ في تحميل الكتاب المعتمد بصيغة PDF الرقمية الآمنة.</div>
  </div>

  <div class="step-item">
    <div class="step-row">
      <div class="step-badge">4</div>
      <div class="step-text">استعرض فهرس الوحدات والدروس، أو تنقل بين صفحات الكتاب باستخدام أزرار التقليب والتكبير.</div>
    </div>
    <div class="step-result">يتيح لك القارئ قراءة النصوص بدقة والاطلاع على الأشكال والجداول والأنشطة الوزارية المقررة.</div>
  </div>

  <div class="callout-note">
    <strong>ملاحظة التوثيق المنهجي:</strong> جميع أسئلة الامتحانات في المنصة مستخرجة وموثقة بنصوص هذه الكتب حصراً؛ يمكنك استخدام القارئ لمراجعة فقرات الدروس التي واجهت فيها صعوبة أثناء حل الاختبارات.
  </div>

  <div class="footer">
    <span>منصة التقييم من أجل التعلم · دليل المستخدم</span>
    <span>10 / 38</span>
  </div>
</div>

<!-- ==========================================
     PAGE 11: STUDENT - TASK 4 (RESULTS & EXPLANATIONS)
     ========================================== -->
<div class="page">
  <h2 class="chapter-title">الطالب</h2>

  <div class="task-title">عرض النتائج وتفسيرات الإجابات والربط بنصوص الكتاب</div>

  <div class="step-item">
    <div class="step-row">
      <div class="step-badge">1</div>
      <div class="step-text">فور تسليم الامتحان أو من خلال <b>سجل الامتحانات</b>، اضغط على <b>عرض تفاصيل النتيجة</b>.</div>
    </div>
    <div class="step-result">تفتح لك بطاقة الإنجاز الكاملة متضمنة درجتك الإجمالية والنسبة المئوية والوقت المستغرق.</div>
  </div>

  <div class="step-item">
    <div class="step-row">
      <div class="step-badge">2</div>
      <div class="step-text">استعرض قائمة أسئلة الاختبار سؤالاً بسؤال.</div>
    </div>
    <div class="step-result">تظهر إجابتك المحددة؛ إذا كانت صحيحة تظهر باللون الأخضر، وإذا كانت خاطئة تظهر باللون الأحمر بجانب الإجابة الصحيحة المعتمدة.</div>
  </div>

  <div class="step-item">
    <div class="step-row">
      <div class="step-badge">3</div>
      <div class="step-text">اقرأ مربع <b>التفسير والتعليل المنهجي</b> أسفل كل سؤال.</div>
    </div>
    <div class="step-result">يوضح لك النظام سبب صحة الإجابة مستشهداً بالقاعدة أو المفهوم العلمي الدقيق من نصوص الكتاب الوزاري.</div>
  </div>

  <div class="step-item">
    <div class="step-row">
      <div class="step-badge">4</div>
      <div class="step-text">اضغط على زر <b>تحميل تقرير النتيجة (PDF)</b> إذا أردت الاحتفاظ بنسخة مطبوعة من شهادة تقييمك.</div>
    </div>
    <div class="step-result">يتم تحميل وثيقة تقرير رسمي يحمل اسمك ودرجتك وتوقيع المنصة الرقمي.</div>
  </div>

  <div class="callout-note">
    <strong>ملاحظة التغذية الراجعة التكيفية:</strong> التقييم في المنظومة ليس مجرد رصد للدرجات، بل هو أداة للتعلم الفعّال؛ استعراض التفسيرات يصحح المفاهيم الخاطئة ويبني فهماً تراكمياً متيناً.
  </div>

  <div class="footer">
    <span>منصة التقييم من أجل التعلم · دليل المستخدم</span>
    <span>11 / 38</span>
  </div>
</div>

<!-- ==========================================
     PAGE 12: STUDENT - TASK 5 (CUMULATIVE ANALYTICS)
     ========================================== -->
<div class="page">
  <h2 class="chapter-title">الطالب</h2>

  <div class="task-title">متابعة التحليلات التراكمية الحية ومستويات بلوم ونواتج التعلم</div>

  <div class="step-item">
    <div class="step-row">
      <div class="step-badge">1</div>
      <div class="step-text">اضغط من القائمة الجانبية على <b>تحليلات النتائج</b>.</div>
    </div>
    <div class="step-result">تفتح لك لوحة التحليلات الحية المرتبطة مباشرة بقاعدة البيانات المركزية.</div>
  </div>

  <div class="step-item">
    <div class="step-row">
      <div class="step-badge">2</div>
      <div class="step-text">راجع مؤشرات الأداء الأربعة في الأعلى: <b>المعدل التراكمي العام</b>، <b>إجمالي الاختبارات المكتملة</b>، <b>معدل الدقة ونسبة النجاح</b>، و<b>مستوى الاستيعاب المنهجي</b>.</div>
    </div>
    <div class="step-result">أرقام حية وديناميكية تتغير تلقائياً مع كل امتحان تجتازه وتعكس مستواك الفعلي.</div>
  </div>

  <div class="step-item">
    <div class="step-row">
      <div class="step-badge">3</div>
      <div class="step-text">استعرض قسم <b>توزيع مهارات التفكير (مستويات بلوم المعرفية)</b>.</div>
    </div>
    <div class="step-result">يوضح لك نسب إتقانك في مهارات: التذكر والاسترجاع، الفهم والاستيعاب، التطبيق العملي، والتحليل وحل المشكلات.</div>
  </div>

  <div class="step-item">
    <div class="step-row">
      <div class="step-badge">4</div>
      <div class="step-text">استعرض جدول <b>معدل إتقان الوحدات والموضوعات الدراسية</b>.</div>
    </div>
    <div class="step-result">يبرز لك النظام الوحدات ذات الإتقان المرتفع (باللون الأخضر) والموضوعات التي تحتاج إلى تعزيز ومراجعة إضافية.</div>
  </div>

  <div class="callout-note">
    <strong>ملاحظة تكامل البيانات:</strong> جميع أرقام التحليلات التراكمية في صفحتك متطابقة تماماً مع ما يظهر لمعلمك وموجهك في لوحات المتابعة الإشرافية دون أي تباين.
  </div>

  <div class="footer">
    <span>منصة التقييم من أجل التعلم · دليل المستخدم</span>
    <span>12 / 38</span>
  </div>
</div>

<!-- ==========================================
     PAGE 13: SHOWCASE - STUDENT DASHBOARD & EXAM UI
     ========================================== -->
<div class="page">
  <div style="font-size: 8.5pt; font-weight: 800; color: #2563EB; margin-bottom: 4px; letter-spacing: 0.05em;">معاينة الواجهة الرسمية · تجربة الطالب</div>
  <h2 style="font-size: 16pt; font-weight: 900; color: #0F172A; margin: 0 0 12px 0;">لوحة تحكم الطالب وشاشة الامتحان الموقوت</h2>

  <div class="mockup-window">
    <div class="mockup-titlebar">
      <div class="mockup-dots"><span class="mockup-dot red"></span><span class="mockup-dot yellow"></span><span class="mockup-dot green"></span></div>
      <div class="mockup-address">https://farabi-ai.com/?tab=exams#active-exam</div>
    </div>
    <div class="mockup-content" style="background: #F8FAFC; padding: 16px;">
      <!-- Impersonation or Exam Active Header -->
      <div style="background: #ffffff; border: 1px solid #E2E8F0; border-radius: 8px; padding: 12px 16px; margin-bottom: 12px; display: flex; justify-content: space-between; align-items: center;">
        <div>
          <div style="font-size: 11pt; font-weight: 900; color: #0F172A;">اختبار منتصف الفصل - العلوم المتكاملة</div>
          <div style="font-size: 8pt; color: #64748B;">الصف الأول الإعدادي · الفصل الدراسي الأول</div>
        </div>
        <div style="display: flex; align-items: center; gap: 8px;">
          <div style="background: #FEF2F2; border: 1px solid #FECACA; color: #DC2626; padding: 4px 12px; border-radius: 999px; font-weight: 800; font-size: 9.5pt; font-family: monospace;">
            ⏱️ الوقت المتبقي: 42:18
          </div>
          <div class="ui-badge ui-badge-success">حفظ تلقائي نشط ✓</div>
        </div>
      </div>

      <!-- Question Box -->
      <div style="background: #ffffff; border: 1px solid #E2E8F0; border-radius: 8px; padding: 16px; margin-bottom: 12px;">
        <div style="display: flex; justify-content: space-between; margin-bottom: 10px;">
          <span style="font-size: 8.5pt; font-weight: 800; color: #2563EB;">السؤال رقم 4 من 15</span>
          <span class="ui-badge ui-badge-primary">مستوى بلوم: فهم وتطبيق</span>
        </div>
        <div style="font-size: 10pt; font-weight: 800; color: #1E293B; line-height: 1.5; margin-bottom: 14px;">
          أي التغيرات التالية يُعد تغيراً كيميائياً مصحوباً بتكوين مادة جديدة ذات خواص مختلفة كلياً؟
        </div>

        <div style="display: flex; flex-direction: column; gap: 8px;">
          <div style="border: 1px solid #E2E8F0; border-radius: 6px; padding: 8px 12px; font-size: 8.5pt; color: #475569;">
            أ) ذوبان ملح الطعام في كمية وفيرة من الماء المقطر.
          </div>
          <div style="border: 2px solid #2563EB; background: #EFF6FF; border-radius: 6px; padding: 8px 12px; font-size: 8.5pt; color: #1E3A8A; font-weight: 700;">
            ب) احتراق شريط الماغنسيوم في الهواء وتكون مسحوق أكسيد الماغنسيوم. (إجابتك المختارة)
          </div>
          <div style="border: 1px solid #E2E8F0; border-radius: 6px; padding: 8px 12px; font-size: 8.5pt; color: #475569;">
            ج) انصهار قطعة من الجليد عند تركها في درجة حرارة الغرفة.
          </div>
          <div style="border: 1px solid #E2E8F0; border-radius: 6px; padding: 8px 12px; font-size: 8.5pt; color: #475569;">
            د) تبخر قطرات الكحول الإيثيلي عند تعرضها للهواء الجوي.
          </div>
        </div>
      </div>

      <!-- Action Footer -->
      <div style="display: flex; justify-content: space-between; align-items: center;">
        <div style="display: flex; gap: 6px;">
          <span style="background: #E2E8F0; color: #475569; padding: 4px 10px; border-radius: 4px; font-size: 8pt; font-weight: 700;">السابق</span>
          <span style="background: #2563EB; color: #ffffff; padding: 4px 14px; border-radius: 4px; font-size: 8pt; font-weight: 700;">التالي</span>
        </div>
        <span style="background: #DC2626; color: #ffffff; padding: 5px 14px; border-radius: 4px; font-size: 8pt; font-weight: 800;">
          تسليم الإجابات وإنهاء الامتحان
        </span>
      </div>
    </div>
  </div>

  <div class="metrics-grid">
    <div class="metric-card">
      <div class="metric-value">92%</div>
      <div class="metric-label">المعدل التراكمي العام</div>
    </div>
    <div class="metric-card">
      <div class="metric-value">14</div>
      <div class="metric-label">امتحانات مكتملة</div>
    </div>
    <div class="metric-card">
      <div class="metric-value">88%</div>
      <div class="metric-label">مستوى استيعاب المفاهيم</div>
    </div>
    <div class="metric-card">
      <div class="metric-value">95%</div>
      <div class="metric-label">الالتزام بالمؤقت الوزاري</div>
    </div>
  </div>

  <div class="footer">
    <span>منصة التقييم من أجل التعلم · دليل المستخدم</span>
    <span>13 / 38</span>
  </div>
</div>

<!-- ==========================================
     PAGE 14: TEACHER - OVERVIEW & TASK 1 (EXCEL IMPORT)
     ========================================== -->
<div class="page">
  <h2 class="chapter-title">المعلم</h2>
  <div class="role-desc">
    يبني ويصمم المعلم الامتحانات المدرسية، ويستورد نماذج Excel المرجعية المعتمدة، ويولد أسئلة الذكاء الاصطناعي الموثقة بالكتب، ويتابع أداء الطلاب ومعدلات إتقان الوحدات.
  </div>

  <div class="sidebar-strip">
    <strong>قائمة هذا الدور:</strong> نظرة عامة والنشاط · المناهج والكتب · بنك الامتحانات · مصمم الامتحانات · أداء الطلاب
  </div>

  <div class="task-title">استيراد نماذج الامتحانات المدرسية من ملف Excel مرجعي (Excel Import)</div>

  <div class="step-item">
    <div class="step-row">
      <div class="step-badge">1</div>
      <div class="step-text">اضغط من القائمة الجانبية على <b>مصمم الامتحانات</b>، ثم اختر تبويب <b>استيراد نماذج Excel المرجعية</b>.</div>
    </div>
    <div class="step-result">تفتح لك واجهة استيراد نماذج الاختبارات الخارجية المعدة عبر جداول البيانات.</div>
  </div>

  <div class="step-item">
    <div class="step-row">
      <div class="step-badge">2</div>
      <div class="step-text">اضغط على زر <b>تحميل قالب Excel المعتمد (.xlsx)</b>.</div>
    </div>
    <div class="step-result">يقوم متصفحك بتحميل ملف القالب الرسمي المتضمن الأعمدة الإلزامية وهيكل الأسئلة المعتمد.</div>
  </div>

  <div class="callout-note">
    <strong>ملاحظة هيكل ملف Excel:</strong> يحتوي القالب على أعمدة: نص السؤال، الخيارات الأربعة (أ، ب، ج، د)، رقم الخيار الصحيح (1-4)، التفسير المنهجي، مستوى بلوم المعرفي، ورمز ناتج التعلم.
  </div>

  <div class="step-item">
    <div class="step-row">
      <div class="step-badge">3</div>
      <div class="step-text">قم بتعبئة أسئلتك داخل ملف القالب ثم احفظه، واضغط على منطقة <b>اختيار ملف Excel أو سحبه وإفلاته هنا</b>.</div>
    </div>
    <div class="step-result">يتعرف النظام على الملف المرفوع ويعرض اسمه وحجمه ويجهز محرك التدقيق.</div>
  </div>

  <div class="step-item">
    <div class="step-row">
      <div class="step-badge">4</div>
      <div class="step-text">اضغط زر <b>معاينة الملف والتحقق من صحته</b>.</div>
    </div>
    <div class="step-result">يقوم الخادم بفحص هيكل الملف والتأكد من خلوه من الأخطاء دون إجراء أي تعديل على قاعدة البيانات.</div>
  </div>

  <div class="footer">
    <span>منصة التقييم من أجل التعلم · دليل المستخدم</span>
    <span>14 / 38</span>
  </div>
</div>

<!-- ==========================================
     PAGE 15: TEACHER - TASK 1 (CONFIRMATION & TIMING)
     ========================================== -->
<div class="page">
  <h2 class="chapter-title">المعلم</h2>

  <div class="task-title">مراجعة المعاينة وتحديد مدة الامتحان وتأكيد الحفظ النهائي</div>

  <div class="step-item">
    <div class="step-row">
      <div class="step-badge">5</div>
      <div class="step-text">راجع جدول المعاينة التفاعلي الذي يوضح جميع الأسئلة وخياراتها، والتأكد من ظهور علامة <b>صالح وجاهز للاستيراد ✓</b> باللون الأخضر.</div>
    </div>
    <div class="step-result">إذا وُجد أي سطر غير مطابق، يُبرز النظام رقم السطر ونوع الخطأ بدقة لتصحيحه.</div>
  </div>

  <div class="step-item">
    <div class="step-row">
      <div class="step-badge">6</div>
      <div class="step-text">اكتب <b>عنوان الامتحان</b> وحدد <b>المادة الدراسية</b> والصف المستهدف.</div>
    </div>
    <div class="step-result">يتم تصنيف الامتحان ضمن بنك الاختبارات المرجعية لهذا الصف والمادة.</div>
  </div>

  <div class="step-item">
    <div class="step-row">
      <div class="step-badge">7</div>
      <div class="step-text">اكتب في حقل <b>مدة الاختبار (بالدقائق)</b> الزمن المخصص للامتحان (مثال: <code>45</code> دقيقة).</div>
    </div>
    <div class="step-result">يتم حفظ هذه المدة الزمنية بشكل دائم وموثوق في قاعدة البيانات، وتلزم الخادم بفرضها على الطلاب.</div>
  </div>

  <div class="step-item">
    <div class="step-row">
      <div class="step-badge">8</div>
      <div class="step-text">اضغط زر <b>تأكيد الاستيراد وحفظ الامتحان المرجعي</b>.</div>
    </div>
    <div class="step-result">يتم حفظ الامتحان في قاعدة البيانات كاختبار مرجعي ثابت ومتاح للنشر فوراً.</div>
  </div>

  <div class="callout-warning">
    <strong>تنبيه فحص المعاينة:</strong> تضمن خطوة <b>معاينة الملف والتحقق من صحته</b> عدم حفظ أي بيانات تالفة أو ناقصة في قاعدة البيانات؛ احرص دائماً على مراجعة عدد الأسئلة المقروءة ومطابقتها لملفك قبل الضغط على الحفظ النهائي.
  </div>

  <div class="callout-note">
    <strong>ملاحظة إعادة الاستخدام:</strong> الامتحانات المرجعية المستوردة من إكسل تظل محفوظة في بنكك الدائم، ويمكنك إعادة نشرها لعدة فصول في أوقات مختلفة دون الحاجة لإعادة رفع الملف.
  </div>

  <div class="footer">
    <span>منصة التقييم من أجل التعلم · دليل المستخدم</span>
    <span>15 / 38</span>
  </div>
</div>

<!-- ==========================================
     PAGE 16: TEACHER - TASK 2 (AI EXAM GENERATOR)
     ========================================== -->
<div class="page">
  <h2 class="chapter-title">المعلم</h2>

  <div class="task-title">توليد اختبار ذكي بالذكاء الاصطناعي مستند لفقرات الكتاب المدرسي</div>

  <div class="step-item">
    <div class="step-row">
      <div class="step-badge">1</div>
      <div class="step-text">في صفحة <b>مصمم الامتحانات</b>، اضغط على تبويب <b>توليد أسئلة بالذكاء الاصطناعي</b>.</div>
    </div>
    <div class="step-result">تظهر لك لوحة اختيار الكتاب المدرسي ونطاق التوليد التكيفي.</div>
  </div>

  <div class="step-item">
    <div class="step-row">
      <div class="step-badge">2</div>
      <div class="step-text">اختر <b>الكتاب المدرسي المعتمد</b> من القائمة المنسدلة (تقتصر القائمة على الكتب المفهرسة رسمياً).</div>
    </div>
    <div class="step-result">يقوم النظام باستدعاء فهرس الوحدات والدروس المتاحة لهذا المنهج.</div>
  </div>

  <div class="step-item">
    <div class="step-row">
      <div class="step-badge">3</div>
      <div class="step-text">حدد <b>الوحدات والدروس المطلوبة</b> بوضع علامة الصح بجانب الموضوعات المراد قياسها.</div>
    </div>
    <div class="step-result">يحدد هذا النطاق فقرات ونصوص الكتاب التي سيعتمد عليها الذكاء الاصطناعي في صياغة الأسئلة.</div>
  </div>

  <div class="step-item">
    <div class="step-row">
      <div class="step-badge">4</div>
      <div class="step-text">حدد <b>عدد الأسئلة</b> (مثال: 10 أو 15 أو 20 سؤالاً) ونسب توزيع <b>مستويات بلوم</b> (تذكر، فهم، تطبيق، تحليل).</div>
    </div>
    <div class="step-result">يضمن ذلك بناء جدول مواصفات متوازن للاختبار يراعي الفروق الفردية.</div>
  </div>

  <div class="step-item">
    <div class="step-row">
      <div class="step-badge">5</div>
      <div class="step-text">اضغط زر <b>توليد الأسئلة الآن</b>.</div>
    </div>
    <div class="step-result">يقوم محرك الذكاء الاصطناعي بصياغة الأسئلة وتزويد كل سؤال بتفسيره المنهجي وناتج التعلم المرتبط بفقرة الكتاب.</div>
  </div>

  <div class="callout-note">
    <strong>ملاحظة التوثيق والجاهزية:</strong> تخضع جميع الأسئلة المولدة لفلتر التحقق المنهجي المعتمد؛ لا يمكن توليد أي سؤال خارج حدود المقرر الدراسي المرفوع والمفهرس.
  </div>

  <div class="footer">
    <span>منصة التقييم من أجل التعلم · دليل المستخدم</span>
    <span>16 / 38</span>
  </div>
</div>

<!-- ==========================================
     PAGE 17: TEACHER - TASK 3 (PUBLISHING & CONTROLS)
     ========================================== -->
<div class="page">
  <h2 class="chapter-title">المعلم</h2>

  <div class="task-title">نشر الامتحان وتحديد مدته وصلاحيات وصول الطلاب</div>

  <div class="step-item">
    <div class="step-row">
      <div class="step-badge">1</div>
      <div class="step-text">بعد توليد الأسئلة أو مراجعة الامتحان، اضغط على زر <b>مراجعة ونشر الامتحان</b>.</div>
    </div>
    <div class="step-result">تفتح لك شاشة إعدادات النشر وتحديد معايير الجلسة الاختبارية.</div>
  </div>

  <div class="step-item">
    <div class="step-row">
      <div class="step-badge">2</div>
      <div class="step-text">حدد <b>مدة الامتحان بالدقائق</b> (مثال: <code>30</code> دقيقة أو <code>60</code> دقيقة).</div>
    </div>
    <div class="step-result">سيتم إلزام الطالب بهذه المدة مع تفعيل المؤقت التنازلي التلقائي.</div>
  </div>

  <div class="step-item">
    <div class="step-row">
      <div class="step-badge">3</div>
      <div class="step-text">اختر <b>الفصول والصفوف المستهدفة</b> المسموح لطلابها بالدخول للاختبار.</div>
    </div>
    <div class="step-result">يظهر الامتحان فقط في لوحة تحكم طلاب الفصول المحددة ضمن تبويب <b>امتحانات ثابتة</b>.</div>
  </div>

  <div class="step-item">
    <div class="step-row">
      <div class="step-badge">4</div>
      <div class="step-text">اختر حالة النشر بالضغط على <b>نشر الامتحان الآن (نشط)</b> أو <b>حفظ كمسودة للإطلاق لاحقاً</b>.</div>
    </div>
    <div class="step-result">إذا اخترت النشر، يصبح متاحاً للطلاب فوراً؛ وإذا اخترت مسودة، يظل محفوظاً في بنكك الشخصي.</div>
  </div>

  <div class="callout-warning">
    <strong>تنبيه قفل الأسئلة بعد النشر:</strong> فور بدء أي طالب في حل الامتحان المنشور، يتم قفل أسئلة الاختبار آلياً لمنع أي تعديل عليها لضمان تكافؤ الفرص وعدالة النتائج.
  </div>

  <div class="footer">
    <span>منصة التقييم من أجل التعلم · دليل المستخدم</span>
    <span>17 / 38</span>
  </div>
</div>

<!-- ==========================================
     PAGE 18: TEACHER - TASK 4 (EXAM BANK MANAGEMENT)
     ========================================== -->
<div class="page">
  <h2 class="chapter-title">المعلم</h2>

  <div class="task-title">إدارة بنك الامتحانات ومتابعة حالة الاختبارات المنشورة</div>

  <div class="step-item">
    <div class="step-row">
      <div class="step-badge">1</div>
      <div class="step-text">اضغط من القائمة الجانبية على <b>بنك الامتحانات</b>.</div>
    </div>
    <div class="step-result">تظهر لك جميع الاختبارات التي أنشأتها مصنفة حسب المادة، الصف، ونوع الامتحان (مرجعي / ذكاء اصطناعي).</div>
  </div>

  <div class="step-item">
    <div class="step-row">
      <div class="step-badge">2</div>
      <div class="step-text">استخدم أدوات التصفية في الأعلى: <b>تصفية حسب الصف الدراسي</b>، أو <b>تصفية حسب الحالة (منشور / مسودة)</b>.</div>
    </div>
    <div class="step-result">يقوم النظام بتحديث القائمة فورياً لعرض الامتحانات المطلوبة فقط.</div>
  </div>

  <div class="step-item">
    <div class="step-row">
      <div class="step-badge">3</div>
      <div class="step-text">بجانب أي امتحان، اضغط على زر <b>معاينة الأسئلة</b> للاطلاع على نص الأسئلة وتوزيع الدرجات.</div>
    </div>
    <div class="step-result">تفتح نافذة منبثقة تستعرض تفاصيل ورقة الامتحان ومستويات بلوم المرتبطة بكل سؤال.</div>
  </div>

  <div class="step-item">
    <div class="step-row">
      <div class="step-badge">4</div>
      <div class="step-text">لإيقاف امتحان نشط، اضغط على <b>إلغاء تنشيط / أرشفة</b>؛ ولإعادة فتح مسودة اضغط <b>نشر</b>.</div>
    </div>
    <div class="step-result">يتم تحديث حالة الامتحان في الوقت الفعلي في حسابات الطلاب.</div>
  </div>

  <div class="callout-note">
    <strong>ملاحظة التصدير والطباعة:</strong> يتيح لك بنك الامتحانات خيار <b>تصدير ورقة الامتحان كملف PDF مطبوع</b> يتضمن نموذج الأسئلة ونموذج الإجابة المستقل للمعلم.
  </div>

  <div class="footer">
    <span>منصة التقييم من أجل التعلم · دليل المستخدم</span>
    <span>18 / 38</span>
  </div>
</div>

<!-- ==========================================
     PAGE 19: TEACHER - TASK 5 (CLASS ANALYTICS)
     ========================================== -->
<div class="page">
  <h2 class="chapter-title">المعلم</h2>

  <div class="task-title">تحليل أداء الطلاب والفصول ونسب إتقان الوحدات ونواتج التعلم</div>

  <div class="step-item">
    <div class="step-row">
      <div class="step-badge">1</div>
      <div class="step-text">اضغط من القائمة الجانبية على <b>أداء الطلاب</b> (أو من تبويب التحليلات).</div>
    </div>
    <div class="step-result">تفتح لوحة مؤشرات الأداء الجماعي للفصول المسندة إليك.</div>
  </div>

  <div class="step-item">
    <div class="step-row">
      <div class="step-badge">2</div>
      <div class="step-text">اختر الفصل الدراسي المطلوب (مثل <b>فصل 1/1 إعدادي</b>) والمادة الدراسية.</div>
    </div>
    <div class="step-result">يعرض النظام إحصائيات الفصل: متوسط الدرجات، نسبة الحضور والتسليم، وتوزيع التقديرات.</div>
  </div>

  <div class="step-item">
    <div class="step-row">
      <div class="step-badge">3</div>
      <div class="step-text">استعرض جدول <b>مصفوفة نواتج التعلم والوحدات</b>.</div>
    </div>
    <div class="step-result">يحدد لك النظام بدقة أي الدروس أتقنها الطلاب بنجاح وأي المفاهيم واجهت فيها أغلبية الفصل صعوبة.</div>
  </div>

  <div class="step-item">
    <div class="step-row">
      <div class="step-badge">4</div>
      <div class="step-text">اضغط على اسم أي طالب للانتقال إلى <b>الملف التراكمي الفردي للطالب</b>.</div>
    </div>
    <div class="step-result">تظهر لك محاولات الطالب وتطوره الزمني عبر الامتحانات المتتالية.</div>
  </div>

  <div class="step-item">
    <div class="step-row">
      <div class="step-badge">5</div>
      <div class="step-text">اضغط زر <b>توليد خطة دعم علاجي</b> للمفاهيم ذات الإتقان الضعيف.</div>
    </div>
    <div class="step-result">يقترح النظام تمارين وتدريبات تشخيصية مخصصة للطلاب الذين يحتاجون إلى مساندة في نواتج تعلم معينة.</div>
  </div>

  <div class="footer">
    <span>منصة التقييم من أجل التعلم · دليل المستخدم</span>
    <span>19 / 38</span>
  </div>
</div>

<!-- ==========================================
     PAGE 20: SHOWCASE - TEACHER DASHBOARD UI
     ========================================== -->
<div class="page">
  <div style="font-size: 8.5pt; font-weight: 800; color: #2563EB; margin-bottom: 4px; letter-spacing: 0.05em;">معاينة الواجهة الرسمية · لوحة المعلم</div>
  <h2 style="font-size: 16pt; font-weight: 900; color: #0F172A; margin: 0 0 12px 0;">مصمم الامتحانات وواجهة استيراد نماذج Excel المرجعية</h2>

  <div class="mockup-window">
    <div class="mockup-titlebar">
      <div class="mockup-dots"><span class="mockup-dot red"></span><span class="mockup-dot yellow"></span><span class="mockup-dot green"></span></div>
      <div class="mockup-address">https://farabi-ai.com/?view=dashboard#teacher-builder</div>
    </div>
    <div class="mockup-content" style="background: #ffffff; padding: 16px;">
      <!-- Navigation tabs -->
      <div style="display: flex; gap: 8px; border-bottom: 2px solid #E2E8F0; padding-bottom: 8px; margin-bottom: 14px;">
        <span style="font-size: 8.5pt; font-weight: 800; color: #2563EB; border-bottom: 2px solid #2563EB; padding-bottom: 8px;">📊 استيراد نماذج Excel المرجعية</span>
        <span style="font-size: 8.5pt; font-weight: 700; color: #64748B;">🤖 توليد بالذكاء الاصطناعي</span>
        <span style="font-size: 8.5pt; font-weight: 700; color: #64748B;">✏️ إضافة أسئلة يدوية</span>
      </div>

      <!-- Excel Dropzone Box -->
      <div style="border: 2px dashed #93C5FD; background: #EFF6FF; border-radius: 8px; padding: 18px; text-align: center; margin-bottom: 14px;">
        <div style="font-size: 20pt; color: #2563EB; margin-bottom: 4px;">📁</div>
        <div style="font-size: 9.5pt; font-weight: 800; color: #1E3A8A; margin-bottom: 4px;">اسحب وأفلت ملف Excel (.xlsx) هنا، أو اضغط للاختيار</div>
        <div style="font-size: 8pt; color: #3B82F6; margin-bottom: 10px;">يتعرف النظام على الأسئلة والخيارات ومستويات بلوم تلقائياً</div>
        <div style="display: inline-flex; gap: 8px;">
          <span style="background: #ffffff; border: 1px solid #BFDBFE; color: #1D4ED8; font-weight: 800; font-size: 8pt; padding: 4px 10px; border-radius: 4px;">
            📥 تحميل قالب Excel المعتمد
          </span>
          <span style="background: #2563EB; color: #ffffff; font-weight: 800; font-size: 8pt; padding: 4px 12px; border-radius: 4px;">
            🔍 معاينة الملف والتحقق من صحته
          </span>
        </div>
      </div>

      <!-- Preview Table Snippet -->
      <div style="border: 1px solid #E2E8F0; border-radius: 6px; overflow: hidden; margin-bottom: 12px;">
        <div style="background: #F1F5F9; padding: 6px 10px; font-size: 8pt; font-weight: 800; color: #334155; display: flex; justify-content: space-between;">
          <span>معاينة الأسئلة المستوردة (15 سؤالاً تم قراءتها بنجاح)</span>
          <span style="color: #16A34A;">الحالة: جاهز للحفظ المرجعي ✓</span>
        </div>
        <div style="padding: 8px 10px; font-size: 8pt; border-bottom: 1px solid #F1F5F9; display: flex; justify-content: space-between;">
          <span>س1: ما الناتج الفعلي لعملية البناء الضوئي في النباتات الخضراء؟</span>
          <span class="ui-badge ui-badge-primary">فهم (بلوم 2)</span>
        </div>
        <div style="padding: 8px 10px; font-size: 8pt; display: flex; justify-content: space-between;">
          <span>س2: احسب كثافة جسم كتلته 60 جم وحجمه 30 سم³ في الظروف القياسية.</span>
          <span class="ui-badge ui-badge-purple">تطبيق (بلوم 3)</span>
        </div>
      </div>

      <!-- Duration & Submit -->
      <div style="display: flex; justify-content: space-between; align-items: center; background: #F8FAFC; padding: 8px 12px; border-radius: 6px;">
        <div style="display: flex; align-items: center; gap: 8px;">
          <span style="font-size: 8pt; font-weight: 800; color: #1E293B;">مدة الامتحان:</span>
          <span style="background: #ffffff; border: 1px solid #CBD5E1; padding: 2px 8px; border-radius: 4px; font-size: 8pt; font-weight: 700; font-family: monospace;">45 دقيقة</span>
        </div>
        <span style="background: #16A34A; color: #ffffff; font-weight: 800; font-size: 8.5pt; padding: 5px 14px; border-radius: 6px;">
          تأكيد الاستيراد وحفظ الامتحان المرجعي ✓
        </span>
      </div>
    </div>
  </div>

  <div class="metrics-grid">
    <div class="metric-card">
      <div class="metric-value">28</div>
      <div class="metric-label">امتحان في البنك المعتمد</div>
    </div>
    <div class="metric-card">
      <div class="metric-value">340</div>
      <div class="metric-label">سؤال موثق بالكتب الوزارية</div>
    </div>
    <div class="metric-card">
      <div class="metric-value">4</div>
      <div class="metric-label">فصول نشطة مسندة</div>
    </div>
    <div class="metric-card">
      <div class="metric-value">91%</div>
      <div class="metric-label">متوسط إتقان الفصول</div>
    </div>
  </div>

  <div class="footer">
    <span>منصة التقييم من أجل التعلم · دليل المستخدم</span>
    <span>20 / 38</span>
  </div>
</div>

<!-- ==========================================
     PAGE 21: SUPERVISOR - OVERVIEW & TASK 1
     ========================================== -->
<div class="page">
  <h2 class="chapter-title">المشرف وموجه المادة</h2>
  <div class="role-desc">
    يتابع الموجه تقارير نواتج التعلم ومستويات التفكير، ويدقق جودة بنوك الأسئلة ومطابقتها للمناهج الوزارية على مستوى المدارس والإدارات التعليمية.
  </div>

  <div class="sidebar-strip">
    <strong>قائمة هذا الدور:</strong> لوحة الموجه · التحليلات والمتابعة الإشرافية · مستكشف الاختبارات التفاعلي · تقارير نواتج التعلم
  </div>

  <div class="task-title">متابعة نواتج التعلم ومستويات بلوم لمادته التخصصية</div>

  <div class="step-item">
    <div class="step-row">
      <div class="step-badge">1</div>
      <div class="step-text">سجّل الدخول بحساب الموجه؛ تفتح لك <b>لوحة الموجه التخصصية</b> الخاصة بمادتك ونطاقك الجغرافي.</div>
    </div>
    <div class="step-result">تظهر لك في الشريط العلوي شارة الموجه واسم المادة (مثل <b>الموجه (العلوم)</b>).</div>
  </div>

  <div class="step-item">
    <div class="step-row">
      <div class="step-badge">2</div>
      <div class="step-text">اضغط على تبويب <b>التحليلات والمتابعة الإشرافية</b>.</div>
    </div>
    <div class="step-result">تظهر لك بطاقات المؤشرات الإجمالية ومخططات نواتج التعلم المجمعة لجميع مدارس إدارتك.</div>
  </div>

  <div class="step-item">
    <div class="step-row">
      <div class="step-badge">3</div>
      <div class="step-text">افحص مخطط <b>هرم مستويات بلوم المعرفية</b>.</div>
    </div>
    <div class="step-result">يعرض المخطط توازن الأسئلة المحلولة بين مستويات: التذكر، الفهم، التطبيق، والتحليل.</div>
  </div>

  <div class="step-item">
    <div class="step-row">
      <div class="step-badge">4</div>
      <div class="step-text">اضغط على أي ناتج تعلم في قائمة <b>مؤشرات نواتج التعلم الوزارية</b>.</div>
    </div>
    <div class="step-result">يعرض لك النظام نسبة إتقان الطلاب لهذا الناتج على مستوى المدارس والفصول التابعة لتوجيهك.</div>
  </div>

  <div class="callout-note">
    <strong>ملاحظة التوجيه الفني:</strong> تتيح هذه البيانات للموجه الفني تحديد الفجوات التعليمية المشتركة بين المدارس وتوجيه المعلمين في الاجتماعات الدورية للتركيز على المفاهيم الأكثر احتياجاً للدعم.
  </div>

  <div class="footer">
    <span>منصة التقييم من أجل التعلم · دليل المستخدم</span>
    <span>21 / 38</span>
  </div>
</div>

<!-- ==========================================
     PAGE 22: SUPERVISOR - TASK 2 (EXAMS AUDIT)
     ========================================== -->
<div class="page">
  <h2 class="chapter-title">المشرف وموجه المادة</h2>

  <div class="task-title">تدقيق الامتحانات المدرسية وبنوك الأسئلة المعتمدة</div>

  <div class="step-item">
    <div class="step-row">
      <div class="step-badge">1</div>
      <div class="step-text">اضغط من القائمة العلوية على <b>مستكشف الاختبارات التفاعلي</b>.</div>
    </div>
    <div class="step-result">تظهر قائمة بجميع الامتحانات المنشورة والمسودات التي أعدها المعلمون في المدارس التابعة لك.</div>
  </div>

  <div class="step-item">
    <div class="step-row">
      <div class="step-badge">2</div>
      <div class="step-text">استخدم مرشحات التصفية لاختيار <b>المدرسة</b>، <b>اسم المعلم</b>، أو <b>الصف الدراسي</b>.</div>
    </div>
    <div class="step-result">يقوم النظام بفلترة الاختبارات المرتبطة بنطاق البحث المختار فوراً.</div>
  </div>

  <div class="step-item">
    <div class="step-row">
      <div class="step-badge">3</div>
      <div class="step-text">اضغط على زر <b>تدقيق ورقة الاختبار</b> لأي نموذج.</div>
    </div>
    <div class="step-result">تفتح نافذة التدقيق الفني متضمنة الأسئلة، الخيارات، نصوص الكتب المرتبطة، ومستويات الصعوبة.</div>
  </div>

  <div class="step-item">
    <div class="step-row">
      <div class="step-badge">4</div>
      <div class="step-text">افحص مؤشر <b>الالتزام بالمواصفات الوزارية</b> ومصدر كل سؤال.</div>
    </div>
    <div class="step-result">يؤكد النظام للموجه أن كافة الأسئلة مستخرجة بدقة من فقرات الكتاب المدرسي الرسمي.</div>
  </div>

  <div class="step-item">
    <div class="step-row">
      <div class="step-badge">5</div>
      <div class="step-text">اضغط زر <b>اعتماد النموذج الإشرافي ✓</b> لتوثيق فحص الورقة الامتحانية.</div>
    </div>
    <div class="step-result">تظهر شارة الاعتماد الإشرافي على ورقة الامتحان في لوحة المعلم والطلاب.</div>
  </div>

  <div class="callout-note">
    <strong>ملاحظة الصلاحية التخصصية:</strong> تقتصر رؤية الموجه على المادة الدراسية المسندة إليه في قرار التكليف ولا يمكنه تعديل أو حذف أسئلة المعلمين لضمان استقلالية التقييم.
  </div>

  <div class="footer">
    <span>منصة التقييم من أجل التعلم · دليل المستخدم</span>
    <span>22 / 38</span>
  </div>
</div>

<!-- ==========================================
     PAGE 23: SUPERVISOR - TASK 3 (SCHOOLS BENCHMARKING)
     ========================================== -->
<div class="page">
  <h2 class="chapter-title">المشرف وموجه المادة</h2>

  <div class="task-title">مقارنة أداء المدارس والفصول التعليمية التابعة للموجه</div>

  <div class="step-item">
    <div class="step-row">
      <div class="step-badge">1</div>
      <div class="step-text">في صفحة <b>التحليلات والمتابعة الإشرافية</b>، توجّه إلى قسم <b>مقارنة المدارس والإدارات</b>.</div>
    </div>
    <div class="step-result">يعرض النظام جدولاً بيانياً يقارن مؤشرات التحصيل ومعدلات الإتقان بين مختلف المدارس.</div>
  </div>

  <div class="step-item">
    <div class="step-row">
      <div class="step-badge">2</div>
      <div class="step-text">افحص مؤشر <b>نسبة التغطية المنهجية</b> لكل مدرسة.</div>
    </div>
    <div class="step-result">يوضح لك المؤشر مدى التزام كل مدرسة بالخطة الزمنية للامتحانات وتغطية وحدات المقرر.</div>
  </div>

  <div class="step-item">
    <div class="step-row">
      <div class="step-badge">3</div>
      <div class="step-text">قارن بين متوسط درجات الفصول في الأسئلة ذات <b>المستويات العليا من التفكير</b> (التحليل والتطبيق).</div>
    </div>
    <div class="step-result">يبرز النظام الفصول المتميزة في مهارات التفكير النقدي مقارنة بالحفظ الآلي.</div>
  </div>

  <div class="step-item">
    <div class="step-row">
      <div class="step-badge">4</div>
      <div class="step-text">اضغط على زر <b>تحديد المدارس الأكثر احتياجاً للدعم</b>.</div>
    </div>
    <div class="step-result">يُفرز النظام المدارس التي تواجه انخفاضاً ملحوظاً في درجات نواتج تعلم معينة لجدولة زيارات ميدانية موجهة.</div>
  </div>

  <div class="callout-note">
    <strong>ملاحظة الشفافية والموضوعية:</strong> تستند جميع المقارنات إلى بيانات رقمية دقيقة محسوبة آلياً من جلسات الاختبارات المعتمدة دون أي تدخل بشري.
  </div>

  <div class="footer">
    <span>منصة التقييم من أجل التعلم · دليل المستخدم</span>
    <span>23 / 38</span>
  </div>
</div>

<!-- ==========================================
     PAGE 24: SUPERVISOR - TASK 4 (REPORT EXPORT)
     ========================================== -->
<div class="page">
  <h2 class="chapter-title">المشرف وموجه المادة</h2>

  <div class="task-title">تصدير التقارير الإحصائية والتحليلية لموجهي العموم والإدارة التعليمية</div>

  <div class="step-item">
    <div class="step-row">
      <div class="step-badge">1</div>
      <div class="step-text">في أعلى لوحة التحليلات الإشرافية، اضغط زر <b>تصدير التقرير الفني المجمع</b>.</div>
    </div>
    <div class="step-result">تفتح نافذة خيارات التصدير وتتيح لك تحديد الفترة الزمنية والمرحلة التعليمية.</div>
  </div>

  <div class="step-item">
    <div class="step-row">
      <div class="step-badge">2</div>
      <div class="step-text">حدد نوع التقرير المطلوب: <b>تقرير نواتج التعلم الوزارية</b> أو <b>تقرير مؤشرات بلوم</b> أو <b>تقرير مقارنة المدارس</b>.</div>
    </div>
    <div class="step-result">يقوم المحرك التحليلي بتجميع كافة المؤشرات في مستند تنفيذي رسمي.</div>
  </div>

  <div class="step-item">
    <div class="step-row">
      <div class="step-badge">3</div>
      <div class="step-text">اختر صيغة التصدير المناسبة: <b>ملف PDF رسمي للطباعة</b> أو <b>جدول بيانات Excel (.xlsx)</b>.</div>
    </div>
    <div class="step-result">يتم توليد الملف فوراً وتحميله إلى جهازك حاملاً الترويسة الوزارية الرسمية وتاريخ الإصدار الدقيق.</div>
  </div>

  <div class="step-item">
    <div class="step-row">
      <div class="step-badge">4</div>
      <div class="step-text">أرسل التقرير إلى موجه عام المادة ومدير الإدارة التعليمية لاستخدامه في تقييم الأداء الدوري.</div>
    </div>
    <div class="step-result">يوفر التقرير مادة علمية وإحصائية موثقة تدعم اتخاذ القرارات التربوية الصائبة.</div>
  </div>

  <div class="callout-note">
    <strong>ملاحظة التحديث اللحظي:</strong> يمكنك إعادة تصدير التقرير في أي وقت ليعكس النتائج المحدثة تلقائياً فور إكمال الطلاب لأي امتحانات جديدة.
  </div>

  <div class="footer">
    <span>منصة التقييم من أجل التعلم · دليل المستخدم</span>
    <span>24 / 38</span>
  </div>
</div>

<!-- ==========================================
     PAGE 25: SHOWCASE - SUPERVISOR UI
     ========================================== -->
<div class="page">
  <div style="font-size: 8.5pt; font-weight: 800; color: #2563EB; margin-bottom: 4px; letter-spacing: 0.05em;">معاينة الواجهة الرسمية · لوحة التوجيه</div>
  <h2 style="font-size: 16pt; font-weight: 900; color: #0F172A; margin: 0 0 12px 0;">لوحة الموجه الفني ومخطط نواتج التعلم وهرم بلوم</h2>

  <div class="mockup-window">
    <div class="mockup-titlebar">
      <div class="mockup-dots"><span class="mockup-dot red"></span><span class="mockup-dot yellow"></span><span class="mockup-dot green"></span></div>
      <div class="mockup-address">https://farabi-ai.com/?view=dashboard#supervisor-analytics</div>
    </div>
    <div class="mockup-content" style="background: #ffffff; padding: 16px;">
      <!-- Supervisor Strip Header -->
      <div style="background: #EEF2FF; border: 1px solid #C7D2FE; border-radius: 8px; padding: 10px 14px; margin-bottom: 12px; display: flex; justify-content: space-between; align-items: center;">
        <div>
          <span style="font-size: 9.5pt; font-weight: 900; color: #3730A3;">لوحة الموجه الفني · مادة العلوم المتكاملة</span>
          <div style="font-size: 7.5pt; color: #4F46E5;">نطاق التوجيه: إدارة مصر الجديدة التعليمية (12 مدرسة تابعة)</div>
        </div>
        <span class="ui-badge ui-badge-purple">المستوى الإشرافي: موجه أول مادة</span>
      </div>

      <!-- Analytics Cards -->
      <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin-bottom: 12px;">
        <div style="border: 1px solid #E2E8F0; border-radius: 6px; padding: 10px;">
          <div style="font-size: 8pt; font-weight: 800; color: #1E293B; margin-bottom: 6px;">هرم مستويات بلوم التراكمي للمادة</div>
          <div style="display: flex; flex-direction: column; gap: 4px; font-size: 7.5pt;">
            <div style="display: flex; justify-content: space-between;"><span>التذكر (بلوم 1)</span><span style="font-weight: 800; color: #2563EB;">94% إتقان</span></div>
            <div style="background: #E2E8F0; height: 5px; border-radius: 3px;"><div style="background: #2563EB; width: 94%; height: 5px; border-radius: 3px;"></div></div>

            <div style="display: flex; justify-content: space-between; margin-top: 2px;"><span>الفهم والاستيعاب (بلوم 2)</span><span style="font-weight: 800; color: #10B981;">89% إتقان</span></div>
            <div style="background: #E2E8F0; height: 5px; border-radius: 3px;"><div style="background: #10B981; width: 89%; height: 5px; border-radius: 3px;"></div></div>

            <div style="display: flex; justify-content: space-between; margin-top: 2px;"><span>التطبيق والحل (بلوم 3)</span><span style="font-weight: 800; color: #F59E0B;">81% إتقان</span></div>
            <div style="background: #E2E8F0; height: 5px; border-radius: 3px;"><div style="background: #F59E0B; width: 81%; height: 5px; border-radius: 3px;"></div></div>

            <div style="display: flex; justify-content: space-between; margin-top: 2px;"><span>التحليل والاستنتاج (بلوم 4)</span><span style="font-weight: 800; color: #8B5CF6;">74% إتقان</span></div>
            <div style="background: #E2E8F0; height: 5px; border-radius: 3px;"><div style="background: #8B5CF6; width: 74%; height: 5px; border-radius: 3px;"></div></div>
          </div>
        </div>

        <div style="border: 1px solid #E2E8F0; border-radius: 6px; padding: 10px;">
          <div style="font-size: 8pt; font-weight: 800; color: #1E293B; margin-bottom: 6px;">أداء المدارس التابعة في نواتج التعلم</div>
          <div style="display: flex; flex-direction: column; gap: 5px; font-size: 7.5pt;">
            <div style="display: flex; justify-content: space-between; border-bottom: 1px solid #F1F5F9; padding-bottom: 3px;">
              <span>مدرسة العروبة الإعدادية بنين</span>
              <span style="font-weight: 800; color: #16A34A;">92.4% (ممتاز)</span>
            </div>
            <div style="display: flex; justify-content: space-between; border-bottom: 1px solid #F1F5F9; padding-bottom: 3px;">
              <span>مدرسة النصر الرسمية لغات</span>
              <span style="font-weight: 800; color: #16A34A;">89.8% (جيد جداً)</span>
            </div>
            <div style="display: flex; justify-content: space-between; border-bottom: 1px solid #F1F5F9; padding-bottom: 3px;">
              <span>مدرسة الحرية الإعدادية بنات</span>
              <span style="font-weight: 800; color: #2563EB;">86.2% (جيد جداً)</span>
            </div>
            <div style="display: flex; justify-content: space-between; padding-bottom: 3px;">
              <span>مدرسة السلام الإعدادية المشتركة</span>
              <span style="font-weight: 800; color: #D97706;">76.5% (يحتاج دعم)</span>
            </div>
          </div>
        </div>
      </div>

      <!-- Action Strip -->
      <div style="display: flex; justify-content: space-between; align-items: center; border-top: 1px solid #E2E8F0; padding-top: 8px;">
        <span style="font-size: 8pt; color: #64748B;">تم تدقيق 46 نموذج امتحاني وربطها بنصوص الكتب الرسمية</span>
        <span style="background: #4F46E5; color: #ffffff; font-weight: 800; font-size: 8pt; padding: 4px 12px; border-radius: 4px;">
          📄 تصدير تقرير التوجيه الفني المجمع
        </span>
      </div>
    </div>
  </div>

  <div class="metrics-grid">
    <div class="metric-card">
      <div class="metric-value">12</div>
      <div class="metric-label">مدارس تحت الإشراف</div>
    </div>
    <div class="metric-card">
      <div class="metric-value">46</div>
      <div class="metric-label">امتحان تم تدقيقه</div>
    </div>
    <div class="metric-card">
      <div class="metric-value">1,820</div>
      <div class="metric-label">جلسة اختبار تم رصدها</div>
    </div>
    <div class="metric-card">
      <div class="metric-value">86.7%</div>
      <div class="metric-label">المعدل العام للإدارة</div>
    </div>
  </div>

  <div class="footer">
    <span>منصة التقييم من أجل التعلم · دليل المستخدم</span>
    <span>25 / 38</span>
  </div>
</div>

<!-- ==========================================
     PAGE 26: DIRECTORS - OVERVIEW & TASK 1
     ========================================== -->
<div class="page">
  <h2 class="chapter-title">مدير المحافظة والمدير المركزي</h2>
  <div class="role-desc">
    يتابع المدير المركزي ومدراء المحافظات المؤشرات العامة للمنظومة، ويشرفون على الموجهين والإدارات التعليمية، ويعاينون تقارير التقييم الإجمالية عبر الهيكل الرقابي.
  </div>

  <div class="sidebar-strip">
    <strong>قائمة هذا الدور:</strong> الهيكل الإشرافي والتابعين · التحليلات والمتابعة الإشرافية · مستكشف الاختبارات التفاعلي · وضع معاينة الإشراف
  </div>

  <div class="task-title">إدارة وتعيين الموجهين ومدراء الإدارات وتوزيع المدارس</div>

  <div class="step-item">
    <div class="step-row">
      <div class="step-badge">1</div>
      <div class="step-text">سجّل الدخول بحساب <b>مدير المحافظة</b> أو <b>المدير المركزي</b>.</div>
    </div>
    <div class="step-result">تظهر لك في الشريط العلوي شارة المدير واسم المحافظة أو صفة الإدارة المركزية.</div>
  </div>

  <div class="step-item">
    <div class="step-row">
      <div class="step-badge">2</div>
      <div class="step-text">اضغط على تبويب <b>الهيكل الإشرافي والتابعين</b>.</div>
    </div>
    <div class="step-result">تظهر لك شجرة الكيانات التنظيمية التابعة لك (الموجهون العموم، موجهو المواد، مدراء الإدارات).</div>
  </div>

  <div class="step-item">
    <div class="step-row">
      <div class="step-badge">3</div>
      <div class="step-text">اضغط على زر <b>إضافة موجه جديد</b> أو <b>تعيين نطاق إشرافي</b>.</div>
    </div>
    <div class="step-result">تفتح نافذة إدخال بيانات الموجه واختيار مادته التخصصية والإدارات والمدارس المسندة إليه.</div>
  </div>

  <div class="step-item">
    <div class="step-row">
      <div class="step-badge">4</div>
      <div class="step-text">اضغط زر <b>حفظ وتفعيل التكليف الإشرافي</b>.</div>
    </div>
    <div class="step-result">يتم إنشاء الحساب فوراً وتحديد صلاحيات الوصول لنطاق المدارس المحددة فقط.</div>
  </div>

  <div class="callout-note">
    <strong>ملاحظة التدرج الهرمي:</strong> يرى مدير المحافظة جميع الإدارات والمدارس التابعة لمحافظته، بينما يمتلك المدير المركزي نظرة شاملة على جميع محافظات الجمهورية الـ 27.
  </div>

  <div class="footer">
    <span>منصة التقييم من أجل التعلم · دليل المستخدم</span>
    <span>26 / 38</span>
  </div>
</div>

<!-- ==========================================
     PAGE 27: DIRECTORS - TASK 2 (STRATEGIC KPIS)
     ========================================== -->
<div class="page">
  <h2 class="chapter-title">مدير المحافظة والمدير المركزي</h2>

  <div class="task-title">استعراض لوحة المؤشرات الإحصائية العامة على مستوى المحافظات</div>

  <div class="step-item">
    <div class="step-row">
      <div class="step-badge">1</div>
      <div class="step-text">اضغط على تبويب <b>التحليلات والمتابعة الإشرافية</b>.</div>
    </div>
    <div class="step-result">تفتح لوحة البيانات الكبرى (Big Data Dashboard) متضمنة الأرقام الإجمالية الحية.</div>
  </div>

  <div class="step-item">
    <div class="step-row">
      <div class="step-badge">2</div>
      <div class="step-text">راجع شريط المؤشرات الحيوية الاستراتيجية (Executive KPIs): <b>إجمالي الاختبارات المنجزة</b>، <b>نسبة التفاعل الطلابي</b>، <b>متوسط الإتقان العام</b>، و<b>معدل التغطية المنهجية</b>.</div>
    </div>
    <div class="step-result">مؤشرات دقيقة يتم احتسابها دورياً من جلسات الطلاب الحقيقية.</div>
  </div>

  <div class="step-item">
    <div class="step-row">
      <div class="step-badge">3</div>
      <div class="step-text">افحص جدول <b>مقارنة الإدارات التعليمية بالمحافظة</b>.</div>
    </div>
    <div class="step-result">يوضح ترتيب الإدارات التابعة تنازلياً حسب معدلات التحصيل ونسب إنجاز الاختبارات.</div>
  </div>

  <div class="step-item">
    <div class="step-row">
      <div class="step-badge">4</div>
      <div class="step-text">استعرض مؤشر <b>استقرار الجلسات الاختبارية والنزاهة الرقمية</b>.</div>
    </div>
    <div class="step-result">يعرض نسب اكتمال الاختبارات في المواعيد المقررة ومعدلات الالتزام بالمؤقت الزمني.</div>
  </div>

  <div class="callout-note">
    <strong>ملاحظة دعم القرار:</strong> تمكن هذه اللوحة مدراء المديريات من متابعة نبض العملية التعليمية في الميدان لحظة بلحظة وتقديم تقارير واقعية لقيادات الوزارة.
  </div>

  <div class="footer">
    <span>منصة التقييم من أجل التعلم · دليل المستخدم</span>
    <span>27 / 38</span>
  </div>
</div>

<!-- ==========================================
     PAGE 28: DIRECTORS - TASK 3 (IMPERSONATION MODE)
     ========================================== -->
<div class="page">
  <h2 class="chapter-title">مدير المحافظة والمدير المركزي</h2>

  <div class="task-title">استخدام وضع معاينة الإشراف (Supervisory Impersonation Mode)</div>

  <div class="step-item">
    <div class="step-row">
      <div class="step-badge">1</div>
      <div class="step-text">في قائمة <b>الهيكل الإشرافي والتابعين</b>، ابحث عن اسم الموجه أو المعلم أو الطالب المراد معاينة حسابه.</div>
    </div>
    <div class="step-result">تظهر بطاقة المستخدم متضمنة بياناته ودوره والجهة التابع لها.</div>
  </div>

  <div class="step-item">
    <div class="step-row">
      <div class="step-badge">2</div>
      <div class="step-text">اضغط على زر <b>👁️ وضع معاينة الإشراف (تصفح بصفتك هذا المستخدم)</b>.</div>
    </div>
    <div class="step-result">يقوم النظام بنقلك فوراً إلى داخل حساب المستخدم لمعاينة ما يراه أمامه بالضبط دون الحاجة لمعرفة كلمة مروره.</div>
  </div>

  <div class="step-item">
    <div class="step-row">
      <div class="step-badge">3</div>
      <div class="step-text">لاحظ ظهور <b>الشريط العلوي البرتقالي الدائم</b> والذي يوضح أنك تتصفح في وضع المعاينة الإشرافية.</div>
    </div>
    <div class="step-result">يبرز الشريط نصاً واضحاً: <b>وضع معاينة الإشراف: تتصفح حالياً بصفتك (معلم / طالب): [اسم المستخدم]</b>.</div>
  </div>

  <div class="step-item">
    <div class="step-row">
      <div class="step-badge">4</div>
      <div class="step-text">للإنهاء والعودة لحسابك القيادي، اضغط زر <b>↩ الرجوع للحساب السابق</b> في الشريط البرتقالي.</div>
    </div>
    <div class="step-result">يخرجك النظام بأمان من الحساب المعاين ويعيدك فوراً إلى لوحة مدير المحافظة أو المدير المركزي.</div>
  </div>

  <div class="callout-warning">
    <strong>تنبيه إجرائي أثناء المعاينة:</strong> وضع المعاينة مخصص للتدقيق والمساندة وحل المشكلات الفنية؛ تجنب إجراء أي تسليمات أو تعديلات على امتحانات الطلاب أثناء تصفحك في هذا الوضع.
  </div>

  <div class="footer">
    <span>منصة التقييم من أجل التعلم · دليل المستخدم</span>
    <span>28 / 38</span>
  </div>
</div>

<!-- ==========================================
     PAGE 29: DIRECTORS - TASK 4 (BANK AUDIT & RATIFICATION)
     ========================================== -->
<div class="page">
  <h2 class="chapter-title">مدير المحافظة والمدير المركزي</h2>

  <div class="task-title">استعراض بنك الامتحانات الموحد واعتماد النماذج الرسمية</div>

  <div class="step-item">
    <div class="step-row">
      <div class="step-badge">1</div>
      <div class="step-text">اضغط على تبويب <b>مستكشف الاختبارات التفاعلي</b> في القائمة العلوية.</div>
    </div>
    <div class="step-result">تظهر لك نماذج الامتحانات المعدة على مستوى المديريات والإدارات مصنفة حسب المراحل التعليمية.</div>
  </div>

  <div class="step-item">
    <div class="step-row">
      <div class="step-badge">2</div>
      <div class="step-text">اختر المادة والصف الدراسي، واطلع على تقرير <b>تغطية المناهج الوزارية المعتمدة</b>.</div>
    </div>
    <div class="step-result">يعرض النظام نسبة تغطية الأسئلة للوحدات الدراسية المقررة ومطابقتها للمواصفات القياسية.</div>
  </div>

  <div class="step-item">
    <div class="step-row">
      <div class="step-badge">3</div>
      <div class="step-text">اضغط على زر <b>اعتماد ونشر النموذج الموحد على مستوى المحافظة</b>.</div>
    </div>
    <div class="step-result">يصبح الاختبار متاحاً لجميع مدارس المحافظة كنمتحان تقييمي موحد يطبق في توقيت متزامن.</div>
  </div>

  <div class="step-item">
    <div class="step-row">
      <div class="step-badge">4</div>
      <div class="step-text">اضغط زر <b>تصدير تقرير الإحصاء التراكمي الشامل للمحافظة</b>.</div>
    </div>
    <div class="step-result">يتم استخراج ملف تحليلي شامل يُرفع للسيد وزير التربية والتعليم والقيادات المركزية.</div>
  </div>

  <div class="callout-note">
    <strong>ملاحظة التوحيد والعدالة:</strong> تتيح هذه الميزة إجراء تقييمات تشخيصية موحدة على مستوى المحافظة لقياس جودة التعليم ومقارنة المخرجات بين الإدارات المختلفة بإنصاف وموضوعية كاملة.
  </div>

  <div class="footer">
    <span>منصة التقييم من أجل التعلم · دليل المستخدم</span>
    <span>29 / 38</span>
  </div>
</div>

<!-- ==========================================
     PAGE 30: SHOWCASE - DIRECTORS UI
     ========================================== -->
<div class="page">
  <div style="font-size: 8.5pt; font-weight: 800; color: #2563EB; margin-bottom: 4px; letter-spacing: 0.05em;">معاينة الواجهة الرسمية · لوحة القيادات</div>
  <h2 style="font-size: 16pt; font-weight: 900; color: #0F172A; margin: 0 0 12px 0;">الهيكل الإشرافي وشريط وضع معاينة الإشراف الدائم</h2>

  <div class="mockup-window">
    <div class="mockup-titlebar">
      <div class="mockup-dots"><span class="mockup-dot red"></span><span class="mockup-dot yellow"></span><span class="mockup-dot green"></span></div>
      <div class="mockup-address">https://farabi-ai.com/?view=dashboard#hierarchy-overview</div>
    </div>
    <div class="mockup-content" style="background: #ffffff; padding: 0;">
      <!-- Impersonation Orange Strip -->
      <div style="background: linear-gradient(90deg, #D97706 0%, #B45309 100%); color: #ffffff; padding: 8px 14px; font-size: 8pt; font-weight: 800; display: flex; justify-content: space-between; align-items: center;">
        <div style="display: flex; align-items: center; gap: 6px;">
          <span>👁️</span>
          <span>وضع معاينة الإشراف: تتصفح حالياً بصفتك (معلم): أ. أحمد مصطفى عبد الرحمن · مدرسة الأورمان الإعدادية</span>
        </div>
        <span style="background: #ffffff; color: #92400E; padding: 3px 10px; border-radius: 999px; font-size: 7.5pt; font-weight: 900;">
          ↩ الرجوع إلى: د. محمد سامي (مدير محافظة الجيزة)
        </span>
      </div>

      <div style="padding: 16px;">
        <!-- Hierarchy Tree Box -->
        <div style="background: #F8FAFC; border: 1px solid #E2E8F0; border-radius: 8px; padding: 12px; margin-bottom: 12px;">
          <div style="font-size: 9pt; font-weight: 900; color: #0F172A; margin-bottom: 8px;">الهيكل الإشرافي لمديرية التربية والتعليم بالجيزة</div>
          <div style="display: flex; flex-direction: column; gap: 6px; font-size: 8pt;">
            <div style="background: #ffffff; border: 1px solid #CBD5E1; padding: 6px 10px; border-radius: 4px; display: flex; justify-content: space-between;">
              <span>📁 إدارة الدقي التعليمية (8 موجهين · 42 مدرسة)</span>
              <span class="ui-badge ui-badge-primary">معدل الإنجاز: 94%</span>
            </div>
            <div style="background: #ffffff; border: 1px solid #CBD5E1; padding: 6px 10px; border-radius: 4px; display: flex; justify-content: space-between;">
              <span>📁 إدارة العجوزة التعليمية (6 موجهين · 38 مدرسة)</span>
              <span class="ui-badge ui-badge-primary">معدل الإنجاز: 91%</span>
            </div>
            <div style="background: #ffffff; border: 1px solid #CBD5E1; padding: 6px 10px; border-radius: 4px; display: flex; justify-content: space-between;">
              <span>📁 إدارة 6 أكتوبر التعليمية (11 موجه · 56 مدرسة)</span>
              <span class="ui-badge ui-badge-success">معدل الإنجاز: 96%</span>
            </div>
          </div>
        </div>

        <div style="border: 1px solid #E2E8F0; border-radius: 6px; padding: 10px; display: flex; justify-content: space-between; align-items: center;">
          <span style="font-size: 8pt; color: #475569;">إجمالي الطلاب المختبرين في المحافظة اليوم: <b>24,850 طالب وطالبة</b></span>
          <span style="background: #2563EB; color: #ffffff; font-weight: 800; font-size: 8pt; padding: 4px 12px; border-radius: 4px;">
            تصدير المؤشرات الاستراتيجية
          </span>
        </div>
      </div>
    </div>
  </div>

  <div class="metrics-grid">
    <div class="metric-card">
      <div class="metric-value">21</div>
      <div class="metric-label">إدارة تعليمية نشطة</div>
    </div>
    <div class="metric-card">
      <div class="metric-value">480</div>
      <div class="metric-label">مدرسة مربوطة بالمنصة</div>
    </div>
    <div class="metric-card">
      <div class="metric-value">94.2%</div>
      <div class="metric-label">متوسط الالتزام بالاختبارات</div>
    </div>
    <div class="metric-card">
      <div class="metric-value">100%</div>
      <div class="metric-label">أمان الخوادم والمؤقت</div>
    </div>
  </div>

  <div class="footer">
    <span>منصة التقييم من أجل التعلم · دليل المستخدم</span>
    <span>30 / 38</span>
  </div>
</div>

<!-- ==========================================
     PAGE 31: ADMIN - OVERVIEW & TASK 1 (BOOKS & CHUNKS)
     ========================================== -->
<div class="page">
  <h2 class="chapter-title">مدير المنظومة والمسؤول العام</h2>
  <div class="role-desc">
    يدير المسؤول العام المنصة بالكامل: المناهج والكتب الوزارية، فهرسة مصادر الأسئلة، حسابات وصلاحيات المعلمين والطلاب، إدارة الأجهزة والجلسات، وإعدادات الترم والنظام.
  </div>

  <div class="sidebar-strip">
    <strong>قائمة هذا الدور:</strong> إدارة ورفع المناهج والكتب · إعدادات المنظومة والتحكم العام · الهيكل الرقابي والجمهوري · إدارة المعلمين · إدارة ومتابعة الطلاب
  </div>

  <div class="task-title">رفع وفهرسة وتجزئة الكتب المدرسية والتحقق من مصادر الأسئلة</div>

  <div class="step-item">
    <div class="step-row">
      <div class="step-badge">1</div>
      <div class="step-text">سجّل الدخول بحساب <b>المدير العام (ADMIN)</b> واضغط على تبويب <b>إدارة ورفع المناهج والكتب</b>.</div>
    </div>
    <div class="step-result">تفتح لك لوحة إدارة المكتبة المنهجية المركزية المعتمدة لوزارة التربية والتعليم.</div>
  </div>

  <div class="step-item">
    <div class="step-row">
      <div class="step-badge">2</div>
      <div class="step-text">في استمارة رفع كتاب جديد، اكتب <b>عنوان الكتاب</b>، اختر <b>الصف الدراسي</b>، <b>المادة</b>، <b>الفصل الدراسي (الترم 1 / الترم 2)</b>، ونوع التعليم (عربى / لغات).</div>
    </div>
    <div class="step-result">يحدد هذا التوصيف بدقة مكان الكتاب ضمن شجرة المناهج المعتمدة.</div>
  </div>

  <div class="step-item">
    <div class="step-row">
      <div class="step-badge">3</div>
      <div class="step-text">اضغط على زر <b>اختيار ملف الكتاب (PDF)</b> وحدد النسخة الرسمية الصادرة من وزارة التربية والتعليم.</div>
    </div>
    <div class="step-result">يقوم النظام بفحص سلامة الملف وتجهيزه لعملية الرفع السحابي الآمن.</div>
  </div>

  <div class="step-item">
    <div class="step-row">
      <div class="step-badge">4</div>
      <div class="step-text">اضغط زر <b>رفع ومعالجة الكتاب المدرسي الآن</b>.</div>
    </div>
    <div class="step-result">يتم رفع الكتاب إلى التخزين السحابي ويبدأ محرك الاستخراج في قراءة صفحات الكتاب.</div>
  </div>

  <div class="callout-note">
    <strong>ملاحظة المعالجة السحابية:</strong> يتم حفظ الكتب وتجزئتها بصورة مؤمنة مع الحفاظ التام على حقوق الملكية الفكرية لوزارة التربية والتعليم والتعليم الفني.
  </div>

  <div class="footer">
    <span>منصة التقييم من أجل التعلم · دليل المستخدم</span>
    <span>31 / 38</span>
  </div>
</div>

<!-- ==========================================
     PAGE 32: ADMIN - TASK 1 (SOURCE READINESS & CHUNKS)
     ========================================== -->
<div class="page">
  <h2 class="chapter-title">مدير المنظومة والمسؤول العام</h2>

  <div class="task-title">فحص جاهزية مصادر الأسئلة ومعالجة الفهارس والتجزئة المنهجية</div>

  <div class="step-item">
    <div class="step-row">
      <div class="step-badge">5</div>
      <div class="step-text">بعد رفع الكتاب، اضغط على زر <b>معالجة وتجزئة نصوص الكتاب (Chunking)</b>.</div>
    </div>
    <div class="step-result">يقوم النظام بتقسيم صفحات الكتاب إلى فقرات ووحدات دلالية ذكية مفهرسة بالدروس.</div>
  </div>

  <div class="step-item">
    <div class="step-row">
      <div class="step-badge">6</div>
      <div class="step-text">اضغط على زر <b>فحص جاهزية مصادر الأسئلة (Source Readiness Check)</b>.</div>
    </div>
    <div class="step-result">يقوم المحرك بفحص الفقرات والتأكد من احتوائها على مفاهيم ومصطلحات كافية لتوليد الأسئلة.</div>
  </div>

  <div class="step-item">
    <div class="step-row">
      <div class="step-badge">7</div>
      <div class="step-text">تأكد من ظهور الشارة الخضراء <b>جاهز لتوليد وبناء الامتحانات ✓</b> على بطاقة الكتاب.</div>
    </div>
    <div class="step-result">يصبح الكتاب معتمداً ويظهر فوراً في قوائم المعلمين والطلاب في مصمم الامتحانات.</div>
  </div>

  <div class="step-item">
    <div class="step-row">
      <div class="step-badge">8</div>
      <div class="step-text">إذا تطلب الأمر تعديل نطاق الصفحات أو فهرس الوحدات، اضغط على <b>تعديل فهرس الكتاب</b>.</div>
    </div>
    <div class="step-result">تفتح نافذة مطابقة الوحدات وتتيح لك تصحيح أرقام صفحات بدء كل وحدة ونهايتها.</div>
  </div>

  <div class="callout-warning">
    <strong>تنبيه تجزئة الكتب:</strong> لا تقم بإعادة تجزئة كتاب نشط ومستخدم في امتحانات حالية، حيث أن تجزئة الكتاب تحدث معرّفات الفقرات المنهجية.
  </div>

  <div class="footer">
    <span>منصة التقييم من أجل التعلم · دليل المستخدم</span>
    <span>32 / 38</span>
  </div>
</div>

<!-- ==========================================
     PAGE 33: ADMIN - TASK 2 (TEACHER MANAGEMENT)
     ========================================== -->
<div class="page">
  <h2 class="chapter-title">مدير المنظومة والمسؤول العام</h2>

  <div class="task-title">إدارة المعلمين وتفعيل الصلاحيات وتعيين المواد والمدارس</div>

  <div class="step-item">
    <div class="step-row">
      <div class="step-badge">1</div>
      <div class="step-text">اضغط على تبويب <b>إدارة المعلمين</b> من شريط الأدوات الرئيسي للمدير.</div>
    </div>
    <div class="step-result">يفتح جدول المعلمين المسجلين في المنظومة مع تفاصيل الاسم، البريد، المدرسة، والمواد المسندة.</div>
  </div>

  <div class="step-item">
    <div class="step-row">
      <div class="step-badge">2</div>
      <div class="step-text">لإضافة معلم جديد، اضغط على زر <b>إضافة معلم معتمد</b>.</div>
    </div>
    <div class="step-result">تفتح استمارة تسجيل بيانات المعلم (الاسم، البريد الإلكتروني، كلمة المرور المبدئية، واسم المدرسة).</div>
  </div>

  <div class="step-item">
    <div class="step-row">
      <div class="step-badge">3</div>
      <div class="step-text">حدد المواد الدراسية والصفوف المسموح للمعلم بإنشاء اختبارات لها.</div>
    </div>
    <div class="step-result">يتم تقييد وصول المعلم للكتب والصفوف المسندة إليه فقط منعاً للتداخل بين التخصصات.</div>
  </div>

  <div class="step-item">
    <div class="step-row">
      <div class="step-badge">4</div>
      <div class="step-text">للتحكم في حالة المعلم، استخدم مفتاح <b>تفعيل / تجميد الحساب</b>، أو اضغط <b>إعادة تعيين كلمة المرور</b>.</div>
    </div>
    <div class="step-result">يتم تحديث صلاحيات المعلم فورياً في قاعدة البيانات.</div>
  </div>

  <div class="callout-note">
    <strong>ملاحظة الاستيراد الجماعي:</strong> يمكن للمدير أيضاً استيراد قوائم المعلمين جماعياً عبر رفع ملف Excel متضمن بياناتهم ومدارسهم وموادهم بنقرة واحدة.
  </div>

  <div class="footer">
    <span>منصة التقييم من أجل التعلم · دليل المستخدم</span>
    <span>33 / 38</span>
  </div>
</div>

<!-- ==========================================
     PAGE 34: ADMIN - TASK 3 (STUDENT MANAGEMENT)
     ========================================== -->
<div class="page">
  <h2 class="chapter-title">مدير المنظومة والمسؤول العام</h2>

  <div class="task-title">إدارة الطلاب وتوليد وتوزيع الأكواد التعريفية وتعيين المراحل</div>

  <div class="step-item">
    <div class="step-row">
      <div class="step-badge">1</div>
      <div class="step-text">اضغط على تبويب <b>إدارة ومتابعة الطلاب</b>.</div>
    </div>
    <div class="step-result">تظهر قاعدة بيانات الطلاب بالكامل مع إمكانية البحث والفلترة حسب المحافظة والمدرسة والصف.</div>
  </div>

  <div class="step-item">
    <div class="step-row">
      <div class="step-badge">2</div>
      <div class="step-text">استخدم حقل البحث للعثور على أي طالب بواسطة <b>كود الطالب</b>، <b>البريد الإلكتروني</b>، أو <b>الاسم</b>.</div>
    </div>
    <div class="step-result">تظهر بطاقة الطالب متضمنة كوده الدائم، تاريخ التسجيل، وحالة النشاط.</div>
  </div>

  <div class="step-item">
    <div class="step-row">
      <div class="step-badge">3</div>
      <div class="step-text">إذا نسي الطالب كلمة مروره أو كوده، اضغط على زر <b>إعادة ضبط كلمة المرور وكشف الكود</b>.</div>
    </div>
    <div class="step-result">يقوم النظام بتعيين كلمة مرور مؤقتة وتزويدك بالكود لتسليمه للطالب.</div>
  </div>

  <div class="step-item">
    <div class="step-row">
      <div class="step-badge">4</div>
      <div class="step-text">لتعديل صف الطالب أو نوع تعليمه (عربي / لغات)، اضغط على <b>تعديل البيانات الأكاديمية</b>.</div>
    </div>
    <div class="step-result">يتم تحديث الكتب والمناهج المتاحة في حساب الطالب لتطابق وضعه الدراسي الجديد.</div>
  </div>

  <div class="callout-note">
    <strong>ملاحظة الأمان:</strong> لا يمكن حذف حساب طالب لديه سجل امتحانات نشط أو درجات معتمدة؛ يتيح النظام خيار <b>تجميد الحساب</b> بدلاً من الحذف لحفظ الأرشيف الأكاديمي.
  </div>

  <div class="footer">
    <span>منصة التقييم من أجل التعلم · دليل المستخدم</span>
    <span>34 / 38</span>
  </div>
</div>

<!-- ==========================================
     PAGE 35: ADMIN - TASK 4 (DEVICE SESSIONS RESET)
     ========================================== -->
<div class="page">
  <h2 class="chapter-title">مدير المنظومة والمسؤول العام</h2>

  <div class="task-title">إدارة الأجهزة والجلسات النشطة وإلغاء قيود الدخول (Device Management)</div>

  <div class="step-item">
    <div class="step-row">
      <div class="step-badge">1</div>
      <div class="step-text">في صفحة إدارة الطلاب أو المعلمين، اضغط على بطاقة المستخدم ثم اختر <b>إدارة الأجهزة المسجلة</b>.</div>
    </div>
    <div class="step-result">تظهر نافذة توضح الأجهزة المرتبطة بالحساب وتاريخ آخر دخول وبصمة الجهاز الرقمية.</div>
  </div>

  <div class="step-item">
    <div class="step-row">
      <div class="step-badge">2</div>
      <div class="step-text">في حالة استنفاد الطالب للحد الأقصى (جهازان) وتغييره لهاتفه أو حاسوبه، تظهر إشارة <b>الحد الأقصى مستنفد (2/2)</b>.</div>
    </div>
    <div class="step-result">يكون الطالب محظوراً من الدخول عبر أي جهاز جديد حتى تفريغ القائمة.</div>
  </div>

  <div class="step-item">
    <div class="step-row">
      <div class="step-badge">3</div>
      <div class="step-text">اضغط على زر <b>مسح الجلسات النشطة / إنهاء تسجيل الدخول للأجهزة</b>.</div>
    </div>
    <div class="step-result">يقوم النظام فوراً بمسح البصمات المسجلة لهذا الحساب وإعادته إلى الحالة الصفرية (0/2).</div>
  </div>

  <div class="step-item">
    <div class="step-row">
      <div class="step-badge">4</div>
      <div class="step-text">أبلغ الطالب بمحاولة تسجيل الدخول مجدداً من جهازه الحالي.</div>
    </div>
    <div class="step-result">يتم تسجيل الدخول بنجاح وحفظ جهازه الجديد كجهاز معتمد رقم 1.</div>
  </div>

  <div class="callout-warning">
    <strong>تنبيه فوري:</strong> الضغط على <b>مسح الجلسات النشطة</b> يؤدي إلى تسجيل الخروج الفوري للمستخدم من كافة أجهزته الحالية وإلغاء صلاحية رموز الوصول السابقة.
  </div>

  <div class="footer">
    <span>منصة التقييم من أجل التعلم · دليل المستخدم</span>
    <span>35 / 38</span>
  </div>
</div>

<!-- ==========================================
     PAGE 36: ADMIN - TASK 5 (GLOBAL TERM & PLATFORM SETTINGS)
     ========================================== -->
<div class="page">
  <h2 class="chapter-title">مدير المنظومة والمسؤول العام</h2>

  <div class="task-title">التبديل العام للفصل الدراسي وتخصيص هوية وشعار المنظومة</div>

  <div class="step-item">
    <div class="step-row">
      <div class="step-badge">1</div>
      <div class="step-text">اضغط على تبويب <b>إعدادات المنظومة والتحكم العام</b>.</div>
    </div>
    <div class="step-result">تفتح لوحة التحكم المركزية في سياسات وإعدادات المنصة على مستوى الجمهورية.</div>
  </div>

  <div class="step-item">
    <div class="step-row">
      <div class="step-badge">2</div>
      <div class="step-text">في بطاقة <b>التبديل العام للفصل الدراسي (Global Term Switcher)</b>، حدد الترم الافتراضي للمنظومة باختيار <b>الفصل الدراسي الأول</b> أو <b>الفصل الدراسي الثاني</b>.</div>
    </div>
    <div class="step-result">يحدد هذا الخيار المحتوى والامتحانات الافتراضية التي تظهر لجميع الطلاب الجدد وغير المخصصين.</div>
  </div>

  <div class="step-item">
    <div class="step-row">
      <div class="step-badge">3</div>
      <div class="step-text">في قسم <b>شعار وهوية المنصة</b>، يمكنك رفع الشعار الرسمي للوزارة أو المديرية ليظهر في الشريط العل التقارير الرسمية.</div>
    </div>
    <div class="step-result">يتم تحديث الشعار فورياً في جميع واجهات المنصة دون الحاجة لإعادة بناء الكود.</div>
  </div>

  <div class="step-item">
    <div class="step-row">
      <div class="step-badge">4</div>
      <div class="step-text">في قسم <b>صلاحيات التسجيل الذاتي</b>، حدد تفعيل أو تعطيل <b>السماح بتسجيل الطلاب الذاتي الجديد</b>.</div>
    </div>
    <div class="step-result">عند التعطيل، يقتصر تسجيل الطلاب على الرفع الإداري المركزي فقط خلال فترات الامتحانات الرسمية.</div>
  </div>

  <div class="callout-note">
    <strong>ملاحظة الحفظ المركزي:</strong> تحفظ جميع الإعدادات في جدول التهيئة السحابي المشترك وتنعكس فوراً على خوادم المنصة دون أي انقطاع في الخدمة.
  </div>

  <div class="footer">
    <span>منصة التقييم من أجل التعلم · دليل المستخدم</span>
    <span>36 / 38</span>
  </div>
</div>

<!-- ==========================================
     PAGE 37: SHOWCASE - ADMIN DASHBOARD UI
     ========================================== -->
<div class="page">
  <div style="font-size: 8.5pt; font-weight: 800; color: #2563EB; margin-bottom: 4px; letter-spacing: 0.05em;">معاينة الواجهة الرسمية · إدارة المنظومة</div>
  <h2 style="font-size: 16pt; font-weight: 900; color: #0F172A; margin: 0 0 12px 0;">لوحة المدير العام وإدارة المناهج والكتب المركزية</h2>

  <div class="mockup-window">
    <div class="mockup-titlebar">
      <div class="mockup-dots"><span class="mockup-dot red"></span><span class="mockup-dot yellow"></span><span class="mockup-dot green"></span></div>
      <div class="mockup-address">https://farabi-ai.com/?view=dashboard#admin-books</div>
    </div>
    <div class="mockup-content" style="background: #ffffff; padding: 16px;">
      <!-- Admin Header -->
      <div style="background: linear-gradient(135deg, #1E1B4B 0%, #312E81 100%); color: #ffffff; padding: 12px 16px; border-radius: 8px; margin-bottom: 12px; display: flex; justify-content: space-between; align-items: center;">
        <div style="display: flex; align-items: center; gap: 8px;">
          <span style="font-size: 18pt;">🏛️</span>
          <div>
            <div style="font-size: 10pt; font-weight: 900;">المكتبة المنهجية المركزية المعتمدة - الإدارة العامة فقط</div>
            <div style="font-size: 7.5pt; color: #C7D2FE;">إدارة وتجزئة وفهرسة الكتب المدرسية الصادرة عن وزارة التربية والتعليم</div>
          </div>
        </div>
        <span class="ui-badge ui-badge-purple">المدير العام: SUPER-ADMIN-001</span>
      </div>

      <!-- Book Row Item -->
      <div style="border: 1px solid #E2E8F0; border-radius: 6px; padding: 10px 14px; margin-bottom: 8px; display: flex; justify-content: space-between; align-items: center;">
        <div>
          <div style="font-size: 9pt; font-weight: 800; color: #0F172A;">📘 كتاب العلوم المتكاملة - الصف الأول الإعدادي (الترم 1)</div>
          <div style="font-size: 7.5pt; color: #64748B;">اللغة: عربي · الحجم: 14.8 ميجابايت · عدد الفقرات المفهرسة: 142 فقرة</div>
        </div>
        <div style="display: flex; gap: 6px;">
          <span class="ui-badge ui-badge-success">جاهز للتوليد ✓</span>
          <span style="background: #F1F5F9; color: #334155; font-size: 7.5pt; padding: 3px 8px; border-radius: 4px; font-weight: 700;">فحص المصادر</span>
        </div>
      </div>

      <!-- Book Row Item 2 -->
      <div style="border: 1px solid #E2E8F0; border-radius: 6px; padding: 10px 14px; margin-bottom: 12px; display: flex; justify-content: space-between; align-items: center;">
        <div>
          <div style="font-size: 9pt; font-weight: 800; color: #0F172A;">📙 كتاب الرياضيات - الصف الأول الإعدادي (الترم 1)</div>
          <div style="font-size: 7.5pt; color: #64748B;">اللغة: عربي · الحجم: 18.2 ميجابايت · عدد الفقرات المفهرسة: 198 فقرة</div>
        </div>
        <div style="display: flex; gap: 6px;">
          <span class="ui-badge ui-badge-success">جاهز للتوليد ✓</span>
          <span style="background: #F1F5F9; color: #334155; font-size: 7.5pt; padding: 3px 8px; border-radius: 4px; font-weight: 700;">فحص المصادر</span>
        </div>
      </div>

      <!-- Platform Settings Quick Bar -->
      <div style="background: #F8FAFC; border: 1px solid #E2E8F0; border-radius: 6px; padding: 8px 12px; display: flex; justify-content: space-between; align-items: center;">
        <span style="font-size: 8pt; font-weight: 700; color: #334155;">الفصل الدراسي الافتراضي: <b>الترم الأول</b> · تسجيل الطلاب: <b>مفتوح</b></span>
        <span style="background: #2563EB; color: #ffffff; font-weight: 800; font-size: 8pt; padding: 4px 12px; border-radius: 4px;">
          ⚙️ فتح إعدادات المنظومة
        </span>
      </div>
    </div>
  </div>

  <div class="metrics-grid">
    <div class="metric-card">
      <div class="metric-value">18</div>
      <div class="metric-label">كتاباً مدرسياً معتمداً</div>
    </div>
    <div class="metric-card">
      <div class="metric-value">1,420</div>
      <div class="metric-label">معلماً نشطاً بالمنظومة</div>
    </div>
    <div class="metric-card">
      <div class="metric-value">48,200</div>
      <div class="metric-label">طالباً مسجلاً بكود دائم</div>
    </div>
    <div class="metric-card">
      <div class="metric-value">99.9%</div>
      <div class="metric-label">نسبة استقرار الخوادم</div>
    </div>
  </div>

  <div class="footer">
    <span>منصة التقييم من أجل التعلم · دليل المستخدم</span>
    <span>37 / 38</span>
  </div>
</div>

<!-- ==========================================
     PAGE 38: CONCLUSION & OFFICIAL SUPPORT
     ========================================== -->
<div class="page" style="display: flex; flex-direction: column; justify-content: space-between;">
  <div>
    <h2 class="chapter-title" style="font-size: 20pt; border-bottom: 3px solid var(--primary); margin-bottom: 14px;">
      الخاتمة وميثاق الأمان والدعم الفني المعتمد
    </h2>

    <p style="font-size: 10pt; color: #334155; line-height: 1.7; margin-bottom: 18px;">
      تمثل <b>منصة التقييم من أجل التعلم (فارابي للذكاء الاصطناعي)</b> نقلة نوعية واستراتيجية في منظومة التعليم والتقييم المحوسب لجمهورية مصر العربية، حيث تجمع بين دقة المناهج والكتب الوزارية، وقوة الذكاء الاصطناعي المسؤول، وعدالة التقييم الزمني الصارم، والتحليلات التراكمية الحية التي تدعم التعلم المستمر.
    </p>

    <div style="background: #F8FAFC; border: 1px solid var(--border); border-radius: 10px; padding: 14px 18px; margin-bottom: 18px;">
      <div style="font-size: 10.5pt; font-weight: 800; color: var(--navy); margin-bottom: 10px;">
        ملخص التزامات النزاهة والأمان الرقمي:
      </div>
      <ul style="margin: 0; padding-right: 20px; font-size: 9pt; color: #475569; line-height: 1.7;">
        <li><b>التوثيق المنهجي الصارم:</b> لا يتم توليد أو اعتماد أي سؤال خارج حدود ونصوص الكتب المدرسية الرسمية.</li>
        <li><b>المؤقت الزمني المحمي:</b> لا يمكن التلاعب بزمن الاختبار أو إيقاف العد التنازلي على خوادم المنصة.</li>
        <li><b>الحفظ التلقائي والتسليم الحتمي:</b> إجابات الطلاب محفوظة باستمرار ويتم تسليمها تلقائياً عند انتهاء الوقت.</li>
        <li><b>تأمين الهوية الرقمية:</b> سياسة حد أقصى جهازين لكل حساب طالب لمنع تداول الحسابات وتسريب الأسئلة.</li>
        <li><b>سرية الإجابات:</b> الإجابات الصحيحة والتفسيرات الوزارية مشفرة ومحمية ولا تظهر إلا بعد اعتماد التسليم.</li>
      </ul>
    </div>

    <div style="background: #EFF6FF; border: 2px solid #2563EB; border-radius: 10px; padding: 16px 20px;">
      <div style="font-size: 10.5pt; font-weight: 800; color: #1E3A8A; margin-bottom: 8px;">
        قنوات الدعم الفني والمساعدة الرسمية:
      </div>
      <div style="font-size: 9pt; color: #1E40AF; line-height: 1.6;">
        في حال وجود أي استفسار تقني أو طلب إعادة ضبط للأجهزة المسجلة أو الإبلاغ عن مشكلة في المحتوى، يرجى التواصل مع فريق الدعم المعتمد عبر القنوات التالية:
        <div style="margin-top: 8px; font-weight: 700; font-family: monospace; direction: ltr; text-align: right;">
          • البريد الإلكتروني المعتمد: support@farabi-assessment.gov.eg<br>
          • البوابة الفنية المركزية: https://farabi-ai.com/support<br>
          • الخط الساخن للتطوير التكنولوجي والتقييم: 19820 (ساعات العمل الرسمية)
        </div>
      </div>
    </div>
  </div>

  <div style="border-top: 1px solid #E2E8F0; padding-top: 14px; text-align: center;">
    <div style="font-size: 9pt; font-weight: 800; color: #0F172A; margin-bottom: 4px;">
      منصة التقييم من أجل التعلم · فارابي للذكاء الاصطناعي
    </div>
    <div style="font-size: 8pt; color: #64748B;">
      جميع الحقوق محفوظة © 2026 · وزارة التربية والتعليم والتعليم الفني · جمهورية مصر العربية
    </div>
    <div style="font-size: 8.5pt; font-weight: 800; color: #2563EB; margin-top: 6px;">
      38 / 38
    </div>
  </div>
</div>

</body>
</html>
`;

const tempHtmlPath = path.resolve('temp_farabi_guide.html');
fs.writeFileSync(tempHtmlPath, htmlContent, 'utf8');

const tempPdfPath = path.resolve('temp_farabi_rendered.pdf');
const primaryPdfPath = path.resolve('c:/Users/eyadsherif/OneDrive/Desktop/Farabi-AI-Platform-User-Guide-AR.pdf');
const updatedPdfPath = path.resolve('c:/Users/eyadsherif/OneDrive/Desktop/Farabi-AI-Platform-User-Guide-AR-Updated.pdf');

console.log('Rendering HTML to PDF via headless Chrome...');

const chromePath = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';

execFileSync(chromePath, [
  '--headless=new',
  '--disable-gpu',
  '--no-pdf-header-footer',
  '--run-all-compositor-stages-before-draw',
  '--print-to-pdf=' + tempPdfPath,
  tempHtmlPath
]);

console.log('Render complete! Verifying PDF...');

// Verify PDF
const pdfBytes = fs.readFileSync(tempPdfPath);
const doc = await PDFDocument.load(pdfBytes);
const pageCount = doc.getPageCount();
console.log('Verified PDF Page Count:', pageCount);

const targets = [
  path.resolve('c:/Users/eyadsherif/OneDrive/Desktop/Farabi-AI-Platform-User-Guide-AR-Final.pdf'),
  primaryPdfPath,
  updatedPdfPath
];

for (const target of targets) {
  try {
    fs.copyFileSync(tempPdfPath, target);
    console.log('✅ Successfully wrote PDF to:', target);
  } catch (err) {
    console.log('⚠️ Could not overwrite locked file:', target);
  }
}

// Clean up
fs.unlinkSync(tempHtmlPath);
fs.unlinkSync(tempPdfPath);

console.log('Done! Generated Farabi AI User Guide with exact page count:', pageCount);
