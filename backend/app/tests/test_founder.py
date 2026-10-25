"""The founder note (2026-10-25): admin-editable, strictly opt-in, strictly validated.

What these pin, in order: link validation (https only, allow-listed hosts, real profile paths); the
publishing gate (nothing is public unless switched on AND named AND noted); the photo pipeline (square,
bounded, EXIF stripped, bomb/forgery refused); and access control (admins only).
"""

import io

import pytest
from PIL import Image

from app.core.exceptions import AppError
from app.core.founder_links import validate_founder_link
from app.db.models.admin_audit_log import AdminAuditLog
from app.services.runtime_settings import runtime_settings
from app.tests.conftest import TestingSessionLocal
from app.tests.test_admin_and_security import _register_and_login
from app.tests.test_admin_platform import admin_headers, fake_bg_storage  # noqa: F401  (fixtures)

PUBLIC = "/api/v1/app/founder"
ADMIN_PHOTO = "/api/v1/admin/founder/photo"
PUBLIC_PHOTO = "/api/v1/app/founder/photo"


def _set(**values):
    db = TestingSessionLocal()
    try:
        for key, value in values.items():
            runtime_settings.set(db, key, value)
    finally:
        db.close()


@pytest.fixture(autouse=True)
def _reset_founder_settings():
    blank = dict(
        founder_section_enabled=False, founder_name="", founder_title="", founder_note="",
        founder_linkedin_url="", founder_github_url="", founder_x_url="", founder_website_url="",
    )
    _set(**blank)
    yield
    _set(**blank)


def _publish(**extra):
    _set(founder_section_enabled=True, founder_name="Ada Lovelace", founder_note="First paragraph.\n\nSecond.", **extra)


def _image_bytes(size=(800, 1000), fmt="JPEG", exif=False) -> bytes:
    img = Image.new("RGB", size, (180, 120, 90))
    buf = io.BytesIO()
    kwargs = {}
    if exif:
        data = Image.Exif()
        data[274] = 6  # orientation: rotate
        data[271] = "SecretPhoneMaker"  # Make
        data[272] = "PrivateModel"  # Model
        data[306] = "2026:10:01 12:00:00"  # DateTime
        kwargs["exif"] = data
    img.save(buf, format=fmt, **kwargs)
    return buf.getvalue()


# ── link validation ───────────────────────────────────────────────────────────────

@pytest.mark.parametrize(
    "key,url",
    [
        ("founder_linkedin_url", "https://www.linkedin.com/in/ada-lovelace"),
        ("founder_linkedin_url", "https://uk.linkedin.com/in/ada"),
        ("founder_github_url", "https://github.com/ada"),
        ("founder_x_url", "https://x.com/ada"),
        ("founder_x_url", "https://twitter.com/ada"),
        ("founder_website_url", "https://ada.dev"),
        ("founder_website_url", "https://www.example.com/about"),
        ("founder_github_url", ""),  # empty = hidden
    ],
)
def test_valid_links_are_accepted(key, url):
    assert validate_founder_link(key, url) == url


@pytest.mark.parametrize(
    "key,url",
    [
        ("founder_github_url", "http://github.com/ada"),  # not https
        ("founder_github_url", "javascript:alert(1)"),
        ("founder_website_url", "data:text/html,<script>alert(1)</script>"),
        ("founder_website_url", "//evil.example/x"),
        ("founder_github_url", "https://evil.example/ada"),  # wrong network for the field
        ("founder_github_url", "https://github.com.evil.example/ada"),  # look-alike host
        ("founder_github_url", "https://notgithub.com/ada"),
        ("founder_github_url", "https://github.com"),  # no profile path
        ("founder_linkedin_url", "https://linkedin.com/"),
        ("founder_github_url", "https://user:pass@github.com/ada"),  # credentials in the URL
        ("founder_website_url", "https://127.0.0.1/"),
        ("founder_website_url", "https://localhost/"),
        ("founder_website_url", "https://intranet/"),  # no dot
        ("founder_website_url", "https://a b.com"),  # whitespace
        ("founder_website_url", "https://exa\tmple.com"),  # control character
    ],
)
def test_unsafe_or_wrong_links_are_refused(key, url):
    with pytest.raises(AppError) as exc:
        validate_founder_link(key, url)
    assert exc.value.code == "INVALID_FOUNDER_LINK"
    assert exc.value.status_code == 400


