import HeaderContainer from "@/components/header/HeaderContainer";
import SceneDispatcher from "@/components/scenes/SceneDispatcher";
import BufferContainer from "@/components/buffer/BufferContainer";
import PianoContainer from "@/components/piano/PianoContainer";
import { usePiano } from "@/hooks/usePiano";
import { useBuffer } from "@/hooks/useBuffer";
import { For, Show } from "solid-js";
import { getOctaveBoundariesPct } from "@/utils/pianoLayout";

const OCTAVE_BOUNDARIES_PCT = getOctaveBoundariesPct();

export default function Home() {
  const piano = usePiano();

  // Pass piano's raw note callbacks into useBuffer so the audio scheduler
  // can fire play_midi_note / stop_midi_note at the exact right millisecond
  // using setTimeout — completely independent of the animation clock.
  const buffer = useBuffer(
    (midi, velocity) => piano.noteOnRaw(midi, velocity),
    (midi) => piano.noteOff(midi),
  );

  const onPauseResume = () => {
    if (buffer.sessionStatus() === "playing") buffer.pausePlayback();
    else if (buffer.sessionStatus() === "paused") buffer.resumePlayback();
  };

  return (
    <div class="h-screen w-full bg-zinc-950 text-white flex flex-col overflow-hidden select-none font-sans">
      <HeaderContainer
        // Instrument
        currentInstrument={piano.currentInstrument}
        availableInstruments={piano.availableInstruments}
        isLoading={piano.isLoading}
        loadProgress={piano.loadProgress}
        activeFolder={piano.activeFolder}
        onSelectInstrument={piano.selectInstrument}
        leftOctave={piano.leftOctave}
        rightOctave={piano.rightOctave}
        leftModifier={piano.leftModifier}
        rightModifier={piano.rightModifier}
        leftLayerIdx={piano.leftLayerIdx}
        rightLayerIdx={piano.rightLayerIdx}
        availableLayers={piano.availableLayers}
        availableLayerRanges={piano.availableLayerRanges}
        velocityForLayer={piano.velocityForLayer}
        // Song
        availableSongs={buffer.availableSongs}
        activeSong={buffer.activeSong}
        isSongLoading={buffer.isLoading}
        sessionStatus={buffer.sessionStatus}
        sessionMode={buffer.sessionMode}
        onSelectSong={buffer.loadSession}
        onSelectMode={buffer.selectMode}
        onPauseResume={onPauseResume}
        onStop={buffer.stopPlayback}
      />

      <div class="flex flex-col flex-1 overflow-hidden relative">
        <Show
          when={
            buffer.sessionStatus() !== "idle" &&
            buffer.sessionStatus() !== "loading"
          }
        >
          <For each={OCTAVE_BOUNDARIES_PCT}>
            {(pct) => (
              <div
                style={{
                  position: "absolute",
                  top: "0",
                  bottom: "0",
                  left: `${pct}%`,
                  width: "1px",
                  background: "rgba(255, 255, 255, 0.10)",
                  "pointer-events": "none",
                  "z-index": "10",
                }}
              />
            )}
          </For>
        </Show>

        {/* SceneDispatcher is purely visual — no audio callbacks needed here */}
        <SceneDispatcher
          allNotes={buffer.allNotes}
          currentTime={buffer.currentTime}
          sessionStatus={buffer.sessionStatus}
          sessionMode={buffer.sessionMode}
        />

        <BufferContainer
          sessionStatus={buffer.sessionStatus}
          sessionMode={buffer.sessionMode}
        />

        <PianoContainer
          activeNotes={piano.activeNotes}
          onNoteOn={piano.noteOn}
          onNoteOff={piano.noteOff}
          leftOctave={piano.leftOctave}
          rightOctave={piano.rightOctave}
        />
      </div>
    </div>
  );
}
