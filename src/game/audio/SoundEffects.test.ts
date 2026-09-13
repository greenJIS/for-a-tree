import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SoundEffects } from './SoundEffects';

describe('SoundEffects', () => {
  describe('headless / Node environment (no window.AudioContext)', () => {
    it('initializes cleanly without errors', () => {
      const sfx = new SoundEffects();
      expect(sfx.volume).toBe(0.5);
      expect(sfx.muted).toBe(false);
    });

    it('gracefully no-ops all sound triggers when AudioContext is unavailable', () => {
      const sfx = new SoundEffects();
      expect(() => {
        sfx.startMusic();
        sfx.setMusicIntensity(true);
        sfx.stopMusic();
        sfx.carbine();
        sfx.scatter();
        sfx.shotgun();
        sfx.rail();
        sfx.alienSplat();
        sfx.splat();
        sfx.aegisOn();
        sfx.aegis();
        sfx.pickup();
        sfx.deliver();
        sfx.decayWarn();
        sfx.decay();
        sfx.generation();
        sfx.growthStalled();
        sfx.play('carbine');
        sfx.resume();
      }).not.toThrow();
    });

    it('manages volume and mute state without AudioContext', () => {
      const sfx = new SoundEffects();
      sfx.volume = 0.8;
      expect(sfx.volume).toBe(0.8);
      expect(sfx.getVolume()).toBe(0.8);

      sfx.setVolume(1.5);
      expect(sfx.volume).toBe(1.0); // clamps to 1

      sfx.setVolume(-0.2);
      expect(sfx.volume).toBe(0.0); // clamps to 0

      expect(sfx.isMuted()).toBe(false);
      sfx.setMuted(true);
      expect(sfx.isMuted()).toBe(true);
      expect(sfx.muted).toBe(true);

      sfx.toggleMute();
      expect(sfx.muted).toBe(false);
    });
  });

  describe('with Web Audio API environment', () => {
    type MockParam = {
      value: number;
      setValueAtTime: ReturnType<typeof vi.fn>;
      cancelScheduledValues: ReturnType<typeof vi.fn>;
      linearRampToValueAtTime: ReturnType<typeof vi.fn>;
      exponentialRampToValueAtTime: ReturnType<typeof vi.fn>;
    };

    function createMockParam(initialValue = 0): MockParam {
      return {
        value: initialValue,
        setValueAtTime: vi.fn(),
        cancelScheduledValues: vi.fn(),
        linearRampToValueAtTime: vi.fn(),
        exponentialRampToValueAtTime: vi.fn(),
      };
    }

    type MockGain = {
      gain: MockParam;
      connect: ReturnType<typeof vi.fn>;
    };

    type MockOsc = {
      type: string;
      frequency: MockParam;
      connect: ReturnType<typeof vi.fn>;
      start: ReturnType<typeof vi.fn>;
      stop: ReturnType<typeof vi.fn>;
    };

    type MockFilter = {
      type: string;
      frequency: MockParam;
      connect: ReturnType<typeof vi.fn>;
      disconnect: ReturnType<typeof vi.fn>;
    };

    type MockBufferSource = {
      buffer: unknown;
      connect: ReturnType<typeof vi.fn>;
      start: ReturnType<typeof vi.fn>;
      stop: ReturnType<typeof vi.fn>;
    };

    let mockCtx: {
      currentTime: number;
      sampleRate: number;
      state: string;
      destination: Record<string, unknown>;
      resume: ReturnType<typeof vi.fn>;
      createGain: ReturnType<typeof vi.fn>;
      createOscillator: ReturnType<typeof vi.fn>;
      createBiquadFilter: ReturnType<typeof vi.fn>;
      createBuffer: ReturnType<typeof vi.fn>;
      createBufferSource: ReturnType<typeof vi.fn>;
    };

    beforeEach(() => {
      mockCtx = {
        currentTime: 10,
        sampleRate: 44100,
        state: 'suspended',
        destination: {},
        resume: vi.fn().mockResolvedValue(undefined),
        createGain: vi.fn((): MockGain => ({
          gain: createMockParam(),
          connect: vi.fn(),
        })),
        createOscillator: vi.fn((): MockOsc => ({
          type: 'sine',
          frequency: createMockParam(),
          connect: vi.fn(),
          start: vi.fn(),
          stop: vi.fn(),
        })),
        createBiquadFilter: vi.fn((): MockFilter => ({
          type: 'lowpass',
          frequency: createMockParam(),
          connect: vi.fn(),
          disconnect: vi.fn(),
        })),
        createBuffer: vi.fn((channels: number, length: number) => ({
          numberOfChannels: channels,
          length,
          getChannelData: vi.fn(() => new Float32Array(length)),
        })),
        createBufferSource: vi.fn((): MockBufferSource => ({
          buffer: null,
          connect: vi.fn(),
          start: vi.fn(),
          stop: vi.fn(),
        })),
      };

      const MockAudioContext = vi.fn(function () {
        return mockCtx;
      });

      (globalThis as unknown as { window: unknown }).window = {
        AudioContext: MockAudioContext,
      };
    });

    afterEach(() => {
      delete (globalThis as unknown as { window?: unknown }).window;
    });

    it('lazily initializes AudioContext on first sound trigger', () => {
      const sfx = new SoundEffects();
      expect(mockCtx.createGain).not.toHaveBeenCalled();

      sfx.carbine();
      expect(mockCtx.createGain).toHaveBeenCalled();
      expect(mockCtx.resume).toHaveBeenCalled();
    });

    it('resumes context on explicit resume()', () => {
      const sfx = new SoundEffects();
      sfx.resume();
      expect(mockCtx.resume).toHaveBeenCalled();
    });

    it('updates master gain on volume and mute adjustments', () => {
      const sfx = new SoundEffects();
      sfx.carbine(); // triggers init

      const masterGain = mockCtx.createGain.mock.results[0].value as MockGain;
      expect(masterGain.gain.setValueAtTime).toHaveBeenCalledWith(0.5, 10);

      sfx.volume = 0.75;
      expect(masterGain.gain.setValueAtTime).toHaveBeenCalledWith(0.75, 10);

      sfx.muted = true;
      expect(masterGain.gain.setValueAtTime).toHaveBeenCalledWith(0, 10);

      sfx.muted = false;
      expect(masterGain.gain.setValueAtTime).toHaveBeenCalledWith(0.75, 10);
    });

    it('synthesizes carbine sound with triangle pitch drop', () => {
      const sfx = new SoundEffects();
      sfx.carbine();
      expect(mockCtx.createOscillator).toHaveBeenCalled();
      const osc = mockCtx.createOscillator.mock.results[0].value as MockOsc;
      expect(osc.type).toBe('triangle');
      expect(osc.frequency.setValueAtTime).toHaveBeenCalledWith(600, 10);
      expect(osc.frequency.exponentialRampToValueAtTime).toHaveBeenCalledWith(80, 10.08);
      expect(osc.start).toHaveBeenCalledWith(10);
      expect(osc.stop).toHaveBeenCalledWith(10.08);
    });

    it('synthesizes scatter sound with noise burst and square drop', () => {
      const sfx = new SoundEffects();
      sfx.scatter();
      expect(mockCtx.createBufferSource).toHaveBeenCalled();
      expect(mockCtx.createOscillator).toHaveBeenCalled();
      const osc = mockCtx.createOscillator.mock.results[0].value as MockOsc;
      expect(osc.type).toBe('square');
      expect(osc.frequency.setValueAtTime).toHaveBeenCalledWith(220, 10);
    });

    it('synthesizes rail sound with sine sweep', () => {
      const sfx = new SoundEffects();
      sfx.rail();
      expect(mockCtx.createOscillator).toHaveBeenCalled();
      const osc = mockCtx.createOscillator.mock.results[0].value as MockOsc;
      expect(osc.type).toBe('sine');
      expect(osc.frequency.setValueAtTime).toHaveBeenCalledWith(1200, 10);
      expect(osc.frequency.exponentialRampToValueAtTime).toHaveBeenCalledWith(150, 10.25);
    });

    it('synthesizes alienSplat sound with crunch noise and pitch drop', () => {
      const sfx = new SoundEffects();
      sfx.alienSplat();
      expect(mockCtx.createBufferSource).toHaveBeenCalled();
      expect(mockCtx.createOscillator).toHaveBeenCalled();
      const osc = mockCtx.createOscillator.mock.results[0].value as MockOsc;
      expect(osc.frequency.setValueAtTime).toHaveBeenCalledWith(150, 10);
      expect(osc.frequency.exponentialRampToValueAtTime).toHaveBeenCalledWith(40, 10.1);
    });

    it('synthesizes aegisOn sound with upward sweep', () => {
      const sfx = new SoundEffects();
      sfx.aegisOn();
      expect(mockCtx.createOscillator).toHaveBeenCalled();
      const osc = mockCtx.createOscillator.mock.results[0].value as MockOsc;
      expect(osc.type).toBe('sine');
      expect(osc.frequency.setValueAtTime).toHaveBeenCalledWith(200, 10);
      expect(osc.frequency.exponentialRampToValueAtTime).toHaveBeenCalledWith(880, 10.2);
    });

    it('synthesizes pickup chime', () => {
      const sfx = new SoundEffects();
      sfx.pickup();
      expect(mockCtx.createOscillator).toHaveBeenCalled();
      const osc = mockCtx.createOscillator.mock.results[0].value as MockOsc;
      expect(osc.type).toBe('sine');
      expect(osc.frequency.setValueAtTime).toHaveBeenCalledWith(880, 10);
      expect(osc.frequency.exponentialRampToValueAtTime).toHaveBeenCalledWith(1320, 10.08);
    });

    it('synthesizes deliver three-note chime', () => {
      const sfx = new SoundEffects();
      sfx.deliver();
      expect(mockCtx.createOscillator).toHaveBeenCalledTimes(3);
    });

    it('synthesizes decayWarn drone', () => {
      const sfx = new SoundEffects();
      sfx.decayWarn();
      expect(mockCtx.createOscillator).toHaveBeenCalled();
      const osc = mockCtx.createOscillator.mock.results[0].value as MockOsc;
      expect(osc.frequency.setValueAtTime).toHaveBeenCalledWith(180, 10);
      expect(osc.frequency.exponentialRampToValueAtTime).toHaveBeenCalledWith(90, 10.5);
    });

    it('synthesizes generation bloom fanfare', () => {
      const sfx = new SoundEffects();
      sfx.generation();
      expect(mockCtx.createOscillator).toHaveBeenCalled();
    });

    it('supports play(name) dispatch with aliases', () => {
      const sfx = new SoundEffects();
      sfx.play('snd_carbine_fire');
      sfx.play('shotgun');
      sfx.play('splat');
      sfx.play('aegis');
      sfx.play('decay');
      sfx.play('snd_generation');
      expect(mockCtx.createOscillator).toHaveBeenCalled();
    });

    it('starts music drone with 1600Hz cutoff filter for active combat', () => {
      const sfx = new SoundEffects();
      sfx.startMusic();

      expect(mockCtx.createOscillator).toHaveBeenCalledTimes(2);
      expect(mockCtx.createBiquadFilter).toHaveBeenCalledTimes(1);

      const filter = mockCtx.createBiquadFilter.mock.results[0].value as MockFilter;
      expect(filter.type).toBe('lowpass');
      expect(filter.frequency.setValueAtTime).toHaveBeenCalledWith(1600, 10);
    });

    it('anchors music filter ramp at current value and cancels scheduled values on intensity change', () => {
      const sfx = new SoundEffects();
      sfx.startMusic();

      const filter = mockCtx.createBiquadFilter.mock.results[0].value as MockFilter;
      filter.frequency.value = 1600;

      sfx.setMusicIntensity(false);
      expect(filter.frequency.cancelScheduledValues).toHaveBeenCalledWith(10);
      expect(filter.frequency.setValueAtTime).toHaveBeenCalledWith(1600, 10);
      expect(filter.frequency.linearRampToValueAtTime).toHaveBeenCalledWith(400, 10.8);

      filter.frequency.value = 400;
      sfx.setMusicIntensity(true);
      expect(filter.frequency.cancelScheduledValues).toHaveBeenCalledWith(10);
      expect(filter.frequency.setValueAtTime).toHaveBeenCalledWith(400, 10);
      expect(filter.frequency.linearRampToValueAtTime).toHaveBeenCalledWith(1600, 10.8);
    });

    it('stops music cleanly and allows restarting', () => {
      const sfx = new SoundEffects();
      sfx.startMusic();

      const osc1 = mockCtx.createOscillator.mock.results[0].value as MockOsc;
      const osc2 = mockCtx.createOscillator.mock.results[1].value as MockOsc;
      const filter = mockCtx.createBiquadFilter.mock.results[0].value as MockFilter;

      sfx.stopMusic();
      expect(osc1.stop).toHaveBeenCalled();
      expect(osc2.stop).toHaveBeenCalled();
      expect(filter.disconnect).toHaveBeenCalled();

      // Subsequent start creates new nodes
      sfx.startMusic();
      expect(mockCtx.createOscillator).toHaveBeenCalledTimes(4);
    });
  });
});
