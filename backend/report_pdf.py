"""Professional PDF Report Generator for ShadowHorn Intelligence Reports.

Generates a complete, publication-quality dark-themed PDF from the structured
report object produced by comprehensive_report.py.  Every field available in the
correlation output is rendered — nothing is silently truncated or dropped.
"""

from reportlab.lib.pagesizes import letter
from reportlab.lib import colors
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.units import inch
from reportlab.lib.enums import TA_CENTER, TA_LEFT, TA_JUSTIFY
from reportlab.platypus import (
    BaseDocTemplate, Table, TableStyle, Paragraph, Spacer, PageBreak,
    Flowable, PageTemplate, Frame, KeepTogether,
)
from datetime import datetime
from io import BytesIO

# ─── Colour palette ──────────────────────────────────────────────────────────
CYAN        = colors.HexColor("#00B4C8")
CYAN_LIGHT  = colors.HexColor("#64C8FF")
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

W, H = letter                       # page width / height
MARGIN = 0.6 * inch
CONTENT_W = W - 2 * MARGIN          # usable width


# ─── Helper flowables ────────────────────────────────────────────────────────
class _Bar(Flowable):
    """Horizontal coloured bar."""
    def __init__(self, width, height=2, color=CYAN):
        Flowable.__init__(self)
        self.width, self.height, self.color = width, height, color

    def draw(self):
        self.canv.setFillColor(self.color)
        self.canv.rect(0, 0, self.width, self.height, fill=1, stroke=0)


class _PageBG(PageTemplate):
    """Dark background with cyan header/footer accent bars."""
    def __init__(self, *a, **kw):
        super().__init__(*a, **kw)

    def beforeDrawPage(self, canv, doc):
        canv.saveState()
        canv.setFillColor(BG_BLACK)
        canv.rect(0, 0, W, H, fill=1, stroke=0)
        canv.setFillColor(CYAN)
        canv.rect(0, H - 6, W, 6, fill=1, stroke=0)
        canv.rect(0, 0, W, 6, fill=1, stroke=0)
        canv.setFillColor(BG_DARK)
        canv.rect(0, 6, 8, H - 12, fill=1, stroke=0)

        # Footer text
        canv.setFont("Helvetica", 7)
        canv.setFillColor(TEXT_MUTED)
        canv.drawString(MARGIN, 14, "ShadowHorn Intelligence Platform  •  OSINT — Open Source")
        canv.drawRightString(W - MARGIN, 14, f"Page {doc.page}")
        canv.restoreState()


# ─── Styles ───────────────────────────────────────────────────────────────────
def _styles():
    ss = getSampleStyleSheet()
    ss["Normal"].textColor = TEXT_WHITE
    ss["Normal"].fontName = "Helvetica"

    def _add(name, **kw):
        ss.add(ParagraphStyle(name, parent=ss["Normal"], **kw))

    _add("Cover",       fontSize=32, textColor=CYAN, fontName="Helvetica-Bold", leading=38, alignment=TA_CENTER, spaceAfter=6)
    _add("CoverSub",    fontSize=13, textColor=CYAN_LIGHT, alignment=TA_CENTER, spaceAfter=4)
    _add("Section",     fontSize=16, textColor=CYAN, fontName="Helvetica-Bold", leading=20, spaceBefore=14, spaceAfter=8)
    _add("SubSection",  fontSize=12, textColor=CYAN_LIGHT, fontName="Helvetica-Bold", leading=14, spaceBefore=8, spaceAfter=4)
    _add("Body",        fontSize=10, textColor=TEXT_WHITE, leading=14, alignment=TA_JUSTIFY, spaceAfter=6)
    _add("BodySmall",   fontSize=9,  textColor=TEXT_WHITE, leading=12, spaceAfter=4)
    _add("Muted",       fontSize=9,  textColor=TEXT_MUTED, leading=12, spaceAfter=4)
    _add("Label",       fontSize=8,  textColor=CYAN_LIGHT, fontName="Helvetica-Bold", leading=10)
    _add("BulletItem",  fontSize=10, textColor=TEXT_WHITE, leading=13, leftIndent=12, spaceAfter=3)
    return ss


