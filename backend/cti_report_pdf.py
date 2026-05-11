"""CTI PDF Report Builder for ShadowHorn.

Renders professional dark-themed PDFs for:
  1. Investigation reports (multi-IOC case reports)
  2. IOC deep-dive reports (single indicator analysis)

Uses the same visual language as the OSINT report_pdf.py.
"""

from reportlab.lib.pagesizes import letter
from reportlab.lib import colors
from reportlab.lib.styles import ParagraphStyle
from reportlab.lib.units import inch
from reportlab.lib.enums import TA_CENTER, TA_LEFT, TA_JUSTIFY
from reportlab.platypus import (
    BaseDocTemplate, Table, TableStyle, Paragraph, Spacer, PageBreak,
    Flowable, PageTemplate, Frame, KeepTogether,
)
from io import BytesIO
import re as _re

# ─── Colour palette ──────────────────────────────────────────────────────────
CYAN        = colors.HexColor("#00B4C8")
BG_BLACK    = colors.HexColor("#000000")
BG_DARK     = colors.HexColor("#0F1419")
BG_CARD     = colors.HexColor("#1E2734")
TEXT_WHITE   = colors.HexColor("#F0F4F7")
TEXT_MUTED   = colors.HexColor("#8899AA")
RED          = colors.HexColor("#FF5C5C")
ORANGE       = colors.HexColor("#FFB84D")
GREEN        = colors.HexColor("#4CAF50")
PURPLE       = colors.HexColor("#A78BFA")
YELLOW       = colors.HexColor("#FBBF24")
ACCENT_INV   = colors.HexColor("#7C3AED")  # purple for investigations
ACCENT_IOC   = CYAN

W, H = letter
MARGIN = 0.6 * inch
CONTENT_W = W - 2 * MARGIN


class _Bar(Flowable):
    def __init__(self, width, height=2, color=CYAN):
        Flowable.__init__(self)
        self.width, self.height, self.color = width, height, color

    def draw(self):
        self.canv.setFillColor(self.color)
        self.canv.rect(0, 0, self.width, self.height, fill=1, stroke=0)


class _CTIPageBG(PageTemplate):
    def __init__(self, accent=CYAN, footer_text="ShadowHorn CTI Report", *a, **kw):
        self._accent = accent
        self._footer = footer_text
        super().__init__(*a, **kw)

    def beforeDrawPage(self, canv, doc):
        canv.saveState()
        canv.setFillColor(BG_BLACK)
        canv.rect(0, 0, W, H, fill=1, stroke=0)
        canv.setFillColor(self._accent)
        canv.rect(0, H - 4, W, 4, fill=1, stroke=0)
        canv.setFillColor(TEXT_MUTED)
        canv.setFont("Helvetica", 7)
        canv.drawString(MARGIN, 0.35 * inch, self._footer)
        canv.drawRightString(W - MARGIN, 0.35 * inch, f"Page {doc.page}")
        canv.restoreState()


def _styles():
    s = {}
    s["Cover"] = ParagraphStyle("Cover", fontName="Helvetica-Bold", fontSize=28,
                                 textColor=TEXT_WHITE, alignment=TA_CENTER, leading=34)
    s["CoverSub"] = ParagraphStyle("CoverSub", fontName="Helvetica", fontSize=12,
                                    textColor=TEXT_MUTED, alignment=TA_CENTER, leading=16)
    s["Section"] = ParagraphStyle("Section", fontName="Helvetica-Bold", fontSize=16,
                                   textColor=CYAN, spaceAfter=6, spaceBefore=14, leading=20)
    s["SubSection"] = ParagraphStyle("SubSection", fontName="Helvetica-Bold", fontSize=12,
                                      textColor=TEXT_WHITE, spaceAfter=4, spaceBefore=8, leading=15)
    s["Body"] = ParagraphStyle("Body", fontName="Helvetica", fontSize=9, textColor=TEXT_WHITE,
                                alignment=TA_JUSTIFY, leading=13, spaceAfter=4)
    s["BodyMuted"] = ParagraphStyle("BodyMuted", fontName="Helvetica", fontSize=8,
                                     textColor=TEXT_MUTED, leading=11, spaceAfter=2)
    s["Bullet"] = ParagraphStyle("Bullet", fontName="Helvetica", fontSize=9,
                                  textColor=TEXT_WHITE, leading=13, leftIndent=14,
                                  bulletIndent=0, spaceAfter=3)
    return s


