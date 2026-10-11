import os
from reportlab.lib.pagesizes import letter
from reportlab.lib import colors
from reportlab.platypus import (
    BaseDocTemplate, PageTemplate, Frame, NextPageTemplate,
    Paragraph, Spacer, Table, TableStyle, PageBreak
)
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle

base_pdf_path = r"C:\Users\eyadsherif\OneDrive\Desktop\Platform_Database_Capacity_Report.pdf"
fallback_pdf_path = r"C:\Users\eyadsherif\OneDrive\Desktop\Platform_Database_Capacity_Report_Updated.pdf"

pdf_path = base_pdf_path
try:
    with open(base_pdf_path, 'a'):
        pass
except (IOError, PermissionError):
    pdf_path = fallback_pdf_path

# Mixed Page Orientation Setup:
# Pages 1 to 3: Portrait (Letter: 612 x 792 pt, width=576 pt)
# Page 4: Landscape (Wide: 1260 x 612 pt, width=1224 pt for 23-column Table 12)
doc = BaseDocTemplate(pdf_path)

frame_portrait = Frame(18, 18, 576, 756, id='F_Port', leftPadding=0, rightPadding=0, topPadding=0, bottomPadding=0)
template_portrait = PageTemplate(id='Portrait', pagesize=letter, frames=frame_portrait)

frame_landscape = Frame(18, 18, 1224, 576, id='F_Land', leftPadding=0, rightPadding=0, topPadding=0, bottomPadding=0)
template_landscape = PageTemplate(id='Landscape', pagesize=(1260, 612), frames=frame_landscape)

doc.addPageTemplates([template_portrait, template_landscape])

styles = getSampleStyleSheet()

title_style = ParagraphStyle(
    'DocTitle',
    parent=styles['Normal'],
    fontName='Helvetica-Bold',
    fontSize=11,
    leading=13,
    textColor=colors.HexColor('#0F172A'),
    alignment=1
)

sub_style = ParagraphStyle(
    'DocSubtitle',
    parent=styles['Normal'],
    fontName='Helvetica-Bold',
    fontSize=7,
    leading=9,
    textColor=colors.HexColor('#475569'),
    alignment=1
)

sec_title_style = ParagraphStyle(
    'SectionHeader',
    parent=styles['Normal'],
    fontName='Helvetica-Bold',
    fontSize=8,
    leading=10,
    textColor=colors.HexColor('#1E293B')
)

cell_hdr = ParagraphStyle(
    'CellHdr',
    parent=styles['Normal'],
    fontName='Helvetica-Bold',
    fontSize=6.5,
    leading=8,
    textColor=colors.white,
    alignment=1
)

cell_hdr_sm = ParagraphStyle(
    'CellHdrSm',
    parent=styles['Normal'],
    fontName='Helvetica-Bold',
    fontSize=5.6,
    leading=7,
    textColor=colors.white,
    alignment=1
)

cell_txt = ParagraphStyle(
    'CellTxt',
    parent=styles['Normal'],
    fontName='Helvetica',
    fontSize=6.2,
    leading=7.6,
    textColor=colors.HexColor('#0F172A'),
    alignment=1
)

cell_txt_sm = ParagraphStyle(
    'CellTxtSm',
    parent=styles['Normal'],
    fontName='Helvetica',
    fontSize=5.4,
    leading=6.6,
    textColor=colors.HexColor('#0F172A'),
    alignment=1
)

cell_txt_left = ParagraphStyle(
    'CellTxtLeft',
    parent=styles['Normal'],
    fontName='Helvetica',
    fontSize=6.2,
    leading=7.6,
    textColor=colors.HexColor('#0F172A'),
    alignment=0
)

cell_pass = ParagraphStyle(
    'CellPass',
    parent=styles['Normal'],
    fontName='Helvetica-Bold',
    fontSize=6.2,
    leading=7.6,
    textColor=colors.HexColor('#15803D'),
    alignment=1
)

