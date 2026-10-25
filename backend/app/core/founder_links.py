"""Strict validation for the founder's public profile links.

These become clickable links on the public homepage, so they are checked server-side (the admin form
mirrors the rules for instant feedback, but the server is the authority): https only, no credentials in
the URL, no control characters, an actual profile path on the named network, and an allow-listed host so
a field labelled "LinkedIn" can only hold a LinkedIn address. "javascript:", "data:" and plain http are
all refused.
"""

import ipaddress
from urllib.parse import urlsplit

from app.core.exceptions import AppError

# setting key -> (label shown in errors, allowed hosts; None = any public hostname, path optional)
FOUNDER_LINK_RULES: dict[str, tuple[str, tuple[str, ...] | None]] = {
    "founder_linkedin_url": ("LinkedIn", ("linkedin.com",)),
    "founder_github_url": ("GitHub", ("github.com",)),
    "founder_x_url": ("X", ("x.com", "twitter.com")),
    "founder_website_url": ("Website", None),
}


def _reject(label: str, why: str) -> AppError:
    return AppError(code="INVALID_FOUNDER_LINK", message=f"{label} link: {why}", status_code=400)


def validate_founder_link(key: str, url: str) -> str:
    """Return the cleaned URL, or raise AppError. An empty string is valid and means "not shown"."""
    label, hosts = FOUNDER_LINK_RULES[key]
    url = url.strip()
    if not url:
        return ""
    if any(ord(c) < 32 or c.isspace() for c in url):
        raise _reject(label, "must not contain spaces or control characters")

    parts = urlsplit(url)
    if parts.scheme != "https":
        raise _reject(label, "must start with https://")
    host = (parts.hostname or "").lower()
    if not host or "@" in parts.netloc:
        raise _reject(label, "must be a plain address without a username or password")

    if hosts is not None:
        if not any(host == h or host.endswith("." + h) for h in hosts):
            raise _reject(label, f"must be an address on {' or '.join(hosts)}")
        if parts.path.strip("/") == "":
            raise _reject(label, "must point to your profile, not just the site's home page")
    else:
        try:
            ipaddress.ip_address(host)
            raise _reject(label, "must use a domain name, not an IP address")
        except ValueError:
            pass
        if "." not in host or host == "localhost" or host.endswith((".local", ".internal", ".localhost")):
            raise _reject(label, "must be a public website address")
    return url
