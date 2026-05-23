"""Trust badge SVG renderer.

Produces a shields.io-style two-segment badge. No external HTTP call — rendered in-process so it's
cacheable, embeddable, and never goes down because shields.io did."""
from __future__ import annotations

_GRADE_COLOR = {
    "TRUSTED":   "#3fb950",  # green
    "CAUTION":   "#d29922",  # yellow
    "RISKY":     "#db6d28",  # orange
    "DANGEROUS": "#f85149",  # red
}


def _est_text_width(s: str) -> int:
    """Rough monospaced-ish width estimate. Good enough for badge layout."""
    return max(40, int(sum(7 if c.isupper() else 6 for c in s) + 14))


def render_badge_svg(grade: str, score: int) -> str:
    grade = (grade or "UNKNOWN").upper()
    color = _GRADE_COLOR.get(grade, "#586069")
    label = "AgentRed"
    value = f"{score}/100 · {grade}"

    label_w = _est_text_width(label)
    value_w = _est_text_width(value)
    total_w = label_w + value_w

    return (
        f'<svg xmlns="http://www.w3.org/2000/svg" width="{total_w}" height="20" role="img" '
        f'aria-label="{label}: {value}">'
        f'<title>{label}: {value}</title>'
        f'<linearGradient id="s" x2="0" y2="100%">'
        f'<stop offset="0" stop-color="#bbb" stop-opacity=".1"/>'
        f'<stop offset="1" stop-opacity=".1"/>'
        f'</linearGradient>'
        f'<clipPath id="r"><rect width="{total_w}" height="20" rx="3" fill="#fff"/></clipPath>'
        f'<g clip-path="url(#r)">'
        f'<rect width="{label_w}" height="20" fill="#24292f"/>'
        f'<rect x="{label_w}" width="{value_w}" height="20" fill="{color}"/>'
        f'<rect width="{total_w}" height="20" fill="url(#s)"/>'
        f'</g>'
        f'<g fill="#fff" text-anchor="middle" font-family="Verdana,Geneva,DejaVu Sans,sans-serif" '
        f'text-rendering="geometricPrecision" font-size="11">'
        f'<text aria-hidden="true" x="{label_w/2}" y="15" fill="#010101" fill-opacity=".3">{label}</text>'
        f'<text x="{label_w/2}" y="14">{label}</text>'
        f'<text aria-hidden="true" x="{label_w + value_w/2}" y="15" fill="#010101" fill-opacity=".3">{value}</text>'
        f'<text x="{label_w + value_w/2}" y="14">{value}</text>'
        f'</g>'
        f'</svg>'
    )
