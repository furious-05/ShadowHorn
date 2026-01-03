"""Professional PDF Report Generator for ShadowHorn Intelligence Reports"""

from reportlab.lib.pagesizes import letter, A4
from reportlab.lib import colors
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.units import inch, mm
from reportlab.lib.enums import TA_CENTER, TA_LEFT, TA_RIGHT, TA_JUSTIFY
from reportlab.platypus import (
    SimpleDocTemplate, Table, TableStyle, Paragraph, Spacer, PageBreak,
    Image, Flowable, KeepTogether, PageTemplate, BaseDocTemplate, Frame
)
from reportlab.pdfgen import canvas
from datetime import datetime
from io import BytesIO

# === COLOR SCHEME ===
PRIMARY_CYAN = colors.HexColor("#00B4C8")
# Use fully black background for pages, while retaining dark gray accents
DARK_BG = colors.HexColor("#000000")
TEXT_LIGHT = colors.HexColor("#F0F4F7")
ACCENT_CYAN = colors.HexColor("#64C8FF")
DARK_GRAY = colors.HexColor("#1E2734")
DARKER_GRAY = colors.HexColor("#0F1419")
RISK_HIGH = colors.HexColor("#FF5C5C")
RISK_MEDIUM = colors.HexColor("#FFB84D")
RISK_LOW = colors.HexColor("#4CAF50")

class RhineDecoration(Flowable):
    """Custom Flowable for Rhine-style decorative lines"""
    def __init__(self, width, height=2, color=PRIMARY_CYAN, style="solid"):
        Flowable.__init__(self)
        self.width = width
        self.height = height
        self.color = color
        self.style = style
    
    def draw(self):
        if self.style == "solid":
            self.canv.setFillColor(self.color)
            self.canv.rect(0, 0, self.width, self.height, fill=1, stroke=0)
        elif self.style == "dashed":
            self.canv.setStrokeColor(self.color)
            self.canv.setLineWidth(1.5)
            dash_width = 8
            gap_width = 4
            x = 0
            while x < self.width:
                self.canv.line(x, self.height/2, min(x + dash_width, self.width), self.height/2)
                x += dash_width + gap_width
        elif self.style == "accent":
            # Gradient-like effect with multiple lines
            self.canv.setFillColor(PRIMARY_CYAN)
            self.canv.rect(0, 0.6, self.width, 1.2, fill=1, stroke=0)
            self.canv.setFillColor(ACCENT_CYAN)
            self.canv.rect(0, 0, self.width, 0.6, fill=1, stroke=0)

class PageDecorationTemplate(PageTemplate):
    """Page template with Rhine decorations"""
    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
    
    def beforeDrawPage(self, canvas, doc):
        # Full-page dark background for proper contrast with light text
        canvas.saveState()
        canvas.setFillColor(DARK_BG)
        canvas.rect(0, 0, letter[0], letter[1], fill=1, stroke=0)

        # Top Rhine line
        canvas.setFillColor(PRIMARY_CYAN)
        canvas.rect(0, letter[1] - 10, letter[0], 8, fill=1, stroke=0)
        
        # Bottom Rhine line
        canvas.rect(0, 0, letter[0], 8, fill=1, stroke=0)
        
        # Side accent
        canvas.setFillColor(DARKER_GRAY)
        canvas.rect(0, 0, 12, letter[1], fill=1, stroke=0)
        canvas.restoreState()

