import assert from 'node:assert/strict';
import test from 'node:test';

import { generateSilenceMp3, SILENCE_DURATION_SECONDS, silenceMp3 } from '../src/silence.js';

const FRAME_LENGTH = 417;
const SAMPLES_PER_FRAME = 1152;
const SAMPLE_RATE = 44100;

test('generates a 128 kbit/s stereo MPEG-1 Layer III stream', () => {
  const buffer = generateSilenceMp3();

  assert.equal(buffer.length % FRAME_LENGTH, 0, 'buffer is a whole number of frames');

  const frames = buffer.length / FRAME_LENGTH;
  const seconds = (frames * SAMPLES_PER_FRAME) / SAMPLE_RATE;
  assert.ok(Math.abs(seconds - SILENCE_DURATION_SECONDS) < 0.05, `duration is ~${SILENCE_DURATION_SECONDS}s, got ${seconds}s`);

  for (let i = 0; i < frames; i += 1) {
    const offset = i * FRAME_LENGTH;
    assert.equal(buffer[offset], 0xff, `frame ${i} sync byte`);
    assert.equal(buffer[offset + 1], 0xfb, `frame ${i} MPEG-1 Layer III, no CRC`);
    assert.equal(buffer[offset + 2], 0x90, `frame ${i} 128 kbit/s, 44.1 kHz`);
    assert.equal(buffer[offset + 3], 0x00, `frame ${i} stereo`);
  }
});

test('honours a custom duration', () => {
  const buffer = generateSilenceMp3(10);
  const seconds = ((buffer.length / FRAME_LENGTH) * SAMPLES_PER_FRAME) / SAMPLE_RATE;
  assert.ok(Math.abs(seconds - 10) < 0.05);
});

test('rejects a non-positive duration', () => {
  assert.throws(() => generateSilenceMp3(0), RangeError);
  assert.throws(() => generateSilenceMp3(-1), RangeError);
});

test('caches the shared buffer', () => {
  assert.equal(silenceMp3(), silenceMp3());
});
