import { createSignal, onMount, onCleanup } from "solid-js";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import {
  getMidiForKey,
  isPianoKey,
  isLeftPianoKey,
  isRightPianoKey,
  isLeftOctaveUpKey,
  isLeftOctaveDownKey,
  isRightOctaveUpKey,
  isRightOctaveDownKey,
  LEFT_OCTAVE_MIN,
  LEFT_OCTAVE_MAX,
  RIGHT_OCTAVE_MIN,
  RIGHT_OCTAVE_MAX,
} from "../utils/keyMapping";

// Define InstrumentInfo to match backend's InstrumentInfoResponse
export interface InstrumentInfo {
  name: string;
  folder: string;
  layers: string[];
  layer_ranges: LayerRange[];
  format: string;
  settings: [string, string][];
  contribution: Contribution;
}

export interface Contribution {
  authors: string[];
  published_date: string;
  licenses: string[];
}

export interface LayerRange {
  name: string;
  lovel: number;
  hivel: number;
}

export type Modifier = "sharp" | "flat" | null;

// Default octave offsets — left hand sits around A2–D4, right hand around F4–B5
const LEFT_OCTAVE_DEFAULT = 2;
const RIGHT_OCTAVE_DEFAULT = 0;

export function usePiano() {
  const [activeNotes, setActiveNotes] = createSignal(new Set<number>());
  const [availableLayers, setAvailableLayers] = createSignal<string[]>([]);
  const [availableLayerRanges, setAvailableLayerRanges] = createSignal<
    LayerRange[]
  >([]);
  const [availableInstruments, setAvailableInstruments] = createSignal<
    InstrumentInfo[]
  >([]);
  const [currentInstrument, setCurrentInstrument] =
    createSignal<InstrumentInfo | null>(null);
  const [isLoading, setIsLoading] = createSignal(false);
  const [loadProgress, setLoadProgress] = createSignal<number | null>(null);
  const [activeFolder, setActiveFolder] = createSignal<string | null>(null);
  const [leftOctave, setLeftOctave] = createSignal(LEFT_OCTAVE_DEFAULT);
  const [rightOctave, setRightOctave] = createSignal(RIGHT_OCTAVE_DEFAULT);
  const [leftModifier, setLeftModifier] = createSignal<Modifier>(null);
  const [rightModifier, setRightModifier] = createSignal<Modifier>(null);
  const [leftLayerIdx, setLeftLayerIdx] = createSignal(0);
  const [rightLayerIdx, setRightLayerIdx] = createSignal(0);

  // Add flag to prevent concurrent loading
  const [isScanning, setIsScanning] = createSignal(false);

  const heldModifiers = {
    shiftLeft: false,
    shiftRight: false,
    altLeft: false,
    altRight: false,
  };

  // ── Helpers ──────────────────────────────────────────────────────────────────

  const applyInstrument = (info: InstrumentInfo) => {
    console.log("[INSTRUMENTS] Applying instrument:", info.name);
    setCurrentInstrument(info);
    setAvailableLayers(info.layers);
    setAvailableLayerRanges(info.layer_ranges ?? []);
    const defaultIdx = info.layers.findIndex((l) => l.toUpperCase() === "MP");
    const idx = defaultIdx >= 0 ? defaultIdx : 0;
    setLeftLayerIdx(idx);
    setRightLayerIdx(idx);
    if (info.folder) setActiveFolder(info.folder);
    console.log("[INSTRUMENTS] Instrument applied successfully");
  };

  const layerForHand = (hand: "left" | "right"): string => {
    const layers = availableLayers();
    if (layers.length === 0) return "";
    const idx = hand === "left" ? leftLayerIdx() : rightLayerIdx();
    return layers[Math.min(idx, layers.length - 1)];
  };

  const cycleLayer = (hand: "left" | "right", direction: 1 | -1) => {
    const total = availableLayers().length;
    if (total === 0) return;
    if (hand === "left") {
      setLeftLayerIdx((i) => Math.max(0, Math.min(total - 1, i + direction)));
    } else {
      setRightLayerIdx((i) => Math.max(0, Math.min(total - 1, i + direction)));
    }
  };

  const velocityForLayer = (layer: string): number => {
    if (!layer) return 54;
    const lower = layer.toLowerCase();
    const layers = availableLayers();
    const base =
      lower === "pp"
        ? 20
        : lower === "mp"
          ? 54
          : lower === "mf"
            ? 76
            : lower === "ff"
              ? 106
              : (() => {
                const idx = layers.indexOf(layer);
                const total = layers.length;
                return total === 0
                  ? 54
                  : Math.round(20 + (idx / Math.max(total - 1, 1)) * 86);
              })();
    return Math.min(127, base);
  };

  // ── Instrument management ─────────────────────────────────────────────────────

  const loadAvailableInstruments = async () => {
    // Prevent concurrent scanning
    if (isScanning()) {
      console.log("[INSTRUMENTS] Already scanning, skipping...");
      return availableInstruments();
    }

    try {
      setIsScanning(true);
      console.log("[INSTRUMENTS] Starting scan...");

      // Add a small delay to make loading visible
      await new Promise(resolve => setTimeout(resolve, 500));

      const instruments = await invoke<InstrumentInfo[]>(
        "get_available_instruments",
      );

      console.log(`[INSTRUMENTS] Found ${instruments.length} instruments`);

      // Add another small delay
      await new Promise(resolve => setTimeout(resolve, 300));

      setAvailableInstruments(instruments);

      setIsScanning(false);
      console.log("[INSTRUMENTS] Scan complete");
      return instruments;
    } catch (e) {
      console.error("[INSTRUMENTS] scan error:", e);
      setIsScanning(false);
      return [] as InstrumentInfo[];
    }
  };

  const selectInstrument = async (folder: string) => {
    console.log("[SELECT] Instrument selection started for:", folder);

    if (activeFolder() === folder) {
      console.log("[SELECT] Already active, skipping");
      return;
    }
    if (isLoading() && activeFolder() !== folder) {
      console.log("[SELECT] Another instrument loading, skipping");
      return;
    }

    setActiveFolder(folder);
    setIsLoading(true);
    setLoadProgress(0);
    console.log("[SELECT] Loading state set");

    const placeholder = availableInstruments().find((i) => i.folder === folder);
    if (placeholder && !currentInstrument()) {
      setAvailableLayers(placeholder.layers);
      setAvailableLayerRanges(placeholder.layer_ranges ?? []);
      const defaultIdx = placeholder.layers.findIndex(
        (l) => l.toUpperCase() === "MP",
      );
      setLeftLayerIdx(defaultIdx >= 0 ? defaultIdx : 0);
      setRightLayerIdx(defaultIdx >= 0 ? defaultIdx : 0);
    }

    try {
      console.log("[SELECT] Calling load_instrument backend command");

      // Listen for real progress events from backend
      const unlisten = await listen("load_progress", (event) => {
        const { progress, loaded, total, status } = event.payload as {
          progress: number;
          loaded: number;
          total: number;
          status: string;
        };
        console.log(`[PROGRESS] ${status}: ${progress}% (${loaded}/${total})`);
        setLoadProgress(progress);
      });

      const info = await invoke<InstrumentInfo>("load_instrument", { folder });

      // Stop listening for progress events
      unlisten();

      console.log("[SELECT] Backend response received:", info);
      applyInstrument(info);

      setIsLoading(false);
      setLoadProgress(null);
      console.log("[SELECT] Instrument loaded successfully");
    } catch (e) {
      console.error("[INSTRUMENTS] load error:", e);
      setActiveFolder(null);
      setIsLoading(false);
      setLoadProgress(null);
    }
  };

  // ── Audio ─────────────────────────────────────────────────────────────────────

  const noteOn = async (midi: number, hand: "left" | "right") => {
    if (activeNotes().has(midi)) return;
    setActiveNotes((prev) => new Set(prev).add(midi));
    const layer = layerForHand(hand);
    try {
      await invoke("play_midi_note", {
        midiNum: midi,
        velocity: velocityForLayer(layer),
        layer,
      });
    } catch (e) {
      console.error("[PIANO] play error:", e);
    }
  };

  const noteOff = async (midi: number) => {
    setActiveNotes((prev) => {
      const n = new Set(prev);
      n.delete(midi);
      return n;
    });
    try {
      await invoke("stop_midi_note", { midiNum: midi });
    } catch (e) {
      console.error("[PIANO] stop error:", e);
    }
  };

  const noteOnRaw = (midi: number, _velocity: number) => {
    noteOn(midi, "right");
  };

  // ── Startup ───────────────────────────────────────────────────────────────────

  onMount(async () => {
    // Don't set loading state on startup - just load instruments silently
    console.log("[INIT] Starting app initialization...");

    // Load available instruments silently
    await loadAvailableInstruments();

    console.log("[INIT] App ready - waiting for user to select instrument");
  });

  // ── Keyboard ──────────────────────────────────────────────────────────────────

  // Maps a held key → the MIDI notes it started (supports chords)
  const keyToMidis = new Map<string, number[]>();
  const heldKeys = new Set<string>();

  const recomputeModifiers = () => {
    const lm: Modifier = heldModifiers.altLeft
      ? "flat"
      : heldModifiers.shiftLeft
        ? "sharp"
        : null;
    const rm: Modifier = heldModifiers.altRight
      ? "flat"
      : heldModifiers.shiftRight
        ? "sharp"
        : null;
    setLeftModifier(lm);
    setRightModifier(rm);
  };

  const normalizeKey = (k: string) => {
    if (k === "?") return "/";
    if (k === "<") return ",";
    if (k === ">") return ".";
    if (k === ":") return ";";
    return k.toLowerCase();
  };

  const handleKeyDown = (e: KeyboardEvent) => {
    // ── Modifier keys ──
    if (e.code === "ShiftLeft") {
      heldModifiers.shiftLeft = true;
      recomputeModifiers();
      return;
    }
    if (e.code === "ShiftRight") {
      heldModifiers.shiftRight = true;
      recomputeModifiers();
      return;
    }
    if (e.code === "AltLeft") {
      heldModifiers.altLeft = true;
      recomputeModifiers();
      e.preventDefault();
      return;
    }
    if (e.code === "AltRight") {
      heldModifiers.altRight = true;
      recomputeModifiers();
      e.preventDefault();
      return;
    }

    // ── Layer cycling (Space) ──
    if (e.code === "Space") {
      e.preventDefault();
      const dir: 1 | -1 =
        heldModifiers.shiftLeft || heldModifiers.shiftRight ? 1 : -1;
      if (heldModifiers.shiftLeft || heldModifiers.altLeft)
        cycleLayer("left", dir);
      if (heldModifiers.shiftRight || heldModifiers.altRight)
        cycleLayer("right", dir);
      return;
    }

    const key = normalizeKey(e.key);
    if (e.repeat && heldKeys.has(key)) return;

    // ── Octave navigation ──
    if (isLeftOctaveUpKey(key)) {
      heldKeys.add(key);
      setLeftOctave((o) => Math.min(LEFT_OCTAVE_MAX, o + 1));
      e.preventDefault();
      return;
    }
    if (isLeftOctaveDownKey(key)) {
      heldKeys.add(key);
      setLeftOctave((o) => Math.max(LEFT_OCTAVE_MIN, o - 1));
      e.preventDefault();
      return;
    }
    if (isRightOctaveUpKey(key)) {
      heldKeys.add(key);
      setRightOctave((o) => Math.min(RIGHT_OCTAVE_MAX, o + 1));
      e.preventDefault();
      return;
    }
    if (isRightOctaveDownKey(key)) {
      heldKeys.add(key);
      setRightOctave((o) => Math.max(RIGHT_OCTAVE_MIN, o - 1));
      e.preventDefault();
      return;
    }

    // ── Escape: reset octaves ──
    if (key === "escape") {
      setLeftOctave(LEFT_OCTAVE_DEFAULT);
      setRightOctave(RIGHT_OCTAVE_DEFAULT);
      return;
    }

    // ── Regular piano keys ──
    if (!isPianoKey(key)) return;

    if (heldKeys.has(key)) return;
    heldKeys.add(key);

    if (isLeftPianoKey(key)) {
      const midi = getMidiForKey(key, "left", leftOctave(), leftModifier());
      if (midi !== null) {
        e.preventDefault();
        keyToMidis.set(key, [midi]);
        noteOn(midi, "left");
      }
    } else if (isRightPianoKey(key)) {
      const midi = getMidiForKey(
        key,
        "right",
        rightOctave(),
        rightModifier(),
      );
      if (midi !== null) {
        e.preventDefault();
        keyToMidis.set(key, [midi]);
        noteOn(midi, "right");
      }
    }
  };

  const handleKeyUp = (e: KeyboardEvent) => {
    if (e.code === "ShiftLeft") {
      heldModifiers.shiftLeft = false;
      recomputeModifiers();
      return;
    }
    if (e.code === "ShiftRight") {
      heldModifiers.shiftRight = false;
      recomputeModifiers();
      return;
    }
    if (e.code === "AltLeft") {
      heldModifiers.altLeft = false;
      recomputeModifiers();
      return;
    }
    if (e.code === "AltRight") {
      heldModifiers.altRight = false;
      recomputeModifiers();
      return;
    }

    const key = normalizeKey(e.key);
    heldKeys.delete(key);

    const midis = keyToMidis.get(key);
    if (midis) {
      midis.forEach((m) => noteOff(m));
      keyToMidis.delete(key);
    }
  };

  window.addEventListener("keydown", handleKeyDown);
  window.addEventListener("keyup", handleKeyUp);

  // ✅ FIX: use onCleanup instead of returning the cleanup function directly.
  // The original code had `return () => { removeEventListeners }` at the usePiano
  // body level, which caused usePiano() to return the cleanup function instead of
  // the API object — making activeNotes (and everything else) undefined.
  onCleanup(() => {
    window.removeEventListener("keydown", handleKeyDown);
    window.removeEventListener("keyup", handleKeyUp);
  });

  return {
    activeNotes,
    noteOn,
    noteOff,
    noteOnRaw,
    availableLayers,
    availableLayerRanges,
    leftLayerIdx,
    rightLayerIdx,
    layerForHand,
    velocityForLayer,
    availableInstruments,
    currentInstrument,
    activeFolder,
    selectInstrument,
    isLoading,
    loadProgress,
    leftOctave,
    rightOctave,
    setLeftOctave,
    setRightOctave,
    leftModifier,
    rightModifier,
  };
}
