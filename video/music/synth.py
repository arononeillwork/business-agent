"""Instruments and helpers for the videos' music, all made from scratch (no samples, no licence needed).
Used by compose.py (the landing video) and day.py (a day in the life).
"""

import glob
import os
import subprocess
import numpy as np
from scipy.signal import butter, lfilter, fftconvolve
from scipy.io import wavfile

SR = 44100
BPM = 120
BEAT = 60 / BPM
BAR = 4 * BEAT
OUT = os.environ.get('MUSIC_OUT') or os.path.join(os.path.dirname(__file__), '..', 'public', 'audio')
rng = np.random.default_rng(7)


def hz(note):
    """'A4' -> 440; sharps as '#', flats as 'b'."""
    names = {'C': 0, 'D': 2, 'E': 4, 'F': 5, 'G': 7, 'A': 9, 'B': 11}
    n = names[note[0]]
    rest = note[1:]
    if rest.startswith('#'):
        n += 1; rest = rest[1:]
    elif rest.startswith('b'):
        n -= 1; rest = rest[1:]
    return 440.0 * 2 ** ((n + 12 * (int(rest) + 1) - 69) / 12)


def t_of(n):
    return np.arange(int(n)) / SR


def env_adsr(n, a=0.01, d=0.1, s=0.7, r=0.2, hold=None):
    n = int(n)
    a_n, d_n, r_n = int(a * SR), int(d * SR), int(r * SR)
    hold = n - r_n if hold is None else int(hold * SR)
    e = np.zeros(n)
    i = np.arange(n)
    e = np.where(i < a_n, i / max(a_n, 1), e)
    dec = (i >= a_n) & (i < a_n + d_n)
    e = np.where(dec, 1 - (1 - s) * (i - a_n) / max(d_n, 1), e)
    e = np.where((i >= a_n + d_n) & (i < hold), s, e)
    rel = i >= hold
    e = np.where(rel, s * np.clip(1 - (i - hold) / max(r_n, 1), 0, 1), e)
    return e


def lp(x, cutoff, order=2):
    b, a = butter(order, min(cutoff / (SR / 2), 0.99), 'low')
    return lfilter(b, a, x)


def hp(x, cutoff, order=2):
    b, a = butter(order, cutoff / (SR / 2), 'high')
    return lfilter(b, a, x)


def bp(x, lo, hi, order=2):
    b, a = butter(order, [lo / (SR / 2), hi / (SR / 2)], 'band')
    return lfilter(b, a, x)


class Track:
    def __init__(self, length):
        self.buf = np.zeros((int(length * SR) + SR * 4, 2))

    def add(self, at, sig, gain=1.0, pan=0.0):
        """Mix a mono or stereo signal in at `at` seconds, panned -1 (left) to 1 (right)."""
        i = int(at * SR)
        if sig.ndim == 1:
            l, r = np.cos((pan + 1) * np.pi / 4), np.sin((pan + 1) * np.pi / 4)
            sig = np.stack([sig * l * 1.414, sig * r * 1.414], axis=1)
        end = min(i + len(sig), len(self.buf))
        self.buf[i:end] += sig[:end - i] * gain


# ---------- instruments ----------

def pad(freqs, dur, bright=1800):
    """Warm detuned saws, softly filtered, slow in and out; stereo from the detune."""
    n = int(dur * SR)
    t = t_of(n)
    left = np.zeros(n); right = np.zeros(n)
    for f in freqs:
        for det, side in ((-0.09, 0), (0.0, 2), (0.08, 1)):
            ff = f * 2 ** (det / 12)
            ph = rng.random()
            saw = 2 * ((ff * t + ph) % 1) - 1
            if side in (0, 2): left += saw
            if side in (1, 2): right += saw
    sig = np.stack([lp(left, bright), lp(right, bright)], axis=1) / (len(freqs) * 3)
    e = env_adsr(n, a=min(0.6, dur * 0.3), d=0.3, s=0.85, r=min(0.9, dur * 0.4))
    return sig * e[:, None]


