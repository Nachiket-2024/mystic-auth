"""The emailed logo: a valid PNG in the brand color, attached inline, shown beside the app name."""
import struct
import zlib
from unittest.mock import AsyncMock

import pytest

from backend.mystic_auth.emails.brand_logo import LOGO_CONTENT_ID, render_brand_logo_png
from backend.mystic_auth.emails.email_sender import SMTPEmailSender
from backend.mystic_auth.emails.email_template_service import render_transactional_email

MODULE = "backend.mystic_auth.emails.email_sender"


def decode(png: bytes):
    """Minimal decoder for the filter-0 RGBA PNGs this module writes."""
    assert png[:8] == b"\x89PNG\r\n\x1a\n"
    pos, width, height, idat = 8, 0, 0, b""
    while pos < len(png):
        length, kind = struct.unpack(">I4s", png[pos:pos + 8])
        data = png[pos + 8:pos + 8 + length]
        assert zlib.crc32(kind + data) & 0xFFFFFFFF == struct.unpack(">I", png[pos + 8 + length:pos + 12 + length])[0]
        if kind == b"IHDR":
            width, height = struct.unpack(">II", data[:8])
        elif kind == b"IDAT":
            idat += data
        pos += 12 + length
    raw = zlib.decompress(idat)
    stride = 1 + width * 4
    return width, height, [raw[r * stride + 1:(r + 1) * stride] for r in range(height)]


def pixel(rows, x, y):
    return tuple(rows[y][x * 4:x * 4 + 4])


def test_png_is_valid_and_square():
    width, height, _ = decode(render_brand_logo_png("#b5533c"))
    assert (width, height) == (96, 96)


def test_fill_is_the_brand_color_with_transparent_corners_and_white_strokes():
    _, _, rows = decode(render_brand_logo_png("#112233"))
    assert pixel(rows, 48, 6) == (0x11, 0x22, 0x33, 255)   # plain badge area
    assert pixel(rows, 0, 0)[3] == 0                        # rounded corner is transparent
    assert pixel(rows, 48, 48)[:3] == (255, 255, 255)       # centre line is white
    assert pixel(rows, 48, 76)[:3] == (255, 255, 255)       # base line is white


def test_different_colors_give_different_images():
    assert render_brand_logo_png("#b5533c") != render_brand_logo_png("#2c7a7b")


def test_template_shows_the_logo_beside_the_app_name_in_the_accent_color(monkeypatch):
    monkeypatch.setattr("backend.mystic_auth.emails.email_template_service.settings.APP_NAME", "MysticAuth")
    html = render_transactional_email(
        preheader="p", heading="h", accent_color="#b5533c", intro="i",
        cta_label="Go", cta_url="https://example.test", expiry_note="e", ignore_note="n",
    )
    assert f'src="cid:{LOGO_CONTENT_ID}"' in html
    assert "font-weight:bold" in html and "color:#b5533c;\">MysticAuth" in html
    assert html.index(f"cid:{LOGO_CONTENT_ID}") < html.index(">MysticAuth<")


@pytest.mark.asyncio
async def test_sender_attaches_the_logo_inline_when_the_body_references_it(mocker):
    send = mocker.patch(f"{MODULE}.aiosmtplib.send", new_callable=AsyncMock)
    mocker.patch(f"{MODULE}.settings.BRAND_COLOR", "#112233")

    await SMTPEmailSender().send("u@example.com", "s", f'<img src="cid:{LOGO_CONTENT_ID}">')

    message = send.call_args.args[0]
    assert message.get_content_type() == "multipart/related"
    parts = list(message.iter_parts())
    image = next(p for p in parts if p.get_content_type() == "image/png")
    assert image["Content-ID"] == f"<{LOGO_CONTENT_ID}>"
    assert image.get_content() == render_brand_logo_png("#112233")


@pytest.mark.asyncio
async def test_sender_leaves_other_mail_without_an_attachment(mocker):
    send = mocker.patch(f"{MODULE}.aiosmtplib.send", new_callable=AsyncMock)
    await SMTPEmailSender().send("u@example.com", "s", "<p>no logo here</p>")
    assert not send.call_args.args[0].is_multipart()


def test_template_has_no_tagline_under_the_name():
    html = render_transactional_email(
        preheader="p", heading="h", accent_color="#b5533c", intro="i",
        cta_label="Go", cta_url="https://example.test", expiry_note="e", ignore_note="n",
    )
    assert "centrally managed" not in html