def get_professional_styles():
    """Create professional paragraph styles"""
    styles = getSampleStyleSheet()
    
    # Modify existing Normal style for dark theme
    styles['Normal'].textColor = TEXT_LIGHT
    styles['Normal'].fontName = 'Helvetica'
    
    # Modify existing BodyText if it exists, otherwise create custom one
    body_style = None
    if 'BodyText' in styles:
        styles['BodyText'].textColor = TEXT_LIGHT
        styles['BodyText'].fontSize = 11
        styles['BodyText'].leading = 14
        styles['BodyText'].alignment = TA_JUSTIFY
        body_style = styles['BodyText']
    
    # Title style
    styles.add(ParagraphStyle(
        name='CustomTitle',
        parent=styles['Heading1'],
        fontSize=36,
        textColor=PRIMARY_CYAN,
        spaceAfter=12,
        alignment=TA_CENTER,
        fontName='Helvetica-Bold',
        leading=42
    ))
    
    # Subtitle style
    styles.add(ParagraphStyle(
        name='CustomSubtitle',
        parent=styles['Normal'],
        fontSize=14,
        textColor=ACCENT_CYAN,
        spaceAfter=6,
        alignment=TA_CENTER,
        fontName='Helvetica'
    ))
    
    # Heading 1 style (section headers)
    styles.add(ParagraphStyle(
        name='SectionHeader',
        parent=styles['Heading1'],
        fontSize=18,
        textColor=PRIMARY_CYAN,
        spaceAfter=12,
        spaceBefore=12,
        fontName='Helvetica-Bold',
        borderColor=PRIMARY_CYAN,
        borderWidth=2,
        borderPadding=8,
        leading=22
    ))
    
    # Heading 2 style (subsections)
    styles.add(ParagraphStyle(
        name='SubsectionHeader',
        parent=styles['Heading2'],
        fontSize=14,
        textColor=ACCENT_CYAN,
        spaceAfter=8,
        spaceBefore=8,
        fontName='Helvetica-Bold',
        leading=16
    ))
    
    # Body text - create custom version
    styles.add(ParagraphStyle(
        name='CustomBodyText',
        parent=styles['Normal'],
        fontSize=11,
        textColor=TEXT_LIGHT,
        spaceAfter=8,
        alignment=TA_JUSTIFY,
        fontName='Helvetica',
        leading=14
    ))
    
    # Key-value style
    styles.add(ParagraphStyle(
        name='KeyValue',
        parent=styles['Normal'],
        fontSize=10,
        textColor=TEXT_LIGHT,
        fontName='Helvetica',
        leading=12
    ))
    
    # Label style
    styles.add(ParagraphStyle(
        name='Label',
        parent=styles['Normal'],
        fontSize=9,
        textColor=ACCENT_CYAN,
        fontName='Helvetica-Bold',
        leading=11
    ))
    
    # Risk level styles
    styles.add(ParagraphStyle(
        name='RiskHigh',
        parent=styles['Normal'],
        fontSize=10,
        textColor=RISK_HIGH,
        fontName='Helvetica-Bold'
    ))
    
    styles.add(ParagraphStyle(
        name='RiskMedium',
        parent=styles['Normal'],
        fontSize=10,
        textColor=RISK_MEDIUM,
        fontName='Helvetica-Bold'
    ))
    
    styles.add(ParagraphStyle(
        name='RiskLow',
        parent=styles['Normal'],
        fontSize=10,
        textColor=RISK_LOW,
        fontName='Helvetica-Bold'
    ))
    
    return styles

def create_cover_page(identifier, report, styles):
    """Create professional cover page"""
    elements = []
    body_style = styles.get('CustomBodyText') or styles.get('BodyText') or styles['Normal']
    
    # Top spacing
    elements.append(Spacer(1, 0.5*inch))
    
    # Title
    elements.append(Paragraph("INTELLIGENCE REPORT", styles['CustomTitle']))
    
    # Rhine decoration
    elements.append(Spacer(1, 0.2*inch))
    rhine = RhineDecoration(7*inch, 3, PRIMARY_CYAN, "accent")
    elements.append(rhine)
    
    # Subject & profile type
    elements.append(Spacer(1, 0.3*inch))
    meta = report.get('meta', {})
    display_name = meta.get('name') or identifier
    profile_type = meta.get('profile_type') or 'Profile'
    elements.append(Paragraph(f"Subject: <b>{display_name}</b> &mdash; {profile_type}", styles['CustomSubtitle']))
    
    # Metadata table
    elements.append(Spacer(1, 0.4*inch))
    
    report_date = datetime.now().strftime("%B %d, %Y")
    report_time = datetime.now().strftime("%H:%M:%S UTC")
    
    compromised = bool(meta.get('compromised'))
    mode = meta.get('collection_mode') or 'standard'
    metadata = [
        ["Report Date", report_date],
        ["Report Time", report_time],
        ["Report Type", "Comprehensive Intelligence Analysis"],
        ["Collection Mode", mode.title()],
        ["Compromise Status", "COMPROMISED" if compromised else "Not Compromised"],
    ]
    
    metadata_table = Table(metadata, colWidths=[2*inch, 4*inch])
    metadata_table.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (0, -1), DARK_GRAY),
        ('BACKGROUND', (1, 0), (1, -1), DARKER_GRAY),
        ('TEXTCOLOR', (0, 0), (-1, -1), TEXT_LIGHT),
        ('ALIGN', (0, 0), (0, -1), 'LEFT'),
        ('ALIGN', (1, 0), (1, -1), 'LEFT'),
        ('FONTNAME', (0, 0), (0, -1), 'Helvetica-Bold'),
        ('FONTSIZE', (0, 0), (-1, -1), 11),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 8),
        ('TOPPADDING', (0, 0), (-1, -1), 8),
        ('LEFTPADDING', (0, 0), (-1, -1), 12),
        ('RIGHTPADDING', (0, 0), (-1, -1), 12),
        ('GRID', (0, 0), (-1, -1), 1, ACCENT_CYAN),
        ('BORDER', (0, 0), (-1, -1), 2, PRIMARY_CYAN),
    ]))
    elements.append(metadata_table)
    
    # Executive summary preview
    elements.append(Spacer(1, 0.5*inch))
    elements.append(Paragraph("EXECUTIVE SUMMARY", styles['SectionHeader']))
    
    executive_summary = report.get('executive_summary', {})
    summary_text = executive_summary.get('summary', 'No summary available')
    elements.append(Paragraph(summary_text[:300] + "...", body_style))
    
    elements.append(Spacer(1, 0.3*inch))
    
    # Risk level badge
    risk_level = executive_summary.get('risk_level', 'Unknown')
    risk_color = RISK_HIGH if risk_level == 'High' else (RISK_MEDIUM if risk_level == 'Medium' else RISK_LOW)
    
    # Get hex color value properly
    risk_hex = risk_color.hexval() if hasattr(risk_color, 'hexval') else str(risk_color)
    if risk_hex.startswith('#x'):
        risk_hex = '#' + risk_hex[2:]  # Fix #x prefix to just #
    
    elements.append(Paragraph(f"Overall Risk Level: <font color='{risk_hex}'><b>{risk_level}</b></font>", body_style))
    
    elements.append(PageBreak())
    
    return elements