cell_warn = ParagraphStyle(
    'CellWarn',
    parent=styles['Normal'],
    fontName='Helvetica-Bold',
    fontSize=6.2,
    leading=7.6,
    textColor=colors.HexColor('#B91C1C'),
    alignment=1
)

def create_table(data, col_widths, is_status=False):
    flowable_data = []
    for r_idx, row in enumerate(data):
        flowable_row = []
        for c_idx, cell in enumerate(row):
            if r_idx == 0:
                flowable_row.append(Paragraph(str(cell), cell_hdr))
            else:
                s_cell = str(cell)
                if is_status and ('PASS' in s_cell or 'OK' in s_cell):
                    flowable_row.append(Paragraph(s_cell, cell_pass))
                elif is_status and ('OVER' in s_cell or 'WARN' in s_cell):
                    flowable_row.append(Paragraph(s_cell, cell_warn))
                elif c_idx == 0:
                    flowable_row.append(Paragraph(s_cell, cell_txt_left if not s_cell.startswith(' ') else cell_txt))
                else:
                    flowable_row.append(Paragraph(s_cell, cell_txt))
        flowable_data.append(flowable_row)
    
    t = Table(flowable_data, colWidths=col_widths)
    t_style = [
        ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor('#1E293B')),
        ('ALIGN', (0, 0), (-1, -1), 'CENTER'),
        ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
        ('GRID', (0, 0), (-1, -1), 0.4, colors.HexColor('#CBD5E1')),
        ('TOPPADDING', (0, 0), (-1, -1), 2),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 2),
    ]
    for r in range(1, len(data)):
        if r % 2 == 0:
            t_style.append(('BACKGROUND', (0, r), (-1, r), colors.HexColor('#F8FAFC')))
    t.setStyle(TableStyle(t_style))
    return t

story = []

# ==================== PAGE 1 (PORTRAIT) ====================
story.append(Paragraph("PLATFORM CAPACITY & COST SPECIFICATION REPORT (PAGE 1 / 4)", title_style))
story.append(Paragraph("SYSTEM SPECIFICATION: 50 TEXTBOOKS | PER-PACKAGE AI EXAM GENERATION | ZERO-DUPLICATE DB CACHE", sub_style))
story.append(Spacer(1, 4))

# Table 1: Annual Exam Attempts Matrix (576 pt width)
story.append(Paragraph("TABLE 1: TOTAL ANNUAL EXAM ATTEMPTS (BY STUDENT TIER & FREQUENCY)", sec_title_style))
story.append(Spacer(1, 2))
t1_data = [
    ["Student Tier", "1x Base (120 Exams)", "2x (240 Exams)", "3x (360 Exams)", "4x (480 Exams)", "5x Max (600 Exams)"],
    ["10,000 Students", "1,200,000", "2,400,000", "3,600,000", "4,800,000", "6,000,000"],
    ["100,000 Students", "12,000,000", "24,000,000", "36,000,000", "48,000,000", "60,000,000"],
    ["500,000 Students", "60,000,000", "120,000,000", "180,000,000", "240,000,000", "300,000,000"],
    ["1,000,000 Students", "120,000,000", "240,000,000", "360,000,000", "480,000,000", "600,000,000"]
]
story.append(create_table(t1_data, [116, 92, 92, 92, 92, 92]))
story.append(Spacer(1, 7))

# Table 2: AI Generation vs DB Cache (Dynamic Per Package) (576 pt width)
story.append(Paragraph("TABLE 2: AI EXAM GENERATION VS DATABASE CACHED SERVING PER STUDENT PACKAGE", sec_title_style))
story.append(Spacer(1, 2))
t2_data = [
    ["Metric / System Parameter", "10,000 Students", "100,000 Students", "500,000 Students", "1,000,000 Students"],
    ["Total Curricular Textbooks Across All Grades", "50 Books", "50 Books", "50 Books", "50 Books"],
    ["Total Annual Exam Deliveries (Base 120x)", "1,200,000", "12,000,000", "60,000,000", "120,000,000"],
    ["AI Exams Generated for Package (Base 120x)", "12,000 Exams", "60,000 Exams", "180,000 Exams", "240,000 Exams"],
    ["Exams Served from Database Cache", "1,188,000", "11,940,000", "59,820,000", "119,760,000"],
    ["AI Generation Ratio", "1.00%", "0.50%", "0.30%", "0.20%"],
    ["Database Cache Hit Ratio", "99.00%", "99.50%", "99.70%", "99.80%"],
    ["Duplicate Exam Collisions per Student", "0.00%", "0.00%", "0.00%", "0.00%"]
]
story.append(create_table(t2_data, [176, 100, 100, 100, 100]))
story.append(Spacer(1, 7))

