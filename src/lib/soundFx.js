// Web Audio API Sound Synthesizer for System Audio & Game FX

let audioCtx = null;

function getAudioContext() {
  if (!audioCtx) {
    const AudioContext = window.AudioContext || window.webkitAudioContext;
    if (AudioContext) {
      audioCtx = new AudioContext();
    }
  }
  if (audioCtx && audioCtx.state === "suspended") {
    audioCtx.resume();
  }
  return audioCtx;
}

export const playSound = (type = "click", volume = 80) => {
  try {
    const ctx = getAudioContext();
    if (!ctx) return;

    const masterGain = ctx.createGain();
    const gainVal = Math.max(0, Math.min(1, volume / 100));
    masterGain.gain.setValueAtTime(gainVal * 0.3, ctx.currentTime);
    masterGain.connect(ctx.destination);

    const now = ctx.currentTime;

    if (type === "click") {
      const osc = ctx.createOscillator();
      osc.type = "sine";
      osc.frequency.setValueAtTime(800, now);
      osc.frequency.exponentialRampToValueAtTime(400, now + 0.05);
      osc.connect(masterGain);
      osc.start(now);
      osc.stop(now + 0.05);
    } else if (type === "notification") {
      // Pleasant iOS-style chime
      const osc1 = ctx.createOscillator();
      const osc2 = ctx.createOscillator();
      osc1.type = "sine";
      osc2.type = "sine";
      osc1.frequency.setValueAtTime(523.25, now); // C5
      osc1.frequency.setValueAtTime(659.25, now + 0.08); // E5
      osc2.frequency.setValueAtTime(783.99, now + 0.16); // G5
      osc2.frequency.setValueAtTime(1046.50, now + 0.24); // C6

      osc1.connect(masterGain);
      osc2.connect(masterGain);

      osc1.start(now);
      osc1.stop(now + 0.2);
      osc2.start(now + 0.16);
      osc2.stop(now + 0.4);
    } else if (type === "win") {
      // Fanfare arpeggio
      const notes = [523.25, 659.25, 783.99, 1046.50];
      notes.forEach((freq, idx) => {
        const osc = ctx.createOscillator();
        osc.type = "triangle";
        osc.frequency.setValueAtTime(freq, now + idx * 0.08);
        osc.connect(masterGain);
        osc.start(now + idx * 0.08);
        osc.stop(now + idx * 0.08 + 0.25);
      });
    } else if (type === "message") {
      // Chuông "tin nhắn đến" cho Admin (CSKH có khách nhắn mới, xem
      // Admin.jsx/handleMessageUpdate) - 2 tiếng "ting" âm sắc chuông nhỏ,
      // tắt dần tự nhiên (exponential decay), khác hẳn tiếng "notification"
      // dùng chung cho các luồng khác (đăng nhập, push banner) để không đổi
      // hành vi những nơi đó. Tự tổng hợp hoàn toàn bằng Web Audio API -
      // không dùng file âm thanh có bản quyền của bên thứ ba.
      const playBell = (freq, startTime, duration) => {
        const osc = ctx.createOscillator();
        const harmonic = ctx.createOscillator();
        const bellGain = ctx.createGain();
        osc.type = "sine";
        harmonic.type = "sine";
        osc.frequency.setValueAtTime(freq, startTime);
        harmonic.frequency.setValueAtTime(freq * 2.4, startTime);
        bellGain.gain.setValueAtTime(0, startTime);
        bellGain.gain.linearRampToValueAtTime(1, startTime + 0.01);
        bellGain.gain.exponentialRampToValueAtTime(0.001, startTime + duration);
        osc.connect(bellGain);
        harmonic.connect(bellGain);
        bellGain.connect(masterGain);
        osc.start(startTime);
        osc.stop(startTime + duration);
        harmonic.start(startTime);
        harmonic.stop(startTime + duration);
      };
      playBell(987.77, now, 0.35); // B5
      playBell(1318.51, now + 0.14, 0.45); // E6
    } else if (type === "toggle") {
      const osc = ctx.createOscillator();
      osc.type = "sine";
      osc.frequency.setValueAtTime(600, now);
      osc.frequency.exponentialRampToValueAtTime(900, now + 0.06);
      osc.connect(masterGain);
      osc.start(now);
      osc.stop(now + 0.06);
    }
  } catch (err) {
    console.warn("Audio playback notice:", err);
  }
};