def create_toc(report, styles):
    """Create table of contents"""
    elements = []
    body_style = styles.get('CustomBodyText') or styles.get('BodyText') or styles['Normal']
    
    elements.append(Paragraph("TABLE OF CONTENTS", styles['SectionHeader']))
    elements.append(Spacer(1, 0.2*inch))
    
    sections = [
        "1. Executive Summary",
        "2. Subject Profile",
        "3. Digital Footprint Analysis",
        "4. Platform Presence",
        "5. Repository Analysis",
        "6. Relationship Network",
        "7. Activity Timeline",
        "8. Attack Surface Assessment",
        "9. Threat Analysis",
        "10. Indicators of Compromise",
        "11. Recommendations",
        "12. Investigation Pivots",
    ]
    
    for section in sections:
        elements.append(Paragraph(f"• {section}", body_style))
        elements.append(Spacer(1, 0.08*inch))
    
    elements.append(PageBreak())
    
    return elements

def create_metrics_dashboard(report, styles):
    """Create KPI metrics dashboard"""
    elements = []
    
    elements.append(Paragraph("KEY METRICS", styles['SectionHeader']))
    elements.append(Spacer(1, 0.15*inch))
    
    # Extract metrics
    counts = report.get('counts', {})
    identifiers_count = counts.get('identifiers', 0)
    platforms_count = counts.get('platforms', 0)
    repos_count = counts.get('repositories', 0)
    total_stars = counts.get('total_stars', 0)
    
    # Create metrics grid using Paragraphs so formatting is rendered correctly
    from reportlab.lib.styles import ParagraphStyle

    metric_style = ParagraphStyle(
        name="MetricCell",
        parent=styles['Normal'],
        fontSize=14,
        leading=16,
        textColor=PRIMARY_CYAN,
        alignment=TA_CENTER,
        fontName='Helvetica-Bold',
    )

    metrics_data = [[
        Paragraph(f"<b>{identifiers_count}</b><br/>Usernames", metric_style),
        Paragraph(f"<b>{platforms_count}</b><br/>Platforms", metric_style),
        Paragraph(f"<b>{repos_count}</b><br/>Repositories", metric_style),
        Paragraph(f"<b>{total_stars}</b><br/>Stars", metric_style),
    ]]
    
    metrics_table = Table(metrics_data, colWidths=[1.5*inch, 1.5*inch, 1.5*inch, 1.5*inch])
    metrics_table.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (-1, -1), DARK_GRAY),
        ('TEXTCOLOR', (0, 0), (-1, -1), PRIMARY_CYAN),
        ('ALIGN', (0, 0), (-1, -1), 'CENTER'),
        ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
        ('FONTNAME', (0, 0), (-1, -1), 'Helvetica-Bold'),
        ('FONTSIZE', (0, 0), (-1, -1), 14),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 16),
        ('TOPPADDING', (0, 0), (-1, -1), 16),
        ('BORDER', (0, 0), (-1, -1), 2, PRIMARY_CYAN),
        ('GRID', (0, 0), (-1, -1), 1, ACCENT_CYAN),
    ]))
    elements.append(metrics_table)
    elements.append(Spacer(1, 0.2*inch))

    # Quick textual summary under metrics
    meta = report.get('meta', {})
    name = meta.get('name') or meta.get('identifier') or 'Subject'
    profile_type = meta.get('profile_type') or 'profile'
    compromised = bool(meta.get('compromised'))
    status_text = "compromised" if compromised else "not compromised"
    summary_line = f"{name} appears to be a {profile_type} with {platforms_count} visible platform(s) and {repos_count} code repositories; accounts are {status_text}."
    body_style = styles.get('CustomBodyText') or styles.get('BodyText') or styles['Normal']
    elements.append(Paragraph(summary_line, body_style))
    
    return elements

