import os
from reportlab.lib import colors
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle

pdf_path = r"C:\Users\eyadsherif\OneDrive\Desktop\Table_12_Comprehensive_Cost_Matrix.pdf"
fallback_pdf_path = r"C:\Users\eyadsherif\OneDrive\Desktop\Table_12_Comprehensive_Cost_Matrix_Updated.pdf"

target_path = pdf_path
try:
    with open(pdf_path, 'a'):
        pass
except (IOError, PermissionError):
    target_path = fallback_pdf_path

doc = SimpleDocTemplate(
    target_path,
    pagesize=(1260, 612),
    leftMargin=18,
    rightMargin=18,
    topMargin=22,
    bottomMargin=18
)

styles = getSampleStyleSheet()

title_style = ParagraphStyle(
    'DocTitle',
    parent=styles['Normal'],
    fontName='Helvetica-Bold',
    fontSize=13,
    leading=16,
    textColor=colors.HexColor('#0F172A'),
    alignment=1
)

sub_style = ParagraphStyle(
    'DocSubtitle',
    parent=styles['Normal'],
    fontName='Helvetica-Bold',
    fontSize=8,
    leading=10,
    textColor=colors.HexColor('#475569'),
    alignment=1
)

sec_title_style = ParagraphStyle(
    'SectionHeader',
    parent=styles['Normal'],
    fontName='Helvetica-Bold',
    fontSize=9,
    leading=11.5,
    textColor=colors.HexColor('#1E293B'),
    alignment=1
)

cell_hdr_sm = ParagraphStyle(
    'CellHdrSm',
    parent=styles['Normal'],
    fontName='Helvetica-Bold',
    fontSize=6.2,
    leading=7.8,
    textColor=colors.white,
    alignment=1
)

cell_txt_sm = ParagraphStyle(
    'CellTxtSm',
    parent=styles['Normal'],
    fontName='Helvetica',
    fontSize=6.0,
    leading=7.4,
    textColor=colors.HexColor('#0F172A'),
    alignment=1
)

note_style = ParagraphStyle(
    'NoteStyle',
    parent=styles['Normal'],
    fontName='Helvetica',
    fontSize=6.8,
    leading=9.2,
    textColor=colors.HexColor('#334155')
)

domain_header_style = ParagraphStyle(
    'DomainHeader',
    parent=styles['Normal'],
    fontName='Helvetica-Bold',
    fontSize=11,
    leading=14,
    textColor=colors.HexColor('#1E293B'),
    alignment=1
)

story = []
story.append(Paragraph("2,315 EGP (~$48 USD / YEAR)", domain_header_style))
story.append(Spacer(1, 10))

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
        "4,800,000", "$21,600" if False else "$11,880", "$9,146", "$22,274",
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
    ('GRID', (0, 0), (-1, -1), 0.5, colors.HexColor('#CBD5E1')),
    ('TOPPADDING', (0, 0), (-1, -1), 4),
    ('BOTTOMPADDING', (0, 0), (-1, -1), 4),
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
story.append(Spacer(1, 14))

# Explanatory Notes Box
notes_html = (
    "<b>EXPLANATORY ARCHITECTURAL &amp; COST NOTES:</b><br/>"
    "• <b>100% Annualized Calculations:</b> All figures (Cloud, Domain, AI Cost, DB Cost, and Total Cost) are fully calculated per year (365 days).<br/>"
    "• <b>Cloud Server (Vercel):</b> Standard Pro seat ($20/M = $240/Y) covers up to 1,000,000 students. For 10,000,000 students, high API execution volume and bandwidth overages result in ~$100/M ($1,200/Y).<br/>"
    "• <b>Domain Name:</b> Fixed across all student tiers at 2,315 EGP/year (~$48 USD/year).<br/>"
    "• <b>Data Cache AI Cost (+40% Scaling Rule):</b> Base 120x for 10k students begins at $48/mo ($576/yr). Doubling exams to 240x adds +40% ($67.20/mo = $806/yr) due to smart question reuse &amp; vector caching.<br/>"
    "• <b>Database Cost (TiDB Serverless):</b> 10,000 students fit 100% within the free 5 GB tier ($0/yr). Larger tiers scale on demand with exact storage used ($0.20/GB/month)."
)

notes_table = Table([[Paragraph(notes_html, note_style)]], colWidths=[1209])
notes_table.setStyle(TableStyle([
    ('BACKGROUND', (0, 0), (-1, -1), colors.HexColor('#F1F5F9')),
    ('BOX', (0, 0), (-1, -1), 0.8, colors.HexColor('#3B82F6')),
    ('TOPPADDING', (0, 0), (-1, -1), 8),
    ('BOTTOMPADDING', (0, 0), (-1, -1), 8),
    ('LEFTPADDING', (0, 0), (-1, -1), 12),
    ('RIGHTPADDING', (0, 0), (-1, -1), 12),
]))
story.append(notes_table)

doc.build(story)
print(f"SUCCESS: Generated standalone Table 12 PDF at {target_path}")
