import { createSignal, onMount, onCleanup, createEffect, For } from "solid-js";
import type { MidiNoteMs } from "@/hooks/useBuffer";
import { getKeyLayoutPx } from "@/utils/pianoLayout";
import RainKey from "./RainKey";

interface PooledKey {
  id: string;
  note: MidiNoteMs | null;
  x: number;
  width: number;
  y: number;
  height: number;
  isBlack: boolean;
  isActive: boolean;
}

interface RainKeyPoolProps {
  allNotes: () => MidiNoteMs[];
  currentTime: () => number;
  containerWidth: () => number;
  containerHeight: () => number;
  sessionStatus: () => any;
}

export default function RainKeyPool(props: RainKeyPoolProps) {
  const [keyPool, setKeyPool] = createSignal<PooledKey[]>([]);

  // Pre-create a pool of key components (enough for maximum concurrent notes)
  const MAX_CONCURRENT_KEYS = 128; // One for each MIDI note

  // Initialize the key pool
  onMount(() => {
    const pool: PooledKey[] = [];
    for (let i = 0; i < MAX_CONCURRENT_KEYS; i++) {
      pool.push({
        id: `key_${i}`,
        note: null,
        x: 0,
        width: 0,
        y: 0,
        height: 0,
        isBlack: false,
        isActive: false,
      });
    }
    setKeyPool(pool);
    console.log(`[RAIN_POOL] Initialized pool with ${MAX_CONCURRENT_KEYS} keys`);
  });

  // Focus/blur handlers for memory management
  onMount(() => {
    const handleFocus = () => {
      console.log("[RAIN_POOL] Window focused - maintaining key pool");
    };

    const handleBlur = () => {
      console.log("[RAIN_POOL] Window blurred - clearing active keys");

      // Reset all keys to inactive state
      setKeyPool(pool => pool.map(key => ({
        ...key,
        note: null,
        isActive: false,
        y: -100, // Move off-screen
      })));
    };

    window.addEventListener('focus', handleFocus);
    window.addEventListener('blur', handleBlur);

    onCleanup(() => {
      window.removeEventListener('focus', handleFocus);
      window.removeEventListener('blur', handleBlur);
    });
  });

  // Queue-based update system
  createEffect(() => {
    const currentTime = props.currentTime();
    const containerWidth = props.containerWidth();
    const containerHeight = props.containerHeight();
    const sessionStatus = props.sessionStatus();
    const allNotes = props.allNotes();

    // Clear all keys when session ends or during preparation
    if (sessionStatus === "idle" || sessionStatus === "finished" || sessionStatus === "preparing") {
      setKeyPool(pool => pool.map(key => ({
        ...key,
        note: null,
        isActive: false,
        y: -100,
      })));
      return;
    }

    if (containerWidth === 0 || containerHeight === 0) return;

    const LOOKAHEAD_MS = 3000;
    const speed = containerHeight / LOOKAHEAD_MS;

    // Calculate which keys should be active
    const visibleNotes = allNotes.flatMap((note) => {
      const keyLayout = getKeyLayoutPx(note.midi, containerWidth);
      if (!keyLayout) return [];

      const noteHeight = Math.max(note.duration_ms * speed, 4);
      const noteBottom = (currentTime - note.start_ms + LOOKAHEAD_MS) * speed;
      const noteTop = noteBottom - noteHeight;

      // Filter notes that are too far ahead
      if (note.start_ms - currentTime > 10000) return [];

      return {
        note,
        x: keyLayout.x,
        width: keyLayout.width,
        y: noteTop,
        height: noteHeight,
        isBlack: keyLayout.type === "black",
      };
    });

    // Assign visible notes to pooled keys
    const updatedPool = keyPool().map((pooledKey, index) => {
      if (index < visibleNotes.length) {
        const visibleNote = visibleNotes[index];

        return {
          ...pooledKey,
          note: visibleNote.note,
          x: visibleNote.x,
          width: visibleNote.width,
          y: visibleNote.y,
          height: visibleNote.height,
          isBlack: visibleNote.isBlack,
          isActive: true,
        };
      } else {
        return {
          ...pooledKey,
          note: null,
          isActive: false,
          y: -100, // Move off-screen
        };
      }
    });

    setKeyPool(updatedPool);
  });

  return (
    <div class="w-full h-full relative overflow-hidden">
      <For each={keyPool()}>
        {(pooledKey) => (
          <RainKey
            note={pooledKey.note || { midi: 0, velocity: 0, start_ms: 0, duration_ms: 0, channel: 0 }}
            x={pooledKey.x}
            width={pooledKey.width}
            y={pooledKey.y}
            height={pooledKey.height}
            isBlack={pooledKey.isBlack}
          />
        )}
      </For>
    </div>
  );
}