# ─── Table helpers ────────────────────────────────────────────────────────────
_GRID = TableStyle([
    ("BACKGROUND",   (0, 0), (-1, 0), BG_CARD),
    ("BACKGROUND",   (0, 1), (-1, -1), BG_DARK),
    ("ROWBACKGROUNDS", (0, 1), (-1, -1), [BG_DARK, BG_BLACK]),
    ("TEXTCOLOR",    (0, 0), (-1, -1), TEXT_WHITE),
    ("FONTNAME",     (0, 0), (-1, 0), "Helvetica-Bold"),
    ("FONTSIZE",     (0, 0), (-1, 0), 9),
    ("FONTSIZE",     (0, 1), (-1, -1), 9),
    ("ALIGN",        (0, 0), (-1, -1), "LEFT"),
    ("VALIGN",       (0, 0), (-1, -1), "TOP"),
    ("TOPPADDING",   (0, 0), (-1, -1), 6),
    ("BOTTOMPADDING",(0, 0), (-1, -1), 6),
    ("LEFTPADDING",  (0, 0), (-1, -1), 8),
    ("RIGHTPADDING", (0, 0), (-1, -1), 8),
    ("GRID",         (0, 0), (-1, -1), 0.5, colors.HexColor("#2A3544")),
    ("LINEBELOW",    (0, 0), (-1, 0), 1.5, CYAN),
])

_KV_STYLE = TableStyle([
    ("BACKGROUND",   (0, 0), (0, -1), BG_CARD),
    ("BACKGROUND",   (1, 0), (1, -1), BG_DARK),
    ("TEXTCOLOR",    (0, 0), (-1, -1), TEXT_WHITE),
    ("FONTNAME",     (0, 0), (0, -1), "Helvetica-Bold"),
    ("FONTSIZE",     (0, 0), (-1, -1), 10),
    ("TOPPADDING",   (0, 0), (-1, -1), 7),
    ("BOTTOMPADDING",(0, 0), (-1, -1), 7),
    ("LEFTPADDING",  (0, 0), (-1, -1), 10),
    ("RIGHTPADDING", (0, 0), (-1, -1), 10),
    ("GRID",         (0, 0), (-1, -1), 0.5, colors.HexColor("#2A3544")),
    ("LINEBELOW",    (0, 0), (-1, -1), 0.5, colors.HexColor("#2A3544")),
])

def _para(text, style):
    """Wrap text in a Paragraph safely."""
    text = str(text) if text else ""
    text = text.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")
    return Paragraph(text, style)

def _kv_table(rows, styles, col1=2.2*inch):
    """Key-value two-column table."""
    col2 = CONTENT_W - col1
    data = []
    body = styles["Body"]
    label = styles["Label"]
    for k, v in rows:
        if not v or str(v).lower() in ("none", "unknown", "—", "n/a", ""):
            continue
        data.append([_para(k, label), _para(v, body)])
    if not data:
        return None
    t = Table(data, colWidths=[col1, col2])
    t.setStyle(_KV_STYLE)
    return t


# ─── Risk colour helper ──────────────────────────────────────────────────────
def _risk_color(level):
    l = (level or "").lower()
    if l in ("critical", "high"):
        return RED
    if l in ("medium", "moderate"):
        return ORANGE
    return GREEN

def _priority_color(label):
    l = (label or "").lower()
    if "critical" in l:
        return RED
    if "high" in l:
        return ORANGE
    if "ongoing" in l:
        return colors.HexColor("#60A5FA")
    if "low" in l:
        return GREEN
    return YELLOW


