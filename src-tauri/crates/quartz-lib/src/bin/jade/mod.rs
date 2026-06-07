pub mod types;
pub mod reader;
pub mod writer;
pub mod text_reader;
pub mod text_writer;
pub mod unhasher;
pub mod hash_manager;

/// Convert binary .bin data to ritobin text format.
/// Pipeline: binary → read → unhash → text
pub fn convert_bin_to_text(data: &[u8]) -> Result<String, String> {
    // Check if already text
    if let Ok(text) = std::str::from_utf8(data) {
        let trimmed = text.trim_start();
        if trimmed.starts_with("#PROP") || trimmed.starts_with("#PTCH") {
            return Ok(text.to_string());
        }
    }

    let mut bin = reader::read(data)
        .map_err(|e| format!("Jade reader error: {}", e.0))?;

    let hashes = hash_manager::get_cached_hashes();
    let hashes_guard = hashes.read();
    unhasher::unhash(&mut bin, &hashes_guard);

    Ok(text_writer::write(&bin))
}

/// Convert ritobin text to binary .bin format.
/// Pipeline: text → parse → write binary
pub fn convert_text_to_bin(text: &str) -> Result<Vec<u8>, String> {
    let bin = text_reader::read(text)
        .map_err(|errors| text_reader::format_errors(&errors))?;

    writer::write(&bin)
        .map_err(|e| format!("Jade writer error: {}", e.0))
}
