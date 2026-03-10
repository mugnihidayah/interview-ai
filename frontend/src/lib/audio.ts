"use client";

declare global {
  interface Window {
    webkitAudioContext?: typeof AudioContext;
  }
}

export interface PreparedAudioUpload {
  blob: Blob;
  filename: string;
  mimeType: string;
}

const TARGET_SAMPLE_RATE = 16000;

export function getPreferredRecordingConfig(): {
  mimeType: string;
  extension: string;
} {
  if (typeof window === "undefined" || typeof MediaRecorder === "undefined") {
    return { mimeType: "audio/webm", extension: "webm" };
  }

  const supportedTypes = [
    { mimeType: "audio/webm;codecs=opus", extension: "webm" },
    { mimeType: "audio/webm", extension: "webm" },
    { mimeType: "audio/mp4", extension: "mp4" },
  ];

  for (const candidate of supportedTypes) {
    if (MediaRecorder.isTypeSupported(candidate.mimeType)) {
      return candidate;
    }
  }

  return { mimeType: "audio/webm", extension: "webm" };
}

export async function prepareAudioForTranscription(
  blob: Blob,
  fallbackMimeType: string
): Promise<PreparedAudioUpload> {
  try {
    const wavBlob = await convertBlobToWav(blob);
    return {
      blob: wavBlob,
      filename: "recording.wav",
      mimeType: "audio/wav",
    };
  } catch {
    const mimeType = blob.type || fallbackMimeType || "audio/webm";
    return {
      blob,
      filename: `recording.${mimeTypeToExtension(mimeType)}`,
      mimeType,
    };
  }
}

async function convertBlobToWav(blob: Blob): Promise<Blob> {
  const AudioContextCtor = window.AudioContext || window.webkitAudioContext;
  if (!AudioContextCtor) {
    throw new Error("AudioContext not supported");
  }

  const audioContext = new AudioContextCtor();

  try {
    const arrayBuffer = await blob.arrayBuffer();
    const decodedBuffer = await audioContext.decodeAudioData(arrayBuffer.slice(0));
    const monoChannel = mixDownToMono(decodedBuffer);
    const resampled =
      decodedBuffer.sampleRate === TARGET_SAMPLE_RATE
        ? monoChannel
        : resampleLinear(monoChannel, decodedBuffer.sampleRate, TARGET_SAMPLE_RATE);

    return new Blob([encodeWav(resampled, TARGET_SAMPLE_RATE)], {
      type: "audio/wav",
    });
  } finally {
    await audioContext.close();
  }
}

function mixDownToMono(buffer: AudioBuffer): Float32Array {
  if (buffer.numberOfChannels === 1) {
    return new Float32Array(buffer.getChannelData(0));
  }

  const mono = new Float32Array(buffer.length);
  for (let channel = 0; channel < buffer.numberOfChannels; channel += 1) {
    const channelData = buffer.getChannelData(channel);
    for (let i = 0; i < channelData.length; i += 1) {
      mono[i] += channelData[i] / buffer.numberOfChannels;
    }
  }
  return mono;
}

function resampleLinear(
  input: Float32Array,
  sourceRate: number,
  targetRate: number
): Float32Array {
  if (input.length === 0 || sourceRate === targetRate) {
    return input;
  }

  const outputLength = Math.max(
    1,
    Math.round((input.length * targetRate) / sourceRate)
  );
  if (outputLength === 1) {
    return new Float32Array([input[0] ?? 0]);
  }

  const output = new Float32Array(outputLength);
  const ratio = (input.length - 1) / (outputLength - 1);

  for (let i = 0; i < outputLength; i += 1) {
    const position = i * ratio;
    const leftIndex = Math.floor(position);
    const rightIndex = Math.min(leftIndex + 1, input.length - 1);
    const weight = position - leftIndex;
    output[i] =
      input[leftIndex] * (1 - weight) + input[rightIndex] * weight;
  }

  return output;
}

function encodeWav(samples: Float32Array, sampleRate: number): ArrayBuffer {
  const buffer = new ArrayBuffer(44 + samples.length * 2);
  const view = new DataView(buffer);

  writeAscii(view, 0, "RIFF");
  view.setUint32(4, 36 + samples.length * 2, true);
  writeAscii(view, 8, "WAVE");
  writeAscii(view, 12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  writeAscii(view, 36, "data");
  view.setUint32(40, samples.length * 2, true);

  let offset = 44;
  for (let i = 0; i < samples.length; i += 1) {
    const value = Math.max(-1, Math.min(1, samples[i]));
    view.setInt16(offset, value < 0 ? value * 0x8000 : value * 0x7fff, true);
    offset += 2;
  }

  return buffer;
}

function writeAscii(view: DataView, offset: number, value: string): void {
  for (let i = 0; i < value.length; i += 1) {
    view.setUint8(offset + i, value.charCodeAt(i));
  }
}

function mimeTypeToExtension(mimeType: string): string {
  if (mimeType.includes("wav")) return "wav";
  if (mimeType.includes("mp4") || mimeType.includes("m4a")) return "mp4";
  if (mimeType.includes("mpeg") || mimeType.includes("mp3")) return "mp3";
  if (mimeType.includes("ogg")) return "ogg";
  return "webm";
}
