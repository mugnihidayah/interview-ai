import { useState, useCallback, useRef } from "react";
import {
  getPreferredRecordingConfig,
  prepareAudioForTranscription,
} from "@/lib/audio";
import { voiceAPI } from "@/lib/api";

interface SpeechRecognitionEvent extends Event {
  results: SpeechRecognitionResultList;
}

interface SpeechRecognitionResultList {
  length: number;
  item(index: number): SpeechRecognitionResult;
  [index: number]: SpeechRecognitionResult;
}

interface SpeechRecognitionResult {
  length: number;
  item(index: number): SpeechRecognitionAlternative;
  [index: number]: SpeechRecognitionAlternative;
  isFinal: boolean;
}

interface SpeechRecognitionAlternative {
  transcript: string;
  confidence: number;
}

interface SpeechRecognition extends EventTarget {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  onresult: ((event: SpeechRecognitionEvent) => void) | null;
  onerror: ((event: Event) => void) | null;
  onend: ((event: Event) => void) | null;
  start(): void;
  stop(): void;
  abort(): void;
}

declare global {
  interface Window {
    SpeechRecognition: {
      new (): SpeechRecognition;
    };
    webkitSpeechRecognition: {
      new (): SpeechRecognition;
    };
  }
}

interface RecorderState {
  isRecording: boolean;
  isTranscribing: boolean;
  previewText: string;
  error: string | null;
}

const INITIAL_STATE: RecorderState = {
  isRecording: false,
  isTranscribing: false,
  previewText: "",
  error: null,
};

const PROMPT_ECHO_MARKERS = [
  "transcribe the interview answer accurately",
  "keep exact spellings",
  "preferred spellings",
  "current interview question",
  "indonesian interview answer",
  "english interview answer",
  "technical terms",
];

