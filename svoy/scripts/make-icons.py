"""Генерация иконок СВОЙ из scripts/source-emblem.png.  Запуск: python3 scripts/make-icons.py"""
from PIL import Image, ImageDraw, ImageFilter
import os
HERE = os.path.dirname(os.path.abspath(__file__))
SRC = os.path.join(HERE, "source-emblem.png")
OUT = os.path.join(HERE, "..", "public")
im = Image.open(SRC).convert("RGB")
W, H = im.size
cx = 849
crop = im.crop((cx - H // 2, 0, cx + H // 2, H))

def full(size):
    return crop.resize((size, size), Image.LANCZOS)

def maskable(size):
    bg = crop.resize((size, size), Image.LANCZOS).filter(ImageFilter.GaussianBlur(size // 6))
    inner = int(size * 0.74)
    fg = crop.resize((inner, inner), Image.LANCZOS)
    mask = Image.new("L", (inner, inner), 0)
    m = inner // 14
    ImageDraw.Draw(mask).ellipse((m, m, inner - m, inner - m), fill=255)
    mask = mask.filter(ImageFilter.GaussianBlur(inner // 22))
    bg.paste(fg, ((size - inner) // 2,) * 2, mask)
    return bg

os.makedirs(f"{OUT}/icons", exist_ok=True)
full(192).save(f"{OUT}/icons/icon-192.png")
full(512).save(f"{OUT}/icons/icon-512.png")
maskable(192).save(f"{OUT}/icons/icon-maskable-192.png")
maskable(512).save(f"{OUT}/icons/icon-maskable-512.png")
full(180).save(f"{OUT}/icons/apple-touch-icon.png")
full(256).save(f"{OUT}/favicon.ico", sizes=[(16,16),(32,32),(48,48),(64,64),(128,128),(256,256)])
print("ok")