# Table 3: $35 Limit Feasibility Assessment (576 pt width)
story.append(Paragraph("TABLE 3: $35 / MONTH SPENDING LIMIT FEASIBILITY ASSESSMENT", sec_title_style))
story.append(Spacer(1, 2))
t3_data = [
    ["Student Tier", "1x (120 Exams)", "2x (240 Exams)", "3x (360 Exams)", "4x (480 Exams)", "5x (600 Exams)"],
    ["10,000 Students", "PASS ($0.00)", "PASS ($0.00)", "PASS ($0.00)", "PASS ($0.00)", "PASS ($0.14)"],
    ["100,000 Students", "PASS ($1.12)", "PASS ($3.04)", "PASS ($4.96)", "PASS ($6.88)", "PASS ($8.80)"],
    ["500,000 Students", "PASS ($8.90)", "PASS ($18.50)", "PASS ($28.10)", "OVER (+$2.70)", "OVER (+$12.30)"],
    ["1,000,000 Students", "PASS ($18.62)", "OVER (+$2.82)", "OVER (+$22.02)", "OVER (+$41.22)", "OVER (+$60.42)"]
]
story.append(create_table(t3_data, [116, 92, 92, 92, 92, 92], is_status=True))
story.append(PageBreak())

# ==================== PAGE 2 (PORTRAIT) ====================
story.append(Paragraph("PLATFORM CAPACITY & COST SPECIFICATION REPORT (PAGE 2 / 4)", title_style))
story.append(Paragraph("DATABASE EXPENDITURE, SERVED EXAMS AFTER CACHE & $35 BUDGET MARGINS", sub_style))
story.append(Spacer(1, 4))

# Table 4: Item-by-Item Monthly Database Cost (576 pt width)
story.append(Paragraph("TABLE 4: MONTHLY DATABASE COST BREAKDOWN FOR ALL PLATFORM ASSETS ($ USD)", sec_title_style))
story.append(Spacer(1, 2))
t4_data = [
    ["Platform Asset / Component", "Storage Size", "10,000 Students", "100,000 Students", "500,000 Students", "1,000,000 Students"],
    ["50 Textbooks PDF Master Files", "600 MB (0.60 GB)", "$0.00 (Free 5GB)", "$0.12 / mo", "$0.12 / mo", "$0.12 / mo"],
    ["Text Chunks & Vector Embeddings", "230 MB (0.23 GB)", "$0.00 (Free 5GB)", "$0.05 / mo", "$0.05 / mo", "$0.05 / mo"],
    ["Teachers, Admins & Hierarchy Users", "12.5 MB (0.01 GB)", "$0.00 (Free 5GB)", "$0.01 / mo", "$0.01 / mo", "$0.01 / mo"],
    ["Audit Logs, Settings & Sessions", "100 MB (0.10 GB)", "$0.00 (Free 5GB)", "$0.02 / mo", "$0.02 / mo", "$0.02 / mo"],
    ["Student Profile Records (Accounts)", "0.01 to 1.20 GB", "$0.00 (Free 5GB)", "$0.02 / mo", "$0.12 / mo", "$0.24 / mo"],
    ["Exam Attempts, Results & Evaluations", "0.96 to 96.00 GB", "$0.00 (Free 5GB)", "$0.90 / mo", "$8.58 / mo", "$18.18 / mo"],
    ["Total Database Monthly Cost (Base 120x)", "1.86 to 98.09 GB", "$0.00 / mo", "$1.12 / mo", "$8.90 / mo", "$18.62 / mo"]
]
story.append(create_table(t4_data, [166, 82, 82, 82, 82, 82]))
story.append(Spacer(1, 6))

