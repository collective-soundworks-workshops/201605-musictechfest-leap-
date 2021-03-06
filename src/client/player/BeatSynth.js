import { audio, audioContext } from 'soundworks/client';

function createBufferSource() {
  const sampleRate = audioContext.sampleRate;
  const buffer = audioContext.createBuffer(1, sampleRate, sampleRate);
  const array = buffer.getChannelData(0);

  for (let i = 0; i < array.length; i++)
    array[i] = Math.random();

  return buffer;
}

export default class BeatSynth extends audio.TimeEngine {
  constructor(sync, bpm, hhBuffer, tomBuffer) {
    super(audioContext);

    this.sync = sync;
    this.buffers = {
      'hh': hhBuffer,
      'sd': tomBuffer,
    };

    this.output = audioContext.createGain();
    this.output.connect(audioContext.destination);

    // filter
    this.minCutoff = 1500;
    this.maxCutoff = audioContext.sampleRate / 2;
    this.logCutoffRatio = Math.log(this.maxCutoff / this.minCutoff);

    this.lowpass = audioContext.createBiquadFilter();
    this.lowpass.connect(this.output);
    this.lowpass.type = 'lowpass';
    this.lowpass.frequency.value = this.maxCutoff;
    this.lowpass.Q.value = 16;

    this.score = [
      ['hh', 'sd'],
      ['sd', 'hh'],
      ['hh', 'sd'],
      ['sd', 'hh'],
    ];

    this.beatPeriod = 60 / bpm;
    this.barPeriod = this.score.length;

    // metro config
    this.clickAttack = 0.001;
    this.clickRelease = 0.098;;
    this.whiteNoiseBuffer = createBufferSource();
  }

  stop(releaseTime) {
    const now = audioContext.currentTime;

    this.output.gain.cancelScheduledValues(now);
    this.output.gain.setValueAtTime(this.output.gain.value, now);
    this.output.gain.linearRampToValueAtTime(0, now + releaseTime);
  }

  setGain(gain) {
    gain *= this.gainMultiplier;
    const now = audioContext.currentTime;
    this.output.gain.cancelScheduledValues(now);
    this.output.gain.setValueAtTime(this.output.gain.value, now);
    this.output.gain.linearRampToValueAtTime(gain, now + 0.05);
  }

  setCutoff(value) {
    // value = value * value;
    const cutoffFrequency = this.minCutoff * Math.exp(this.logCutoffRatio * value);
    this.lowpass.frequency.value = cutoffFrequency;
  }

  setGainMultiplier(value) {
    this.gainMultiplier = value;
  }

  trigger(time, bufferId) {
    if (Math.random() <= 0.3) return;

    const buffer = this.buffers[bufferId];
    const clickAttack = this.clickAttack;
    const clickRelease = this.clickRelease;
    const src = audioContext.createBufferSource();

    if (bufferId === 'hh')
      src.connect(this.lowpass);
    else
      src.connect(this.output);

    src.buffer = buffer;
    src.start(time);
    src.stop(time + clickAttack + clickRelease);
  }

  advanceTime(syncTime) {
    const beatPhase = syncTime % this.beatPeriod;
    const prevBeatTime = syncTime - beatPhase;

    const beatTime = prevBeatTime + this.beatPeriod;
    const beatNumber = beatTime % this.barPeriod;

    const beatScore = this.score[beatNumber];
    const rythmicUnit = this.beatPeriod / beatScore.length;

    beatScore.forEach((value, index) => {
      if (value !== 0) {
        const eventTime = beatTime + (index * rythmicUnit);
        const localTime = this.sync.getAudioTime(eventTime);
        this.trigger(localTime, value);
      }
    });

    return syncTime + this.beatPeriod;
  }
}
