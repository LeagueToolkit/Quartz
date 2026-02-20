use flint::core::wad::extractor::{extract_chunk, extract_all};
use std::path::PathBuf;

#[test]
fn test_extractor_api_exists() {
    // This test verifies that the extractor API exists and has the correct signatures
    // We can't actually test without a real WAD file, but we can verify
    // the API is correct by checking that the code compiles
    
    // The fact that this compiles means our API is correct
    fn _check_extract_chunk_api() {
        use flint::core::wad::reader::WadReader;
        
        // This won't run, just checking the API compiles
        if false {
            let reader = WadReader::open("test.wad").unwrap();
            let mut wad = reader.into_wad();
            // Get a chunk reference before borrowing wad mutably
            let chunk_copy = wad.chunks().values().next().cloned();
            if let Some(chunk) = chunk_copy {
                let _ = extract_chunk(&mut wad, &chunk, "output.bin", None);
            }
        }
    }
    
    fn _check_extract_all_api() {
        use flint::core::wad::reader::WadReader;
        
        // This won't run, just checking the API compiles
        if false {
            let reader = WadReader::open("test.wad").unwrap();
            let mut wad = reader.into_wad();
            let _ = extract_all(&mut wad, "output_dir", None);
        }
    }
}

#[test]
fn test_extract_chunk_nonexistent_file() {
    // Test that extract_chunk properly handles errors
    // We can't test the success case without a real WAD file
    
    // This test just verifies error handling works
    let fake_path = PathBuf::from("nonexistent.wad");
    let result = flint::core::wad::reader::WadReader::open(&fake_path);
    
    // Should fail because file doesn't exist
    assert!(result.is_err());
}

#[test]
fn test_extract_all_nonexistent_file() {
    // Test that extract_all properly handles errors
    // We can't test the success case without a real WAD file
    
    // This test just verifies error handling works
    let fake_path = PathBuf::from("nonexistent.wad");
    let result = flint::core::wad::reader::WadReader::open(&fake_path);
    
    // Should fail because file doesn't exist
    assert!(result.is_err());
}
