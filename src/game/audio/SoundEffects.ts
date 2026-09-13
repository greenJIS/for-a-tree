/**
 * Procedural sound synthesizer using the browser Web Audio API.
 * Pure synthesis with zero external audio assets.
 * SRS 7.
 */

export type SoundEffectName =
  | 'carbine'
  | 'scatter'
  | 'shotgun'
  | 'rail'
  | 'alienSplat'
  | 'splat'
  | 'aegisOn'
  | 'aegis'
  | 'pickup'
  | 'deliver'
  | 'decayWarn'
  | 'decay'
  | 'generation'
  | 'snd_carbine_fire'
  | 'snd_shotgun_fire'
  | 'snd_rail_fire'
  | 'snd_alien_splat'
  | 'snd_aegis_on'
  | 'snd_pickup'
  | 'snd_deliver'
  | 'snd_decay_warn'
  | 'snd_generation';

export class SoundEffects {
  #ctx: AudioContext | null = null;
  #masterGain: GainNode | null = null;
  #noiseBuffer: AudioBuffer | null = null;
  #volume = 0.5;
  #muted = false;

  get volume(): number {
    return this.#volume;
  }

  set volume(val: number) {
    this.#volume = Math.max(0, Math.min(1, val));
    if (this.#masterGain && this.#ctx && !this.#muted) {
      this.#masterGain.gain.setValueAtTime(this.#volume, this.#ctx.currentTime);
    }
  }

  get muted(): boolean {
    return this.#muted;
  }

