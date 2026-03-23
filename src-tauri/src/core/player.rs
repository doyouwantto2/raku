use crate::engine::cache;
use crate::error::AudioError;
use crate::setup::audio::{self, AudioHandle};
use crate::setup::config::{AppState, InstrumentConfig};
use crate::state;
use lazy_static::lazy_static;
use std::sync::{Arc, Mutex};
use tauri::{AppHandle, State};

lazy_static! {
    pub static ref CURRENT_INSTRUMENT: Arc<Mutex<Option<InstrumentConfig>>> =
        Arc::new(Mutex::new(None));
    pub static ref CURRENT_FOLDER: Arc<Mutex<Option<String>>> = Arc::new(Mutex::new(None));
}

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

    let recorded_midi = audio::pitch_to_midi(&key_data.pitch).unwrap_or(key_data.midi_num());
    let ratio = audio::pitch_ratio(recorded_midi, midi_num);

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
pub async fn play_note_auto(
    midi_num: u8,
    velocity: u8,
    handle: State<'_, AudioHandle>,
    _app: AppHandle,
) -> Result<(), String> {
    use crate::setup::audio;

    let config_guard = CURRENT_INSTRUMENT.lock().unwrap();
    let config = config_guard.as_ref().ok_or("No instrument loaded")?;

    let key_data = config
        .piano_keys
        .get(&midi_num.to_string())
        .ok_or_else(|| format!("Note {} not found in piano configuration", midi_num))?;

    let sample_idx: usize = {
        let mut ranges: Vec<_> = config.general.layers.values().collect();
        ranges.sort_by_key(|r| r.lovel);

        let matched_layer_name = ranges
            .iter()
            .find(|r| velocity >= r.lovel && velocity <= r.hivel)
            .map(|r| r.name.to_uppercase());

        if let Some(layer_upper) = matched_layer_name {
            // Find the sample in this key whose layer matches
            key_data
                .samples
                .iter()
                .position(|s| s.layer.to_uppercase() == layer_upper)
                .unwrap_or(0)
        } else {
            // No range matched — pick the closest layer by velocity distance
            // instead of silently falling back to index 0.
            let best = ranges
                .iter()
                .enumerate()
                .min_by_key(|(_, r)| {
                    let mid = (r.lovel as i16 + r.hivel as i16) / 2;
                    (velocity as i16 - mid).abs()
                })
                .map(|(i, r)| (i, r.name.to_uppercase()));

            if let Some((_, layer_upper)) = best {
                key_data
                    .samples
                    .iter()
                    .position(|s| s.layer.to_uppercase() == layer_upper)
                    .unwrap_or(0)
            } else {
                0
            }
        }
    };

    // ── Fetch from cache and push voice ───────────────────────────────────────

    let data = cache::get_by_index(midi_num, sample_idx)
        .ok_or_else(|| format!("Sample not cached: midi={} idx={}", midi_num, sample_idx))?;

    if data.is_empty() {
        return Err(format!(
            "Empty sample: midi={} idx={}",
            midi_num, sample_idx
        ));
    }

    let recorded_midi = audio::pitch_to_midi(&key_data.pitch).unwrap_or(key_data.midi_num());
    let ratio = audio::pitch_ratio(recorded_midi, midi_num);

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

    // Start release envelope instead of immediately removing the voice
    if let Ok(mut voices) = handle.active_voices.lock() {
        for voice in voices.iter_mut() {
            if voice.midi_note == midi_num {
                voice.is_releasing = true;
            }
        }
    }

    Ok(())
}

#[tauri::command]
pub async fn get_available_instruments(
) -> Result<Vec<crate::extra::sketch::instrument::response::InstrumentInfoResponse>, String> {
    use crate::storage::handler::FileHandler;

    let file_handler = FileHandler::new().map_err(|e| e.to_string())?;

    let directories = file_handler
        .scan_instrument_directories()
        .await
        .map_err(|e| e.to_string())?;

    let mut result = Vec::new();
    for (_index, folder) in directories.iter().enumerate() {
        let folder_name = folder
            .file_name()
            .and_then(|name| name.to_str())
            .unwrap_or("unknown");

        // Read the instrument.json to get full instrument data
        let json_path = folder.join("instrument.json");
        let raw = crate::storage::basic::BasicFileOperations::read_file_content(&json_path)
            .map_err(|e| e.to_string())?;

        if raw.is_empty() {
            continue;
        }

        match serde_json::from_str::<InstrumentConfig>(&raw) {
            Ok(config) => {
                let info =
                    crate::extra::sketch::instrument::response::InstrumentInfoResponse::from_config(
                        &config,
                        folder_name,
                    );
                result.push(info);
            }
            Err(e) => {
                eprintln!("[SCAN] Failed to parse JSON at {:?}: {}", json_path, e);
            }
        }
    }

    Ok(result)
}

// Backward compatibility alias
#[tauri::command]
pub async fn get_available_instruments_files(
) -> Result<Vec<crate::extra::sketch::instrument::response::InstrumentInfoResponse>, String> {
    // Just call the main function
    get_available_instruments().await
}

#[tauri::command]
pub async fn load_instrument(
    folder: String,
    app: AppHandle,
    _state: State<'_, AppState>,
) -> Result<crate::extra::sketch::instrument::response::InstrumentInfoResponse, String> {
    use crate::storage::handler::FileHandler;

    // Validate instrument exists using FileHandler
    let file_handler = FileHandler::new().map_err(|e| e.to_string())?;

    let instrument_exists = file_handler
        .instrument_exists(&folder)
        .await
        .map_err(|e| e.to_string())?;

    if !instrument_exists {
        return Err(format!("Instrument '{}' does not exist", folder));
    }

    file_handler
        .validate_instrument_structure(&folder)
        .await
        .map_err(|e| e.to_string())?;

    // Use the original progress-enabled loading function
    let config = crate::setup::audio::load_instrument_with_progress(&folder, &app)
        .map_err(|e| e.to_string())?;

    *CURRENT_INSTRUMENT.lock().unwrap() = Some(config.clone());
    *CURRENT_FOLDER.lock().unwrap() = Some(folder.clone());

    let info = crate::extra::sketch::instrument::response::InstrumentInfoResponse::from_config(
        &config, &folder,
    );

    state::set_last_instrument(&folder).map_err(|e: AudioError| e.to_string())?;

    Ok(info)
}

#[tauri::command]
pub async fn get_app_state() -> Result<AppState, String> {
    state::read().map_err(|e: AudioError| e.to_string())
}

#[tauri::command]
pub async fn get_instrument_info(
) -> Result<Option<crate::extra::sketch::instrument::response::InstrumentInfoResponse>, String> {
    let config_guard = CURRENT_INSTRUMENT.lock().unwrap();
    let folder_guard = CURRENT_FOLDER.lock().unwrap();

    Ok(config_guard.as_ref().map(|config| {
        let folder_name = folder_guard.clone().unwrap_or_default();
        crate::extra::sketch::instrument::response::InstrumentInfoResponse::from_config(
            config,
            &folder_name,
        )
    }))
}

#[tauri::command]
pub async fn clear_last_instrument() -> Result<(), String> {
    state::clear_last_instrument().map_err(|e: AudioError| e.to_string())
}

pub fn set_current_folder(folder: String) {
    *CURRENT_FOLDER.lock().unwrap() = Some(folder);
}