def create_data_section(title, data_list, styles):
    """Create a professional data section"""
    elements = []
    body_style = styles.get('CustomBodyText') or styles.get('BodyText') or styles['Normal']
    
    elements.append(Paragraph(title, styles['SectionHeader']))
    
    if not data_list:
        elements.append(Paragraph("No data available", body_style))
        return elements
    
    # Create table data
    table_data = []
    for item in data_list[:10]:  # Limit to 10 items
        if isinstance(item, dict):
            row = []
            for key, value in list(item.items())[:2]:
                row.append(f"<b>{key}:</b> {str(value)[:50]}")
            if row:
                table_data.append(row)
        else:
            table_data.append([str(item)])
    
    if table_data:
        table = Table(table_data, colWidths=[3.25*inch, 3.25*inch])
        table.setStyle(TableStyle([
            ('BACKGROUND', (0, 0), (-1, -1), DARKER_GRAY),
            ('TEXTCOLOR', (0, 0), (-1, -1), TEXT_LIGHT),
            ('ALIGN', (0, 0), (-1, -1), 'LEFT'),
            ('VALIGN', (0, 0), (-1, -1), 'TOP'),
            ('FONTNAME', (0, 0), (-1, -1), 'Helvetica'),
            ('FONTSIZE', (0, 0), (-1, -1), 10),
            ('BOTTOMPADDING', (0, 0), (-1, -1), 8),
            ('TOPPADDING', (0, 0), (-1, -1), 8),
            ('LEFTPADDING', (0, 0), (-1, -1), 10),
            ('RIGHTPADDING', (0, 0), (-1, -1), 10),
            ('GRID', (0, 0), (-1, -1), 1, ACCENT_CYAN),
            ('BORDER', (0, 0), (-1, -1), 1, PRIMARY_CYAN),
            ('ROWBACKGROUNDS', (0, 0), (-1, -1), [DARKER_GRAY, DARK_GRAY]),
        ]))
        elements.append(table)
    
    elements.append(Spacer(1, 0.15*inch))
    
    return elements

def create_narrative_section(title, text, styles):
    """Create narrative text section"""
    elements = []
    
    body_style = styles.get('CustomBodyText') or styles.get('BodyText') or styles['Normal']
    elements.append(Paragraph(title, styles['SectionHeader']))
    elements.append(Paragraph(text, body_style))
    elements.append(Spacer(1, 0.15*inch))
    
    return elements

