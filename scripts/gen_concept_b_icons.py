from pathlib import Path
import subprocess

out = Path("icons")
out.mkdir(exist_ok=True)

BG = (0x3D, 0x4A, 0x2E)
LIGHT = (0xD4, 0xE8, 0xA0)
DARK = (0x3D, 0x4A, 0x2E)
ACC = (0xF0, 0xD0, 0x60)


def rounded_rect_mask(x, y, w, h, r, px, py):
    if x + r <= px < x + w - r and y <= py < y + h:
        return True
    if x <= px < x + w and y + r <= py < y + h - r:
        return True
    for cx, cy in [
        (x + r, y + r),
        (x + w - r - 1, y + r),
        (x + r, y + h - r - 1),
        (x + w - r - 1, y + h - r - 1),
    ]:
        if (px - cx) ** 2 + (py - cy) ** 2 <= r * r:
            return True
    return False


def draw(size):
    data = bytearray([BG[0], BG[1], BG[2]] * (size * size))

    def setpx(px, py, c):
        if 0 <= px < size and 0 <= py < size:
            i = (py * size + px) * 3
            data[i : i + 3] = bytes(c)

    def S(v):
        return int(round(v * size / 1024))

    p1 = (S(512), S(184))
    p2 = (S(786), S(474))
    p3 = (S(238), S(474))
    minx, maxx = min(p1[0], p2[0], p3[0]), max(p1[0], p2[0], p3[0])
    miny, maxy = min(p1[1], p2[1], p3[1]), max(p1[1], p2[1], p3[1])
    ax, ay = p1
    bx, by = p2
    cx, cy = p3
    den = (by - cy) * (ax - cx) + (cx - bx) * (ay - cy)
    for y in range(miny, maxy + 1):
        for x in range(minx, maxx + 1):
            a = ((by - cy) * (x - cx) + (cx - bx) * (y - cy)) / den if den else -1
            b = ((cy - ay) * (x - cx) + (ax - cx) * (y - cy)) / den if den else -1
            c = 1 - a - b
            if a >= 0 and b >= 0 and c >= 0:
                setpx(x, y, LIGHT)

    rx, ry, rw, rh, rr = S(268), S(460), S(488), S(356), max(1, S(56))
    for y in range(ry, ry + rh):
        for x in range(rx, rx + rw):
            if rounded_rect_mask(rx, ry, rw, rh, rr, x, y):
                setpx(x, y, LIGHT)

    sx, sy, sw, sh, sr = S(482), S(460), max(1, S(60)), S(322), max(1, S(20))
    for y in range(sy, sy + sh):
        for x in range(sx, sx + sw):
            if rounded_rect_mask(sx, sy, sw, sh, sr, x, y):
                setpx(x, y, DARK)

    ccx, ccy, r = S(676), S(658), max(1, S(70))
    r2 = r * r
    for y in range(ccy - r, ccy + r + 1):
        for x in range(ccx - r, ccx + r + 1):
            if (x - ccx) * (x - ccx) + (y - ccy) * (y - ccy) <= r2:
                setpx(x, y, ACC)

    return data


for size, name in [
    (512, "icon-512.png"),
    (192, "icon-192.png"),
    (180, "apple-touch-icon.png"),
    (32, "favicon-32.png"),
    (16, "favicon-16.png"),
]:
    ppm = out / f"tmp-{size}.ppm"
    with ppm.open("wb") as f:
        f.write(f"P6\n{size} {size}\n255\n".encode("ascii"))
        f.write(draw(size))
    subprocess.run(
        ["sips", "-s", "format", "png", str(ppm), "--out", str(out / name)],
        check=True,
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
    )
    ppm.unlink(missing_ok=True)

print("generated")