export function useVoiceRecorder(language: string = "en", sessionId?: string) {
  const [state, setState] = useState<RecorderState>(INITIAL_STATE);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);
  const recognitionRef = useRef<SpeechRecognition | null>(null);
  const webSpeechResultRef = useRef<string>("");
  const recordingMimeTypeRef = useRef<string>("audio/webm");
  const recordingFilenameRef = useRef<string>("recording.webm");

  const stopWebSpeech = useCallback(() => {
    if (recognitionRef.current) {
      try {
        recognitionRef.current.stop();
      } catch {
        // ignore
      }
      recognitionRef.current = null;
    }
  }, []);

  const startWebSpeechPreview = useCallback(() => {
    const SpeechRecognitionAPI =
      typeof window !== "undefined"
        ? window.SpeechRecognition || window.webkitSpeechRecognition
        : null;

    if (!SpeechRecognitionAPI) return;

    try {
      const recognition = new SpeechRecognitionAPI();
      recognition.continuous = true;
      recognition.interimResults = true;
      recognition.lang = language === "id" ? "id-ID" : "en-US";

      recognition.onresult = (event: SpeechRecognitionEvent) => {
        let interim = "";
        let final = "";

        for (let i = 0; i < event.results.length; i += 1) {
          const result = event.results[i];
          if (result.isFinal) {
            final += result[0].transcript + " ";
          } else {
            interim += result[0].transcript;
          }
        }

        const combined = (final + interim).trim();
        webSpeechResultRef.current = final.trim();

        setState((prev) => ({
          ...prev,
          previewText: combined,
        }));
      };

      recognition.onerror = () => {
        // Web Speech is preview-only; keep recording alive.
      };

      recognition.onend = () => {
        // Browser may stop preview automatically.
      };

      recognitionRef.current = recognition;
      recognition.start();
    } catch {
      // Continue without preview if Web Speech is unavailable.
    }
  }, [language]);

  const startRecording = useCallback(async () => {
    setState({ ...INITIAL_STATE, isRecording: true });
    chunksRef.current = [];
    webSpeechResultRef.current = "";

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          autoGainControl: true,
          channelCount: 1,
          echoCancellation: true,
          noiseSuppression: true,
          sampleRate: 16000,
          sampleSize: 16,
        },
      });
      streamRef.current = stream;

      const recordingConfig = getPreferredRecordingConfig();
      const options: MediaRecorderOptions = {
        audioBitsPerSecond: 128000,
      };
      if (recordingConfig.mimeType) {
        options.mimeType = recordingConfig.mimeType;
      }

      const recorder = new MediaRecorder(stream, options);
      mediaRecorderRef.current = recorder;
      recordingMimeTypeRef.current =
        recorder.mimeType || recordingConfig.mimeType || "audio/webm";
      recordingFilenameRef.current = `recording.${recordingConfig.extension}`;

      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          chunksRef.current.push(event.data);
        }
      };

      recorder.start(250);
      startWebSpeechPreview();
    } catch (err) {
      const message =
        err instanceof DOMException && err.name === "NotAllowedError"
          ? "Microphone access denied. Please allow microphone permission."
          : "Failed to start recording. Check your microphone.";

      setState({
        ...INITIAL_STATE,
        error: message,
      });
    }
  }, [startWebSpeechPreview]);

  const stopRecording = useCallback(async (): Promise<string> => {
    stopWebSpeech();

    return new Promise((resolve) => {
      const recorder = mediaRecorderRef.current;

      if (!recorder || recorder.state === "inactive") {
        setState((prev) => ({ ...prev, isRecording: false }));
        resolve(webSpeechResultRef.current);
        return;
      }

      recorder.onstop = async () => {
        streamRef.current?.getTracks().forEach((track) => track.stop());
        streamRef.current = null;

        const chunks = chunksRef.current;
        if (chunks.length === 0) {
          setState({
            ...INITIAL_STATE,
            error: "No audio recorded.",
          });
          resolve("");
          return;
        }

        const mimeType =
          recorder.mimeType || recordingMimeTypeRef.current || "audio/webm";
        const audioBlob = new Blob(chunks, { type: mimeType });

        setState((prev) => ({
          ...prev,
          isRecording: false,
          isTranscribing: true,
        }));

        try {
          const preparedAudio = await prepareAudioForTranscription(
            audioBlob,
            mimeType
          );
          const result = await voiceAPI.transcribe(
            preparedAudio.blob,
            language,
            {
              filename: preparedAudio.filename,
              sessionId,
            }
          );
          const previewFallback = webSpeechResultRef.current.trim();
          const safeTranscript = pickSafeTranscript(
            result.text,
            previewFallback
          );

          if (result.status === "success" && safeTranscript) {
            setState({ ...INITIAL_STATE });
            resolve(safeTranscript);
          } else if (result.status === "empty") {
            if (previewFallback) {
              setState({ ...INITIAL_STATE });
              resolve(previewFallback);
            } else {
              setState({
                ...INITIAL_STATE,
                error: "No speech detected. Please try again.",
              });
              resolve("");
            }
          } else {
            setState({ ...INITIAL_STATE });
            resolve(safeTranscript || "");
          }
        } catch {
          const fallback = webSpeechResultRef.current.trim();
          if (fallback) {
            setState({ ...INITIAL_STATE });
            resolve(fallback);
          } else {
            setState({
              ...INITIAL_STATE,
              error: "Transcription failed. Please try again or type your answer.",
            });
            resolve("");
          }
        }
      };

      recorder.stop();
    });
  }, [language, sessionId, stopWebSpeech]);

  const cancelRecording = useCallback(() => {
    stopWebSpeech();

    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== "inactive") {
      mediaRecorderRef.current.onstop = null;
      mediaRecorderRef.current.stop();
    }

    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    chunksRef.current = [];

    setState(INITIAL_STATE);
  }, [stopWebSpeech]);

  const isSupported =
    typeof window !== "undefined" &&
    !!navigator.mediaDevices?.getUserMedia &&
    !!window.MediaRecorder;

  return {
    ...state,
    isSupported,
    startRecording,
    stopRecording,
    cancelRecording,
  };
}

function pickSafeTranscript(
  transcript: string | undefined,
  previewFallback: string
): string {
  const trimmedTranscript = (transcript || "").trim();
  if (!trimmedTranscript) {
    return "";
  }

  if (looksLikePromptEcho(trimmedTranscript) && previewFallback) {
    return previewFallback;
  }

  return trimmedTranscript;
}

function looksLikePromptEcho(value: string): boolean {
  const normalized = value.trim().toLowerCase();
  if (normalized.length < 16) {
    return false;
  }

  return PROMPT_ECHO_MARKERS.some((marker) => normalized.includes(marker));
}