def test_the_admin_api_refuses_a_bad_link_and_saves_a_good_one(client, admin_headers):
    bad = client.put("/api/v1/admin/settings", headers=admin_headers, json={"settings": {"founder_github_url": "javascript:alert(1)"}})
    assert bad.status_code == 400
    assert bad.json()["error"]["code"] == "INVALID_FOUNDER_LINK"
    assert runtime_settings.get("founder_github_url") == ""

    good = client.put("/api/v1/admin/settings", headers=admin_headers, json={"settings": {"founder_github_url": "https://github.com/ada"}})
    assert good.status_code == 200
    assert runtime_settings.get("founder_github_url") == "https://github.com/ada"


def test_the_founder_category_is_listed_for_the_admin_ui(client, admin_headers):
    keys = {s["key"]: s for s in client.get("/api/v1/admin/settings", headers=admin_headers).json()}
    assert {k for k in keys if k.startswith("founder_")} == {
        "founder_section_enabled", "founder_name", "founder_title", "founder_note",
        "founder_linkedin_url", "founder_github_url", "founder_x_url", "founder_website_url",
    }
    assert all(keys[k]["category"] == "founder" for k in keys if k.startswith("founder_"))


# ── the publishing gate ───────────────────────────────────────────────────────────

def test_nothing_is_public_by_default(client):
    body = client.get(PUBLIC).json()
    assert body == {"enabled": False, "name": "", "title": "", "note": "", "photo_url": None, "links": []}


@pytest.mark.parametrize(
    "values",
    [
        dict(founder_section_enabled=False, founder_name="Ada", founder_note="Hello"),  # switched off
        dict(founder_section_enabled=True, founder_name="", founder_note="Hello"),  # no name
        dict(founder_section_enabled=True, founder_name="Ada", founder_note=""),  # no note
        dict(founder_section_enabled=True, founder_name="   ", founder_note="Hello"),  # whitespace name
    ],
)
def test_the_section_stays_hidden_unless_on_named_and_noted(client, values):
    _set(**values, founder_github_url="https://github.com/ada")
    body = client.get(PUBLIC).json()
    assert body["enabled"] is False
    assert body["name"] == "" and body["note"] == "" and body["links"] == []  # nothing leaks while hidden


def test_a_published_section_returns_only_what_was_filled_in(client):
    _publish(founder_title="Founder, Querex", founder_github_url="https://github.com/ada", founder_website_url="https://ada.dev")
    body = client.get(PUBLIC).json()
    assert body["enabled"] is True
    assert body["name"] == "Ada Lovelace" and body["title"] == "Founder, Querex"
    assert body["note"] == "First paragraph.\n\nSecond."
    assert [(l["kind"], l["url"]) for l in body["links"]] == [("github", "https://github.com/ada"), ("website", "https://ada.dev")]
    assert body["photo_url"] is None  # no invented avatar


def test_the_public_endpoint_needs_no_login(client):
    assert client.get(PUBLIC).status_code == 200


# ── the photo ─────────────────────────────────────────────────────────────────────

def _upload(client, headers, data, name="me.jpg", ctype="image/jpeg"):
    return client.post(ADMIN_PHOTO, headers=headers, files={"file": (name, data, ctype)})


def test_photo_is_square_small_and_stripped_of_metadata(client, admin_headers, fake_bg_storage):
    resp = _upload(client, admin_headers, _image_bytes(exif=True))
    assert resp.status_code == 200, resp.text
    assert resp.json()["photo_url"].startswith("/app/founder/photo?v=")

    stored = client.get(ADMIN_PHOTO, headers=admin_headers)
    assert stored.status_code == 200 and stored.headers["content-type"] == "image/webp"
    image = Image.open(io.BytesIO(stored.content))
    assert image.format == "WEBP" and image.size == (512, 512)
    assert len(stored.content) <= 90 * 1024
    # the original carried Make/Model/DateTime/orientation; none of it may survive
    assert len(image.getexif()) == 0
    assert b"SecretPhoneMaker" not in stored.content and b"PrivateModel" not in stored.content