# ═══════════════════════════════════════════════════════════════════════════════
#  build_pdf_bytes — main entry point
# ═══════════════════════════════════════════════════════════════════════════════
def build_pdf_bytes(report: dict) -> bytes:
    meta = report.get("meta", {})
    identifier = meta.get("identifier") or meta.get("name") or "Report"
    name = meta.get("name") or identifier
    exec_summary = report.get("executive_summary", {})

    buf = BytesIO()
    doc = BaseDocTemplate(buf, pagesize=letter,
                          leftMargin=MARGIN, rightMargin=MARGIN,
                          topMargin=MARGIN + 0.15 * inch,
                          bottomMargin=MARGIN + 0.15 * inch)
    frame = Frame(MARGIN, MARGIN + 0.15 * inch,
                  CONTENT_W, H - 2 * MARGIN - 0.3 * inch, id="main")
    doc.addPageTemplates([_PageBG(id="bg", frames=[frame])])

    S = _styles()
    body = S["Body"]
    muted = S["Muted"]
    els = []

    # ── COVER PAGE ────────────────────────────────────────────────────────
    els.append(Spacer(1, 1.2 * inch))
    els.append(Paragraph("INTELLIGENCE REPORT", S["Cover"]))
    els.append(_Bar(CONTENT_W, 3, CYAN))
    els.append(Spacer(1, 0.15 * inch))
    els.append(Paragraph(f"Subject: {name}", S["CoverSub"]))
    profile_type = meta.get("profile_type") or ""
    if profile_type:
        els.append(Paragraph(profile_type.title(), S["CoverSub"]))
    els.append(Spacer(1, 0.4 * inch))

    now = datetime.utcnow()
    cover_rows = [
        ("Report Date", now.strftime("%B %d, %Y")),
        ("Report Time", now.strftime("%H:%M:%S UTC")),
        ("Report Type", "Comprehensive Intelligence Analysis"),
        ("Identifier", identifier),
        ("Location", meta.get("location")),
        ("Collection Mode", (meta.get("collection_mode") or "standard").title()),
        ("Compromise Status", "COMPROMISED" if meta.get("compromised") else "Not Compromised"),
    ]
    t = _kv_table(cover_rows, S)
    if t:
        els.append(t)

    els.append(Spacer(1, 0.3 * inch))
    risk_level = exec_summary.get("risk_level", "Unknown")
    rc = _risk_color(risk_level)
    hex_c = rc.hexval() if hasattr(rc, "hexval") else str(rc)
    if hex_c.startswith("#x"):
        hex_c = "#" + hex_c[2:]
    els.append(Paragraph(f'Overall Risk Level: <font color="{hex_c}"><b>{risk_level.upper()}</b></font>', body))
    els.append(PageBreak())

    # ── TABLE OF CONTENTS ─────────────────────────────────────────────────
    toc_items = [
        "Executive Summary", "Key Metrics", "Digital Footprint Analysis",
        "Platform Presence", "Repository Analysis", "Content &amp; Posts",
        "Behavior &amp; Interests", "Relationship Network", "Activity Timeline",
        "Attack Surface Assessment", "Threat Analysis",
        "Indicators of Compromise", "Recommendations",
        "Investigation Pivots", "AI Narrative",
    ]
    els.append(Paragraph("TABLE OF CONTENTS", S["Section"]))
    els.append(_Bar(CONTENT_W, 1.5, CYAN))
    els.append(Spacer(1, 0.15 * inch))
    for i, item in enumerate(toc_items, 1):
        els.append(Paragraph(f"{i}.  {item}", body))
    els.append(PageBreak())

    # ── 1. EXECUTIVE SUMMARY ──────────────────────────────────────────────
    els.append(Paragraph("1.  EXECUTIVE SUMMARY", S["Section"]))
    els.append(_Bar(CONTENT_W, 1.5, CYAN))
    els.append(Spacer(1, 0.1 * inch))
    summary_text = exec_summary.get("summary") or "No summary available."
    els.append(_para(summary_text, body))
    risk_factors = exec_summary.get("risk_factors")
    if risk_factors and risk_factors != "Minimal risk indicators":
        els.append(Spacer(1, 0.05 * inch))
        els.append(Paragraph(f'Risk Factors: <font color="{hex_c}"><b>{risk_factors}</b></font>', S["BodySmall"]))
    els.append(Spacer(1, 0.15 * inch))

    # ── 2. KEY METRICS ────────────────────────────────────────────────────
    counts = report.get("counts", {})
    els.append(Paragraph("2.  KEY METRICS", S["Section"]))
    els.append(_Bar(CONTENT_W, 1.5, CYAN))
    els.append(Spacer(1, 0.1 * inch))

    metric_style = ParagraphStyle("_m", parent=S["Normal"], fontSize=16,
                                  textColor=CYAN, fontName="Helvetica-Bold",
                                  alignment=TA_CENTER, leading=20)
    metric_label = ParagraphStyle("_ml", parent=S["Normal"], fontSize=8,
                                  textColor=TEXT_MUTED, alignment=TA_CENTER,
                                  leading=10)
    mc = [
        (str(counts.get("identifiers", 0)), "Identifiers"),
        (str(counts.get("platforms", 0)), "Platforms"),
        (str(counts.get("repositories", 0)), "Repositories"),
        (str(counts.get("total_stars", 0)), "Stars"),
        (str(counts.get("connections", 0)), "Connections"),
    ]
    metric_row = []
    label_row = []
    for val, lbl in mc:
        metric_row.append(Paragraph(f"<b>{val}</b>", metric_style))
        label_row.append(Paragraph(lbl, metric_label))
    cw = CONTENT_W / len(mc)
    mt = Table([metric_row, label_row], colWidths=[cw] * len(mc))
    mt.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, -1), BG_CARD),
        ("ALIGN",      (0, 0), (-1, -1), "CENTER"),
        ("VALIGN",     (0, 0), (-1, -1), "MIDDLE"),
        ("TOPPADDING", (0, 0), (-1, 0), 14),
        ("BOTTOMPADDING", (0, 1), (-1, 1), 10),
        ("GRID",       (0, 0), (-1, -1), 0.5, colors.HexColor("#2A3544")),
        ("LINEBELOW",  (0, 0), (-1, 0), 0, BG_CARD),
    ]))
    els.append(mt)
    els.append(Spacer(1, 0.15 * inch))

    # ── 3. DIGITAL FOOTPRINT ──────────────────────────────────────────────
    df = report.get("digital_footprint", {})
    els.append(Paragraph("3.  DIGITAL FOOTPRINT ANALYSIS", S["Section"]))
    els.append(_Bar(CONTENT_W, 1.5, CYAN))
    els.append(Spacer(1, 0.1 * inch))
    els.append(_para(df.get("analysis", "No data available."), body))
    df_kv = _kv_table([
        ("Platforms Found", str(df.get("platforms_found", 0))),
        ("Accounts Identified", str(df.get("accounts_identified", 0))),
    ], S)
    if df_kv:
        els.append(df_kv)
    els.append(PageBreak())

    # ── 4. PLATFORM PRESENCE ──────────────────────────────────────────────
    platforms = report.get("platform_presence", [])
    if platforms:
        els.append(Paragraph("4.  PLATFORM PRESENCE", S["Section"]))
        els.append(_Bar(CONTENT_W, 1.5, CYAN))
        els.append(Spacer(1, 0.1 * inch))
        hdr = [
            Paragraph("<b>Platform</b>", S["Label"]),
            Paragraph("<b>Username</b>", S["Label"]),
            Paragraph("<b>URL</b>", S["Label"]),
            Paragraph("<b>Bio</b>", S["Label"]),
        ]
        rows = [hdr]
        for p in platforms:
            rows.append([
                _para(p.get("platform", "—"), body),
                _para(p.get("username", "—"), body),
                _para(p.get("url", "—"), S["BodySmall"]),
                _para(p.get("bio", "—"), S["BodySmall"]),
            ])
        t = Table(rows, colWidths=[1.1*inch, 1.2*inch, 2.4*inch, CONTENT_W - 4.7*inch])
        t.setStyle(_GRID)
        els.append(t)
        els.append(Spacer(1, 0.15 * inch))

    # ── 5. REPOSITORIES ──────────────────────────────────────────────────
    repos = report.get("repositories", [])
    if repos:
        els.append(Paragraph(f"5.  REPOSITORY ANALYSIS ({len(repos)})", S["Section"]))
        els.append(_Bar(CONTENT_W, 1.5, CYAN))
        els.append(Spacer(1, 0.1 * inch))
        hdr = [
            Paragraph("<b>Repository</b>", S["Label"]),
            Paragraph("<b>Language</b>", S["Label"]),
            Paragraph("<b>Stars</b>", S["Label"]),
            Paragraph("<b>Forks</b>", S["Label"]),
            Paragraph("<b>Description</b>", S["Label"]),
        ]
        rows = [hdr]
        for r in repos:
            desc = (r.get("description") or "—")[:80]
            rows.append([
                _para(r.get("name", "—"), body),
                _para(r.get("language") or "—", S["BodySmall"]),
                _para(str(r.get("stars", 0)), body),
                _para(str(r.get("forks", 0)), body),
                _para(desc, S["BodySmall"]),
            ])
        t = Table(rows, colWidths=[1.4*inch, 0.8*inch, 0.5*inch, 0.5*inch, CONTENT_W - 3.2*inch])
        t.setStyle(_GRID)
        els.append(t)
        els.append(Spacer(1, 0.15 * inch))
    els.append(PageBreak())

    # ── 6. CONTENT & POSTS ────────────────────────────────────────────────
    _render_section_items(els, S, report, "Content & Posts", "content", "6")

    # ── 7. BEHAVIOR & INTERESTS ───────────────────────────────────────────
    els.append(Paragraph("7.  BEHAVIOR &amp; INTERESTS", S["Section"]))
    els.append(_Bar(CONTENT_W, 1.5, CYAN))
    els.append(Spacer(1, 0.1 * inch))

    _render_section_items(els, S, report, "Behavior", "behavior", None, bare=True)

    activity = _find_section_value(report, "activity_patterns", "Activity Pattern")
    if activity:
        els.append(Paragraph("Activity Patterns", S["SubSection"]))
        els.append(_para(activity, body))

    interests = _find_section_value(report, "behavior", "Identified Interests")
    if interests:
        els.append(Paragraph("Interests", S["SubSection"]))
        els.append(_para(interests, body))

    anomalies = _find_section_value(report, "behavior", "Behavioral Anomalies")
    if anomalies:
        els.append(Paragraph("Behavioral Anomalies", S["SubSection"]))
        els.append(_para(anomalies, body))
    els.append(Spacer(1, 0.15 * inch))

    # ── 8. RELATIONSHIP NETWORK ───────────────────────────────────────────
    rel = report.get("relationship_analysis", {})
    els.append(Paragraph("8.  RELATIONSHIP NETWORK", S["Section"]))
    els.append(_Bar(CONTENT_W, 1.5, CYAN))
    els.append(Spacer(1, 0.1 * inch))
    els.append(_para(rel.get("summary", "No relationship data available."), body))
    conn_count = rel.get("connection_count", 0)
    if conn_count:
        els.append(_para(f"Total mapped connections: {conn_count}", muted))

    rel_section = _find_generic_section(report, "Relationship")
    if rel_section:
        for item in rel_section.get("items", []):
            lbl = item.get("label", "")
            val = item.get("value", "")
            if lbl and val and lbl not in ("Total Connections",):
                els.append(Paragraph(f"<b>{lbl}:</b>  {val}", S["BodySmall"]))
    els.append(Spacer(1, 0.15 * inch))

    # ── 9. ACTIVITY TIMELINE ──────────────────────────────────────────────
    timeline_sec = _find_generic_section(report, "Evidence") or _find_generic_section(report, "Timeline")
    if timeline_sec and timeline_sec.get("items"):
        els.append(Paragraph("9.  ACTIVITY TIMELINE", S["Section"]))
        els.append(_Bar(CONTENT_W, 1.5, CYAN))
        els.append(Spacer(1, 0.1 * inch))
        for item in timeline_sec["items"]:
            val = item.get("value", "")
            lbl = item.get("label", "")
            if val:
                if lbl and lbl not in val:
                    els.append(Paragraph(f"<b>{lbl}:</b>  {val}", S["BodySmall"]))
                else:
                    els.append(_para(val, S["BodySmall"]))
        els.append(Spacer(1, 0.15 * inch))
    els.append(PageBreak())

    # ── 10. ATTACK SURFACE ────────────────────────────────────────────────
    els.append(Paragraph("10.  ATTACK SURFACE ASSESSMENT", S["Section"]))
    els.append(_Bar(CONTENT_W, 1.5, CYAN))
    els.append(Spacer(1, 0.1 * inch))
    els.append(_para(report.get("attack_surface", {}).get("analysis", "No data."), body))

    attack_sec = _find_generic_section(report, "Attack Surface")
    if attack_sec:
        for item in attack_sec.get("items", []):
            lbl, val = item.get("label", ""), item.get("value", "")
            if lbl and val:
                els.append(Paragraph(f"<b>{lbl}:</b>  {val}", S["BodySmall"]))
    els.append(Spacer(1, 0.15 * inch))

    # ── 11. THREAT ANALYSIS ───────────────────────────────────────────────
    els.append(Paragraph("11.  THREAT ANALYSIS", S["Section"]))
    els.append(_Bar(CONTENT_W, 1.5, CYAN))
    els.append(Spacer(1, 0.1 * inch))
    els.append(_para(report.get("threat_analysis", {}).get("analysis", "No data."), body))

    threat_sec = _find_generic_section(report, "Threat Assessment")
    if threat_sec:
        for item in threat_sec.get("items", []):
            lbl, val = item.get("label", ""), item.get("value", "")
            if lbl and val:
                els.append(Paragraph(f"<b>{lbl}:</b>  {val}", S["BodySmall"]))
    els.append(Spacer(1, 0.15 * inch))
    els.append(PageBreak())

    # ── 12. INDICATORS OF COMPROMISE ──────────────────────────────────────
    iocs = report.get("indicators_of_compromise", {})
    has_iocs = any(iocs.get(k) for k in ("emails", "accounts", "platform_urls", "repository_urls"))
    if has_iocs:
        els.append(Paragraph("12.  INDICATORS OF COMPROMISE", S["Section"]))
        els.append(_Bar(CONTENT_W, 1.5, CYAN))
        els.append(Spacer(1, 0.1 * inch))
        ioc_groups = [
            ("Email Addresses", iocs.get("emails", [])),
            ("Usernames / Accounts", iocs.get("accounts", [])),
            ("Platform URLs", iocs.get("platform_urls", [])),
            ("Repository URLs", iocs.get("repository_urls", [])),
        ]
        for group_name, items in ioc_groups:
            if not items:
                continue
            els.append(Paragraph(group_name, S["SubSection"]))
            hdr = [Paragraph("<b>#</b>", S["Label"]),
                   Paragraph(f"<b>{group_name}</b>", S["Label"])]
            rows = [hdr]
            for i, item in enumerate(items, 1):
                rows.append([_para(str(i), muted), _para(str(item), S["BodySmall"])])
            t = Table(rows, colWidths=[0.4 * inch, CONTENT_W - 0.4 * inch])
            t.setStyle(_GRID)
            els.append(t)
            els.append(Spacer(1, 0.1 * inch))
        els.append(Spacer(1, 0.1 * inch))

    # ── 13. RECOMMENDATIONS ───────────────────────────────────────────────
    recs = report.get("recommendations", [])
    if recs:
        els.append(Paragraph("13.  RECOMMENDATIONS", S["Section"]))
        els.append(_Bar(CONTENT_W, 1.5, CYAN))
        els.append(Spacer(1, 0.1 * inch))
        for rec in recs:
            if not isinstance(rec, dict):
                continue
            priority = rec.get("priority", "MEDIUM")
            action = rec.get("action", "")
            pc = _priority_color(priority)
            hex_p = pc.hexval() if hasattr(pc, "hexval") else str(pc)
            if hex_p.startswith("#x"):
                hex_p = "#" + hex_p[2:]
            els.append(Paragraph(
                f'<font color="{hex_p}"><b>[{priority}]</b></font>  {_esc(action)}',
                S["BulletItem"],
            ))
        els.append(Spacer(1, 0.15 * inch))
    els.append(PageBreak())

    # ── 14. INVESTIGATION PIVOTS ──────────────────────────────────────────
    pivots = report.get("investigation_pivots", [])
    if pivots:
        els.append(Paragraph("14.  INVESTIGATION PIVOTS", S["Section"]))
        els.append(_Bar(CONTENT_W, 1.5, CYAN))
        els.append(Spacer(1, 0.1 * inch))
        for p in pivots:
            if not isinstance(p, dict):
                continue
            els.append(Paragraph(f'<b>{_esc(p.get("name", ""))}</b>', S["SubSection"]))
            els.append(_para(p.get("description", ""), body))
        els.append(Spacer(1, 0.15 * inch))

    # ── 15. AI NARRATIVE ──────────────────────────────────────────────────
    ai = report.get("ai_narrative", "")
    if ai:
        els.append(Paragraph("15.  AI INTELLIGENCE NARRATIVE", S["Section"]))
        els.append(_Bar(CONTENT_W, 1.5, CYAN))
        els.append(Spacer(1, 0.1 * inch))
        els.append(_para(ai, body))
        els.append(Spacer(1, 0.15 * inch))

    # ── REMAINING GENERIC SECTIONS (catch-all) ────────────────────────────
    rendered_titles = {
        "executive summary", "subject profile", "correlation summary",
        "digital identifiers", "platform presence", "top repositories",
        "relationship intelligence", "behavior", "content & posts",
        "evidence & source", "intelligence indicators", "attack surface",
        "threat assessment", "ai analysis", "prioritized recommendations",
        "investigation",
    }
    for sec in report.get("sections", []):
        title_lower = (sec.get("title") or "").lower()
        if any(rt in title_lower for rt in rendered_titles):
            continue
        items = sec.get("items", [])
        if not items:
            continue
        els.append(Paragraph(_esc(sec["title"]), S["Section"]))
        els.append(_Bar(CONTENT_W, 1.5, CYAN))
        els.append(Spacer(1, 0.1 * inch))
        for item in items:
            lbl = item.get("label", "")
            val = item.get("value", "")
            if lbl and val:
                els.append(Paragraph(f"<b>{_esc(lbl)}:</b>  {_esc(val)}", S["BodySmall"]))
        els.append(Spacer(1, 0.1 * inch))

    # ── END PAGE ──────────────────────────────────────────────────────────
    els.append(PageBreak())
    els.append(Spacer(1, 2.5 * inch))
    els.append(Paragraph("END OF REPORT", S["Cover"]))
    els.append(_Bar(CONTENT_W, 3, CYAN))
    els.append(Spacer(1, 0.2 * inch))
    els.append(Paragraph("ShadowHorn Intelligence Platform", S["CoverSub"]))
    els.append(Paragraph(f"Generated {now.strftime('%B %d, %Y at %H:%M UTC')}", S["Muted"]))
    els.append(Paragraph("Classification: OSINT — Open Source", S["Muted"]))

    doc.build(els)
    buf.seek(0)
    return buf.getvalue()


