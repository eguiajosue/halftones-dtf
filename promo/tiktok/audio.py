#!/usr/bin/env python3
"""Banda sonora sintetizada del video (sin música ni muestras de terceros).

Genera build/audio.wav: 15 s, 44,1 kHz, estéreo. Los tiempos replican el
objeto T de promo.js; si cambias uno, cambia el otro.
Uso: python3 promo/tiktok/audio.py   (solo necesita numpy)
"""
import os
import wave
import numpy as np

SR, DUR = 44100, 15.0
N = int(SR * DUR)
rng = np.random.default_rng(7)
L = np.zeros(N)
R = np.zeros(N)

T = dict(
    hook_words=[0.08, 0.32, 0.56, 0.86, 1.10, 1.40], highlight=1.52, strike=1.95, wipe_k=2.45,
    alt=[2.80, 2.95, 3.20], poster=3.85, scan=4.45, tune=5.55, knock=6.65,
    wipe_paper=7.90, print=8.30, land=8.60, tee_cap=[8.70, 8.85, 9.20],
    fields=[10.70, 11.45, 12.20], end=13.05, dots=[13.35, 13.45, 13.55], word=13.65, cta=13.95, bio=14.15,
)


def add(t, sig, gain=1.0, pan=0.0):
    i = int(t * SR)
    if i >= N:
        return
    sig = sig[: N - i] * gain
    L[i:i + len(sig)] += sig * np.sqrt(0.5 * (1 - pan))
    R[i:i + len(sig)] += sig * np.sqrt(0.5 * (1 + pan))


def tt(d):
    return np.arange(int(d * SR)) / SR


def lowpass(x, cutoff):
    """Filtro de un polo; cutoff puede ser un escalar o una curva por muestra."""
    c = np.broadcast_to(np.asarray(cutoff, float), x.shape)
    a = 1 - np.exp(-2 * np.pi * c / SR)
    y = np.empty_like(x)
    acc = 0.0
    for i in range(len(x)):
        acc += a[i] * (x[i] - acc)
        y[i] = acc
    return y


def thunk(f0=140, f1=48, d=0.22, click=0.35):
    t = tt(d)
    f = f1 + (f0 - f1) * np.exp(-t * 28)
    body = np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t * 16)
    n = rng.standard_normal(len(t)) * np.exp(-t * 120) * click
    return body + lowpass(n, 5000)


def kick(d=0.32):
    t = tt(d)
    f = 45 + 110 * np.exp(-t * 35)
    return np.tanh(1.6 * np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t * 9))


def hat(d=0.06):
    t = tt(d)
    n = rng.standard_normal(len(t))
    return (n - lowpass(n, 7000)) * np.exp(-t * 70)


def tick(f=2600, d=0.025):
    t = tt(d)
    return np.sin(2 * np.pi * f * t) * np.exp(-t * 260)


def whoosh(d=0.35, f0=400, f1=6000, rise=True):
    t = tt(d)
    n = rng.standard_normal(len(t))
    sweep = f0 * (f1 / f0) ** (t / d if rise else 1 - t / d)
    env = np.sin(np.pi * t / d) ** 2
    return (lowpass(n, sweep) - lowpass(n, sweep * 0.25)) * env * 2.2


def bell(f, d=1.6):
    t = tt(d)
    out = np.zeros(len(t))
    for ratio, amp, dec in [(1, 1, 3.2), (2.0, 0.45, 4.5), (2.76, 0.35, 6), (5.4, 0.15, 9)]:
        out += amp * np.sin(2 * np.pi * f * ratio * t) * np.exp(-t * dec)
    return out * (1 - np.exp(-t * 400))


def pluck(f, d=0.42):
    t = tt(d)
    saw = 2 * ((f * t) % 1) - 1
    return lowpass(saw, 300 + 1800 * np.exp(-t * 14)) * np.exp(-t * 6)


def blip(f, d=0.12):
    t = tt(d)
    return np.sin(2 * np.pi * f * t * (1 + 0.6 * np.exp(-t * 60))) * np.exp(-t * 30)


# 1 · Gancho: golpes secos por palabra, marcador, tachado y barrido a negro
for i, w in enumerate(T["hook_words"]):
    add(w, thunk(150 + i * 8, 46), 0.75, pan=(-0.2 if i % 2 else 0.2))
add(T["hook_words"][-1], kick(), 0.5)
add(T["highlight"], whoosh(0.2, 800, 5000), 0.25)
add(T["strike"], whoosh(0.22, 2500, 9000), 0.35, pan=0.3)
add(T["wipe_k"] - 0.05, whoosh(0.4, 300, 4000), 0.45)

