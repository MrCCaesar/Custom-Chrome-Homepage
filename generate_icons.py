"""
生成 Chrome 扩展所需的占位图标
运行: python generate_icons.py
需要: pip install Pillow
"""
from PIL import Image, ImageDraw, ImageFont
import os

SIZES = [16, 48, 128]
OUT_DIR = os.path.join(os.path.dirname(__file__), 'icons')


def create_icon(size):
    img = Image.new('RGBA', (size, size), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)

    # 圆角矩形背景
    margin = size // 8
    draw.rounded_rectangle(
        [margin, margin, size - margin, size - margin],
        radius=size // 4,
        fill=(108, 99, 255, 255),
    )

    # 中心文字 "H"
    try:
        font_size = size // 2
        font = ImageFont.truetype("segoeui.ttf", font_size)
    except Exception:
        font = ImageFont.load_default()

    text = "H"
    bbox = draw.textbbox((0, 0), text, font=font)
    tw = bbox[2] - bbox[0]
    th = bbox[3] - bbox[1]
    x = (size - tw) // 2
    y = (size - th) // 2 - size // 10
    draw.text((x, y), text, fill=(255, 255, 255, 255), font=font)

    return img


def main():
    os.makedirs(OUT_DIR, exist_ok=True)
    for size in SIZES:
        img = create_icon(size)
        path = os.path.join(OUT_DIR, f'icon{size}.png')
        img.save(path)
        print(f'✓ 已生成: {path}')


if __name__ == '__main__':
    main()
    print('完成!')
