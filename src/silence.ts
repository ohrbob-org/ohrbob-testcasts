/**
 * Generates a silent MP3 entirely in memory, so the service needs no encoder
 * (no ffmpeg, no lame) at build or run time.
 *
 * The MPEG-1 Layer III frame header below describes 128 kbit/s, 44.1 kHz,
 * stereo audio. The side information and main data of every frame are left as
 * zeros: with `part2_3_length == 0` each granule carries no Huffman data, which
 * every decoder renders as silence.
 */

export const SILENCE_DURATION_SECONDS = 120;
export const SILENCE_BITRATE_KBPS = 128;
export const SILENCE_SAMPLE_RATE = 44100;

const SAMPLES_PER_FRAME = 1152;
// 144 * bitrate / sample_rate, floored: 144 * 128000 / 44100 = 417
const FRAME_LENGTH = Math.floor((144 * SILENCE_BITRATE_KBPS * 1000) / SILENCE_SAMPLE_RATE);
// 0xFF 0xFB = MPEG-1 Layer III, no CRC. 0x90 = 128 kbit/s, 44.1 kHz, no padding. 0x00 = stereo.
const FRAME_HEADER = Buffer.from([0xff, 0xfb, 0x90, 0x00]);

/** A single silent frame: the header followed by zeroed side info and main data. */
export function silenceFrame(): Buffer {
  const frame = Buffer.alloc(FRAME_LENGTH);
  FRAME_HEADER.copy(frame, 0);
  return frame;
}

export function generateSilenceMp3(durationSeconds: number = SILENCE_DURATION_SECONDS): Buffer {
  if (!Number.isFinite(durationSeconds) || durationSeconds <= 0) {
    throw new RangeError('durationSeconds must be a positive number');
  }

  const frameCount = Math.round((durationSeconds * SILENCE_SAMPLE_RATE) / SAMPLES_PER_FRAME);
  const frame = silenceFrame();
  const output = Buffer.alloc(frameCount * FRAME_LENGTH);

  for (let i = 0; i < frameCount; i += 1) {
    frame.copy(output, i * FRAME_LENGTH);
  }

  return output;
}

let cached: Buffer | undefined;

/** The shared 2 minute silent MP3, generated once and reused. */
export function silenceMp3(): Buffer {
  if (!cached) {
    cached = generateSilenceMp3();
  }
  return cached;
}
