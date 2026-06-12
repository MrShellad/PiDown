let audioCtx: AudioContext | null = null;

function getAudioContext() {
  if (!audioCtx) {
    audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
  }
  return audioCtx;
}

export function playSoundEffect(soundId: string) {
  try {
    const ctx = getAudioContext();
    // Resume context if suspended (browser security autoplays)
    if (ctx.state === "suspended") {
      ctx.resume();
    }

    const now = ctx.currentTime;

    if (soundId === "success") {
      // Pleasant double chime / major chord arpeggio: C5 -> E5 -> G5
      const notes = [
        { freq: 523.25, time: 0, duration: 0.12 }, // C5
        { freq: 659.25, time: 0.08, duration: 0.12 }, // E5
        { freq: 783.99, time: 0.16, duration: 0.35 }, // G5
      ];
      
      notes.forEach((note) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.connect(gain);
        gain.connect(ctx.destination);
        
        osc.type = "sine";
        osc.frequency.setValueAtTime(note.freq, now + note.time);
        
        gain.gain.setValueAtTime(0, now + note.time);
        gain.gain.linearRampToValueAtTime(0.25, now + note.time + 0.01);
        gain.gain.exponentialRampToValueAtTime(0.001, now + note.time + note.duration);
        
        osc.start(now + note.time);
        osc.stop(now + note.time + note.duration);
      });
    } else if (soundId === "bell") {
      // High-pitched bell with slow decay and overtone harmonics
      const baseFreq = 880; // A5
      const overtones = [1, 2, 3, 4.2];
      const durations = [0.6, 0.35, 0.2, 0.12];
      const gains = [0.22, 0.08, 0.04, 0.01];
      
      overtones.forEach((ratio, i) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.connect(gain);
        gain.connect(ctx.destination);
        
        osc.type = "sine";
        osc.frequency.setValueAtTime(baseFreq * ratio, now);
        
        gain.gain.setValueAtTime(0, now);
        gain.gain.linearRampToValueAtTime(gains[i], now + 0.01);
        gain.gain.exponentialRampToValueAtTime(0.0001, now + durations[i]);
        
        osc.start(now);
        osc.stop(now + durations[i]);
      });
    } else if (soundId === "digital") {
      // Quick digital double beep
      const beeps = [
        { time: 0, duration: 0.08 },
        { time: 0.12, duration: 0.08 }
      ];
      
      beeps.forEach((beep) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.connect(gain);
        gain.connect(ctx.destination);
        
        osc.type = "triangle"; // softer than square, but still digital
        osc.frequency.setValueAtTime(987.77, now + beep.time); // B5
        
        gain.gain.setValueAtTime(0, now + beep.time);
        gain.gain.linearRampToValueAtTime(0.18, now + beep.time + 0.01);
        gain.gain.exponentialRampToValueAtTime(0.001, now + beep.time + beep.duration);
        
        osc.start(now + beep.time);
        osc.stop(now + beep.time + beep.duration);
      });
    } else if (soundId === "glass") {
      // Very high pitched ping with extremely fast decay
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      
      osc.type = "sine";
      osc.frequency.setValueAtTime(1480, now); // F#6
      
      gain.gain.setValueAtTime(0, now);
      gain.gain.linearRampToValueAtTime(0.3, now + 0.004);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.15);
      
      osc.start(now);
      osc.stop(now + 0.18);
    }
  } catch (err) {
    console.error("Failed to play synthesized sound effect", err);
  }
}