_GRID = TableStyle([
    ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#1A2332")),
    ("TEXTCOLOR", (0, 0), (-1, 0), CYAN),
    ("TEXTCOLOR", (0, 1), (-1, -1), TEXT_WHITE),
    ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
    ("FONTSIZE", (0, 0), (-1, -1), 8),
    ("BACKGROUND", (0, 1), (-1, -1), BG_CARD),
    ("GRID", (0, 0), (-1, -1), 0.4, colors.HexColor("#2A3544")),
    ("VALIGN", (0, 0), (-1, -1), "TOP"),
    ("LEFTPADDING", (0, 0), (-1, -1), 6),
    ("RIGHTPADDING", (0, 0), (-1, -1), 6),
    ("TOPPADDING", (0, 0), (-1, -1), 4),
    ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
])

_KV_STYLE = TableStyle([
    ("BACKGROUND", (0, 0), (0, -1), colors.HexColor("#1A2332")),
    ("BACKGROUND", (1, 0), (1, -1), BG_CARD),
    ("TEXTCOLOR", (0, 0), (0, -1), CYAN),
    ("TEXTCOLOR", (1, 0), (1, -1), TEXT_WHITE),
    ("FONTNAME", (0, 0), (0, -1), "Helvetica-Bold"),
    ("FONTSIZE", (0, 0), (-1, -1), 9),
    ("GRID", (0, 0), (-1, -1), 0.4, colors.HexColor("#2A3544")),
    ("VALIGN", (0, 0), (-1, -1), "TOP"),
    ("LEFTPADDING", (0, 0), (-1, -1), 6),
    ("RIGHTPADDING", (0, 0), (-1, -1), 6),
    ("TOPPADDING", (0, 0), (-1, -1), 4),
    ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
])


def _esc(text):
    if not text:
        return ""
    text = str(text)
    for old, new in [("&", "&amp;"), ("<", "&lt;"), (">", "&gt;")]:
        text = text.replace(old, new)
    return text


def _para(text, style):
    return Paragraph(_esc(text), style)


def _kv_table(pairs, col_widths=None):
    if not col_widths:
        col_widths = [1.8 * inch, CONTENT_W - 1.8 * inch]
    rows = [[Paragraph(_esc(str(k)), ParagraphStyle("K", fontName="Helvetica-Bold",
             fontSize=9, textColor=CYAN)),
             Paragraph(_esc(str(v)), ParagraphStyle("V", fontName="Helvetica",
             fontSize=9, textColor=TEXT_WHITE))]
            for k, v in pairs]
    t = Table(rows, colWidths=col_widths)
    t.setStyle(_KV_STYLE)
    return t


def _severity_color(sev):
    sev = (sev or "").lower()
    return {"critical": RED, "high": ORANGE, "medium": YELLOW,
            "low": GREEN, "clean": GREEN}.get(sev, TEXT_MUTED)


# ───────────────────────────────────────────────────────────────────────────
# Investigation Report PDF
# ───────────────────────────────────────────────────────────────────────────