def test_the_photo_is_not_public_until_the_section_is_published(client, admin_headers, fake_bg_storage):
    assert _upload(client, admin_headers, _image_bytes()).status_code == 200
    assert client.get(PUBLIC_PHOTO).status_code == 404  # uploaded, but the section is off
    assert client.get(PUBLIC).json()["photo_url"] is None

    _publish()
    url = client.get(PUBLIC).json()["photo_url"]
    assert url and url.startswith("/app/founder/photo?v=")
    served = client.get(PUBLIC_PHOTO)
    assert served.status_code == 200 and served.headers["content-type"] == "image/webp"
    # short-lived on purpose: it can be un-published, and a cached copy outlives that
    assert served.headers["cache-control"] == "public, max-age=300"


def test_replacing_the_photo_changes_its_version_url(client, admin_headers, fake_bg_storage):
    _publish()
    _upload(client, admin_headers, _image_bytes())
    first = client.get(PUBLIC).json()["photo_url"]
    _upload(client, admin_headers, _image_bytes(size=(900, 900), fmt="PNG"), name="me.png", ctype="image/png")
    assert client.get(PUBLIC).json()["photo_url"] != first


def test_deleting_the_photo_removes_it_everywhere(client, admin_headers, fake_bg_storage):
    _publish()
    _upload(client, admin_headers, _image_bytes())
    assert client.delete(ADMIN_PHOTO, headers=admin_headers).status_code == 200
    assert client.get(PUBLIC).json()["photo_url"] is None
    assert client.get(PUBLIC_PHOTO).status_code == 404
    assert client.delete(ADMIN_PHOTO, headers=admin_headers).status_code == 404


@pytest.mark.parametrize(
    "data,ctype,status",
    [
        (b"not an image at all", "image/jpeg", 400),  # bytes disagree with the declared type
        (_image_bytes(fmt="PNG"), "image/jpeg", 400),  # a PNG claiming to be a JPEG
        (b"%PDF-1.4 ...", "application/pdf", 400),  # wrong content type
        (_image_bytes(size=(100, 100)), "image/jpeg", 400),  # too small to be a usable portrait
        (b"\xff\xd8\xff" + b"0" * (9 * 1024 * 1024), "image/jpeg", 413),  # over the 8 MB limit
    ],
)
def test_bad_uploads_are_refused(client, admin_headers, fake_bg_storage, data, ctype, status):
    assert _upload(client, admin_headers, data, ctype=ctype).status_code == status
    assert client.get(ADMIN_PHOTO, headers=admin_headers).status_code == 404  # nothing was stored


def test_a_decompression_bomb_is_refused_before_it_is_decoded(client, admin_headers, fake_bg_storage):
    bomb = io.BytesIO()
    Image.new("1", (7000, 7000)).save(bomb, format="PNG")  # ~49 megapixels, tiny on the wire
    assert len(bomb.getvalue()) < 1024 * 1024
    resp = _upload(client, admin_headers, bomb.getvalue(), name="x.png", ctype="image/png")
    assert resp.status_code == 413
    assert resp.json()["error"]["code"] == "IMAGE_TOO_LARGE"


# ── access control and audit ──────────────────────────────────────────────────────

def test_only_admins_can_touch_the_photo(client, unique_email, fake_bg_storage):
    plain_headers = _register_and_login(client, unique_email)  # a normal, non-admin account
    for method, kwargs in (
        ("post", {"files": {"file": ("me.jpg", _image_bytes(), "image/jpeg")}}),
        ("get", {}),
        ("delete", {}),
    ):
        assert getattr(client, method)(ADMIN_PHOTO, headers=plain_headers, **kwargs).status_code == 403
        assert getattr(client, method)(ADMIN_PHOTO, **kwargs).status_code == 401


def test_photo_changes_are_audited(client, admin_headers, fake_bg_storage):
    _upload(client, admin_headers, _image_bytes())
    client.delete(ADMIN_PHOTO, headers=admin_headers)
    with TestingSessionLocal() as db:
        actions = [a.action for a in db.query(AdminAuditLog).all()]
    assert "founder.photo.upload" in actions and "founder.photo.delete" in actions