# 2 · «Hay una alternativa libre.»
add(T["alt"][0], thunk(120, 50, click=0.2), 0.5)
add(T["alt"][1], thunk(130, 50, click=0.2), 0.5)
for f, g, p in [(659.25, 0.28, -0.3), (987.77, 0.2, 0.3), (1318.5, 0.12, 0)]:
    add(T["alt"][2], bell(f), g, pan=p)
add(T["poster"] - 0.45, whoosh(0.45, 200, 7000), 0.3)

# 3 · Trama: pulso de 120 BPM, barrido de lectura, clics del deslizador, knockout
for b in np.arange(4.0, 13.0, 0.5):
    add(b, kick(), 0.55)
    add(b + 0.25, hat(), 0.18, pan=0.25)
    if int(round(b * 2)) % 4 == 3:
        add(b + 0.125, hat(0.04), 0.1, pan=-0.25)
roots = [55.0, 55.0, 55.0, 55.0, 43.65, 43.65, 49.0, 49.0]       # La · Fa · Sol
for k, b in enumerate(np.arange(4.0, 13.0, 0.5)):
    add(b, pluck(roots[k % 8]), 0.32)
    add(b + 0.25, pluck(roots[k % 8] * 2), 0.14)
add(T["poster"], thunk(90, 40, d=0.4), 0.45)
add(T["scan"], whoosh(1.0, 300, 3500), 0.22)


def eio(p):
    return 4 * p ** 3 if p < 0.5 else 1 - (-2 * p + 2) ** 3 / 2


last = None
for s in np.arange(0, 1.0, 1 / SR * 64):
    lpi = round(720 / (10 + 14 * eio(s)))
    if lpi != last:
        add(T["tune"] + s, tick(2200 + (lpi - 30) * 20), 0.12, pan=0.15)
        last = lpi
add(T["knock"], tick(1500, 0.04), 0.35)
for k in range(18):
    add(T["knock"] + 0.1 + rng.random() * 0.6, blip(900 + rng.random() * 900, 0.08), 0.12, pan=rng.uniform(-0.6, 0.6))

# 4 · Prenda: la estampa vuela y se asienta
add(T["wipe_paper"] - 0.05, whoosh(0.35, 400, 5000), 0.4)
add(T["print"], whoosh(0.3, 6000, 500, rise=True), 0.3)
add(T["land"], thunk(110, 38, d=0.5, click=0.6), 0.9)
add(T["land"], whoosh(0.5, 3000, 300), 0.25)
for w in T["tee_cap"]:
    add(w, thunk(170, 60, d=0.12, click=0.2), 0.35)

# 5 · Campos de tinta
for i, f in enumerate(T["fields"]):
    add(f - 0.3, whoosh(0.3, 500, 7000), 0.4, pan=(-0.4, 0.4, 0)[i])
    add(f, thunk(160, 45, d=0.3, click=0.5), 0.7)
    add(f + 0.12, thunk(200, 60, d=0.15, click=0.25), 0.35)

# 6 · Cierre: puntos del logo en escala ascendente y acorde final
add(T["end"] - 0.02, whoosh(0.32, 7000, 400), 0.35)
for d, f in zip(T["dots"], [523.25, 659.25, 783.99]):
    add(d, blip(f, 0.16), 0.3)
add(T["word"], thunk(130, 45, d=0.3), 0.6)
add(T["cta"], thunk(150, 50, d=0.2, click=0.3), 0.45)
for f, g, p in [(440.0, 0.22, -0.3), (523.25, 0.18, 0.3), (659.25, 0.16, -0.1), (880.0, 0.1, 0.1), (110.0, 0.35, 0)]:
    add(T["bio"], bell(f, 0.85), g, pan=p)

# Reverberación corta (convolución con ruido decreciente) y masterizado
ir_t = tt(0.9)
ir = rng.standard_normal(len(ir_t)) * np.exp(-ir_t * 6.5)
ir /= np.sqrt(np.sum(ir ** 2))
for ch in (L, R):
    wet = np.fft.irfft(np.fft.rfft(ch, N + len(ir)) * np.fft.rfft(ir, N + len(ir)))[:N]
    ch += 0.12 * wet
mix = np.stack([L, R], 1)
mix = np.tanh(mix * 1.3) / np.tanh(1.3)
mix *= 0.89 / np.max(np.abs(mix))
fade = int(0.02 * SR)
mix[:fade] *= np.linspace(0, 1, fade)[:, None]
mix[-fade:] *= np.linspace(1, 0, fade)[:, None]

out = os.path.join(os.path.dirname(os.path.abspath(__file__)), "build", "audio.wav")
os.makedirs(os.path.dirname(out), exist_ok=True)
with wave.open(out, "wb") as w:
    w.setnchannels(2)
    w.setsampwidth(2)
    w.setframerate(SR)
    w.writeframes((mix * 32767).astype("<i2").tobytes())
print(out)
