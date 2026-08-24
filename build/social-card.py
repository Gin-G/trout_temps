#!/usr/bin/env python3
"""Draw the 1200x630 social card.

Twitter and Slack render a 180x180 logo as a small square thumbnail; at
1200x630 the same link becomes a full-width card. This is that image, built
from the site's own palette and logo so the card and the page match.

    python3 build/social-card.py            # writes social-card.png

Run it when the palette or the headline changes. The output is committed —
it has no live data in it, so there is no reason to rebuild it per deploy.
"""
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parent.parent
W, H = 1200, 630

ABYSS = (10, 26, 31)
PAPER = (238, 244, 242)
MIST = (143, 179, 189)
SAFE = (79, 178, 134)
CAUTION = (224, 164, 88)
DANGER = (214, 90, 74)
LINE = (30, 56, 66)

SERIF = "/usr/share/fonts/truetype/dejavu/DejaVuSerif.ttf"
SERIF_I = "/usr/share/fonts/truetype/dejavu/DejaVuSerif-Italic.ttf"
MONO = "/usr/share/fonts/truetype/dejavu/DejaVuSansMono.ttf"


def font(path, size):
    try:
        return ImageFont.truetype(path, size)
    except OSError:
        return ImageFont.load_default()


def tracked(draw, xy, text, fnt, fill, spacing=0):
    """Letter-spaced text: the site sets 0.24em on its eyebrow labels."""
    x, y = xy
    for ch in text:
        draw.text((x, y), ch, font=fnt, fill=fill)
        x += draw.textlength(ch, font=fnt) + spacing
    return x


def gradient_bar(img, box, radius=6):
    """The safe-to-danger ramp from the dashboard header."""
    x0, y0, x1, y1 = box
    bar = Image.new("RGB", (x1 - x0, y1 - y0))
    d = ImageDraw.Draw(bar)
    w = x1 - x0
    # Green holds to ~55%, warms through amber, ends red — matching the CSS.
    stops = [(0.0, SAFE), (0.55, SAFE), (0.72, CAUTION), (1.0, DANGER)]
    for px in range(w):
        t = px / max(1, w - 1)
        for i in range(len(stops) - 1):
            t0, c0 = stops[i]
            t1, c1 = stops[i + 1]
            if t0 <= t <= t1:
                k = 0 if t1 == t0 else (t - t0) / (t1 - t0)
                c = tuple(round(c0[j] + (c1[j] - c0[j]) * k) for j in range(3))
                d.line([(px, 0), (px, y1 - y0)], fill=c)
                break
    mask = Image.new("L", bar.size, 0)
    ImageDraw.Draw(mask).rounded_rectangle([0, 0, bar.size[0] - 1, bar.size[1] - 1],
                                           radius=radius, fill=255)
    img.paste(bar, (x0, y0), mask)


def main():
    img = Image.new("RGB", (W, H), ABYSS)
    d = ImageDraw.Draw(img)

    # A hairline of the brand green along the top, so the card reads as ours
    # even as a thumbnail.
    d.rectangle([0, 0, W, 6], fill=SAFE)

    pad = 72

    # Logo, same asset as the favicon and the dashboard headline.
    logo_path = ROOT / "logo.png"
    logo_bottom = 96
    if logo_path.exists():
        logo = Image.open(logo_path).convert("RGBA")
        logo = logo.resize((128, 128), Image.LANCZOS)
        img.paste(logo, (pad, 78), logo)
        logo_bottom = 78 + 128

    eyebrow = font(MONO, 20)
    tracked(d, (pad + 160, 104), "LIVE USGS STREAMFLOW", eyebrow, MIST, spacing=3.2)
    tracked(d, (pad + 160, 136), "PARAMETER 00010", eyebrow, MIST, spacing=3.2)

    # The headline, in the page's own serif and its own two-line break.
    h1 = font(SERIF, 76)
    h1i = font(SERIF_I, 76)
    y = logo_bottom + 52
    d.text((pad, y), "Know before you", font=h1, fill=PAPER)
    d.text((pad, y + 92), "release the fish.", font=h1i, fill=SAFE)

    # The threshold ramp, with the 65°F mark where the dashboard puts it.
    bar_y = y + 216
    gradient_bar(img, (pad, bar_y, W - pad, bar_y + 54))
    small = font(MONO, 18)
    d.text((pad + 16, bar_y + 17), "45°F", font=small, fill=(10, 26, 31))
    right = "73°F"
    d.text((W - pad - 16 - d.textlength(right, font=small), bar_y + 17), right,
           font=small, fill=(10, 26, 31))
    # The white 65°F marker: 20/28 of the way along the 45-73 scale.
    mark_x = pad + round((W - 2 * pad) * (65 - 45) / (73 - 45))
    d.rectangle([mark_x - 1, bar_y - 12, mark_x + 1, bar_y + 66], fill=PAPER)
    label = "65°F — RECOVERY THRESHOLD"
    lw = d.textlength(label, font=small) + 2.2 * (len(label) - 1)
    tracked(d, (min(mark_x + 14, W - pad - lw), bar_y - 34), label, small, PAPER, spacing=2.2)

    # Footer rule and the domain.
    d.line([(pad, H - 84), (W - pad, H - 84)], fill=LINE, width=1)
    foot = font(MONO, 21)
    tracked(d, (pad, H - 58), "TROUT-TEMPS.NICKKNOWS.NET", foot, MIST, spacing=2.4)
    tail = "1,450 GAGES · 15 STATES"
    tw = d.textlength(tail, font=foot) + 2.4 * (len(tail) - 1)
    tracked(d, (W - pad - tw, H - 58), tail, foot, MIST, spacing=2.4)

    out = ROOT / "social-card.png"
    img.save(out, "PNG", optimize=True)
    print(f"{out.relative_to(ROOT)}  {img.size[0]}x{img.size[1]}  {out.stat().st_size // 1024} KB")


if __name__ == "__main__":
    main()
