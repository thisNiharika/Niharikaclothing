// Licensed under Spatial Sites key SS-093-GENMGQ. Redistribution prohibited. https://spatialsites.co/licence
// Licensed by Spatial Sites. See LICENSE.txt. Redistribution prohibited.
//
// The beat behind the ferrofluid. One two-bar pattern drives both the picture and the sound, so they cannot drift
// apart: the liquid reads its pulses from the pattern and the clock (`bands`), and the synth plays the same pattern on
// that clock. With the sound off the clock is the page's own and the pulses are quieter; with it on the clock is the
// audio's, so a spike rises on the kick the visitor hears. Everything is made in the browser: no audio files.

export const BPM = 108;
export const STEP = 60 / BPM / 4;
export const STEPS = 32;

/** Which steps of the two bars each voice plays on. */
export const PATTERN = {
  kick: [0, 7, 10, 16, 23, 26, 30],
  clap: [8, 24],
  hat: [2, 6, 10, 14, 18, 22, 26, 29, 30],
  bass: [
    [0, 45], [3, 45], [6, 48], [10, 45], [13, 43], [16, 41], [19, 41], [22, 43], [26, 40], [29, 43],
  ] as [number, number][],
};

/** How long each band's pulse takes to die away, in seconds. */
const DECAY = { low: 0.2, mid: 0.16, high: 0.07 };

/** Seconds since the last hit of `steps` at time `t`, looking back up to one loop. */
export function sinceHit(steps: readonly number[], t: number): number {
  if (!(t >= 0) || !steps.length) return Infinity;
  const loop = STEPS * STEP;
  const pos = t % loop;
  let best = Infinity;
  for (const s of steps) {
    const at = s * STEP;
    const d = pos >= at ? pos - at : pos + loop - at;
    if (d < best) best = d;
  }
  // Early in the first loop the nearest hit behind may be one from a loop that never played.
  return best > t ? Infinity : best;
}

/** The three bands' pulses at time `t`, each 0 to 1: low from the kick and the bass, mid from the clap, high from the hats. */
export function bands(t: number, slow = 1): { low: number; mid: number; high: number } {
  const k = Math.exp(-sinceHit(PATTERN.kick, t) / (DECAY.low * slow));
  const b = Math.exp(-sinceHit(PATTERN.bass.map((x) => x[0]), t) / (0.3 * slow)) * 0.35;
  const c = Math.exp(-sinceHit(PATTERN.clap, t) / (DECAY.mid * slow));
  const h = Math.exp(-sinceHit(PATTERN.hat, t) / (DECAY.high * slow));
  return { low: Math.min(1, k + b), mid: c, high: h };
}

const midiHz = (m: number) => 440 * Math.pow(2, (m - 69) / 12);

/** The synth: kick, clap, hats and a filtered bass, scheduled a little ahead on the audio clock. */
export class Beat {
  private ctx: AudioContext | null = null;
  private out: GainNode | null = null;
  private noise: AudioBuffer | null = null;
  private timer = 0;
  private start = 0;
  private next = 0;
  playing = false;

  static available(): boolean {
    return typeof window !== "undefined" && ("AudioContext" in window || "webkitAudioContext" in window);
  }

  /** Seconds into the loop on the audio clock, allowing for the output latency; null while silent. */
  clock(): number | null {
    if (!this.playing || !this.ctx) return null;
    const lag = (this.ctx as AudioContext & { outputLatency?: number }).outputLatency ?? this.ctx.baseLatency ?? 0;
    return Math.max(0, this.ctx.currentTime - this.start - lag);
  }

