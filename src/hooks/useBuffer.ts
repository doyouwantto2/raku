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
const AUDIO_LEAD_MS = 600;

// Rolling scheduler: how far ahead to schedule at a time.
// Keeps only ~SCHEDULE_WINDOW_MS worth of timers active at once instead
// of dumping the entire song's worth of timeouts up front.
const SCHEDULE_WINDOW_MS = 2000;
// How often the rolling scheduler refills the window.
const SCHEDULER_TICK_MS = 200;

// ── Hook ──────────────────────────────────────────────────────────────────────

export function useBuffer(
  onNoteOn?: (midi: number, velocity: number) => void,
  onNoteOff?: (midi: number) => void,
) {
  const [availableSongs, setAvailableSongs] = createSignal<SongInfo[]>([]);
  const [activeSong, setActiveSong] = createSignal<SongInfo | null>(null);
  const [allNotes, setAllNotes] = createSignal<MidiNoteMs[]>([]);
  const [sessionInfo, setSessionInfo] = createSignal<MidiSessionInfo | null>(null);
  const [isLoading, setIsLoading] = createSignal(false);
  const [sessionStatus, setSessionStatus] = createSignal<SessionStatus>("idle");
  const [sessionMode, setSessionMode] = createSignal<SessionMode>(null);
  const [currentTime, setCurrentTime] = createSignal(0);
  const [score, setScore] = createSignal(0);

  let sessionStartMs = 0;
  let rafHandle: number | null = null;
  let pausedAtMs = 0;

  // ── Rolling audio scheduler state ─────────────────────────────────────────
  // noteTimeouts: active per-note timers (capped to SCHEDULE_WINDOW_MS ahead)
  // schedulerHandle: the interval that refills the window
  // scheduledUpToMs: high-water mark — notes before this have already been scheduled
  let noteTimeouts: ReturnType<typeof setTimeout>[] = [];
  let schedulerHandle: ReturnType<typeof setInterval> | null = null;
  let scheduledUpToMs = 0;

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
      console.log(`[BUFFER] Session ready — ${notes.length} notes, ${info.tempo_bpm.toFixed(1)} BPM`);
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

  const selectMode = (mode: "perform" | "instruct") => {
    if (sessionStatus() !== "ready") return;
    setSessionMode(mode);
    startPlayback(mode);
  };

  // ── Rolling audio scheduler ───────────────────────────────────────────────
  //
  // Instead of scheduling ALL notes at once (thousands of timers), we keep a
  // sliding window of at most SCHEDULE_WINDOW_MS worth of pending timers.
  // A setInterval refills the window every SCHEDULER_TICK_MS.
  //
  // `fromMs` = current animation-clock position (may be negative during lead-in).
  // We only schedule notes whose audio-fire time falls within the next
  // SCHEDULE_WINDOW_MS from right now.

  const scheduleWindow = (notes: MidiNoteMs[], fromMs: number) => {
    if (!onNoteOn && !onNoteOff) return;

    // Wall-clock "now" corresponds to animation position fromMs.
    // Audio fires at animation position: note.start_ms - AUDIO_LEAD_MS
    // Wall-clock delay from now: (note.start_ms - fromMs - AUDIO_LEAD_MS)
    const windowEnd = scheduledUpToMs + SCHEDULE_WINDOW_MS;

    for (const note of notes) {
      // Skip notes already scheduled or before our cursor
      if (note.start_ms <= scheduledUpToMs) continue;
      // Stop once we're past the window
      if (note.start_ms > windowEnd) break;

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

    scheduledUpToMs = windowEnd;
  };

  const startRollingScheduler = (notes: MidiNoteMs[], fromMs: number) => {
    stopRollingScheduler();

    // Sort notes by start_ms once so scheduleWindow can break early
    const sorted = [...notes].sort((a, b) => a.start_ms - b.start_ms);

    // Seed the scheduler cursor at fromMs (negative during lead-in)
    scheduledUpToMs = fromMs;

    // Fill the first window immediately
    scheduleWindow(sorted, fromMs);

    // Refill every SCHEDULER_TICK_MS
    schedulerHandle = setInterval(() => {
      // Current animation position
      const animNow = performance.now() - sessionStartMs;
      // Advance cursor to just behind now so we never miss notes
      if (animNow > scheduledUpToMs) scheduledUpToMs = animNow;
      scheduleWindow(sorted, animNow);
    }, SCHEDULER_TICK_MS);
  };

  const stopRollingScheduler = () => {
    if (schedulerHandle !== null) {
      clearInterval(schedulerHandle);
      schedulerHandle = null;
    }
    for (const id of noteTimeouts) clearTimeout(id);
    noteTimeouts = [];
    scheduledUpToMs = 0;
  };

  // ── Playback controls ──────────────────────────────────────────────────────

  const startPlayback = (mode: SessionMode) => {
    sessionStartMs = performance.now() + VISUAL_LEAD_MS;
    pausedAtMs = -VISUAL_LEAD_MS;
    setCurrentTime(-VISUAL_LEAD_MS);
    setSessionStatus("playing");

    if (mode === "instruct") {
      startRollingScheduler(allNotes(), -VISUAL_LEAD_MS);
    }

    tick();
  };

  const pausePlayback = () => {
    if (sessionStatus() !== "playing") return;
    pausedAtMs = currentTime();
    stopRollingScheduler();
    stopTick();
    setSessionStatus("paused");
  };

  const resumePlayback = () => {
    if (sessionStatus() !== "paused") return;
    sessionStartMs = performance.now() - pausedAtMs;
    setSessionStatus("playing");

    if (sessionMode() === "instruct") {
      startRollingScheduler(allNotes(), pausedAtMs);
    }

    tick();
  };

  const stopPlayback = () => {
    stopRollingScheduler();
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
    stopRollingScheduler();
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

  onMount(() => { scanSongs(); });
  onCleanup(() => { stopRollingScheduler(); stopTick(); });

  // ── Public API ─────────────────────────────────────────────────────────────

  return {
    availableSongs, activeSong, loadSession, scanSongs,
    allNotes, sessionInfo,
    isLoading, sessionStatus, isReady,
    sessionMode, selectMode,
    currentTime, startPlayback, pausePlayback, resumePlayback, stopPlayback, clearSession,
    score, setScore,
  };
}
