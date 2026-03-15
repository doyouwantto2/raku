use crate::engine::cache;
use crate::engine::decoder;
use crate::error::AudioError;
use crate::setup::audio::AudioHandle;
use crate::setup::config::AppState;
use crate::storage::logic::CURRENT_INSTRUMENT;
use tauri::{AppHandle, State};

#[tauri::command]
pub async fn play_midi_note(
    midi_num: u8,
    velocity: u8,
    layer: String,
    handle: State<'_, AudioHandle>,
    _app: AppHandle,
) -> Result<(), String> {
    let config_guard = CURRENT_INSTRUMENT.lock().unwrap();
    let config = config_guard.as_ref().ok_or("No instrument loaded")?;

    let key_data = config
        .piano_keys
        .get(&midi_num.to_string())
        .ok_or_else(|| AudioError::NoteNotFound(midi_num).to_string())?;

    let layer_upper = layer.to_uppercase();
    let _sample_info = key_data
        .samples
        .iter()
        .find(|s| s.layer.to_uppercase() == layer_upper)
        .or_else(|| key_data.samples.first())
        .ok_or_else(|| format!("No samples for note {}", midi_num))?;

    let sample_idx = key_data
        .samples
        .iter()
        .position(|s| s.layer.to_uppercase() == layer_upper)
        .unwrap_or(0);

    let data = cache::get_by_index(midi_num, sample_idx)
        .ok_or_else(|| format!("Sample not cached: midi={} layer={}", midi_num, layer))?;

    // Debug: Check if sample data is valid
    if data.is_empty() {
        return Err(format!(
            "Empty sample data for midi={} layer={}",
            midi_num, layer
        ));
    }

    let recorded_midi = decoder::pitch_to_midi(&key_data.pitch).unwrap_or(key_data.midi_num());
    let ratio = decoder::pitch_ratio(recorded_midi, midi_num);

    if let Ok(mut voices) = handle.active_voices.lock() {
        voices.push(crate::setup::audio::Voice {
            data,
            playhead: 0.0,
            pitch_ratio: ratio,
            midi_note: midi_num,
            is_releasing: false,
            volume: velocity as f32 / 127.0,
        });
    }

    Ok(())
}

#[tauri::command]
pub async fn stop_midi_note(
    midi_num: u8,
    handle: State<'_, AudioHandle>,
    _app: AppHandle,
    _state: State<'_, AppState>,
) -> Result<(), String> {
    let config_guard = CURRENT_INSTRUMENT.lock().unwrap();
    let config = config_guard.as_ref().ok_or("No instrument loaded")?;

    let _key_data = config
        .piano_keys
        .get(&midi_num.to_string())
        .ok_or_else(|| AudioError::NoteNotFound(midi_num).to_string())?;

    if let Ok(mut voices) = handle.active_voices.lock() {
        for voice in voices.iter_mut() {
            if voice.midi_note == midi_num {
                voice.is_releasing = true;
            }
        }
    }

    Ok(())
}
