use crate::storage::items::*;
use crate::storage::handler::FileHandler;
use tauri::State;
use std::sync::Arc;
use tokio::sync::RwLock;

// Tauri commands for frontend integration only
// Manager is just for Tauri commands, no pure functions

// CRUD operations for file management
#[tauri::command]
pub async fn create_instrument(
    folder: String,
    file_handler: State<'_, Arc<RwLock<FileHandler>>>,
) -> Result<InstrumentFileResponse, String> {
    let handler = file_handler.read().await;
    handler.create_instrument(&folder).await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn delete_instrument(
    folder: String,
    file_handler: State<'_, Arc<RwLock<FileHandler>>>,
) -> Result<(), String> {
    let handler = file_handler.read().await;
    handler.delete_instrument(&folder).await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn create_song(
    name: String,
    file_type: String,
    file_handler: State<'_, Arc<RwLock<FileHandler>>>,
) -> Result<SongFileResponse, String> {
    let handler = file_handler.read().await;
    let song_type = if file_type == "midi" {
        SongFileType::Midi
    } else {
        SongFileType::Other(file_type)
    };
    
    handler.create_song(&name, song_type).await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn delete_song(
    path: String,
    file_handler: State<'_, Arc<RwLock<FileHandler>>>,
) -> Result<(), String> {
    let handler = file_handler.read().await;
    handler.delete_song(&path).await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn get_file_metadata(
    path: String,
    file_type: String,
    file_handler: State<'_, Arc<RwLock<FileHandler>>>,
) -> Result<FileMetadata, String> {
    let handler = file_handler.read().await;
    let type_enum = match file_type.as_str() {
        "instrument" => FileType::Instrument,
        "song" => FileType::Song,
        _ => return Err("Invalid file type".to_string()),
    };
    
    handler.get_file_metadata(&path, type_enum).await
        .map_err(|e| e.to_string())
}