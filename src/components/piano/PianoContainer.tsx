import { For, createMemo } from "solid-js";
import { getKeyHighlight } from "@/utils/keyMapping";
import { PIANO_KEYS } from "@/utils/pianoLayout";

interface PianoProps {
  activeNotes: () => Set<number>;
  onNoteOn: (midi: number, hand: "left" | "right") => void;
  onNoteOff: (midi: number) => void;
  leftOctave: () => number;
  rightOctave: () => number;
}

const WHITE_KEYS = PIANO_KEYS.filter((k) => k.type === "white");
const BLACK_KEYS = PIANO_KEYS.filter((k) => k.type === "black");

export default function PianoContainer(props: PianoProps) {
  const { activeNotes, onNoteOn, onNoteOff, leftOctave, rightOctave } = props;

  const highlights = createMemo(() => {
    const map = new Map<number, "left" | "right" | "both">();
    for (const k of PIANO_KEYS) {
      const h = getKeyHighlight(k.midi, leftOctave(), rightOctave());
      if (h) map.set(k.midi, h);
    }
    return map;
  });

  const whiteClass = (midi: number) => {
    const active = activeNotes().has(midi);
    const highlight = highlights().get(midi);
    if (active) return "bg-emerald-300 border-emerald-400 translate-y-0.5";
    if (highlight === "both") return "bg-purple-200 border-purple-300";
    if (highlight === "left") return "bg-blue-200 border-blue-300";
    if (highlight === "right") return "bg-green-200 border-green-300";
    return "bg-zinc-100 hover:bg-white border-zinc-300";
  };

  const blackClass = (midi: number) => {
    const active = activeNotes().has(midi);
    const highlight = highlights().get(midi);
    if (active) return "bg-emerald-500 translate-y-0.5";
    if (highlight === "both") return "bg-purple-700";
    if (highlight === "left") return "bg-blue-700";
    if (highlight === "right") return "bg-green-700";
    return "bg-zinc-900 hover:bg-zinc-700";
  };

  const handForMidi = (midi: number): "left" | "right" => {
    const h = highlights().get(midi);
    if (h === "left") return "left";
    if (h === "right") return "right";
    if (h === "both") return "right";
    return "left";
  };

  return (
    <div
      class="fixed bottom-0 w-full select-none"
      style="height: 25vh; min-height: 2rem; max-height: 10rem;"
    >
      <div class="absolute inset-0 flex">
        <For each={WHITE_KEYS}>
          {(key) => (
            <button
              onMouseDown={() => onNoteOn(key.midi, handForMidi(key.midi))}
              onMouseUp={() => onNoteOff(key.midi)}
              onMouseLeave={() => onNoteOff(key.midi)}
              class={`h-full flex-1 border border-zinc-400
                    flex items-end justify-center 
                    text-[7px] font-black text-zinc-400
                    transition-all duration-75 ${whiteClass(key.midi)}`}
            >
              {key.midi % 12 === 0 ? `C${Math.floor(key.midi / 12) - 1}` : ""}
            </button>
          )}
        </For>
      </div>

      <For each={BLACK_KEYS}>
        {(key) => (
          <button
            onMouseDown={() => onNoteOn(key.midi, handForMidi(key.midi))}
            onMouseUp={() => onNoteOff(key.midi)}
            onMouseLeave={() => onNoteOff(key.midi)}
            class={`absolute top-0 z-10 rounded-b-sm
                  transition-all duration-75 ${blackClass(key.midi)}`}
            style={`left: ${key.left}%; width: ${key.width}%; height: 58%; min-height: 1rem;`}
          />
        )}
      </For>
    </div>
  );
}
