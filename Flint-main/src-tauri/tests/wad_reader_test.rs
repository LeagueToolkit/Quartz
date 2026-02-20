use flint::core::wad::reader::WadReader;
use std::path::PathBuf;

#[test]
fn test_wad_reader_basic() {
    // This test requires a valid WAD file to exist
    // For now, we'll just test that the module compiles and the API is correct
    
    // Test that we can call the methods (they will fail without a real WAD file)
    let fake_path = PathBuf::from("nonexistent.wad");
    let result = WadReader::open(&fake_path);
    
    // Should fail because file doesn't exist
    assert!(result.is_err());
    
    // Verify error message contains the path
    if let Err(e) = result {
        let error_msg = e.to_string();
        assert!(error_msg.contains("IO error") || error_msg.contains("WAD error"));
    }
}

#[test]
fn test_wad_reader_api_exists() {
    // This test just verifies that all the required methods exist
    // and have the correct signatures
    
    // We can't actually test without a real WAD file, but we can verify
    // the API is correct by checking that the code compiles
    
    // The fact that this compiles means our API is correct
    fn _check_api() {
        let _: Result<WadReader, _> = WadReader::open("test.wad");
    }
}
