import { For, Show, createSignal } from "solid-js";
import type { SongInfo, SessionStatus, SessionMode } from "@/hooks/useBuffer";

interface SongSelectProps {
  availableSongs: () => SongInfo[];
  activeSong: () => SongInfo | null;
  isLoading: () => boolean;
  sessionStatus: () => SessionStatus;
  sessionMode: () => SessionMode;
  onSelectSong: (song: SongInfo) => void;
  onSelectMode: (mode: "perform" | "instruct") => void;
  onStop: () => void;
}

export default function SongSelect(props: SongSelectProps) {
  const [showList, setShowList] = createSignal(false);

  const displayName = () => {
    const song = props.activeSong();
    if (!song) return null;
    return song.display_name;
  };

  const statusLabel = () => {
    switch (props.sessionStatus()) {
      case "loading":
        return "loading";
      case "ready":
        return "ready";
      case "playing":
        return props.sessionMode() ?? "playing";
      case "paused":
        return "paused";
      case "finished":
        return "finished";
      default:
        return null;
    }
  };

  const dotClass = () => {
    switch (props.sessionStatus()) {
      case "loading":
        return "bg-amber-400 animate-pulse";
      case "ready":
        return "bg-blue-400";
      case "playing":
        return "bg-emerald-400 shadow-[0_0_6px_2px_rgba(52,211,153,0.4)]";
      case "paused":
        return "bg-amber-400";
      case "finished":
        return "bg-zinc-400";
      default:
        return "bg-zinc-600";
    }
  };

  const isIdle = () => props.sessionStatus() === "idle" && !props.activeSong();

  return (
    <div class="shrink-0 relative">
      {/* Song button */}
      <button
        onClick={() => setShowList((v) => !v)}
        class={`flex items-center gap-2 bg-zinc-800 rounded-lg px-3 py-1.5 border border-zinc-700 transition-colors shrink-0 cursor-pointer hover:bg-zinc-700 ${displayName() ? "text-zinc-200" : "text-zinc-400"
          }`}
      >
        <Show when={displayName()}>
          <span
            class={`w-1.5 h-1.5 rounded-full shrink-0 transition-colors ${dotClass()}`}
          />
          <span class="font-medium truncate max-w-[140px]">
            {displayName()}
          </span>
          <Show when={props.isLoading()}>
            <span class="text-xs text-amber-400 font-bold shrink-0 animate-pulse">
              loading
            </span>
          </Show>
          <Show when={!props.isLoading() && statusLabel()}>
            <span class="text-xs px-1.5 py-0.5 rounded bg-zinc-700 text-zinc-400 uppercase font-medium shrink-0">
              {statusLabel()}
            </span>
          </Show>
        </Show>
        <Show when={isIdle()}>
          <span class="text-zinc-400">Select song</span>
        </Show>
        <Show when={!displayName() && !isIdle()}>
          <span class={`w-1.5 h-1.5 rounded-full shrink-0 ${dotClass()}`} />
          <span class="text-zinc-400">Select song</span>
        </Show>
        <span class="text-zinc-400 text-xs shrink-0">
          {showList() ? "▴" : "▾"}
        </span>
      </button>

      {/* Dropdown */}
      <Show when={showList()}>
        <div class="absolute top-full right-0 mt-3 z-50 w-[150%] bg-zinc-800 rounded-lg shadow-xl border border-zinc-700 max-h-[60vh] overflow-y-auto">
          <div class="p-1 w-full">
            <Show
              when={props.availableSongs().length > 0}
              fallback={
                <div class="px-4 py-3 text-xs text-zinc-500">
                  No MIDI files found in ~/.config/rakund/songs/
                </div>
              }
            >
              <For each={props.availableSongs()}>
                {(song) => {
                  const isActive = () =>
                    props.activeSong()?.file_path === song.file_path;
                  const isThisLoading = () => isActive() && props.isLoading();
                  const isOtherLoading = () => !isActive() && props.isLoading();
                  const isReady = () =>
                    isActive() && props.sessionStatus() === "ready";
                  const isPlaying = () =>
                    isActive() && props.sessionStatus() === "playing";
                  const isPaused = () =>
                    isActive() && props.sessionStatus() === "paused";
                  const isFinished = () =>
                    isActive() && props.sessionStatus() === "finished";

                  return (
                    <div class="mb-1 border-b border-zinc-700/60 last:border-b-0">
                      {/* Song row */}
                      <button
                        onClick={() => {
                          if (isOtherLoading()) return;
                          if (!isActive()) {
                            props.onSelectSong(song);
                          }
                        }}
                        disabled={isOtherLoading()}
                        class={`w-full text-left px-4 py-3 transition-colors group ${isActive()
                          ? "bg-zinc-700/50"
                          : isOtherLoading()
                            ? "opacity-50 cursor-not-allowed"
                            : "cursor-pointer hover:bg-zinc-700/30"
                          }`}
                      >
                        <div class="flex items-center gap-3">
                          {/* Status dot */}
                          <span
                            class={`w-2 h-2 rounded-full shrink-0 transition-colors ${isThisLoading()
                              ? "bg-amber-400 animate-pulse"
                              : isPlaying()
                                ? "bg-emerald-400 shadow-[0_0_6px_2px_rgba(52,211,153,0.4)]"
                                : isReady() || isPaused()
                                  ? "bg-blue-400"
                                  : isFinished()
                                    ? "bg-zinc-400"
                                    : "bg-zinc-600 group-hover:bg-zinc-400"
                              }`}
                          />
                          <span class="text-sm font-medium text-zinc-200 truncate flex-1">
                            {song.display_name}
                          </span>
                          <Show when={isThisLoading()}>
                            <span class="text-xs text-amber-400 animate-pulse shrink-0">
                              loading…
                            </span>
                          </Show>
                          <Show when={isReady()}>
                            <span class="text-xs text-blue-400 shrink-0">
                              READY
                            </span>
                          </Show>
                          <Show when={isPlaying()}>
                            <span class="text-xs text-emerald-400 shrink-0 uppercase">
                              {props.sessionMode()}
                            </span>
                          </Show>
                          <Show when={isPaused()}>
                            <span class="text-xs text-amber-400 shrink-0">
                              PAUSED
                            </span>
                          </Show>
                          <Show when={isFinished()}>
                            <span class="text-xs text-zinc-400 shrink-0">
                              DONE
                            </span>
                          </Show>
                        </div>
                      </button>

                      {/* Mode buttons — shown when this song is ready */}
                      <Show when={isReady()}>
                        <div class="px-4 pb-3 flex space-x-4 gap-2 mt-2">
                          <button
                            class="flex-1 px-3 py-1.5 rounded text-xs font-medium bg-blue-600 hover:bg-blue-500 text-white transition-colors"
                            onClick={() => {
                              props.onSelectMode("perform");
                              setShowList(false);
                            }}
                          >
                            Perform
                          </button>
                          <button
                            class="flex-1 px-3 py-1.5 rounded text-xs font-medium bg-lime-600 hover:bg-lime-500 text-zinc-200 transition-colors"
                            onClick={() => {
                              props.onSelectMode("instruct");
                              setShowList(false);
                            }}
                          >
                            Instruct
                          </button>
                        </div>
                      </Show>

                      {/* Stop button — shown when playing, paused, or finished */}
                      <Show when={isPlaying() || isPaused()}>
                        <div class="px-4 pb-3">
                          <button
                            class="w-full px py-1.5 mt-2 rounded text-xs font-medium bg-zinc-700 hover:bg-zinc-600 text-zinc-300 transition-colors"
                            onClick={() => {
                              props.onStop();
                              setShowList(false);
                            }}
                          >
                            Stop
                          </button>
                        </div>
                      </Show>
                    </div>
                  );
                }}
              </For>
            </Show>
          </div>
        </div>
      </Show>
    </div>
  );
}