  set muted(val: boolean) {
    this.#muted = val;
    if (this.#masterGain && this.#ctx) {
      this.#masterGain.gain.setValueAtTime(
        this.#muted ? 0 : this.#volume,
        this.#ctx.currentTime,
      );
    }
  }

  setVolume(val: number): void {
    this.volume = val;
  }

  getVolume(): number {
    return this.volume;
  }

  setMuted(val: boolean): void {
    this.muted = val;
  }

  isMuted(): boolean {
    return this.muted;
  }

  toggleMute(): boolean {
    this.muted = !this.muted;
    return this.muted;
  }

  #init(): AudioContext | null {
    if (this.#ctx) {
      if (this.#ctx.state === 'suspended') {
        void this.#ctx.resume();
      }
      return this.#ctx;
    }

    if (
      typeof window === 'undefined' ||
      !(
        window.AudioContext ||
        (window as unknown as { webkitAudioContext?: typeof AudioContext })
          .webkitAudioContext
      )
    ) {
      return null;
    }

    const AudioContextClass =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext })
        .webkitAudioContext;

    try {
      this.#ctx = new AudioContextClass();
      this.#masterGain = this.#ctx.createGain();
      this.#masterGain.gain.setValueAtTime(
        this.#muted ? 0 : this.#volume,
        this.#ctx.currentTime,
      );
      this.#masterGain.connect(this.#ctx.destination);

      if (this.#ctx.state === 'suspended') {
        void this.#ctx.resume();
      }

      return this.#ctx;
    } catch {
      return null;
    }
  }

  #getNoiseBuffer(ctx: AudioContext): AudioBuffer {
    if (this.#noiseBuffer) return this.#noiseBuffer;
    const length = Math.floor(ctx.sampleRate * 1.0);
    const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
    const channel = buffer.getChannelData(0);
    for (let i = 0; i < length; i += 1) {
      channel[i] = Math.random() * 2 - 1;
    }
    this.#noiseBuffer = buffer;
    return buffer;
  }

  resume(): void {
    const ctx = this.#init();
    if (ctx && ctx.state === 'suspended') {
      void ctx.resume();
    }
  }

  /**
   * Kinetic Carbine: punchy crack (triangle wave pitch drop from 600Hz to 80Hz, 0.08s).
   */
  carbine(): void {
    const ctx = this.#init();
    if (!ctx || !this.#masterGain) return;

    const t = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = 'triangle';
    osc.frequency.setValueAtTime(600, t);
    osc.frequency.exponentialRampToValueAtTime(80, t + 0.08);

    gain.gain.setValueAtTime(0.4, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.08);

    osc.connect(gain);
    gain.connect(this.#masterGain);

    osc.start(t);
    osc.stop(t + 0.08);
  }

  /**
   * Scatter Pulser: spread blast (noise burst + low square pitch drop, 0.15s).
   */
  scatter(): void {
    const ctx = this.#init();
    if (!ctx || !this.#masterGain) return;

    const t = ctx.currentTime;

    // Noise burst
    const noise = ctx.createBufferSource();
    noise.buffer = this.#getNoiseBuffer(ctx);
    const noiseFilter = ctx.createBiquadFilter();
    noiseFilter.type = 'bandpass';
    noiseFilter.frequency.setValueAtTime(1200, t);
    const noiseGain = ctx.createGain();
    noiseGain.gain.setValueAtTime(0.3, t);
    noiseGain.gain.exponentialRampToValueAtTime(0.001, t + 0.12);

    noise.connect(noiseFilter);
    noiseFilter.connect(noiseGain);
    noiseGain.connect(this.#masterGain);

    noise.start(t);
    noise.stop(t + 0.12);

    // Low square pitch drop
    const osc = ctx.createOscillator();
    const oscGain = ctx.createGain();
    osc.type = 'square';
    osc.frequency.setValueAtTime(220, t);
    osc.frequency.exponentialRampToValueAtTime(40, t + 0.15);
    oscGain.gain.setValueAtTime(0.2, t);
    oscGain.gain.exponentialRampToValueAtTime(0.001, t + 0.15);

    osc.connect(oscGain);
    oscGain.connect(this.#masterGain);

    osc.start(t);
    osc.stop(t + 0.15);
  }

  shotgun(): void {
    this.scatter();
  }

  /**
   * Mag-Rail Staker: high-voltage hum and crack (sine frequency sweep 1200Hz to 150Hz with sharp attack, 0.25s).
   */
  rail(): void {
    const ctx = this.#init();
    if (!ctx || !this.#masterGain) return;

    const t = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = 'sine';
    osc.frequency.setValueAtTime(1200, t);
    osc.frequency.exponentialRampToValueAtTime(150, t + 0.25);

    gain.gain.setValueAtTime(0.001, t);
    gain.gain.linearRampToValueAtTime(0.5, t + 0.005);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.25);

    osc.connect(gain);
    gain.connect(this.#masterGain);

    osc.start(t);
    osc.stop(t + 0.25);
  }

  /**
   * Mutant Splat: squishy crunch (noise + low pitch drop 150Hz to 40Hz, 0.1s).
   */
  alienSplat(): void {
    const ctx = this.#init();
    if (!ctx || !this.#masterGain) return;

    const t = ctx.currentTime;

    const noise = ctx.createBufferSource();
    noise.buffer = this.#getNoiseBuffer(ctx);
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(800, t);
    filter.frequency.exponentialRampToValueAtTime(200, t + 0.1);
    const noiseGain = ctx.createGain();
    noiseGain.gain.setValueAtTime(0.35, t);
    noiseGain.gain.exponentialRampToValueAtTime(0.001, t + 0.1);

    noise.connect(filter);
    filter.connect(noiseGain);
    noiseGain.connect(this.#masterGain);

    noise.start(t);
    noise.stop(t + 0.1);

    const osc = ctx.createOscillator();
    const oscGain = ctx.createGain();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(150, t);
    osc.frequency.exponentialRampToValueAtTime(40, t + 0.1);
    oscGain.gain.setValueAtTime(0.3, t);
    oscGain.gain.exponentialRampToValueAtTime(0.001, t + 0.1);

    osc.connect(oscGain);
    oscGain.connect(this.#masterGain);

    osc.start(t);
    osc.stop(t + 0.1);
  }

  splat(): void {
    this.alienSplat();
  }

  /**
   * Aegis Pulse: resonant charge (sine upward sweep 200Hz to 880Hz with resonant tail, 0.4s).
   */
  aegisOn(): void {
    const ctx = this.#init();
    if (!ctx || !this.#masterGain) return;

    const t = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = 'sine';
    osc.frequency.setValueAtTime(200, t);
    osc.frequency.exponentialRampToValueAtTime(880, t + 0.2);

    gain.gain.setValueAtTime(0.01, t);
    gain.gain.linearRampToValueAtTime(0.4, t + 0.05);
    gain.gain.setValueAtTime(0.4, t + 0.2);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.4);

    osc.connect(gain);
    gain.connect(this.#masterGain);

    osc.start(t);
    osc.stop(t + 0.4);
  }

  aegis(): void {
    this.aegisOn();
  }

  /**
   * Canister Pickup: clean crystalline chime (high sine chime 880Hz -> 1320Hz, 0.15s).
   */
  pickup(): void {
    const ctx = this.#init();
    if (!ctx || !this.#masterGain) return;

    const t = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = 'sine';
    osc.frequency.setValueAtTime(880, t);
    osc.frequency.exponentialRampToValueAtTime(1320, t + 0.08);

    gain.gain.setValueAtTime(0.001, t);
    gain.gain.linearRampToValueAtTime(0.3, t + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.15);

    osc.connect(gain);
    gain.connect(this.#masterGain);

    osc.start(t);
    osc.stop(t + 0.15);
  }

  /**
   * Tree Delivery: rising three-note growth chime (440Hz -> 554Hz -> 659Hz, 0.3s).
   */
  deliver(): void {
    const ctx = this.#init();
    const masterGain = this.#masterGain;
    if (!ctx || !masterGain) return;

    const t = ctx.currentTime;
    const notes = [440, 554.37, 659.25];
    for (let idx = 0; idx < notes.length; idx += 1) {
      const freq = notes[idx];
      const noteStart = t + idx * 0.09;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, noteStart);

      gain.gain.setValueAtTime(0.001, noteStart);
      gain.gain.linearRampToValueAtTime(0.25, noteStart + 0.01);
      gain.gain.exponentialRampToValueAtTime(0.001, noteStart + 0.12);

      osc.connect(gain);
      gain.connect(masterGain);

      osc.start(noteStart);
      osc.stop(noteStart + 0.12);
    }
  }

  /**
   * Decay Warning: low descending drone (180Hz -> 90Hz, 0.5s).
   */
  decayWarn(): void {
    const ctx = this.#init();
    if (!ctx || !this.#masterGain) return;

    const t = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(180, t);
    osc.frequency.exponentialRampToValueAtTime(90, t + 0.5);

    gain.gain.setValueAtTime(0.001, t);
    gain.gain.linearRampToValueAtTime(0.25, t + 0.05);
    gain.gain.setValueAtTime(0.25, t + 0.3);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.5);

    osc.connect(gain);
    gain.connect(this.#masterGain);

    osc.start(t);
    osc.stop(t + 0.5);
  }

  decay(): void {
    this.decayWarn();
  }

  /**
   * Generation Fanfare: full bloom fanfare (triumphant chords/arpeggios, 0.6s).
   */
  generation(): void {
    const ctx = this.#init();
    const masterGain = this.#masterGain;
    if (!ctx || !masterGain) return;

    const t = ctx.currentTime;
    const notes = [
      { freq: 523.25, start: 0.0, dur: 0.2 },
      { freq: 659.25, start: 0.1, dur: 0.2 },
      { freq: 783.99, start: 0.2, dur: 0.25 },
      { freq: 1046.5, start: 0.3, dur: 0.3 },
      { freq: 523.25, start: 0.3, dur: 0.3 },
      { freq: 659.25, start: 0.3, dur: 0.3 },
      { freq: 783.99, start: 0.3, dur: 0.3 },
    ];

    for (const note of notes) {
      const noteStart = t + note.start;
      const noteEnd = noteStart + note.dur;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = 'triangle';
      osc.frequency.setValueAtTime(note.freq, noteStart);

      gain.gain.setValueAtTime(0.001, noteStart);
      gain.gain.linearRampToValueAtTime(0.15, noteStart + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.001, noteEnd);

      osc.connect(gain);
      gain.connect(masterGain);

      osc.start(noteStart);
      osc.stop(noteEnd);
    }
  }

  play(name: SoundEffectName): void {
    switch (name) {
      case 'carbine':
      case 'snd_carbine_fire':
        this.carbine();
        break;
      case 'scatter':
      case 'shotgun':
      case 'snd_shotgun_fire':
        this.scatter();
        break;
      case 'rail':
      case 'snd_rail_fire':
        this.rail();
        break;
      case 'alienSplat':
      case 'splat':
      case 'snd_alien_splat':
        this.alienSplat();
        break;
      case 'aegisOn':
      case 'aegis':
      case 'snd_aegis_on':
        this.aegisOn();
        break;
      case 'pickup':
      case 'snd_pickup':
        this.pickup();
        break;
      case 'deliver':
      case 'snd_deliver':
        this.deliver();
        break;
      case 'decayWarn':
      case 'decay':
      case 'snd_decay_warn':
        this.decayWarn();
        break;
      case 'generation':
      case 'snd_generation':
        this.generation();
        break;
    }
  }
}
