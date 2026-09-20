import os
import sys
import shutil
from reportlab.lib.pagesizes import A4, landscape
from reportlab.lib import colors
from reportlab.platypus import (
    SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle, HRFlowable
)
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.units import inch

# Ensure UTF-8 output
if sys.stdout.encoding != 'utf-8':
    try:
        sys.stdout.reconfigure(encoding='utf-8')
    except Exception:
        pass

def generate_pdf():
    desktop_dir = os.path.join(os.environ.get('USERPROFILE', ''), 'OneDrive', 'Desktop')
    if not os.path.exists(desktop_dir):
        desktop_dir = os.path.join(os.environ.get('USERPROFILE', ''), 'Desktop')
        if not os.path.exists(desktop_dir):
            desktop_dir = os.getcwd()

    pdf_filename = 'AI_AND_TIDB_COST_TABLES.pdf'
    pdf_path_project = os.path.join(os.getcwd(), pdf_filename)
    pdf_path_desktop = os.path.join(desktop_dir, pdf_filename)
    public_dir = os.path.join(os.getcwd(), 'client', 'public')
    os.makedirs(public_dir, exist_ok=True)
    pdf_path_public = os.path.join(public_dir, pdf_filename)

    # Use landscape A4 for wide, beautiful tables
    doc = SimpleDocTemplate(
        pdf_path_project,
        pagesize=landscape(A4),
        leftMargin=24,
        rightMargin=24,
        topMargin=20,
        bottomMargin=20
    )

    styles = getSampleStyleSheet()

    # Color Palette
    c_navy = colors.HexColor('#0F2942')
    c_blue = colors.HexColor('#1D4ED8')
    c_dark = colors.HexColor('#0F172A')
    c_slate = colors.HexColor('#475569')
    c_green = colors.HexColor('#15803D')
    c_green_bg = colors.HexColor('#DCFCE7')
    c_green_border = colors.HexColor('#86EFAC')
    c_red = colors.HexColor('#DC2626')
    c_light = colors.HexColor('#F8FAFC')
    c_border = colors.HexColor('#CBD5E1')

    # Typography
    t_title = ParagraphStyle('TTitle', parent=styles['Normal'], fontName='Helvetica-Bold', fontSize=14, leading=16, textColor=c_navy)
    t_sub = ParagraphStyle('TSub', parent=styles['Normal'], fontName='Helvetica', fontSize=8, leading=10, textColor=c_slate)
    t_sec = ParagraphStyle('TSec', parent=styles['Normal'], fontName='Helvetica-Bold', fontSize=10.5, leading=12, textColor=c_navy)
    t_note = ParagraphStyle('TNote', parent=styles['Normal'], fontName='Helvetica', fontSize=7.5, leading=9.5, textColor=c_slate)

    # Table cell styles
    th_style = ParagraphStyle('TH', parent=styles['Normal'], fontName='Helvetica-Bold', fontSize=7.5, leading=9, textColor=colors.white, alignment=1)
    th_curr_style = ParagraphStyle('THC', parent=styles['Normal'], fontName='Helvetica-Bold', fontSize=7.5, leading=9, textColor=colors.white, alignment=1)
    td_normal = ParagraphStyle('TD', parent=styles['Normal'], fontName='Helvetica', fontSize=7.2, leading=8.5, textColor=c_dark, alignment=1)
    td_bold = ParagraphStyle('TDB', parent=styles['Normal'], fontName='Helvetica-Bold', fontSize=7.2, leading=8.5, textColor=c_dark, alignment=1)
    td_green = ParagraphStyle('TDG', parent=styles['Normal'], fontName='Helvetica-Bold', fontSize=7.5, leading=9, textColor=c_green, alignment=1)
    td_red = ParagraphStyle('TDR', parent=styles['Normal'], fontName='Helvetica-Bold', fontSize=7.2, leading=8.5, textColor=c_red, alignment=1)

    story = []

    # Title & Subtitle
    story.append(Paragraph("<b>PLATFORM INFRASTRUCTURE COST ANALYSIS (0 TO 1,000,000 STUDENTS)</b>", t_title))
    story.append(Paragraph("Comparative Cost Matrix: AI Engine Models vs. TiDB Cloud Serverless Database | Strictly Two Core Tables", t_sub))
    story.append(Spacer(1, 6))

    # Clarification Callout Note
    clarification_text = (
        "<b>CLARIFICATION ON AI COST ($1,030 vs. &lt;$5.00):</b> "
        "The <b>$1,030/mo</b> figure represented a theoretical worst-case where 5% of 10,000,000 quizzes (500,000 live API calls) bypass cache and hit live Gemini every month. "
        "The <b>&lt;$5.00/mo</b> figure represents our actual TiDB Question Bank architecture: the Egyptian curriculum is finite (~300 chapters). "
        "Once questions are generated into TiDB, 1,000,000 students take quizzes directly from the database without invoking live Gemini API calls."
    )
    story.append(Paragraph(clarification_text, t_note))
    story.append(Spacer(1, 6))

    # =========================================================================
    # TABLE 1: AI COST (CURRENT PLAN VS OTHER MODELS)
    # =========================================================================
    story.append(Paragraph("<b>TABLE 1: AI ENGINE MONTHLY COST SCALE (OUR CURRENT PLAN vs. OTHER AI MODELS)</b>", t_sec))
    story.append(Spacer(1, 3))

    table1_data = [
        [
            Paragraph("<b>Scale<br/>(Active Students)</b>", th_style),
            Paragraph("<b>Monthly Quizzes<br/>(10 / Student)</b>", th_style),
            Paragraph("<b>OUR CURRENT PLAN<br/>Gemini 1.5 Flash + DB Cache</b>", th_curr_style),
            Paragraph("<b>Gemini 1.5 Flash<br/>100% Live (No Cache)</b>", th_style),
            Paragraph("<b>OpenAI GPT-4o mini<br/>100% Live AI</b>", th_style),
            Paragraph("<b>Gemini 1.5 Pro<br/>100% Live AI</b>", th_style),
            Paragraph("<b>OpenAI GPT-4o (Full)<br/>100% Live AI</b>", th_style),
            Paragraph("<b>Claude 3.5 Sonnet<br/>100% Live AI</b>", th_style)
        ],
        [
            Paragraph("0 – 1,000 (Launch)", td_bold),
            Paragraph("10,000", td_normal),
            Paragraph("<b>$0.00 / mo</b><br/><font size=5.5 color='#15803D'>(Free Tier)</font>", td_green),
            Paragraph("$25.00", td_normal),
            Paragraph("$51.00", td_normal),
            Paragraph("$425.00", td_normal),
            Paragraph("$850.00", td_normal),
            Paragraph("$1,150.00", td_normal),
        ],
        [
            Paragraph("10,000 Students", td_bold),
            Paragraph("100,000", td_normal),
            Paragraph("<b>$0.00 / mo</b><br/><font size=5.5 color='#15803D'>(Served from DB)</font>", td_green),
            Paragraph("$250.00", td_normal),
            Paragraph("$510.00", td_normal),
            Paragraph("$4,250.00", td_normal),
            Paragraph("$8,500.00", td_normal),
            Paragraph("$11,500.00", td_normal),
        ],
        [
            Paragraph("50,000 Students", td_bold),
            Paragraph("500,000", td_normal),
            Paragraph("<b>&lt; $1.00 / mo</b>", td_green),
            Paragraph("$1,250.00", td_normal),
            Paragraph("$2,550.00", td_normal),
            Paragraph("$21,250.00", td_red),
            Paragraph("$42,500.00", td_red),
            Paragraph("$57,500.00", td_red),
        ],
        [
            Paragraph("100,000 Students", td_bold),
            Paragraph("1,000,000", td_normal),
            Paragraph("<b>&lt; $2.00 / mo</b>", td_green),
            Paragraph("$2,500.00", td_normal),
            Paragraph("$5,100.00", td_normal),
            Paragraph("$42,500.00", td_red),
            Paragraph("$85,000.00", td_red),
            Paragraph("$115,000.00", td_red),
        ],
        [
            Paragraph("250,000 Students", td_bold),
            Paragraph("2,500,000", td_normal),
            Paragraph("<b>&lt; $3.50 / mo</b>", td_green),
            Paragraph("$6,250.00", td_normal),
            Paragraph("$12,750.00", td_red),
            Paragraph("$106,250.00", td_red),
            Paragraph("$212,500.00", td_red),
            Paragraph("$287,500.00", td_red),
        ],
        [
            Paragraph("500,000 Students", td_bold),
            Paragraph("5,000,000", td_normal),
            Paragraph("<b>&lt; $4.50 / mo</b>", td_green),
            Paragraph("$12,500.00", td_red),
            Paragraph("$25,500.00", td_red),
            Paragraph("$212,500.00", td_red),
            Paragraph("$425,000.00", td_red),
            Paragraph("$575,000.00", td_red),
        ],
        [
            Paragraph("<b>1,000,000 (1 Million)</b>", td_bold),
            Paragraph("<b>10,000,000</b>", td_bold),
            Paragraph("<b>&lt; $5.00 / mo</b><br/><font size=5.5 color='#15803D'>(Max $1,030 if 5% dynamic)</font>", td_green),
            Paragraph("<b>$25,000.00 / mo</b>", td_red),
            Paragraph("<b>$51,000.00 / mo</b>", td_red),
            Paragraph("<b>$425,000.00 / mo</b>", td_red),
            Paragraph("<b>$850,000.00 / mo</b>", td_red),
            Paragraph("<b>$1,150,000.00 / mo</b>", td_red),
        ],
    ]

    col_w1 = [90, 80, 130, 85, 85, 85, 90, 95]
    t1 = Table(table1_data, colWidths=col_w1)
    t1.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor('#1E293B')),
        ('BACKGROUND', (2, 0), (2, 0), colors.HexColor('#1D4ED8')),
        ('BACKGROUND', (2, 1), (2, -1), colors.HexColor('#DCFCE7')),
        ('BACKGROUND', (0, -1), (-1, -1), colors.HexColor('#F0FDF4')),
        ('ALIGN', (0, 0), (-1, -1), 'CENTER'),
        ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
        ('GRID', (0, 0), (-1, -1), 0.5, c_border),
        ('BOX', (2, 0), (2, -1), 1.5, colors.HexColor('#16A34A')),
        ('TOPPADDING', (0, 0), (-1, -1), 3),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 3),
    ]))
    story.append(t1)
    story.append(Spacer(1, 10))

    # =========================================================================
    # TABLE 2: TIDB DATABASE COST
    # =========================================================================
    story.append(Paragraph("<b>TABLE 2: TIDB CLOUD DATABASE MONTHLY COST SCALE (0 TO 1,000,000 STUDENTS)</b>", t_sec))
    story.append(Paragraph("Official TiDB Cloud Serverless Rates: <b>5 GiB Storage + 50M Request Units (RU) FREE each month</b>. Overages: $0.25/GiB storage, $0.10 per 1M RU.", t_sub))
    story.append(Spacer(1, 3))

    table2_data = [
        [
            Paragraph("<b>Scale<br/>(Active Students)</b>", th_style),
            Paragraph("<b>Estimated Storage<br/>(Books + History)</b>", th_style),
            Paragraph("<b>Monthly Request<br/>Units (RU)</b>", th_style),
            Paragraph("<b>TiDB Free Tier<br/>Coverage Status</b>", th_style),
            Paragraph("<b>Storage Overage<br/>Cost ($)</b>", th_style),
            Paragraph("<b>Compute (RU)<br/>Cost ($)</b>", th_style),
            Paragraph("<b>TOTAL TIDB<br/>MONTHLY COST ($)</b>", th_curr_style),
            Paragraph("<b>Equivalent in<br/>EGP (~50 EGP/$)</b>", th_style),
        ],
        [
            Paragraph("0 – 1,000 (Launch)", td_bold),
            Paragraph("0.4 GB", td_normal),
            Paragraph("~250,000 RU", td_normal),
            Paragraph("<b>100% Free Quota</b>", td_green),
            Paragraph("$0.00", td_normal),
            Paragraph("$0.00", td_normal),
            Paragraph("<b>$0.00 / mo</b>", td_green),
            Paragraph("0 EGP", td_normal),
        ],
        [
            Paragraph("10,000 Students", td_bold),
            Paragraph("0.8 GB", td_normal),
            Paragraph("~1,800,000 RU", td_normal),
            Paragraph("<b>100% Free Quota</b>", td_green),
            Paragraph("$0.00", td_normal),
            Paragraph("$0.00", td_normal),
            Paragraph("<b>$0.00 / mo</b>", td_green),
            Paragraph("0 EGP", td_normal),
        ],
        [
            Paragraph("50,000 Students", td_bold),
            Paragraph("2.5 GB", td_normal),
            Paragraph("~9,000,000 RU", td_normal),
            Paragraph("<b>100% Free Quota</b>", td_green),
            Paragraph("$0.00", td_normal),
            Paragraph("$0.00", td_normal),
            Paragraph("<b>$0.00 / mo</b>", td_green),
            Paragraph("0 EGP", td_normal),
        ],
        [
            Paragraph("100,000 Students", td_bold),
            Paragraph("4.8 GB", td_normal),
            Paragraph("~18,500,000 RU", td_normal),
            Paragraph("<b>100% Free Quota</b><br/><font size=5 color='#15803D'>(&lt;5GB &amp; &lt;50M RU)</font>", td_green),
            Paragraph("$0.00", td_normal),
            Paragraph("$0.00", td_normal),
            Paragraph("<b>$0.00 / mo</b>", td_green),
            Paragraph("0 EGP", td_normal),
        ],
        [
            Paragraph("250,000 Students", td_bold),
            Paragraph("10.5 GB", td_normal),
            Paragraph("~45,000,000 RU", td_normal),
            Paragraph("5 GB Free + 50M RU Free", td_normal),
            Paragraph("$1.38 (5.5 GB paid)", td_normal),
            Paragraph("$0.00 (under 50M RU)", td_green),
            Paragraph("<b>~$1.38 / mo</b>", td_green),
            Paragraph("~69 EGP / mo", td_normal),
        ],
        [
            Paragraph("500,000 Students", td_bold),
            Paragraph("21.0 GB", td_normal),
            Paragraph("~92,000,000 RU", td_normal),
            Paragraph("5 GB Free + 50M RU Free", td_normal),
            Paragraph("$4.00 (16 GB paid)", td_normal),
            Paragraph("$4.20 (42M RU paid)", td_normal),
            Paragraph("<b>~$8.20 / mo</b>", td_green),
            Paragraph("~410 EGP / mo", td_normal),
        ],
        [
            Paragraph("<b>1,000,000 (1 Million)</b>", td_bold),
            Paragraph("<b>38.5 GB</b>", td_bold),
            Paragraph("<b>~185,000,000 RU</b>", td_bold),
            Paragraph("5 GB Free + 50M RU Free", td_normal),
            Paragraph("$8.38 (33.5 GB paid)", td_normal),
            Paragraph("$13.50 (135M RU paid)", td_normal),
            Paragraph("<b>~$21.88 / mo</b>", td_green),
            Paragraph("<b>~1,094 EGP / mo</b>", td_bold),
        ],
    ]

    col_w2 = [95, 90, 95, 110, 85, 85, 95, 85]
    t2 = Table(table2_data, colWidths=col_w2)
    t2.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor('#1E293B')),
        ('BACKGROUND', (6, 0), (6, 0), colors.HexColor('#1D4ED8')),
        ('BACKGROUND', (6, 1), (6, -1), colors.HexColor('#DCFCE7')),
        ('BACKGROUND', (0, -1), (-1, -1), colors.HexColor('#F0FDF4')),
        ('ALIGN', (0, 0), (-1, -1), 'CENTER'),
        ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
        ('GRID', (0, 0), (-1, -1), 0.5, c_border),
        ('BOX', (6, 0), (6, -1), 1.5, colors.HexColor('#16A34A')),
        ('TOPPADDING', (0, 0), (-1, -1), 3),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 3),
    ]))
    story.append(t2)
    story.append(Spacer(1, 8))

    # Final Total Summary Line
    total_summary = (
        "<b>COMBINED INFRASTRUCTURE MONTHLY COST AT 1,000,000 STUDENTS:</b> "
        "AI Engine (<b>&lt;$5.00/mo</b>) + TiDB Cloud Database (<b>~$21.88/mo</b>) = "
        "<b>~$26.88 / Month Total (~1,344 EGP / Month)</b>. "
        "This achieves a <b>99.89% cost reduction</b> compared to unoptimized architectures."
    )
    story.append(Paragraph(total_summary, ParagraphStyle('TSummary', parent=styles['Normal'], fontName='Helvetica-Bold', fontSize=8, leading=10, textColor=c_navy, alignment=1)))

    doc.build(story)

    # Copy to Desktop and client/public
    try:
        shutil.copyfile(pdf_path_project, pdf_path_desktop)
        print(f"✅ Saved to Desktop: {pdf_path_desktop}")
    except Exception as e:
        print(f"Warning Desktop copy: {e}")

    try:
        shutil.copyfile(pdf_path_project, pdf_path_public)
        print(f"✅ Saved to client/public: {pdf_path_public}")
    except Exception as e:
        print(f"Warning public copy: {e}")

    print(f"✅ Generated Project PDF: {pdf_path_project}")

if __name__ == '__main__':
    generate_pdf()
