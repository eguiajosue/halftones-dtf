#!/usr/bin/env python3
"""Genera tiles de umbral para semitono (PNG escala de grises 8 bits).

Herramienta de DESARROLLO: se ejecuta una vez, fuera de Photoshop. No forma
parte del plugin. Uso: python3 tools/make_tiles.py assets/tiles
"""
import math, struct, sys, zlib


def write_png_gray(path, w, h, px):
    raw = b"".join(b"\x00" + bytes(px[y * w:(y + 1) * w]) for y in range(h))

    def chunk(t, d):
        return struct.pack(">I", len(d)) + t + d + struct.pack(">I", zlib.crc32(t + d) & 0xFFFFFFFF)

    with open(path, "wb") as f:
        f.write(b"\x89PNG\r\n\x1a\n")
        f.write(chunk(b"IHDR", struct.pack(">IIBBBBB", w, h, 8, 0, 0, 0, 0)))
        f.write(chunk(b"IDAT", zlib.compress(raw, 9)))
        f.write(chunk(b"IEND", b""))


def equalize(values):
    """Histograma plano: rangos equiespaciados 1..254 (tono lineal)."""
    n = len(values)
    order = sorted(range(n), key=lambda i: values[i])
    out = [0] * n
    for rank, i in enumerate(order):
        out[i] = round(1 + rank * 253 / (n - 1))
    return out


# Spot functions: mayor valor donde el punto crece ANTES (centro de la celda)
def spot_euclid(u, v):
    au, av = abs(u), abs(v)
    return 1 - (au * au + av * av) if au + av <= 1 else (1 - au) ** 2 + (1 - av) ** 2


def spot_line(u, v):
    return 1 - abs(v)


def spot_diamond(u, v):
    return 1 - (abs(u) + abs(v)) / 2


def spot_ellipse(u, v):
    return 1 - (u * u + (v * 1.4) ** 2)


def make(path, spot, size=128):
    vals = []
    for y in range(size):
        for x in range(size):
            u = (x + 0.5) / size * 2 - 1
            v = (y + 0.5) / size * 2 - 1
            vals.append(spot(u, v))
    write_png_gray(path, size, size, equalize(vals))


def equalize_exact(values, size):
    """Como equalize(), pero desempata por el ángulo respecto al centro: en celdas pequeñas los empates
    de una función de punto simétrica harían crecer el punto en orden de lectura y no en círculo."""
    n = len(values)
    c = (size - 1) / 2
    order = sorted(range(n), key=lambda i: (round(values[i], 9), math.atan2(i // size - c, i % size - c)))
    out = [0] * n
    for rank, i in enumerate(order):
        out[i] = round(1 + rank * 253 / (n - 1))
    return out


EXACT_SIZES = range(3, 49)       # celdas de 3 a 48 px: ht_<tipo>_<n>.png, para usar a escala 100 %


def make_exact(path, spot, size):
    vals = []
    for y in range(size):
        for x in range(size):
            u = (x + 0.5) / size * 2 - 1
            v = (y + 0.5) / size * 2 - 1
            vals.append(spot(u, v))
    write_png_gray(path, size, size, equalize_exact(vals, size))


if __name__ == "__main__":
    out = sys.argv[1] if len(sys.argv) > 1 else "."
    make(f"{out}/ht_round.png", spot_euclid)
    make(f"{out}/ht_line.png", spot_line)
    make(f"{out}/ht_diamond.png", spot_diamond)
    make(f"{out}/ht_ellipse.png", spot_ellipse)
    for name, spot in (("round", spot_euclid), ("line", spot_line), ("diamond", spot_diamond), ("ellipse", spot_ellipse)):
        for n in EXACT_SIZES:
            make_exact(f"{out}/ht_{name}_{n}.png", spot, n)
