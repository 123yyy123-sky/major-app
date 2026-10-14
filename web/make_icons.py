# -*- coding: utf-8 -*-
"""生成 PWA 图标：橙底白字「专」"""
import os
from PIL import Image, ImageDraw, ImageFont

OUT = r"F:\Ai\major-app\web\dist\icons"
os.makedirs(OUT, exist_ok=True)

ORANGE = (232, 89, 12)
FONTS = [
    r"C:\Windows\Fonts\msyhbd.ttc",
    r"C:\Windows\Fonts\msyh.ttc",
    r"C:\Windows\Fonts\simhei.ttf",
]

def pick_font(size):
    for f in FONTS:
        if os.path.exists(f):
            try:
                return ImageFont.truetype(f, size)
            except Exception:
                pass
    return ImageFont.load_default()

def make(size, pad_ratio=0.0, bg=ORANGE, fg=(255, 255, 255), radius_ratio=0.22):
    img = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    r = int(size * radius_ratio)
    d.rounded_rectangle([0, 0, size - 1, size - 1], radius=r, fill=bg)

    # 字：占画布约 62%
    fs = int(size * 0.62)
    font = pick_font(fs)
    txt = "专"
    bbox = d.textbbox((0, 0), txt, font=font)
    tw, th = bbox[2] - bbox[0], bbox[3] - bbox[1]
    x = (size - tw) / 2 - bbox[0]
    y = (size - th) / 2 - bbox[1] - size * 0.01
    d.text((x, y), txt, font=font, fill=fg)
    return img

# 标准图标（带圆角）
for s in (192, 512):
    make(s).save(os.path.join(OUT, f"icon-{s}.png"))
# maskable：满幅底色，安全区留足
for s in (192, 512):
    img = Image.new("RGBA", (s, s), ORANGE)
    d = ImageDraw.Draw(img)
    fs = int(s * 0.44)
    font = pick_font(fs)
    bbox = d.textbbox((0, 0), "专", font=font)
    tw, th = bbox[2] - bbox[0], bbox[3] - bbox[1]
    d.text(((s - tw) / 2 - bbox[0], (s - th) / 2 - bbox[1]), "专", font=font, fill=(255, 255, 255))
    img.save(os.path.join(OUT, f"maskable-{s}.png"))
# iOS 主屏图标（不透明，无圆角，系统自己裁）
make(180, radius_ratio=0.0).convert("RGB").save(os.path.join(OUT, "apple-touch-icon.png"))
# favicon
make(64, radius_ratio=0.18).save(os.path.join(OUT, "favicon.png"))

for f in sorted(os.listdir(OUT)):
    p = os.path.join(OUT, f)
    print(f"{f:28} {os.path.getsize(p):>7} B")
print("icons ->", OUT)
