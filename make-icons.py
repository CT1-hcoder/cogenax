"""Generates the launcher icons into resources/android/res. Needs Pillow: python3 scripts/make-icons.py"""
import math, os
from PIL import Image, ImageDraw

BG = (11, 22, 38)
TEAL = (45, 212, 191)
OUT = os.path.join(os.path.dirname(__file__), '..', 'resources', 'android', 'res')

def glyph(size, scale):
    """Open ring with a dot at the gap, drawn at 4x then reduced for smooth edges."""
    s = size * 4
    im = Image.new('RGBA', (s, s), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    c = s / 2
    r = s * 0.5 * scale
    w = s * 0.075 * scale * 2
    box = [c - r, c - r, c + r, c + r]
    d.arc(box, start=40, end=320, fill=TEAL, width=int(w))
    for ang in (40, 320):  # round caps
        x = c + (r - w / 2) * math.cos(math.radians(ang)); y = c + (r - w / 2) * math.sin(math.radians(ang))
        d.ellipse([x - w / 2, y - w / 2, x + w / 2, y + w / 2], fill=TEAL)
    dr = w * 0.62
    cx = c + (r - w / 2)
    d.ellipse([cx - dr, c - dr, cx + dr, c + dr], fill=(251, 191, 36))
    return im.resize((size, size), Image.LANCZOS)

def save(img, folder, name):
    p = os.path.join(OUT, folder); os.makedirs(p, exist_ok=True)
    img.save(os.path.join(p, name))

legacy = {'mdpi': 48, 'hdpi': 72, 'xhdpi': 96, 'xxhdpi': 144, 'xxxhdpi': 192}
adaptive = {'mdpi': 108, 'hdpi': 162, 'xhdpi': 216, 'xxhdpi': 324, 'xxxhdpi': 432}

for k, px in legacy.items():
    sq = Image.new('RGBA', (px, px), BG + (255,))
    sq.alpha_composite(glyph(px, 0.62))
    mask = Image.new('L', (px * 4, px * 4), 0)
    ImageDraw.Draw(mask).rounded_rectangle([0, 0, px * 4 - 1, px * 4 - 1], radius=px * 4 // 5 // 2 * 1, fill=255)
    mask = mask.resize((px, px), Image.LANCZOS)
    out = Image.new('RGBA', (px, px), (0, 0, 0, 0)); out.paste(sq, (0, 0), mask)
    save(out, f'mipmap-{k}', 'ic_launcher.png')
    circ = Image.new('L', (px * 4, px * 4), 0)
    ImageDraw.Draw(circ).ellipse([0, 0, px * 4 - 1, px * 4 - 1], fill=255)
    circ = circ.resize((px, px), Image.LANCZOS)
    out2 = Image.new('RGBA', (px, px), (0, 0, 0, 0)); out2.paste(sq, (0, 0), circ)
    save(out2, f'mipmap-{k}', 'ic_launcher_round.png')

for k, px in adaptive.items():
    save(glyph(px, 0.40), f'mipmap-{k}', 'ic_launcher_foreground.png')  # stays inside the 66% safe zone

os.makedirs(os.path.join(OUT, 'values'), exist_ok=True)
open(os.path.join(OUT, 'values', 'ic_launcher_background.xml'), 'w').write(
    '<?xml version="1.0" encoding="utf-8"?>\n<resources>\n    <color name="ic_launcher_background">#0B1626</color>\n</resources>\n')
print('icons written to', os.path.abspath(OUT))