# Table 5: Detailed Exams After Cache per Package & Multiplier (576 pt width)
story.append(Paragraph("TABLE 5: EXAMS GENERATED AFTER DB CACHE FOR EACH PACKAGE (1x TO 5x)", sec_title_style))
story.append(Spacer(1, 2))
t5_data = [
    ["Student Package", "Exam Multiplier", "Total Exams", "AI Generated", "Served After DB Cache"],
    ["10,000 Students", "1x (120 Exams)", "1,200,000", "12,000", "1,188,000"],
    ["10,000 Students", "2x (240 Exams)", "2,400,000", "24,000", "2,376,000"],
    ["10,000 Students", "3x (360 Exams)", "3,600,000", "36,000", "3,564,000"],
    ["10,000 Students", "4x (480 Exams)", "4,800,000", "48,000", "4,752,000"],
    ["10,000 Students", "5x (600 Exams)", "6,000,000", "60,000", "5,940,000"],
    ["100,000 Students", "1x (120 Exams)", "12,000,000", "60,000", "11,940,000"],
    ["100,000 Students", "3x (360 Exams)", "36,000,000", "180,000", "35,820,000"],
    ["100,000 Students", "5x (600 Exams)", "60,000,000", "300,000", "59,700,000"],
    ["500,000 Students", "1x (120 Exams)", "60,000,000", "180,000", "59,820,000"],
    ["500,000 Students", "3x (360 Exams)", "180,000,000", "540,000", "179,460,000"],
    ["500,000 Students", "5x (600 Exams)", "300,000,000", "900,000", "299,100,000"],
    ["1,000,000 Students", "1x (120 Exams)", "120,000,000", "240,000", "119,760,000"],
    ["1,000,000 Students", "3x (360 Exams)", "360,000,000", "720,000", "359,280,000"],
    ["1,000,000 Students", "5x (600 Exams)", "600,000,000", "1,200,000", "598,800,000"]
]
story.append(create_table(t5_data, [116, 95, 115, 95, 155]))
story.append(Spacer(1, 6))

# Table 6: Total Monthly Platform Cost Summary & $35 Limit Margin (576 pt width)
story.append(Paragraph("TABLE 6: TOTAL MONTHLY PLATFORM DATABASE COST & $35 LIMIT MARGIN ($ USD)", sec_title_style))
story.append(Spacer(1, 2))
t6_data = [
    ["Student Package", "Multiplier", "Total DB Size", "Monthly DB Cost", "$35 Monthly Limit", "Margin / Status"],
    ["10,000 Students", "1x (120x)", "1.86 GB", "$0.00", "$35.00", "PASS (+$35.00 buffer)"],
    ["10,000 Students", "5x (600x)", "5.70 GB", "$0.14", "$35.00", "PASS (+$34.86 buffer)"],
    ["100,000 Students", "1x (120x)", "10.61 GB", "$1.12", "$35.00", "PASS (+$33.88 buffer)"],
    ["100,000 Students", "5x (600x)", "49.01 GB", "$8.80", "$35.00", "PASS (+$26.20 buffer)"],
    ["500,000 Students", "1x (120x)", "49.49 GB", "$8.90", "$35.00", "PASS (+$26.10 buffer)"],
    ["500,000 Students", "3x (360x)", "145.49 GB", "$28.10", "$35.00", "PASS (+$6.90 buffer)"],
    ["500,000 Students", "5x (600x)", "241.49 GB", "$47.30", "$35.00", "OVER (Exceeds by $12.30)"],
    ["1,000,000 Students", "1x (120x)", "98.09 GB", "$18.62", "$35.00", "PASS (+$16.38 buffer)"],
    ["1,000,000 Students", "5x (600x)", "482.09 GB", "$95.42", "$35.00", "OVER (Exceeds by $60.42)"]
]
story.append(create_table(t6_data, [116, 68, 76, 86, 90, 140], is_status=True))
story.append(PageBreak())

