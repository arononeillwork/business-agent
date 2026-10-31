"""The landing video's music and sound effects, made from scratch (no samples, no licence needed).

120 bpm, so a bar is 2 s (60 frames at 30 fps) and the video's cuts land on beats:
  bars 1-5   (0-10 s)   23:47: a quiet clock, once a second, over a soft minor chord
  bars 6-7   (10-14 s)  "What if you changed it once?": warm chords swell, a riser
  bars 8-18  (14-36 s)  onboarding: the groove starts (F C Dm Bb)
  bars 19-37 (36-74 s)  opening hours and the menu: fuller, a bell melody on top
  bars 38-41 (74-82 s)  the team: lighter
  bars 42-45 (82-90 s)  "Home by half past" / "How much is your time worth?": drums out, a question
  bars 46-47 (90-95 s)  the logo: resolves home, rings out

    python3 video/music/compose.py   ->  video/public/audio/music.mp3 and sfx-*.mp3 (needs numpy, scipy, ffmpeg)
"""
import os
import numpy as np
from scipy.signal import butter, lfilter, fftconvolve
from scipy.io import wavfile

SR = 44100
BPM = 120
BEAT = 60 / BPM
BAR = 4 * BEAT
LENGTH = 95.0
OUT = os.path.join(os.path.dirname(__file__), '..', 'public', 'audio')
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
    def __init__(self):
        self.buf = np.zeros((int(LENGTH * SR) + SR * 4, 2))

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


# ---------- the arrangement ----------

def bar(n):
    """Start time of bar n (1-based)."""
    return (n - 1) * BAR


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

music = Track()
drums = Track()


def chord_bar(n, name, pad_gain=0.5, arp=True, arp_gain=0.32, bass_on=True, ep_on=False):
    c = CHORDS[name]
    music.add(bar(n), pad([hz(x) for x in c['pad']], BAR + 0.6), pad_gain)
    if bass_on:
        r = hz(c['root'])
        for b, l in ((0, 1.4), (1.5, 0.45), (2, 1.4), (3.5, 0.45)):
            music.add(bar(n) + b * BEAT, bass(r, l * BEAT), 0.85)
    if arp:
        notes = c['arp']
        order = [0, 1, 2, 3, 2, 1, 2, 3]
        for i, k in enumerate(order):
            music.add(bar(n) + i * BEAT / 2, pluck(hz(notes[k]), 0.9), arp_gain * (1.0 if i % 2 == 0 else 0.75), pan=(-0.35 if i % 2 else 0.35))
    if ep_on:
        for i, x in enumerate(c['pad']):
            music.add(bar(n) + i * 0.012, ep(hz(x) * 2, BAR * 1.5, 0.8), 0.22, pan=-0.2 + 0.13 * i)


def groove(n, full=True, kick_gain=0.9):
    for b in range(4):
        drums.add(bar(n) + b * BEAT, kick(), kick_gain * (1.0 if b in (0, 2) else (0.55 if full else 0.0)))
        if b in (1, 3):
            drums.add(bar(n) + b * BEAT, clap(), 0.55 if full else 0.35)
    for s in range(8):
        drums.add(bar(n) + s * BEAT / 2, shaker(1.0 if s % 2 else 0.6), 0.9 if full else 0.6, pan=0.4)
    if full:
        for s in (1.75, 3.75):
            drums.add(bar(n) + s * BEAT, shaker(1.2), 0.8, pan=0.4)


# Bars 1-5: a quiet clock, once a second, over a soft A minor chord.
for sec in range(10):
    music.add(sec * 1.0, tick(sec % 2 == 0), 0.5 * (1 - 0.06 * max(0, sec - 7)))
music.add(0, pad([hz('A2'), hz('E3'), hz('C4')], 10.3, bright=900), 0.28)
for at, note in ((0.0, 'E4'), (2.0, 'C4'), (4.0, 'D4'), (6.0, 'B3')):
    music.add(at, ep(hz(note), 3.0, 0.6), 0.14, pan=0.2)