def build_investigation_report_pdf(report: dict) -> bytes:
    buf = BytesIO()
    st = _styles()
    meta = report.get("meta", {})
    stats = report.get("stats", {})
    inv_name = meta.get("investigation_name", "Investigation Report")

    frame = Frame(MARGIN, MARGIN, CONTENT_W, H - 2 * MARGIN, id="main")
    page_tmpl = _CTIPageBG(
        accent=ACCENT_INV,
        footer_text=f"ShadowHorn CTI — {inv_name}",
        id="cti_inv", frames=[frame],
    )
    doc = BaseDocTemplate(buf, pagesize=letter,
                          leftMargin=MARGIN, rightMargin=MARGIN,
                          topMargin=MARGIN, bottomMargin=MARGIN)
    doc.addPageTemplates([page_tmpl])

    story = []

    # Cover
    story.append(Spacer(1, 2.2 * inch))
    story.append(_para("THREAT INTELLIGENCE", st["Cover"]))
    story.append(_para("INVESTIGATION REPORT", st["Cover"]))
    story.append(Spacer(1, 0.3 * inch))
    story.append(_Bar(CONTENT_W, 3, ACCENT_INV))
    story.append(Spacer(1, 0.3 * inch))
    story.append(_para(inv_name, st["CoverSub"]))
    story.append(_para(f"Generated: {meta.get('generated_at', 'N/A')[:19]}", st["CoverSub"]))
    if meta.get("description"):
        story.append(Spacer(1, 0.15 * inch))
        story.append(_para(meta["description"], st["CoverSub"]))
    if meta.get("tags"):
        story.append(_para(f"Tags: {', '.join(meta['tags'])}", st["CoverSub"]))
    story.append(PageBreak())

    # Executive Summary
    story.append(_para("Executive Summary", st["Section"]))
    story.append(_Bar(CONTENT_W, 1.5, ACCENT_INV))
    story.append(Spacer(1, 6))
    story.append(_para(report.get("executive_summary", "N/A"), st["Body"]))
    story.append(Spacer(1, 10))

    # Key Metrics
    story.append(_para("Key Metrics", st["Section"]))
    story.append(_Bar(CONTENT_W, 1.5, ACCENT_INV))
    story.append(Spacer(1, 6))
    story.append(_kv_table([
        ("Total IOCs", stats.get("total_iocs", 0)),
        ("Average Score", f"{stats.get('avg_score', 0)}/100"),
        ("Maximum Score", f"{stats.get('max_score', 0)}/100"),
        ("Sources Used", ", ".join(stats.get("sources_used", []))),
        ("Status", meta.get("status", "active").upper()),
    ]))
    story.append(Spacer(1, 10))

    # Severity Distribution
    sev_dist = stats.get("severity_distribution", {})
    if sev_dist:
        story.append(_para("Severity Distribution", st["SubSection"]))
        rows = [["Severity", "Count"]]
        for sev_name in ("critical", "high", "medium", "low", "clean"):
            count = sev_dist.get(sev_name, 0)
            if count:
                rows.append([sev_name.upper(), str(count)])
        if len(rows) > 1:
            t = Table(rows, colWidths=[2 * inch, 2 * inch])
            t.setStyle(_GRID)
            story.append(t)
            story.append(Spacer(1, 10))

    # Type Distribution
    type_dist = stats.get("type_distribution", {})
    if type_dist:
        story.append(_para("IOC Type Distribution", st["SubSection"]))
        rows = [["Type", "Count"]]
        for ttype, tcount in sorted(type_dist.items(), key=lambda x: -x[1]):
            rows.append([ttype.upper(), str(tcount)])
        t = Table(rows, colWidths=[2 * inch, 2 * inch])
        t.setStyle(_GRID)
        story.append(t)
        story.append(Spacer(1, 10))

    # Top Threats
    top_threats = report.get("top_threats", [])
    if top_threats:
        story.append(PageBreak())
        story.append(_para("Top Threats", st["Section"]))
        story.append(_Bar(CONTENT_W, 1.5, RED))
        story.append(Spacer(1, 6))
        rows = [["IOC", "Type", "Score", "Severity"]]
        for tt in top_threats[:10]:
            rows.append([
                _esc(tt.get("ioc", "?"))[:50],
                tt.get("ioc_type", "?"),
                str(tt.get("score", 0)),
                tt.get("severity", "?").upper(),
            ])
        t = Table(rows, colWidths=[2.6 * inch, 1 * inch, 0.8 * inch, 1 * inch])
        t.setStyle(_GRID)
        story.append(t)
        story.append(Spacer(1, 10))

    # Detailed Findings
    detailed = report.get("detailed_findings", [])
    if detailed:
        story.append(PageBreak())
        story.append(_para("Detailed Findings", st["Section"]))
        story.append(_Bar(CONTENT_W, 1.5, ACCENT_INV))
        story.append(Spacer(1, 6))

        for idx, finding in enumerate(detailed[:20]):
            sev = finding.get("severity", "unknown")
            ioc_label = f"{finding.get('ioc', '?')} ({finding.get('ioc_type', '?')})"
            story.append(_para(f"{idx+1}. {ioc_label} — Score: {finding.get('score', 0)}/100 [{sev.upper()}]",
                               st["SubSection"]))
            for sf in finding.get("source_findings", []):
                src = sf.get("source", "Unknown")
                details = ", ".join(f"{k}: {v}" for k, v in sf.items()
                                    if k != "source" and v and v != "N/A" and v != [] and v != 0)
                if details:
                    story.append(Paragraph(f"&bull; <b>{_esc(src)}</b>: {_esc(details[:300])}",
                                           st["Bullet"]))
            story.append(Spacer(1, 6))

    # Recommendations
    recs = report.get("recommendations", [])
    if recs:
        story.append(PageBreak())
        story.append(_para("Recommendations", st["Section"]))
        story.append(_Bar(CONTENT_W, 1.5, GREEN))
        story.append(Spacer(1, 6))
        for r in recs:
            story.append(Paragraph(f"&bull; {_esc(r)}", st["Bullet"]))
        story.append(Spacer(1, 10))

    doc.build(story)
    return buf.getvalue()


# ───────────────────────────────────────────────────────────────────────────
# IOC Deep-Dive Report PDF
# ───────────────────────────────────────────────────────────────────────────