# ==================== PAGE 3 (PORTRAIT) ====================
story.append(Paragraph("PLATFORM CAPACITY & COST SPECIFICATION REPORT (PAGE 3 / 4)", title_style))
story.append(Paragraph("10K CASE STUDY & $35 STORAGE PURCHASING POWER", sub_style))
story.append(Spacer(1, 4))

# Table 7: 10,000 Random Students Scenario (576 pt width)
story.append(Paragraph("TABLE 7: 10,000 RANDOM STUDENTS SCENARIO — DETAILED AI GENERATION VS DB CACHE (1x TO 5x)", sec_title_style))
story.append(Spacer(1, 2))
t7_data = [
    ["Exam Frequency", "Total Exams Taken", "AI Generated Pool", "Served From DB Cache"],
    ["1x Base (120 Exams)", "1,200,000", "12,000", "1,188,000"],
    ["2x (240 Exams)", "2,400,000", "24,000", "2,376,000"],
    ["3x (360 Exams)", "3,600,000", "36,000", "3,564,000"],
    ["4x (480 Exams)", "4,800,000", "48,000", "4,752,000"],
    ["5x Max (600 Exams)", "6,000,000", "60,000", "5,940,000"]
]
story.append(create_table(t7_data, [144, 144, 144, 144]))
story.append(Spacer(1, 7))

# Table 8: $35/Month Limit Database Storage Capacity (576 pt width)
story.append(Paragraph("TABLE 8: $35 / MONTH SPENDING LIMIT DATABASE STORAGE PURCHASING POWER & STUDENT CAPACITY", sec_title_style))
story.append(Spacer(1, 2))
t8_data = [
    ["Database Storage Allocation Metric", "Calculation / Unit Cost", "Effective Platform Storage", "Supported Student Scale / Limit Status"],
    ["TiDB Free Storage Allowance", "Included free in TiDB plan", "5.0 GB Storage", "Covers Baseline + ~30,000 Students ($0 Cost)"],
    ["Purchased Storage with $35/Month Budget", "$35.00 / $0.20 per GB", "+175.0 GB Paid Storage", "Adds ~218,000,000 Exam Records ($35 Cost)"],
    ["TOTAL STORAGE CAPACITY WITH $35/MONTH LIMIT", "5 GB (Free) + 175 GB (Paid)", "180.0 GB TOTAL STORAGE", "MAXIMUM STORAGE PURCHASABLE AT $35/MO"],
    ["Student Limit 1x Base (120 Exams/Yr)", "0.096 GB per 1,000 students", "180.0 GB Capacity", "UP TO 1,800,000 STUDENTS (PASS)"],
    ["Student Limit 2x (240 Exams/Yr)", "0.192 GB per 1,000 students", "180.0 GB Capacity", "UP TO 900,000 STUDENTS (PASS)"],
    ["Student Limit 3x (360 Exams/Yr)", "0.288 GB per 1,000 students", "180.0 GB Capacity", "UP TO 600,000 STUDENTS (PASS)"],
    ["Student Limit 5x Max (600 Exams/Yr)", "0.480 GB per 1,000 students", "180.0 GB Capacity", "UP TO 360,000 STUDENTS (PASS)"]
]
story.append(create_table(t8_data, [166, 115, 120, 175], is_status=True))
story.append(Spacer(1, 7))

# Conclusion Box (576 pt width)
summary_style = ParagraphStyle(
    'SummaryBoxStyle',
    parent=styles['Normal'],
    fontName='Helvetica',
    fontSize=6.5,
    leading=8.8,
    textColor=colors.HexColor('#0F172A')
)

