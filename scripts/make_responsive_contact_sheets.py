from __future__ import annotations

from pathlib import Path

from PIL import Image, ImageDraw, ImageFont


ROOT = Path("artifacts/responsive/screenshots")
OUT = Path("artifacts/responsive/contact-sheets")
VIEWPORTS = [
    "320x568",
    "360x740",
    "390x844",
    "412x915",
    "430x932",
    "768x1024",
    "834x1194",
    "1024x768",
    "1180x820",
    "1366x768",
    "1440x1000",
    "1920x1080",
]


def font(size: int) -> ImageFont.ImageFont:
    for name in ("arial.ttf", "Arial.ttf", "DejaVuSans.ttf"):
        try:
            return ImageFont.truetype(name, size)
        except OSError:
            continue
    return ImageFont.load_default()


def fit_image(src: Image.Image, width: int, height: int) -> Image.Image:
    image = src.convert("RGB")
    image.thumbnail((width, height), Image.LANCZOS)
    canvas = Image.new("RGB", (width, height), "#f3ead6")
    left = (width - image.width) // 2
    top = (height - image.height) // 2
    canvas.paste(image, (left, top))
    return canvas


def make_sheet(page_dir: Path) -> Path | None:
    shots = [(name, page_dir / f"{name}-first.png") for name in VIEWPORTS]
    shots = [(name, path) for name, path in shots if path.exists()]
    if not shots:
        return None

    thumb_w, thumb_h = 250, 180
    label_h = 30
    gap = 14
    cols = 4
    rows = (len(shots) + cols - 1) // cols
    title_h = 46
    sheet_w = cols * thumb_w + (cols + 1) * gap
    sheet_h = title_h + rows * (thumb_h + label_h) + (rows + 1) * gap

    sheet = Image.new("RGB", (sheet_w, sheet_h), "#0b3438")
    draw = ImageDraw.Draw(sheet)
    title_font = font(20)
    label_font = font(15)
    draw.text((gap, 12), page_dir.name, fill="#efd39a", font=title_font)

    for index, (name, shot_path) in enumerate(shots):
        row, col = divmod(index, cols)
        x = gap + col * (thumb_w + gap)
        y = title_h + gap + row * (thumb_h + label_h + gap)
        with Image.open(shot_path) as src:
            thumb = fit_image(src, thumb_w, thumb_h)
        sheet.paste(thumb, (x, y))
        draw.rectangle((x, y, x + thumb_w - 1, y + thumb_h - 1), outline="#efd39a", width=1)
        draw.text((x + 8, y + thumb_h + 7), name, fill="#f4efe4", font=label_font)

    OUT.mkdir(parents=True, exist_ok=True)
    out_path = OUT / f"{page_dir.name}.png"
    sheet.save(out_path, optimize=True)
    return out_path


def main() -> int:
    if not ROOT.exists():
        raise SystemExit(f"Responsive screenshot directory not found: {ROOT}")
    made = [path for page_dir in sorted(ROOT.iterdir()) if page_dir.is_dir() for path in [make_sheet(page_dir)] if path]
    if not made:
        raise SystemExit("No responsive screenshots found for contact sheets")
    print("Responsive contact sheets:")
    for path in made:
        print(path.as_posix())
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