def build_ioc_report_pdf(report: dict) -> bytes:
    buf = BytesIO()
    st = _styles()
    meta = report.get("meta", {})
    ioc_value = meta.get("ioc", "Unknown IOC")
    ioc_type = meta.get("ioc_type", "unknown")

    frame = Frame(MARGIN, MARGIN, CONTENT_W, H - 2 * MARGIN, id="main")
    page_tmpl = _CTIPageBG(
        accent=ACCENT_IOC,
        footer_text=f"ShadowHorn CTI — IOC: {ioc_value[:40]}",
        id="cti_ioc", frames=[frame],
    )
    doc = BaseDocTemplate(buf, pagesize=letter,
                          leftMargin=MARGIN, rightMargin=MARGIN,
                          topMargin=MARGIN, bottomMargin=MARGIN)
    doc.addPageTemplates([page_tmpl])

    story = []

    # Cover
    story.append(Spacer(1, 2.2 * inch))
    story.append(_para("IOC DEEP-DIVE", st["Cover"]))
    story.append(_para("ANALYSIS REPORT", st["Cover"]))
    story.append(Spacer(1, 0.3 * inch))
    story.append(_Bar(CONTENT_W, 3, ACCENT_IOC))
    story.append(Spacer(1, 0.3 * inch))
    story.append(_para(ioc_value, st["CoverSub"]))
    story.append(_para(f"Type: {ioc_type.upper()} | Generated: {meta.get('generated_at', 'N/A')[:19]}", st["CoverSub"]))
    story.append(PageBreak())

    # Executive Summary
    story.append(_para("Executive Summary", st["Section"]))
    story.append(_Bar(CONTENT_W, 1.5, ACCENT_IOC))
    story.append(Spacer(1, 6))
    story.append(_para(report.get("executive_summary", "N/A"), st["Body"]))
    story.append(Spacer(1, 10))

    # Threat Score
    score = report.get("threat_score", 0)
    severity = report.get("severity", "unknown")
    story.append(_para("Threat Assessment", st["Section"]))
    story.append(_Bar(CONTENT_W, 1.5, _severity_color(severity)))
    story.append(Spacer(1, 6))
    story.append(_kv_table([
        ("Overall Score", f"{score}/100"),
        ("Severity", severity.upper()),
        ("IOC Type", ioc_type.upper()),
        ("IOC Value", ioc_value),
    ]))
    story.append(Spacer(1, 10))

    # Score Breakdown
    breakdown = report.get("score_breakdown", {})
    if breakdown:
        story.append(_para("Score Breakdown by Source", st["SubSection"]))
        rows = [["Source", "Score"]]
        for src, val in sorted(breakdown.items(), key=lambda x: -(x[1] if isinstance(x[1], (int, float)) else 0)):
            rows.append([src, str(val)])
        t = Table(rows, colWidths=[3 * inch, 1.5 * inch])
        t.setStyle(_GRID)
        story.append(t)
        story.append(Spacer(1, 10))

    # Key Findings
    key_findings = report.get("key_findings", [])
    if key_findings:
        story.append(_para("Key Findings", st["Section"]))
        story.append(_Bar(CONTENT_W, 1.5, ORANGE))
        story.append(Spacer(1, 6))
        for kf in key_findings:
            story.append(Paragraph(f"&bull; {_esc(kf)}", st["Bullet"]))
        story.append(Spacer(1, 10))

    # Source Analysis
    source_findings = report.get("source_findings", [])
    if source_findings:
        story.append(PageBreak())
        story.append(_para("Source-by-Source Analysis", st["Section"]))
        story.append(_Bar(CONTENT_W, 1.5, ACCENT_IOC))
        story.append(Spacer(1, 6))

        for sf in source_findings:
            src = sf.get("source", "Unknown")
            story.append(_para(src, st["SubSection"]))
            pairs = [(k, str(v)) for k, v in sf.items()
                     if k != "source" and v and v != "N/A" and v != [] and v != 0]
            if pairs:
                story.append(_kv_table(pairs))
            else:
                story.append(_para("No significant data from this source.", st["BodyMuted"]))
            story.append(Spacer(1, 8))

    # Recommendations
    recs = report.get("recommendations", [])
    if recs:
        story.append(PageBreak())
        story.append(_para("Recommendations", st["Section"]))
        story.append(_Bar(CONTENT_W, 1.5, GREEN))
        story.append(Spacer(1, 6))
        for r in recs:
            story.append(Paragraph(f"&bull; {_esc(r)}", st["Bullet"]))
        story.append(Spacer(1, 10))

    doc.build(story)
    return buf.getvalue()