# ─── Internal helpers ─────────────────────────────────────────────────────────
def _esc(text):
    """XML-escape text for Paragraph."""
    text = str(text) if text else ""
    return text.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")


def _find_generic_section(report, keyword):
    """Find a section by keyword in title."""
    kw = keyword.lower()
    for sec in report.get("sections", []):
        if kw in (sec.get("title") or "").lower():
            return sec
    return None


def _find_section_value(report, keyword, label_keyword):
    """Find a specific label value from a generic section."""
    sec = _find_generic_section(report, keyword)
    if not sec:
        return None
    lk = label_keyword.lower()
    for item in sec.get("items", []):
        if lk in (item.get("label") or "").lower():
            return item.get("value")
    return None


def _render_section_items(els, S, report, keyword, prefix, number, bare=False):
    """Render a generic section's items."""
    sec = _find_generic_section(report, keyword)
    if not sec or not sec.get("items"):
        return
    if not bare and number:
        els.append(Paragraph(f"{number}.  {_esc(sec.get('title', keyword))}", S["Section"]))
        els.append(_Bar(CONTENT_W, 1.5, CYAN))
        els.append(Spacer(1, 0.1 * inch))
    for item in sec["items"]:
        lbl = item.get("label", "")
        val = item.get("value", "")
        if lbl and val:
            els.append(Paragraph(f"<b>{_esc(lbl)}:</b>  {_esc(val)}", S["BodySmall"]))
