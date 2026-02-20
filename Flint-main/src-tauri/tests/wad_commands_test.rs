use flint::commands::wad::{read_wad, WadInfo, ChunkInfo, ExtractionResult};

#[tokio::test]
async fn test_read_wad_nonexistent_file() {
    // Test that read_wad returns an error for nonexistent files
    let fake_path = "nonexistent.wad".to_string();
    let result = read_wad(fake_path).await;
    
    // Should fail because file doesn't exist
    assert!(result.is_err());
    
    // Verify error message is meaningful
    if let Err(e) = result {
        assert!(e.contains("IO error") || e.contains("WAD error") || e.contains("No such file"));
    }
}

#[tokio::test]
async fn test_wad_info_serialization() {
    // Test that WadInfo can be serialized/deserialized
    let info = WadInfo {
        path: "test.wad".to_string(),
        chunk_count: 42,
    };
    
    let json = serde_json::to_string(&info).unwrap();
    let deserialized: WadInfo = serde_json::from_str(&json).unwrap();
    
    assert_eq!(deserialized.path, "test.wad");
    assert_eq!(deserialized.chunk_count, 42);
}

#[tokio::test]
async fn test_chunk_info_serialization() {
    // Test that ChunkInfo can be serialized/deserialized
    let info = ChunkInfo {
        path_hash: "1a2b3c4d5e6f7a8b".to_string(),
        resolved_path: Some("characters/aatrox/aatrox.bin".to_string()),
        compressed_size: 1024,
        uncompressed_size: 2048,
    };
    
    let json = serde_json::to_string(&info).unwrap();
    let deserialized: ChunkInfo = serde_json::from_str(&json).unwrap();
    
    assert_eq!(deserialized.path_hash, "1a2b3c4d5e6f7a8b");
    assert_eq!(deserialized.resolved_path, Some("characters/aatrox/aatrox.bin".to_string()));
    assert_eq!(deserialized.compressed_size, 1024);
    assert_eq!(deserialized.uncompressed_size, 2048);
}

#[tokio::test]
async fn test_extraction_result_serialization() {
    // Test that ExtractionResult can be serialized/deserialized
    let result = ExtractionResult {
        extracted_count: 10,
        failed_count: 2,
    };
    
    let json = serde_json::to_string(&result).unwrap();
    let deserialized: ExtractionResult = serde_json::from_str(&json).unwrap();
    
    assert_eq!(deserialized.extracted_count, 10);
    assert_eq!(deserialized.failed_count, 2);
}

#[test]
fn test_wad_commands_api_exists() {
    // This test verifies that all the required command functions exist
    // and have the correct signatures by checking that the code compiles
    
    // The fact that this compiles means our API is correct
    fn _check_api() {
        // These functions should exist and be async
        let _: std::pin::Pin<Box<dyn std::future::Future<Output = Result<WadInfo, String>>>> = 
            Box::pin(read_wad("test.wad".to_string()));
    }
}
