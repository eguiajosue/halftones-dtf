#!/usr/bin/env python3
"""Genera los iconos propios del plugin (PNG RGBA, solo biblioteca estándar)."""
import struct, sys, zlib


def write_png_rgba(path, w, h, px):
    raw = b"".join(b"\x00" + bytes(px[y * w * 4:(y + 1) * w * 4]) for y in range(h))

    def chunk(t, d):
        return struct.pack(">I", len(d)) + t + d + struct.pack(">I", zlib.crc32(t + d) & 0xFFFFFFFF)

    with open(path, "wb") as f:
        f.write(b"\x89PNG\r\n\x1a\n")
        f.write(chunk(b"IHDR", struct.pack(">IIBBBBB", w, h, 8, 6, 0, 0, 0)))
        f.write(chunk(b"IDAT", zlib.compress(raw, 9)))
        f.write(chunk(b"IEND", b""))


def dots(size, rgb):
    """Rejilla de puntos de tamaño creciente (semitono) sobre fondo transparente."""
    px = bytearray(size * size * 4)
    n = 4
    cell = size / n
    for y in range(size):
        for x in range(size):
            cx, cy = int(x // cell), int(y // cell)
            r = cell * (0.12 + 0.38 * (cx + cy) / (2 * (n - 1)))
            dx = (x + 0.5) % cell - cell / 2
            dy = (y + 0.5) % cell - cell / 2
            if dx * dx + dy * dy <= r * r:
                i = (y * size + x) * 4
                px[i:i + 4] = bytes((*rgb, 255))
    return px


if __name__ == "__main__":
    out = sys.argv[1] if len(sys.argv) > 1 else "."
    for size, suffix in ((23, ""), (46, "@2x")):
        write_png_rgba(f"{out}/panel-light{suffix}.png", size, size, dots(size, (235, 235, 235)))
        write_png_rgba(f"{out}/panel-dark{suffix}.png", size, size, dots(size, (40, 40, 40)))
    for size, suffix in ((24, ""), (48, "@2x")):
        write_png_rgba(f"{out}/plugin{suffix}.png", size, size, dots(size, (74, 144, 226)))
