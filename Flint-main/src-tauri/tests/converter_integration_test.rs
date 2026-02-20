use flint::core::bin::converter::{bin_to_json, bin_to_text, json_to_bin, text_to_bin};
use flint::core::bin::parser::{Bin, BinValue};

#[test]
fn test_bin_to_text_to_bin_roundtrip() {
    // Create a simple bin structure
    let mut bin = Bin::new();
    bin.sections
        .insert("type".to_string(), BinValue::String("PROP".to_string()));
    bin.sections
        .insert("version".to_string(), BinValue::U32(1));
    bin.sections
        .insert("test_int".to_string(), BinValue::I32(42));
    bin.sections
        .insert("test_float".to_string(), BinValue::F32(3.14));
    bin.sections
        .insert("test_bool".to_string(), BinValue::Bool(true));

    // Convert to text
    let text = bin_to_text(&bin, None).expect("Failed to convert bin to text");
    println!("Text output:\n{}", text);

    // Convert back to bin
    let bin2 = text_to_bin(&text, None).expect("Failed to convert text to bin");

    // Verify key sections match
    assert_eq!(
        bin.sections.get("type"),
        bin2.sections.get("type"),
        "Type section mismatch"
    );
    assert_eq!(
        bin.sections.get("version"),
        bin2.sections.get("version"),
        "Version section mismatch"
    );
    assert_eq!(
        bin.sections.get("test_int"),
        bin2.sections.get("test_int"),
        "Int section mismatch"
    );
}

#[test]
fn test_bin_to_json_to_bin_roundtrip() {
    // Create a simple bin structure
    let mut bin = Bin::new();
    bin.sections
        .insert("type".to_string(), BinValue::String("PROP".to_string()));
    bin.sections
        .insert("version".to_string(), BinValue::U32(1));
    bin.sections
        .insert("test_string".to_string(), BinValue::String("hello".to_string()));

    // Convert to JSON
    let json = bin_to_json(&bin, None).expect("Failed to convert bin to JSON");
    println!("JSON output:\n{}", json);

    // Convert back to bin
    let bin2 = json_to_bin(&json, None).expect("Failed to convert JSON to bin");

    // Verify key sections match
    assert_eq!(
        bin.sections.get("type"),
        bin2.sections.get("type"),
        "Type section mismatch"
    );
    assert_eq!(
        bin.sections.get("version"),
        bin2.sections.get("version"),
        "Version section mismatch"
    );
}

#[test]
fn test_hash_value_conversion() {
    let mut bin = Bin::new();
    bin.sections.insert(
        "test_hash".to_string(),
        BinValue::Hash {
            value: 0x12345678,
            name: Some("test/path".to_string()),
        },
    );

    // Convert to text - should show the name
    let text = bin_to_text(&bin, None).expect("Failed to convert bin to text");
    assert!(text.contains("test/path"), "Text should contain hash name");

    // Convert to JSON - should show the name
    let json = bin_to_json(&bin, None).expect("Failed to convert bin to JSON");
    assert!(json.contains("test/path"), "JSON should contain hash name");
}