# Bars 6-7: the turn. Warm chords swell, a riser into the groove.
music.add(bar(6), pad([hz(x) for x in CHORDS['F']['pad']], BAR + 0.8, 2200), 0.6)
for i, x in enumerate(CHORDS['F']['pad']):
    music.add(bar(6) + 0.02 * i, ep(hz(x) * 2, 3.5), 0.3)
music.add(bar(7), pad([hz(x) for x in CHORDS['C']['pad']], BAR + 0.6, 2400), 0.6)
for i, x in enumerate(['E4', 'G4', 'C5']):
    music.add(bar(7) + 0.02 * i, ep(hz(x), 3.0), 0.28)
music.add(bar(7), riser(BAR), 0.9)

# Bars 8-18: onboarding. The groove.
for n in range(8, 19):
    chord_bar(n, CYCLE[(n - 8) % 4], arp_gain=0.28)
    groove(n, full=n > 8)

# Bars 19-37: opening hours and the menu. Fuller, the bell melody on top.
for n in range(19, 38):
    chord_bar(n, CYCLE[(n - 19) % 4], pad_gain=0.55, arp_gain=0.3, ep_on=(n % 4 == 3))
    groove(n, full=True)
for phrase, octave in ((19, 1.0), (23, 1.0), (30, 1.0), (34, 2.0)):
    for beat, note, length in MELODY:
        music.add(bar(phrase) + beat * BEAT, bell(hz(note) * octave, length * BEAT + 1.2), 0.42, pan=-0.15)

# Bars 38-41: the team. Lighter.
for n in range(38, 42):
    chord_bar(n, CYCLE[(n - 38) % 4], pad_gain=0.5, arp_gain=0.24)
    groove(n, full=False, kick_gain=0.7)

# Bars 42-43: "Home by half past." Drums out.
chord_bar(42, 'Dm', pad_gain=0.55, arp=False, bass_on=False, ep_on=True)
chord_bar(43, 'Bb', pad_gain=0.55, arp=False, bass_on=False, ep_on=True)
# Bars 44-45: "How much is your time worth?" A question, left open.
music.add(bar(44), pad([hz(x) for x in CHORDS['Csus']['pad']], 2 * BAR + 0.5, 1400), 0.42)
for i, x in enumerate(['C4', 'F4', 'G4', 'D5']):
    music.add(bar(44) + 0.05 * i, ep(hz(x), 4.0, 0.7), 0.26)
music.add(bar(45) + 2 * BEAT, riser(2 * BEAT), 0.35)
# Bars 46-47: home. The logo.
music.add(bar(46), pad([hz(x) for x in CHORDS['F']['pad']] + [hz('F4')], 2 * BAR + 1.5, 2600), 0.6)
for i, x in enumerate(['F3', 'C4', 'F4', 'A4', 'C5']):
    music.add(bar(46) + 0.03 * i, ep(hz(x), 6.0), 0.3)
music.add(bar(46), bass(hz('F2'), 2.5), 0.9)
drums.add(bar(46), kick(), 0.8)
for i, n in enumerate(['C5', 'A4', 'F4', 'C5', 'F5']):
    music.add(bar(46) + (0.5 + i * 0.5) * BEAT, bell(hz(n), 2.5), 0.32, pan=0.15)

# Mix: the drums push the chords a little (side-chain), a room around everything but the kick.
kick_env = np.zeros(len(drums.buf))
for n in list(range(8, 42)):
    for b in (0, 2):
        i = int((bar(n) + b * BEAT) * SR)
        m = int(0.35 * SR)
        kick_env[i:i + m] = np.maximum(kick_env[i:i + m], np.exp(-np.arange(m) / (0.09 * SR)))