def ep(f, dur, vel=1.0):
    """Electric piano: a sine bell (FM), quick to start, slow to fade."""
    n = int(dur * SR)
    t = t_of(n)
    idx = 1.6 * np.exp(-t * 6) * vel
    sig = np.sin(2 * np.pi * f * t + idx * np.sin(2 * np.pi * f * t))
    sig += 0.25 * np.sin(2 * np.pi * 2 * f * t) * np.exp(-t * 4)
    e = np.exp(-t * 1.6) * np.minimum(1, t / 0.004)
    return sig * e * 0.5 * vel


def pluck(f, dur, bright=0.996):
    """Plucked string (Karplus-Strong as a comb filter)."""
    n = int(dur * SR)
    N = int(SR / f)
    burst = np.zeros(n)
    burst[:N] = lp(rng.uniform(-1, 1, N), 5000)
    a = np.zeros(N + 2); a[0] = 1; a[N] = -0.5 * bright; a[N + 1] = -0.5 * bright
    sig = lfilter([1.0], a, burst)
    return lp(sig, 4200) * np.minimum(1, (n - np.arange(n)) / (0.05 * SR)) * 0.6


def bell(f, dur):
    """A glockenspiel-ish bell for the melody."""
    n = int(dur * SR)
    t = t_of(n)
    sig = (np.sin(2 * np.pi * f * t) + 0.35 * np.sin(2 * np.pi * f * 2.76 * t) * np.exp(-t * 6)
           + 0.15 * np.sin(2 * np.pi * f * 5.4 * t) * np.exp(-t * 12))
    return sig * np.exp(-t * 3.2) * np.minimum(1, t / 0.002) * 0.35


def bass(f, dur):
    n = int(dur * SR)
    t = t_of(n)
    sig = np.sin(2 * np.pi * f * t) + 0.3 * np.sin(2 * np.pi * 2 * f * t)
    sig = np.tanh(sig * 1.4)
    return lp(sig, 700) * env_adsr(n, a=0.008, d=0.15, s=0.75, r=0.08) * 0.55


def kick(vel=1.0):
    n = int(0.45 * SR)
    t = t_of(n)
    f = 45 + 85 * np.exp(-t * 28)
    ph = 2 * np.pi * np.cumsum(f) / SR
    sig = np.sin(ph) * np.exp(-t * 7.5) + 0.15 * lp(rng.uniform(-1, 1, n), 2500) * np.exp(-t * 90)
    return np.tanh(sig * 1.5) * 0.8 * vel


def clap(vel=1.0):
    n = int(0.3 * SR)
    t = t_of(n)
    noise = bp(rng.uniform(-1, 1, n), 900, 5200)
    e = np.exp(-t * 22) + 0.6 * np.exp(-np.maximum(t - 0.012, 0) * 30) * (t > 0.012)
    return noise * e * 0.45 * vel


def shaker(vel=1.0):
    n = int(0.09 * SR)
    t = t_of(n)
    return hp(rng.uniform(-1, 1, n), 6500) * np.exp(-t * 55) * np.minimum(1, t / 0.006) * 0.22 * vel


def tick(high=True):
    """A wall clock: a short wooden click with a little body, the tock lower than the tick."""
    n = int(0.12 * SR)
    t = t_of(n)
    body = 1650 if high else 1250
    click = bp(rng.uniform(-1, 1, n), body * 0.7, body * 1.6) * np.exp(-t * 260)
    ring = np.sin(2 * np.pi * body * t) * np.exp(-t * 90) * 0.35
    thump = np.sin(2 * np.pi * 180 * t) * np.exp(-t * 60) * 0.25
    return (click + ring + thump) * 0.32


def riser(dur):
    n = int(dur * SR)
    t = t_of(n)
    noise = rng.uniform(-1, 1, n)
    out = np.zeros(n)
    steps = 24
    for k in range(steps):
        a, b = k * n // steps, (k + 1) * n // steps
        c = 400 * (12000 / 400) ** (k / steps)
        out[a:b] = bp(noise, c * 0.7, min(c * 1.4, 20000))[a:b]
    return out * (t / dur) ** 2 * 0.35


