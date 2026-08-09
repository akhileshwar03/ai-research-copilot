"""HTTP-level contract tests for /paper-analyzer/analyze — auth gating,
validation, and response shape against the FakePaperAnalyzerService override
in conftest.py. Real measurement logic is covered by
test_paper_analyzer_service.py.
"""

import io

from reportlab.lib.pagesizes import letter
from reportlab.pdfgen import canvas


def _simple_pdf() -> bytes:
    buf = io.BytesIO()
    c = canvas.Canvas(buf, pagesize=letter)
    c.setFont("Times-Roman", 12)
    c.drawString(72, 700, "Some body text for the paper analyzer to read.")
    c.showPage()
    c.save()
    return buf.getvalue()


def test_analyze_requires_auth(client):
    resp = client.post(
        "/api/v1/paper-analyzer/analyze",
        files={"file": ("paper.pdf", _simple_pdf(), "application/pdf")},
        data={"style": "apa"},
    )
    assert resp.status_code == 401


def test_analyze_rejects_non_pdf(client, auth_headers):
    resp = client.post(
        "/api/v1/paper-analyzer/analyze",
        files={"file": ("paper.txt", b"hello", "text/plain")},
        data={"style": "apa"},
        headers=auth_headers,
    )
    assert resp.status_code == 400


def test_analyze_requires_style_field(client, auth_headers):
    resp = client.post(
        "/api/v1/paper-analyzer/analyze",
        files={"file": ("paper.pdf", _simple_pdf(), "application/pdf")},
        headers=auth_headers,
    )
    assert resp.status_code == 422


def test_analyze_success_shape(client, auth_headers):
    resp = client.post(
        "/api/v1/paper-analyzer/analyze",
        files={"file": ("paper.pdf", _simple_pdf(), "application/pdf")},
        data={"style": "apa"},
        headers=auth_headers,
    )
    assert resp.status_code == 200
    body = resp.json()
    assert body["style_guide"] == "APA (7th ed.)"  # via FakePaperAnalyzerService
    assert "overall_score" in body
    assert "checks" in body and len(body["checks"]) >= 1
    assert "disclaimer" in body and body["disclaimer"]
