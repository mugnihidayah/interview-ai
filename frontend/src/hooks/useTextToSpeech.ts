import { useState, useCallback, useRef } from "react";
import { voiceAPI } from "@/lib/api";

interface TTSState {
  isSpeaking: boolean;
  error: string | null;
}

interface SpeakOptions {
  cacheKey?: string;
}

export function useTextToSpeech() {
  const [state, setState] = useState<TTSState>({
    isSpeaking: false,
    error: null,
  });
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const objectUrlRef = useRef<string | null>(null);

  const cleanup = useCallback(() => {
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.removeAttribute("src");
      audioRef.current = null;
    }
    if (objectUrlRef.current) {
      URL.revokeObjectURL(objectUrlRef.current);
      objectUrlRef.current = null;
    }
  }, []);

  const speak = useCallback(
    async (
      text: string,
      language: string = "en",
      options: SpeakOptions = {}
    ) => {
      // Stop any currently playing audio
      cleanup();

      setState({ isSpeaking: true, error: null });

      try {
        const audioBlob = await voiceAPI.tts(text, language, options);
        const url = URL.createObjectURL(audioBlob);
        objectUrlRef.current = url;

        const audio = new Audio(url);
        audioRef.current = audio;

        audio.onended = () => {
          setState({ isSpeaking: false, error: null });
          cleanup();
        };

        audio.onerror = () => {
          setState({ isSpeaking: false, error: "Audio playback failed" });
          cleanup();
        };

        await audio.play();
      } catch {
        setState({ isSpeaking: false, error: "TTS failed" });
        cleanup();
      }
    },
    [cleanup]
  );

  const stop = useCallback(() => {
    cleanup();
    setState({ isSpeaking: false, error: null });
  }, [cleanup]);

  return {
    ...state,
    speak,
    stop,
  };
}
