from io import BytesIO


def test_upload_documents_contract_legacy_and_v1(client):
    files = {"file": ("demo.pdf", BytesIO(b"%PDF-1.4\n1 0 obj\n<<>>\nendobj\ntrailer\n<<>>\n%%EOF"), "application/pdf")}
    up_legacy = client.post("/upload", files=files)
    files2 = {"file": ("demo.pdf", BytesIO(b"%PDF-1.4\n%%EOF"), "application/pdf")}
    up_v1 = client.post("/api/v1/upload", files=files2)

    assert up_legacy.status_code == 200
    assert up_v1.status_code == 200
    assert up_legacy.json()["message"] == "PDF uploaded successfully"

    docs_legacy = client.get("/documents")
    docs_v1 = client.get("/api/v1/documents")
    assert docs_legacy.status_code == 200
    assert docs_v1.status_code == 200


def test_chat_streaming_contract_legacy_and_v1(client):
    payload = {"messages": [{"role": "user", "content": "hi"}], "document_id": None}

    legacy = client.post("/chat", json=payload)
    v1 = client.post("/api/v1/chat", json=payload)

    assert legacy.status_code == 200
    assert v1.status_code == 200
    assert legacy.text == "hello world"
    assert v1.text == "hello world"


def test_health_and_readiness(client):
    h1 = client.get("/health")
    h2 = client.get("/api/v1/health")
    r1 = client.get("/readiness")
    r2 = client.get("/api/v1/readiness")

    assert h1.status_code == 200
    assert h2.status_code == 200
    assert r1.status_code == 200
    assert r2.status_code == 200
    assert h1.json()["status"] == "ok"
    assert "checks" in r1.json()