conclusion_text = (
    "<b>FINAL CONCLUSION — $35 / MONTH (180 GB) DATABASE BUDGET FULLY COVERS:</b><br/>"
    "• <b>All 50 Textbooks &amp; Curricula:</b> Complete PDF files stored permanently (0.60 GB).<br/>"
    "• <b>All School Hierarchy &amp; Staff:</b> 100% of teacher, admin, and managerial accounts (0.01 GB — up to 5,000 teacher &amp; staff users).<br/>"
    "• <b>Full AI Question Bank &amp; Vectors:</b> Complete 768-dim embeddings and pre-cached exams (0.23 GB).<br/>"
    "• <b>Security, Logs &amp; Sessions:</b> Full audit trails, user logins, and operational settings (0.10 GB).<br/>"
    "• <b>Massive Student Capacity:</b> Sufficient capacity for <b>over 1,800,000 students taking 120 exams/year</b>, or <b>360,000 students taking 600 exams/year (5x max multiplier)</b>."
)

conclusion_table = Table([[Paragraph(conclusion_text, summary_style)]], colWidths=[576])
conclusion_table.setStyle(TableStyle([
    ('BACKGROUND', (0, 0), (-1, -1), colors.HexColor('#F8FAFC')),
    ('BOX', (0, 0), (-1, -1), 0.8, colors.HexColor('#3B82F6')),
    ('TOPPADDING', (0, 0), (-1, -1), 5),
    ('BOTTOMPADDING', (0, 0), (-1, -1), 5),
    ('LEFTPADDING', (0, 0), (-1, -1), 8),
    ('RIGHTPADDING', (0, 0), (-1, -1), 8),
]))
story.append(conclusion_table)

# Switch next page to Wide Landscape specifically for Table 12
story.append(NextPageTemplate('Landscape'))
story.append(PageBreak())

domain_header_style = ParagraphStyle(
    'DomainHeader',
    parent=styles['Normal'],
    fontName='Helvetica-Bold',
    fontSize=11,
    leading=14,
    textColor=colors.HexColor('#1E293B'),
    alignment=1
)
story.append(Paragraph("2,315 EGP (~$48 USD / YEAR)", domain_header_style))
story.append(Spacer(1, 8))

# Two-tier header row setup
t12_header_r0 = [
    "Student", "Cloud", "Domain",
    "120 exam", "", "", "",
    "240 exam", "", "", "",
    "360 exam", "", "", "",
    "480 exam", "", "", "",
    "600 Exam", "", "", ""
]

t12_header_r1 = [
    "", "", "",
    "Data cache exam", "Data cache Ai cost", "DB cost", "Total cost",
    "Data cache exam", "Data cache Ai cost", "DB cost", "Total cost",
    "Data cache exam", "Data cache Ai cost", "DB cost", "Total cost",
    "Data cache exam", "Data cache Ai cost", "DB cost", "Total cost",
    "Data cache exam", "Data cache Ai cost", "DB cost", "Total cost"
]

