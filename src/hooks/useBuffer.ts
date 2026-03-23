import { createSignal, onMount, onCleanup } from "solid-js";
import { invoke } from "@tauri-apps/api/core";

// ── Types ─────────────────────────────────────────────────────────────────────

export interface SongInfo {
  file_name: string;
  file_path: string;
  display_name: string;
}

export interface MidiNoteMs {
  midi: number;
  velocity: number;
  start_ms: number;
  duration_ms: number;
  channel: number;
}

export interface MidiSessionInfo {
  total_duration_ms: number;
  tempo_bpm: number;
  note_count: number;
  file_path: string;
}

export type SessionMode = "perform" | "instruct" | null;
export type SessionStatus =
  | "idle"
  | "loading"
  | "ready"
  | "playing"
  | "paused"
  | "finished";

// ── Constants ─────────────────────────────────────────────────────────────────

const VISUAL_LEAD_MS = 2000;
const AUDIO_LEAD_MS = 564;

// ── Hook ──────────────────────────────────────────────────────────────────────

export function useBuffer(
  onNoteOn?: (midi: number, velocity: number) => void,
  onNoteOff?: (midi: number) => void,
) {
  // ── Song list ──────────────────────────────────────────────────────────────
  const [availableSongs, setAvailableSongs] = createSignal<SongInfo[]>([]);
  const [activeSong, setActiveSong] = createSignal<SongInfo | null>(null);

  // ── Session data ───────────────────────────────────────────────────────────
  const [allNotes, setAllNotes] = createSignal<MidiNoteMs[]>([]);
  const [sessionInfo, setSessionInfo] = createSignal<MidiSessionInfo | null>(null);

  // ── Loading state ──────────────────────────────────────────────────────────
  const [isLoading, setIsLoading] = createSignal(false);
  const [sessionStatus, setSessionStatus] = createSignal<SessionStatus>("idle");

  // ── Mode ───────────────────────────────────────────────────────────────────
  const [sessionMode, setSessionMode] = createSignal<SessionMode>(null);

  // ── Animation clock (visuals only) ────────────────────────────────────────
  const [currentTime, setCurrentTime] = createSignal(0);
  let sessionStartMs = 0;
  let rafHandle: number | null = null;

  // ── Audio scheduling ───────────────────────────────────────────────────────
  let noteTimeouts: ReturnType<typeof setTimeout>[] = [];
  let pausedAtMs = 0;

  // ── Score ──────────────────────────────────────────────────────────────────
  const [score, setScore] = createSignal(0);

  // ── Helpers ───────────────────────────────────────────────────────────────

  const isReady = () =>
    sessionStatus() === "ready" ||
    sessionStatus() === "playing" ||
    sessionStatus() === "paused";

  // ── Scan ──────────────────────────────────────────────────────────────────

  const scanSongs = async () => {
    try {
      const songs = await invoke<SongInfo[]>("scan_songs");
      setAvailableSongs(songs);
    } catch (e) {
      console.error("[SONGS] scan error:", e);
    }
  };

  // ── Load session ───────────────────────────────────────────────────────────

  const loadSession = async (song: SongInfo) => {
    if (isLoading()) return;
    if (activeSong()?.file_path === song.file_path && isReady()) return;

    setActiveSong(song);
    setIsLoading(true);
    setSessionStatus("loading");
    setSessionMode(null);
    setAllNotes([]);
    setSessionInfo(null);
    resetPlayback();

    try {
      const info = await invoke<MidiSessionInfo>("load_midi_session", {
        filePath: song.file_path,
      });
      setSessionInfo(info);

      const notes = await invoke<MidiNoteMs[]>("get_session_notes");
      setAllNotes(notes);

      setSessionStatus("ready");
      console.log(
        `[BUFFER] Session ready — ${notes.length} notes, ${info.tempo_bpm.toFixed(1)} BPM`,
      );
    } catch (e) {
      console.error("[BUFFER] load error:", e);
      setActiveSong(null);
      setSessionStatus("idle");
      setAllNotes([]);
      setSessionInfo(null);
    } finally {
      setIsLoading(false);
    }
  };

  // ── Mode selection ─────────────────────────────────────────────────────────
  // Mode is forwarded to startPlayback so the audio guard can read it
  // before setSessionMode's signal update has propagated.

  const selectMode = (mode: "perform" | "instruct") => {
    if (sessionStatus() !== "ready") return;
    setSessionMode(mode);
    startPlayback(mode);
  };

  // ── Audio scheduler ────────────────────────────────────────────────────────

  const scheduleAudio = (notes: MidiNoteMs[], fromMs: number) => {
    if (!onNoteOn && !onNoteOff) return;

    cancelAudio();

    for (const note of notes) {
      const noteOnDelay = note.start_ms - fromMs - AUDIO_LEAD_MS;
      const noteOffDelay = note.start_ms + note.duration_ms - fromMs - AUDIO_LEAD_MS;

      if (noteOnDelay >= 0) {
        noteTimeouts.push(
          setTimeout(() => onNoteOn?.(note.midi, note.velocity), noteOnDelay),
        );
      }
      if (noteOffDelay >= 0) {
        noteTimeouts.push(
          setTimeout(() => onNoteOff?.(note.midi), noteOffDelay),
        );
      }
    }

    console.log(
      `[AUDIO] Scheduled ${noteTimeouts.length} events` +
      ` (visual_lead=${VISUAL_LEAD_MS}ms, audio_lead=${AUDIO_LEAD_MS}ms, from=${fromMs.toFixed(0)}ms)`,
    );
  };

  const cancelAudio = () => {
    for (const id of noteTimeouts) clearTimeout(id);
    noteTimeouts = [];
  };

  // ── Playback controls ──────────────────────────────────────────────────────
  //
  // instruct → animation + auto-audio (song plays itself)
  // perform  → animation only, no auto-audio (user plays the keys)

  const startPlayback = (mode: SessionMode) => {
    sessionStartMs = performance.now() + VISUAL_LEAD_MS;
    pausedAtMs = -VISUAL_LEAD_MS;
    setCurrentTime(-VISUAL_LEAD_MS);
    setSessionStatus("playing");

    if (mode === "instruct") {
      scheduleAudio(allNotes(), -VISUAL_LEAD_MS);
    }

    tick();
  };

  const pausePlayback = () => {
    if (sessionStatus() !== "playing") return;
    pausedAtMs = currentTime();
    cancelAudio();
    stopTick();
    setSessionStatus("paused");
  };

  const resumePlayback = () => {
    if (sessionStatus() !== "paused") return;
    sessionStartMs = performance.now() - pausedAtMs;
    setSessionStatus("playing");

    // Only reschedule audio in instruct mode
    if (sessionMode() === "instruct") {
      scheduleAudio(allNotes(), pausedAtMs);
    }

    tick();
  };

  const stopPlayback = () => {
    cancelAudio();
    stopTick();
    setCurrentTime(0);
    setScore(0);
    pausedAtMs = 0;
    sessionStartMs = 0;
    setAllNotes([]);
    setSessionInfo(null);
    setSessionStatus("idle");
    setSessionMode(null);
  };

  const resetPlayback = () => {
    cancelAudio();
    stopTick();
    setCurrentTime(0);
    setScore(0);
    pausedAtMs = 0;
    sessionStartMs = 0;
  };

  // ── Animation tick ─────────────────────────────────────────────────────────

  const tick = () => {
    rafHandle = requestAnimationFrame(() => {
      if (sessionStatus() !== "playing") return;

      const now = performance.now() - sessionStartMs;
      setCurrentTime(now);

      const info = sessionInfo();
      if (info && now >= info.total_duration_ms) {
        setSessionStatus("finished");
        stopTick();
        return;
      }

      tick();
    });
  };

  const stopTick = () => {
    if (rafHandle !== null) {
      cancelAnimationFrame(rafHandle);
      rafHandle = null;
    }
  };

  // ── Clear session ──────────────────────────────────────────────────────────

  const clearSession = async () => {
    stopPlayback();
    setActiveSong(null);
    setAllNotes([]);
    setSessionInfo(null);
    setSessionStatus("idle");
    setSessionMode(null);
    try {
      await invoke("clear_session");
    } catch (e) {
      console.error("[BUFFER] clear error:", e);
    }
  };

  // ── Startup ────────────────────────────────────────────────────────────────

  onMount(() => {
    scanSongs();
  });

  onCleanup(() => {
    cancelAudio();
    stopTick();
  });

  // ── Public API ─────────────────────────────────────────────────────────────

  return {
    availableSongs,
    activeSong,
    loadSession,
    scanSongs,

    allNotes,
    sessionInfo,

    isLoading,
    sessionStatus,
    isReady,

    sessionMode,
    selectMode,

    currentTime,
    startPlayback,
    pausePlayback,
    resumePlayback,
    stopPlayback,
    clearSession,

    score,
    setScore,
  };
}
