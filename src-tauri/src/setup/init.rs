use crate::core;
use crate::error::AudioError;
use crate::setup::audio;
use crate::setup::config::AppState;
use crate::state;
use crate::storage::handler::FileHandler;
use std::sync::Arc;
use tokio::sync::RwLock;

pub fn run() -> Result<(), AudioError> {
    let audio_handle = audio::start_stream()?;

    match state::instruments_dir() {
        Ok(dir) => println!("[INIT] Instruments directory: {:?}", dir),
        Err(e) => eprintln!("[INIT] Cannot resolve instruments dir: {}", e),
    }

    let file_handler = Arc::new(RwLock::new(FileHandler::new().map_err(|e| {
        AudioError::InstrumentError(format!("Failed to initialize FileHandler: {}", e))
    })?));

    let app_state = AppState::default();

    tauri::Builder::default()
        .manage(audio_handle)
        .manage(file_handler)
        .manage(app_state)
        .invoke_handler(tauri::generate_handler![
            core::player::play_midi_note,
            core::player::stop_midi_note,
            core::player::play_note_auto, // ← new: velocity-aware auto play
            core::player::load_instrument,
            core::player::get_available_instruments,
            core::player::get_available_instruments_files,
            core::player::get_instrument_info,
            core::player::get_app_state,
            core::player::clear_last_instrument,
            core::visualizer::scan_songs,
            core::visualizer::scan_song_files,
            core::visualizer::load_midi_session,
            core::visualizer::get_session_notes,
            core::visualizer::clear_session,
            core::manager::create_instrument,
            core::manager::delete_instrument,
            core::manager::create_song,
            core::manager::delete_song,
            core::manager::get_file_metadata,
        ])
        .setup(|_app| Ok(()))
        .run(tauri::generate_context!())
        .expect("error while running tauri application");

    Ok(())
}
