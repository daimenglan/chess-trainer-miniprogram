#!/usr/bin/env python3
"""Generate tab bar icons for mychess AI mini program.

Creates 3 icon pairs (active + inactive):
  - 对弈 (Play)    : chess knight
  - 棋谱 (Records)  : open book with chess notation
  - 我的 (Profile)  : user avatar

Active   = purple fill (#6c63ff) with subtle glow
Inactive = grey outline (#8888aa)
"""

from PIL import Image, ImageDraw, ImageFilter
import os

SIZE = 128
OUT_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "images")
os.makedirs(OUT_DIR, exist_ok=True)

PURPLE     = (108, 99, 255)
PURPLE_HI  = (139, 132, 255)
GREY       = (136, 136, 170)
GREY_HI    = (160, 160, 190)
BG         = (26, 26, 46)


def draw_pawn(draw, cx, cy, fill, hi):
    """Draw a clean geometric chess pawn, sized at 2/3 of the board square."""
    # Canvas 128 = one chessboard square; piece fills 2/3 → ~85 px
    # Head circle
    hr = 14
    draw.ellipse([cx - hr, cy - 46 - hr, cx + hr, cy - 46 + hr],
                 fill=fill, outline=hi)
    # Neck / collar (connects directly to head)
    draw.rectangle([cx - 4, cy - 32, cx + 4, cy - 24], fill=fill)
    # Body – flared trapezoid
    top_w, bot_w = 17, 46
    body_h = 42
    top_y = cy - 24
    draw.polygon(
        [(cx - top_w // 2, top_y),
         (cx + top_w // 2, top_y),
         (cx + bot_w // 2, top_y + body_h),
         (cx - bot_w // 2, top_y + body_h)],
        fill=fill, outline=hi
    )
    # Base pedestal – sits directly under the body
    bw, bh = 54, 9
    draw.rounded_rectangle(
        [cx - bw // 2, cy + 18, cx + bw // 2, cy + 27],
        radius=4, fill=fill, outline=hi, width=1
    )


def draw_book(draw, cx, cy, fill, hi):
    """Draw an open book with chess notation."""
    pw, ph = 44, 36   # page dimensions
    spine = 6

    # Left page (chessboard grid)
    lx0, ly0 = cx - pw // 2 - 2, cy - ph // 2
    lx1, ly1 = cx - spine // 2, cy + ph // 2
    draw.polygon(
        [(lx0, ly0), (lx1, ly0 - 4), (lx1, ly1), (lx0, ly1)],
        fill=fill, outline=hi
    )
    # Chessboard cells
    cell = 5
    for r in range(4):
        for c in range(4):
            x0 = lx0 + 3 + c * cell
            y0 = ly0 + 3 + r * cell
            if (r + c) % 2 == 0:
                draw.rectangle([x0, y0, x0 + cell - 1, y0 + cell - 1], fill=hi)

    # Right page (notation lines)
    rx0, ry0 = cx + spine // 2, cy - ph // 2
    rx1, ry1 = cx + pw // 2 + 2, cy + ph // 2
    draw.polygon(
        [(rx0, ry0 - 4), (rx1, ry0), (rx1, ry1), (rx0, ry1)],
        fill=fill, outline=hi
    )
    # Notation lines
    for i in range(5):
        y = ry0 + 6 + i * 6
        draw.line([rx0 + 4, y, rx1 - 4, y], fill=hi, width=1)

    # Spine
    draw.line([cx, cy - ph // 2 - 2, cx, cy + ph // 2], fill=hi, width=2)

    # Bottom shadow
    draw.ellipse([cx - 26, cy + ph // 2 + 2, cx + 26, cy + ph // 2 + 8],
                 fill=(0, 0, 0, 60))


def draw_profile(draw, cx, cy, fill, hi):
    """Draw a user avatar."""
    # Head
    hr = 16
    draw.ellipse([cx - hr, cy - 28 - hr, cx + hr, cy - 28 + hr],
                 fill=fill, outline=hi)
    # Shoulders
    sw, sh = 34, 30
    top = cy - 6
    draw.polygon(
        [(cx - sw, top + sh), (cx - sw + 6, top),
         (cx + sw - 6, top), (cx + sw, top + sh)],
        fill=fill, outline=hi
    )
    # Neck
    draw.rectangle([cx - 6, cy - 14, cx + 6, top], fill=fill)


def make_icon(name, draw_fn, active=True):
    """Create one icon image with optional glow."""
    img = Image.new("RGBA", (SIZE, SIZE), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)
    cx, cy = SIZE // 2, SIZE // 2

    if active:
        fill, hi = PURPLE, PURPLE_HI
        # Glow: draw shape in purple on a blurred layer, then draw sharp shape on top
        glow_img = Image.new("RGBA", (SIZE, SIZE), (0, 0, 0, 0))
        glow_draw = ImageDraw.Draw(glow_img)
        draw_fn(glow_draw, cx, cy, PURPLE, PURPLE_HI)
        glow_img = glow_img.filter(ImageFilter.GaussianBlur(12))
        img.paste(glow_img, (0, 0), glow_img)
    else:
        fill, hi = GREY, GREY_HI

    draw_fn(draw, cx, cy, fill, hi)

    suffix = "-active" if active else ""
    path = os.path.join(OUT_DIR, f"tab-{name}{suffix}.png")
    img.save(path)
    print(f"  → {path}")


def main():
    icons = [
        ("game",    draw_pawn),
        ("records", draw_book),
        ("profile", draw_profile),
    ]
    for name, fn in icons:
        make_icon(name, fn, active=True)
        make_icon(name, fn, active=False)


if __name__ == "__main__":
    main()