def build_pdf_bytes(report):
    """Build complete professional PDF report"""
    # Extract identifier from report metadata
    identifier = report.get('meta', {}).get('identifier') or report.get('meta', {}).get('name') or 'Intelligence_Report'
    
    buffer = BytesIO()
    
    # Create document with custom page template
    doc = BaseDocTemplate(
        buffer,
        pagesize=letter,
        rightMargin=0.5*inch,
        leftMargin=0.5*inch,
        topMargin=0.5*inch,
        bottomMargin=0.5*inch,
    )
    
    # Add page template with decorations
    template = PageDecorationTemplate(
        id='normal',
        frames=[Frame(
            0.5*inch,
            0.5*inch,
            letter[0] - 1*inch,
            letter[1] - 1*inch,
            id='normal_frame'
        )]
    )
    doc.addPageTemplates([template])
    
    styles = get_professional_styles()
    # Define body_style that can be used throughout
    body_style = styles.get('CustomBodyText') or styles.get('BodyText') or styles['Normal']
    elements = []
    
    # === COVER PAGE ===
    elements.extend(create_cover_page(identifier, report, styles))
    
    # === TABLE OF CONTENTS ===
    elements.extend(create_toc(report, styles))
    
    # === METRICS SECTION ===
    elements.extend(create_metrics_dashboard(report, styles))
    elements.append(PageBreak())
    
    # === EXECUTIVE SUMMARY ===
    executive = report.get('executive_summary', {})
    elements.extend(create_narrative_section(
        "EXECUTIVE SUMMARY",
        executive.get('summary', 'No summary available'),
        styles
    ))
    
    # === DIGITAL FOOTPRINT ===
    elements.extend(create_narrative_section(
        "DIGITAL FOOTPRINT ANALYSIS",
        report.get('digital_footprint', {}).get('analysis', 'No data available'),
        styles
    ))
    
    # === PLATFORM PRESENCE ===
    platforms = report.get('platform_presence', [])
    if platforms:
        elements.append(Paragraph("PLATFORM PRESENCE", styles['SectionHeader']))
        for platform in platforms[:5]:  # Limit to 5 platforms
            if isinstance(platform, dict):
                name = platform.get('platform', 'Unknown')
                username = platform.get('username', 'N/A')
                elements.append(Paragraph(f"<b>{name}</b>: {username}", body_style))
        elements.append(Spacer(1, 0.15*inch))
    
    elements.append(PageBreak())
    
    # === REPOSITORIES ===
    repos = report.get('repositories', [])
    if repos:
        elements.append(Paragraph("REPOSITORY ANALYSIS", styles['SectionHeader']))
        for repo in repos[:3]:
            if isinstance(repo, dict):
                repo_name = repo.get('name', 'Unknown')
                stars = repo.get('stars', 0)
                forks = repo.get('forks', 0)
                lang = repo.get('language', 'N/A')
                elements.append(Paragraph(
                    f"<b>{repo_name}</b><br/>Stars: {stars} | Forks: {forks} | Language: {lang}",
                    body_style
                ))
        elements.append(Spacer(1, 0.15*inch))
    
    # === RELATIONSHIPS ===
    relationships = report.get('relationship_analysis', {})
    elements.extend(create_narrative_section(
        "RELATIONSHIP NETWORK",
        relationships.get('summary', 'No relationship data available'),
        styles
    ))
    
    elements.append(PageBreak())
    
    # === ATTACK SURFACE ===
    attack_surface = report.get('attack_surface', {})
    elements.extend(create_narrative_section(
        "ATTACK SURFACE ASSESSMENT",
        attack_surface.get('analysis', 'No attack surface data available'),
        styles
    ))
    
    # === THREAT ANALYSIS ===
    threats = report.get('threat_analysis', {})
    elements.extend(create_narrative_section(
        "THREAT ANALYSIS",
        threats.get('analysis', 'No threat data available'),
        styles
    ))
    
    elements.append(PageBreak())
    
    # === INDICATORS OF COMPROMISE ===
    iocs = report.get('indicators_of_compromise', {})
    if iocs:
        elements.append(Paragraph("INDICATORS OF COMPROMISE", styles['SectionHeader']))
        for ioc_type, ioc_list in iocs.items():
            if ioc_list:
                elements.append(Paragraph(f"<b>{ioc_type.title()}:</b>", styles['SubsectionHeader']))
                # Show all available indicators (no artificial limit) so every
                # URL and email from correlation is visible in the PDF.
                for ioc in ioc_list:
                    elements.append(Paragraph(f"• {ioc}", body_style))
        elements.append(Spacer(1, 0.15*inch))
    
    # === RECOMMENDATIONS ===
    recommendations = report.get('recommendations', [])
    if recommendations:
        elements.append(Paragraph("RECOMMENDATIONS", styles['SectionHeader']))
        for rec in recommendations[:5]:
            if isinstance(rec, dict):
                priority = rec.get('priority', 'Medium')
                action = rec.get('action', '')
                elements.append(Paragraph(f"<b>{priority}:</b> {action}", body_style))
        elements.append(Spacer(1, 0.15*inch))
    
    elements.append(PageBreak())
    
    # === INVESTIGATION PIVOTS ===
    pivots = report.get('investigation_pivots', [])
    if pivots:
        elements.append(Paragraph("INVESTIGATION PIVOTS", styles['SectionHeader']))
        for pivot in pivots[:5]:
            if isinstance(pivot, dict):
                name = pivot.get('name', 'Unknown')
                description = pivot.get('description', '')
                elements.append(Paragraph(f"<b>{name}:</b> {description}", body_style))
        elements.append(Spacer(1, 0.15*inch))
    
    # === AI NARRATIVE ===
    ai_narrative = report.get('ai_narrative', '')
    if ai_narrative:
        elements.extend(create_narrative_section(
            "INTELLIGENT SYNTHESIS",
            ai_narrative,
            styles
        ))
    
    # Build PDF
    doc.build(elements)
    buffer.seek(0)
    
    return buffer.getvalue()
