import pytest

from backend.mystic_auth.core.settings import settings
from backend.mystic_auth.emails import email_logo
from backend.mystic_auth.emails.brand_logo import render_brand_logo_png

PNG = b"\x89PNG\r\n\x1a\n" + b"data"
JPEG = b"\xff\xd8\xff\xe0" + b"data"
GIF = b"GIF89a" + b"data"


@pytest.fixture(autouse=True)
def _clear_cache():
    email_logo._load_custom_logo.cache_clear()
    yield
    email_logo._load_custom_logo.cache_clear()


def test_without_a_custom_path_the_generated_badge_is_used(monkeypatch):
    monkeypatch.setattr(settings, "EMAIL_LOGO_PATH", "")
    monkeypatch.setattr(settings, "BRAND_COLOR", "#336699")
    assert email_logo.load_email_logo() == (render_brand_logo_png("#336699"), "png")


@pytest.mark.parametrize(("content", "subtype"), [(PNG, "png"), (JPEG, "jpeg"), (GIF, "gif")])
def test_custom_logo_is_used_with_the_right_image_type(tmp_path, monkeypatch, content, subtype):
    logo = tmp_path / "logo.bin"
    logo.write_bytes(content)
    monkeypatch.setattr(settings, "EMAIL_LOGO_PATH", str(logo))
    assert email_logo.load_email_logo() == (content, subtype)


def test_replacing_the_file_is_picked_up_without_a_restart(tmp_path, monkeypatch):
    logo = tmp_path / "logo.png"
    logo.write_bytes(PNG)
    monkeypatch.setattr(settings, "EMAIL_LOGO_PATH", str(logo))
    assert email_logo.load_email_logo()[0] == PNG
    logo.write_bytes(PNG + b"-v2")
    import os
    os.utime(logo, ns=(1, 2_000_000_000))
    assert email_logo.load_email_logo()[0] == PNG + b"-v2"


@pytest.mark.parametrize("problem", ["missing", "too_big", "not_an_image"])
def test_an_unusable_file_falls_back_to_the_badge_and_warns(tmp_path, monkeypatch, caplog, problem):
    logo = tmp_path / "logo.png"
    if problem == "too_big":
        logo.write_bytes(PNG + b"x" * email_logo.MAX_LOGO_BYTES)
    elif problem == "not_an_image":
        logo.write_bytes(b"<svg></svg>")
    monkeypatch.setattr(settings, "EMAIL_LOGO_PATH", str(logo))
    monkeypatch.setattr(settings, "BRAND_COLOR", "#336699")
    with caplog.at_level("WARNING"):
        assert email_logo.load_email_logo() == (render_brand_logo_png("#336699"), "png")
    assert "EMAIL_LOGO_PATH" in caplog.text
