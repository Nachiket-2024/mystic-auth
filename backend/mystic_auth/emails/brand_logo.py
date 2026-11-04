"""The brand badge as a PNG, for emails.

Mail clients (Gmail above all) drop inline SVG and data: images, and a hosted
image would need a public URL that the mail provider can fetch. So the badge is
drawn here, in pure Python with no imaging dependency, and attached to the
message as an inline image (see email_sender.py).

This is the default email logo, always drawn from BRAND_COLOR, never from
VITE_APP_LOGO_URL, VITE_APP_FAVICON_URL, a user's own color pick or the app's
theme.ts. A project's own image is set with EMAIL_LOGO_PATH (email_logo.py). See docs/mystic_auth/appearance/overview.md#where-the-brand-shows-up.

The geometry is the same as frontend/public/favicon.svg and
frontend/src/mystic_auth/theme/brandIcon.ts (24x24 units): a rounded square in
the brand color with a white arch, a centre line, a base line and two dots.
"""
import math
import struct
import zlib
from functools import lru_cache

LOGO_CONTENT_ID = "brand-logo"

_VIEWBOX = 24.0
_CORNER_RADIUS = 5.0
_STROKE_HALF_WIDTH = 0.8        # stroke-width 1.6
_ARCH_CENTER = (12.0, 11.0)
_ARCH_RADIUS = 5.0
_SEGMENTS = (                   # straight strokes, round caps
    ((7.0, 19.0), (7.0, 11.0)),     # left side of the arch
    ((17.0, 11.0), (17.0, 19.0)),   # right side of the arch
    ((12.0, 19.0), (12.0, 6.0)),    # centre line
    ((6.0, 19.0), (18.0, 19.0)),    # base
)
_DOTS = ((10.5, 14.0), (13.5, 14.0))
_DOT_RADIUS = 0.55
_SAMPLES = 4                    # 4 x 4 samples per pixel for smooth edges


def _distance_to_segment(px: float, py: float, a: tuple[float, float], b: tuple[float, float]) -> float:
    ax, ay = a
    bx, by = b
    dx, dy = bx - ax, by - ay
    t = max(0.0, min(1.0, ((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy)))
    return math.hypot(px - (ax + t * dx), py - (ay + t * dy))


def _inside_rounded_square(x: float, y: float) -> bool:
    cx = min(max(x, _CORNER_RADIUS), _VIEWBOX - _CORNER_RADIUS)
    cy = min(max(y, _CORNER_RADIUS), _VIEWBOX - _CORNER_RADIUS)
    return 0.0 <= x <= _VIEWBOX and 0.0 <= y <= _VIEWBOX and math.hypot(x - cx, y - cy) <= _CORNER_RADIUS


def _is_white(x: float, y: float) -> bool:
    if any(_distance_to_segment(x, y, a, b) <= _STROKE_HALF_WIDTH for a, b in _SEGMENTS):
        return True
    arch_x, arch_y = _ARCH_CENTER
    if y <= arch_y and abs(math.hypot(x - arch_x, y - arch_y) - _ARCH_RADIUS) <= _STROKE_HALF_WIDTH:
        return True
    return any(math.hypot(x - dx, y - dy) <= _DOT_RADIUS for dx, dy in _DOTS)


def _chunk(kind: bytes, data: bytes) -> bytes:
    body = kind + data
    return struct.pack(">I", len(data)) + body + struct.pack(">I", zlib.crc32(body) & 0xFFFFFFFF)


@lru_cache(maxsize=8)
def render_brand_logo_png(hex_color: str, size: int = 96) -> bytes:
    """RGBA PNG of the badge filled with `hex_color` (#rrggbb)."""
    red, green, blue = (int(hex_color[i:i + 2], 16) for i in (1, 3, 5))
    unit = _VIEWBOX / size
    step = unit / _SAMPLES
    rows = []
    for row in range(size):
        line = bytearray([0])  # PNG filter type 0 (none)
        for col in range(size):
            covered = white = 0
            for sy in range(_SAMPLES):
                for sx in range(_SAMPLES):
                    x = col * unit + (sx + 0.5) * step
                    y = row * unit + (sy + 0.5) * step
                    if _inside_rounded_square(x, y):
                        covered += 1
                        if _is_white(x, y):
                            white += 1
            if covered == 0:
                line += b"\x00\x00\x00\x00"
                continue
            mix = white / covered
            line += bytes((
                round(red + (255 - red) * mix),
                round(green + (255 - green) * mix),
                round(blue + (255 - blue) * mix),
                round(255 * covered / (_SAMPLES * _SAMPLES)),
            ))
        rows.append(bytes(line))
    header = struct.pack(">IIBBBBB", size, size, 8, 6, 0, 0, 0)  # 8-bit RGBA
    return (
        b"\x89PNG\r\n\x1a\n"
        + _chunk(b"IHDR", header)
        + _chunk(b"IDAT", zlib.compress(b"".join(rows), 9))
        + _chunk(b"IEND", b"")
    )