def reverb(stereo, seconds=2.2, wet=0.22):
    n = int(seconds * SR)
    t = t_of(n)
    ir = np.stack([rng.uniform(-1, 1, n), rng.uniform(-1, 1, n)], axis=1) * np.exp(-t * 3.2)[:, None]
    ir[:, 0] = lp(ir[:, 0], 6000); ir[:, 1] = lp(ir[:, 1], 6000)
    ir /= np.sqrt((ir ** 2).sum(axis=0))
    out = np.stack([fftconvolve(stereo[:, c], ir[:, c])[:len(stereo)] for c in range(2)], axis=1)
    return stereo * (1 - wet) + out * wet * 2.0


# The warm, uplifting progression both videos use for the calm part, and its bell melody.
CHORDS = {
    'F':  dict(pad=['F3', 'A3', 'C4', 'E4'], arp=['F4', 'A4', 'C5', 'E5'], root='F2'),
    'C':  dict(pad=['E3', 'G3', 'C4', 'D4'], arp=['C4', 'E4', 'G4', 'D5'], root='C2'),
    'Dm': dict(pad=['D3', 'F3', 'A3', 'C4'], arp=['D4', 'F4', 'A4', 'C5'], root='D2'),
    'Bb': dict(pad=['D3', 'F3', 'A3', 'Bb3'], arp=['Bb3', 'D4', 'F4', 'A4'], root='Bb1'),
    'Csus': dict(pad=['C3', 'F3', 'G3', 'D4'], arp=['C4', 'F4', 'G4', 'D5'], root='C2'),
}
CYCLE = ['F', 'C', 'Dm', 'Bb']
MELODY = [  # (beat in the 4-bar phrase, note, length in beats)
    (0, 'C5', 1), (1.5, 'A4', 0.5), (2, 'C5', 1), (3, 'D5', 1),
    (4, 'C5', 1.5), (5.5, 'G4', 2),
    (8, 'A4', 1), (9.5, 'F4', 0.5), (10, 'A4', 1), (11, 'C5', 1),
    (12, 'Bb4', 1), (13, 'A4', 1), (14, 'F4', 2),
]


def write_wav(name, mix, length):
    """Fade the last 2 s, normalise, and write public/audio/<name>.wav."""
    end = int(length * SR)
    fade = int(2.0 * SR)
    mix = mix[:end].copy()
    mix[end - fade:end] *= np.linspace(1, 0, fade)[:, None]
    mix /= np.max(np.abs(mix)) * 1.12
    os.makedirs(OUT, exist_ok=True)
    wavfile.write(os.path.join(OUT, f'{name}.wav'), SR, (mix * 32767).astype(np.int16))


def master(name):
    """For the web: no sub rumble, a touch less boom, gently compressed, -17 LUFS, as MP3; the WAV removed."""
    wav = os.path.join(OUT, f'{name}.wav')
    subprocess.run(['ffmpeg', '-v', 'error', '-y', '-i', wav, '-af',
                    'highpass=f=38,equalizer=f=90:t=q:w=1.0:g=-3,equalizer=f=3500:t=q:w=1.2:g=1.5,'
                    'acompressor=threshold=-18dB:ratio=2.5:attack=15:release=200:makeup=2,loudnorm=I=-17:TP=-1.5:LRA=11',
                    '-ar', '44100', '-c:a', 'libmp3lame', '-b:a', '192k', os.path.join(OUT, f'{name}.mp3')], check=True)
    os.remove(wav)


def save_sfx(name, sig):
    """A sound effect, normalised, as public/audio/sfx-<name>.mp3."""
    if sig.ndim == 1:
        sig = np.stack([sig, sig], axis=1)
    sig = sig / (np.max(np.abs(sig)) * 1.05)
    wav = os.path.join(OUT, f'sfx-{name}.wav')
    os.makedirs(OUT, exist_ok=True)
    wavfile.write(wav, SR, (sig * 32767).astype(np.int16))
    subprocess.run(['ffmpeg', '-v', 'error', '-y', '-i', wav, '-c:a', 'libmp3lame', '-b:a', '160k', wav[:-4] + '.mp3'], check=True)
    os.remove(wav)