t12_rows = [
    [
        "10,000", "$240/Y", "2,315 EGP",
        "12,000", "$576", "$0", "$864",
        "24,000", "$806", "$0", "$1,094",
        "36,000", "$1,037", "$0", "$1,325",
        "48,000", "$1,267", "$0", "$1,555",
        "60,000", "$1,498", "$2", "$1,788"
    ],
    [
        "100,000", "$240/Y", "2,315 EGP",
        "60,000", "$1,464", "$13", "$1,765",
        "120,000", "$2,050", "$36", "$2,374",
        "180,000", "$2,635", "$60", "$2,983",
        "240,000", "$3,221", "$83", "$3,592",
        "300,000", "$3,806", "$106", "$4,200"
    ],
    [
        "500,000", "$240/Y", "2,315 EGP",
        "180,000", "$2,124", "$107", "$2,519",
        "360,000", "$2,974", "$222", "$3,484",
        "540,000", "$3,823", "$337", "$4,448",
        "720,000", "$4,673", "$452", "$5,413",
        "900,000", "$5,522", "$568", "$6,378"
    ],
    [
        "1,000,000", "$240/Y", "2,315 EGP",
        "240,000", "$2,676", "$223", "$3,187",
        "480,000", "$3,746", "$454", "$4,488",
        "720,000", "$4,817", "$684", "$5,789",
        "960,000", "$5,887", "$915", "$7,090",
        "1,200,000", "$6,958", "$1,145", "$8,391"
    ],
    [
        "2,000,000", "$360/Y", "2,315 EGP",
        "360,000", "$3,240", "$447", "$4,095",
        "720,000", "$4,536", "$908", "$5,852",
        "1,080,000", "$5,832", "$1,368", "$7,608",
        "1,440,000", "$7,128", "$1,829", "$9,365",
        "1,800,000", "$8,424", "$2,290", "$11,122"
    ],
    [
        "5,000,000", "$600/Y", "2,315 EGP",
        "600,000", "$4,200", "$1,118", "$5,966",
        "1,200,000", "$5,880", "$2,270", "$8,798",
        "1,800,000", "$7,560", "$3,421", "$11,629",
        "2,400,000", "$9,240", "$4,573", "$14,461",
        "3,000,000", "$10,920", "$5,725", "$17,293"
    ],
    [
        "10,000,000", "$1,200/Y", "2,315 EGP",
        "1,200,000", "$5,400", "$2,237", "$8,885",
        "2,400,000", "$7,560", "$4,541", "$13,349",
        "3,600,000", "$9,720", "$6,842", "$17,810",
        "4,800,000", "$11,880", "$9,146", "$22,274",
        "6,000,000", "$14,040", "$11,450", "$26,738"
    ]
]

# Convert Table 12 data into flowable paragraphs
t12_flowable = []
for r_idx, row in enumerate([t12_header_r0, t12_header_r1] + t12_rows):
    flow_row = []
    for c_idx, cell in enumerate(row):
        if r_idx in [0, 1]:
            flow_row.append(Paragraph(str(cell), cell_hdr_sm))
        else:
            flow_row.append(Paragraph(str(cell), cell_txt_sm))
    t12_flowable.append(flow_row)

# 23 columns widths: Col 0-2 (169 pt) + 5 groups of 4 cols (208 pt each) = 1,209 pt
t12_col_widths = [
    65, 48, 56,
    56, 54, 46, 52,
    56, 54, 46, 52,
    56, 54, 46, 52,
    56, 54, 46, 52,
    56, 54, 46, 52
]

t12_table = Table(t12_flowable, colWidths=t12_col_widths)
t12_table_style = [
    ('BACKGROUND', (0, 0), (-1, 1), colors.HexColor('#1E293B')),
    ('ALIGN', (0, 0), (-1, -1), 'CENTER'),
    ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
    ('GRID', (0, 0), (-1, -1), 0.4, colors.HexColor('#CBD5E1')),
    ('TOPPADDING', (0, 0), (-1, -1), 2),
    ('BOTTOMPADDING', (0, 0), (-1, -1), 2),
    # Spans for Group Headers
    ('SPAN', (0, 0), (0, 1)),  # Student
    ('SPAN', (1, 0), (1, 1)),  # Cloud
    ('SPAN', (2, 0), (2, 1)),  # Domain
    ('SPAN', (3, 0), (6, 0)),  # 120 exam
    ('SPAN', (7, 0), (10, 0)), # 240 exam
    ('SPAN', (11, 0), (14, 0)),# 360 exam
    ('SPAN', (15, 0), (18, 0)),# 480 exam
    ('SPAN', (19, 0), (22, 0)),# 600 Exam
]

for r in range(2, len(t12_flowable)):
    if r % 2 == 1:
        t12_table_style.append(('BACKGROUND', (0, r), (-1, r), colors.HexColor('#F8FAFC')))

t12_table.setStyle(TableStyle(t12_table_style))
story.append(t12_table)

doc.build(story)
print(f"SUCCESS: Generated mixed orientation PDF with Table 12 landscape at {pdf_path}")