  async on() {
    if (this.playing) return;
    if (!this.ctx) {
      const C = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      this.ctx = new C();
      const comp = this.ctx.createDynamicsCompressor();
      comp.threshold.value = -14;
      comp.ratio.value = 4;
      this.out = this.ctx.createGain();
      this.out.gain.value = 0;
      this.out.connect(comp).connect(this.ctx.destination);
      const len = Math.floor(this.ctx.sampleRate * 0.5);
      this.noise = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
      const d = this.noise.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    }
    await this.ctx.resume();
    const now = this.ctx.currentTime;
    this.out!.gain.cancelScheduledValues(now);
    this.out!.gain.setValueAtTime(this.out!.gain.value, now);
    this.out!.gain.linearRampToValueAtTime(0.5, now + 0.5);
    this.start = now + 0.08;
    this.next = 0;
    this.playing = true;
    this.pump();
    this.timer = window.setInterval(() => this.pump(), 25);
  }

  off() {
    if (!this.playing || !this.ctx || !this.out) return;
    this.playing = false;
    clearInterval(this.timer);
    const now = this.ctx.currentTime;
    this.out.gain.cancelScheduledValues(now);
    this.out.gain.setValueAtTime(this.out.gain.value, now);
    this.out.gain.linearRampToValueAtTime(0, now + 0.25);
    const ctx = this.ctx;
    window.setTimeout(() => { if (!this.playing) void ctx.suspend(); }, 400);
  }

  private pump() {
    const ctx = this.ctx!;
    while (this.start + this.next * STEP < ctx.currentTime + 0.12) {
      const at = this.start + this.next * STEP;
      const s = this.next % STEPS;
      if (PATTERN.kick.includes(s)) this.kick(at);
      if (PATTERN.clap.includes(s)) this.clap(at);
      if (PATTERN.hat.includes(s)) this.hat(at, s === 30 ? 0.18 : 0.05);
      const b = PATTERN.bass.find((x) => x[0] === s);
      if (b) this.bass(at, midiHz(b[1]));
      this.next++;
    }
  }

  private kick(at: number) {
    const ctx = this.ctx!, o = ctx.createOscillator(), g = ctx.createGain();
    o.type = "sine";
    o.frequency.setValueAtTime(150, at);
    o.frequency.exponentialRampToValueAtTime(42, at + 0.14);
    g.gain.setValueAtTime(0.0001, at);
    g.gain.exponentialRampToValueAtTime(1, at + 0.004);
    g.gain.exponentialRampToValueAtTime(0.0001, at + 0.42);
    o.connect(g).connect(this.out!);
    o.start(at);
    o.stop(at + 0.45);
  }

  private burst(at: number, type: BiquadFilterType, freq: number, peak: number, decay: number) {
    const ctx = this.ctx!, n = ctx.createBufferSource(), f = ctx.createBiquadFilter(), g = ctx.createGain();
    n.buffer = this.noise;
    f.type = type;
    f.frequency.value = freq;
    g.gain.setValueAtTime(0.0001, at);
    g.gain.exponentialRampToValueAtTime(peak, at + 0.002);
    g.gain.exponentialRampToValueAtTime(0.0001, at + decay);
    n.connect(f).connect(g).connect(this.out!);
    n.start(at);
    n.stop(at + decay + 0.02);
  }

  private clap(at: number) {
    for (const [d, p] of [[0, 0.5], [0.011, 0.4], [0.023, 0.6]] as const) this.burst(at + d, "bandpass", 1500, p, 0.16);
  }

  private hat(at: number, decay: number) {
    this.burst(at, "highpass", 7500, 0.16, decay);
  }

  private bass(at: number, hz: number) {
    const ctx = this.ctx!, o = ctx.createOscillator(), f = ctx.createBiquadFilter(), g = ctx.createGain();
    o.type = "sawtooth";
    o.frequency.value = hz;
    f.type = "lowpass";
    f.Q.value = 7;
    f.frequency.setValueAtTime(900, at);
    f.frequency.exponentialRampToValueAtTime(140, at + 0.26);
    g.gain.setValueAtTime(0.0001, at);
    g.gain.exponentialRampToValueAtTime(0.32, at + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, at + 0.34);
    o.connect(f).connect(g).connect(this.out!);
    o.start(at);
    o.stop(at + 0.36);
  }
}