duck = 1 - 0.28 * kick_env
mix = reverb(music.buf * duck[:, None], wet=0.24) + reverb(drums.buf, seconds=0.9, wet=0.08)
# Fade the very end.
end = int(LENGTH * SR)
fade = int(2.0 * SR)
mix[end - fade:end] *= np.linspace(1, 0, fade)[:, None]
mix = mix[:end]
mix /= np.max(np.abs(mix)) * 1.12
os.makedirs(OUT, exist_ok=True)
wavfile.write(os.path.join(OUT, 'music.wav'), SR, (mix * 32767).astype(np.int16))


# ---------- sound effects ----------

def save(name, sig):
    if sig.ndim == 1:
        sig = np.stack([sig, sig], axis=1)
    sig = sig / (np.max(np.abs(sig)) * 1.05)
    wavfile.write(os.path.join(OUT, f'sfx-{name}.wav'), SR, (sig * 32767).astype(np.int16))


# A soft UI click.
n = int(0.05 * SR); t = t_of(n)
save('click', lp(hp(rng.uniform(-1, 1, n), 1500), 7000) * np.exp(-t * 180) * 0.6 + np.sin(2 * np.pi * 1800 * t) * np.exp(-t * 220) * 0.4)
# A notification ping (two notes).
n = int(0.7 * SR); t = t_of(n)
p = np.sin(2 * np.pi * hz('E6') * t) * np.exp(-t * 7)
p[int(0.08 * SR):] += np.sin(2 * np.pi * hz('B6') * t[:n - int(0.08 * SR)]) * np.exp(-t[:n - int(0.08 * SR)] * 6)
save('ping', reverb(np.stack([p, p], axis=1), 0.8, 0.2))
# A low buzz (the 1-star review).
n = int(0.35 * SR); t = t_of(n)
save('buzz', lp(np.sign(np.sin(2 * np.pi * 110 * t)) * 0.5 + np.sin(2 * np.pi * 220 * t) * 0.3, 1200) * env_adsr(n, 0.01, 0.05, 0.8, 0.1))
# A pop (a card arriving).
n = int(0.18 * SR); t = t_of(n)
f = 380 + 900 * np.exp(-t * 40)
save('pop', np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t * 26))
# A whoosh (between scenes).
n = int(0.7 * SR); t = t_of(n)
noise = rng.uniform(-1, 1, n); w = np.zeros(n)
for k in range(20):
    a, b = k * n // 20, (k + 1) * n // 20
    c = 300 * (5000 / 300) ** (np.sin(np.pi * k / 20))
    w[a:b] = bp(noise, c * 0.6, c * 1.5)[a:b]
save('whoosh', w * np.sin(np.pi * t / t[-1]) ** 2)
# A soft chime (done / all set).
n = int(1.6 * SR); t = t_of(n)
ch = sum(np.sin(2 * np.pi * hz(x) * t) * np.exp(-t * 3) for x in ('C6', 'E6', 'G6'))
save('chime', reverb(np.stack([ch, ch], axis=1), 1.4, 0.3))
print('music and sound effects written to', os.path.abspath(OUT))

# Master for the web (no sub rumble, a touch less boom, gently compressed, -17 LUFS) and keep MP3s.
import glob
import subprocess
subprocess.run(['ffmpeg', '-v', 'error', '-y', '-i', os.path.join(OUT, 'music.wav'), '-af',
                'highpass=f=38,equalizer=f=90:t=q:w=1.0:g=-3,equalizer=f=3500:t=q:w=1.2:g=1.5,'
                'acompressor=threshold=-18dB:ratio=2.5:attack=15:release=200:makeup=2,loudnorm=I=-17:TP=-1.5:LRA=11',
                '-ar', '44100', '-c:a', 'libmp3lame', '-b:a', '192k', os.path.join(OUT, 'music.mp3')], check=True)
for wav in glob.glob(os.path.join(OUT, 'sfx-*.wav')):
    subprocess.run(['ffmpeg', '-v', 'error', '-y', '-i', wav, '-c:a', 'libmp3lame', '-b:a', '160k', wav[:-4] + '.mp3'], check=True)
for wav in glob.glob(os.path.join(OUT, '*.wav')):
    os.remove(wav)
