"""HTTP-level contract tests for /humanize and /checker/* — auth gating,
validation errors, and response shape. Real service logic (heuristics, LLM
combination) is covered by test_checker_service.py / test_humanizer_service.py;
these tests exercise the route wiring against the Fake*Service overrides in
conftest.py.
"""

import io


def _build_minimal_pdf(text: str) -> bytes:
    """Hand-built, dependency-free PDF with real extractable text (no
    reportlab/fpdf in this venv)."""
    objects = [
        b"<< /Type /Catalog /Pages 2 0 R >>",
        b"<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
        b"<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] "
        b"/Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>",
        b"<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
    ]
    stream = f"BT /F1 18 Tf 72 700 Td ({text}) Tj ET".encode("latin-1")
    objects.append(b"<< /Length %d >>\nstream\n" % len(stream) + stream + b"\nendstream")

    out = io.BytesIO()
    out.write(b"%PDF-1.4\n")
    offsets = []
    for i, obj in enumerate(objects, start=1):
        offsets.append(out.tell())
        out.write(f"{i} 0 obj\n".encode())
        out.write(obj)
        out.write(b"\nendobj\n")
    xref_offset = out.tell()
    n = len(objects) + 1
    out.write(f"xref\n0 {n}\n".encode())
    out.write(b"0000000000 65535 f \n")
    for off in offsets:
        out.write(f"{off:010d} 00000 n \n".encode())
    out.write(f"trailer\n<< /Size {n} /Root 1 0 R >>\nstartxref\n{xref_offset}\n%%EOF".encode())
    return out.getvalue()


# ── Humaniser ────────────────────────────────────────────────────────────────


def test_humanize_requires_auth(client):
    resp = client.post("/api/v1/humanize", json={"text": "hello there"})
    assert resp.status_code == 401


def test_humanize_success_streams_sse(client, auth_headers):
    resp = client.post("/api/v1/humanize", json={"text": "hello there"}, headers=auth_headers)
    assert resp.status_code == 200
    assert "text/event-stream" in resp.headers.get("content-type", "")

    text = resp.text
    assert 'data: "[normal]"' in text
    assert 'data: "hello there"' in text
    assert "event: done" in text


def test_humanize_rejects_empty_text(client, auth_headers):
    resp = client.post("/api/v1/humanize", json={"text": "   "}, headers=auth_headers)
    assert resp.status_code == 400


def test_humanize_rejects_missing_field(client, auth_headers):
    resp = client.post("/api/v1/humanize", json={}, headers=auth_headers)
    assert resp.status_code == 422


# ── Humaniser history ────────────────────────────────────────────────────────


def test_humanizer_runs_requires_auth(client):
    resp = client.get("/api/v1/humanizer/runs")
    assert resp.status_code == 401


def test_humanizer_runs_create_list_delete_round_trip(client, auth_headers):
    create_resp = client.post(
        "/api/v1/humanizer/runs",
        json={"input_text": "original text", "output_text": "rewritten text", "style": "normal"},
        headers=auth_headers,
    )
    assert create_resp.status_code == 200
    run_id = create_resp.json()["id"]

    list_resp = client.get("/api/v1/humanizer/runs", headers=auth_headers)
    assert list_resp.status_code == 200
    body = list_resp.json()
    assert body["total"] == 1
    assert body["runs"][0]["id"] == run_id
    assert body["runs"][0]["output_text"] == "rewritten text"

    delete_resp = client.delete(f"/api/v1/humanizer/runs/{run_id}", headers=auth_headers)
    assert delete_resp.status_code == 200

    list_after_delete = client.get("/api/v1/humanizer/runs", headers=auth_headers)
    assert list_after_delete.json()["total"] == 0


# ── AI Checker: text ─────────────────────────────────────────────────────────


def test_checker_text_requires_auth(client):
    resp = client.post("/api/v1/checker/text", json={"text": "hello"})
    assert resp.status_code == 401


def test_checker_text_success(client, auth_headers):
    resp = client.post("/api/v1/checker/text", json={"text": "some text to analyze"}, headers=auth_headers)
    assert resp.status_code == 200
    body = resp.json()
    assert body["verdict"] == "uncertain"
    assert "disclaimer" in body and body["disclaimer"]
    assert "signals" in body


def test_checker_text_rejects_empty(client, auth_headers):
    resp = client.post("/api/v1/checker/text", json={"text": ""}, headers=auth_headers)
    assert resp.status_code in (400, 422)


# ── AI Checker: document ─────────────────────────────────────────────────────


def test_checker_document_requires_auth(client):
    pdf_bytes = _build_minimal_pdf("hello")
    resp = client.post(
        "/api/v1/checker/document",
        files={"file": ("test.pdf", pdf_bytes, "application/pdf")},
    )
    assert resp.status_code == 401


def test_checker_document_rejects_non_pdf(client, auth_headers):
    resp = client.post(
        "/api/v1/checker/document",
        files={"file": ("test.txt", b"hello", "text/plain")},
        headers=auth_headers,
    )
    assert resp.status_code == 400


def test_checker_document_extracts_text_and_checks_it(client, auth_headers):
    pdf_bytes = _build_minimal_pdf("This document contains real extractable text.")
    resp = client.post(
        "/api/v1/checker/document",
        files={"file": ("test.pdf", pdf_bytes, "application/pdf")},
        headers=auth_headers,
    )
    assert resp.status_code == 200
    body = resp.json()
    assert body["verdict"] == "uncertain"  # via FakeCheckerService


def test_checker_document_rejects_pdf_with_no_extractable_text(client, auth_headers):
    # A PDF with an empty content stream has nothing for pypdf to extract.
    pdf_bytes = _build_minimal_pdf("")
    resp = client.post(
        "/api/v1/checker/document",
        files={"file": ("blank.pdf", pdf_bytes, "application/pdf")},
        headers=auth_headers,
    )
    assert resp.status_code == 422


# ── Writing Feedback ─────────────────────────────────────────────────────────


def test_writing_feedback_requires_auth(client):
    resp = client.post("/api/v1/checker/feedback", json={"text": "hello there"})
    assert resp.status_code == 401


def test_writing_feedback_success(client, auth_headers):
    resp = client.post("/api/v1/checker/feedback", json={"text": "some text to review"}, headers=auth_headers)
    assert resp.status_code == 200
    body = resp.json()
    assert body["overall_score"] == 80
    assert len(body["issues"]) == 1
    assert body["issues"][0]["type"] == "style"


def test_writing_feedback_rejects_empty(client, auth_headers):
    resp = client.post("/api/v1/checker/feedback", json={"text": ""}, headers=auth_headers)
    assert resp.status_code in (400, 422)
