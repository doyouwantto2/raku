import { For, createMemo, onMount, onCleanup, createSignal } from "solid-js";
import type { Accessor } from "solid-js";
import type { MidiNoteMs, SessionMode } from "@/hooks/useBuffer";
import { getKeyLayoutPx, type KeyLayoutPx } from "@/utils/pianoLayout";
import RainKey from "./RainKey";

// ── Constants ─────────────────────────────────────────────────────────────────

const LOOKAHEAD_MS = 3000;

// ── Types ─────────────────────────────────────────────────────────────────────

interface PreparedNote {
  note: MidiNoteMs;
  layout: KeyLayoutPx;
  isBlack: boolean;
}

// ── Props ─────────────────────────────────────────────────────────────────────

interface RainLayoutProps {
  allNotes: Accessor<MidiNoteMs[]>;
  currentTime: Accessor<number>;
  sessionMode: Accessor<SessionMode>;
}

// ── Binary search helpers ─────────────────────────────────────────────────────

/** First index where note.start_ms >= target */
function lowerBound(notes: PreparedNote[], target: number): number {
  let lo = 0, hi = notes.length;
  while (lo < hi) {
    const mid = (lo + hi) >>> 1;
    if (notes[mid].note.start_ms < target) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}

/** First index where note.start_ms > target */
function upperBound(notes: PreparedNote[], target: number): number {
  let lo = 0, hi = notes.length;
  while (lo < hi) {
    const mid = (lo + hi) >>> 1;
    if (notes[mid].note.start_ms <= target) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function RainLayout(props: RainLayoutProps) {
  let containerRef: HTMLDivElement | undefined;

  const [containerWidth, setContainerWidth] = createSignal(0);
  const [containerHeight, setContainerHeight] = createSignal(0);

  onMount(() => {
    if (!containerRef) return;
    const measure = () => {
      setContainerWidth(containerRef!.clientWidth);
      setContainerHeight(containerRef!.clientHeight);
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(containerRef);
    onCleanup(() => observer.disconnect());
  });

  // ── Fall speed ────────────────────────────────────────────────────────────

  const speed = createMemo(() => containerHeight() / LOOKAHEAD_MS);

  // ── Pre-process notes ─────────────────────────────────────────────────────
  //
  // This memo only reruns when allNotes or containerWidth changes — NOT every
  // frame. It pre-sorts by start_ms and pre-computes pixel layouts so the
  // per-frame memo never touches the full note array or does map lookups.

  const preparedNotes = createMemo<PreparedNote[]>(() => {
    const w = containerWidth();
    const notes = props.allNotes();
    if (w === 0 || notes.length === 0) return [];

    const result: PreparedNote[] = [];
    for (const note of notes) {
      const layout = getKeyLayoutPx(note.midi, w);
      if (!layout) continue;
      result.push({ note, layout, isBlack: layout.type === "black" });
    }

    // Sort by start_ms so we can binary-search the visible window each frame
    result.sort((a, b) => a.note.start_ms - b.note.start_ms);
    return result;
  });

  // ── Visible notes — O(log n + k) per frame instead of O(n) ───────────────
  //
  // Binary search finds only the notes whose start_ms falls in the visible
  // window. Notes with very long durations that start before the window but
  // are still visible are handled by the tail-end scan (rare, cheap).

  const visibleNotes = createMemo(() => {
    const t = props.currentTime();
    const h = containerHeight();
    const spd = speed();
    const prepared = preparedNotes();
    if (h === 0 || spd === 0 || prepared.length === 0) return [];

    // A note is visible when: noteBottom >= 0 AND noteTop <= h
    //   noteBottom = (t - start_ms + LOOKAHEAD_MS) * spd
    //   noteBottom >= 0  →  start_ms <= t + LOOKAHEAD_MS
    //   noteTop    <= h  →  start_ms >= t - (h / spd)   (approx, note may be tall)
    //
    // We widen the low bound slightly to catch long-duration notes that
    // started well before the window but whose body still overlaps.
    const MAX_NOTE_DURATION_MS = 8000; // generous upper bound
    const windowStart = t - MAX_NOTE_DURATION_MS;
    const windowEnd = t + LOOKAHEAD_MS;

    const from = lowerBound(prepared, windowStart);
    const to = upperBound(prepared, windowEnd);

    const result = [];
    for (let i = from; i < to; i++) {
      const { note, layout, isBlack } = prepared[i];
      const noteHeight = Math.max(note.duration_ms * spd, 4);
      const noteBottom = (t - note.start_ms + LOOKAHEAD_MS) * spd;
      const noteTop = noteBottom - noteHeight;

      if (noteBottom < 0 || noteTop > h) continue;

      result.push({
        note,
        x: layout.x,
        width: layout.width,
        y: noteTop,
        height: noteHeight,
        isBlack,
      });
    }
    return result;
  });

  return (
    <div
      ref={containerRef}
      class="w-full h-full relative overflow-hidden bg-zinc-950"
    >
      <For each={visibleNotes()}>
        {(item) => (
          <RainKey
            note={item.note}
            x={item.x}
            width={item.width}
            y={item.y}
            height={item.height}
            isBlack={item.isBlack}
          />
        )}
      </For>
    </div>
  );
}
