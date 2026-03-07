//! Integration test for parsing a sample ritobin file.

use ltk_ritobin::{parse, write, ParseError};

const SAMPLE_RITOBIN: &str = r#"#PROP_text
type: string = "PROP"
version: u32 = 3
linked: list[string] = {
    "DATA/Characters/Test/Animations/Skin0.bin"
    "DATA/Characters/Test/Test.bin"
}
entries: map[hash,embed] = {
    "Characters/Test/Skins/Skin0" = SkinCharacterDataProperties {
        skinClassification: u32 = 1
        championSkinName: string = "TestBase"
        metaDataTags: string = "gender:male"
        loadscreen: embed = CensoredImage {
            image: string = "ASSETS/Characters/Test/Skins/Base/TestLoadScreen.tex"
        }
        skinAudioProperties: embed = skinAudioProperties {
            tagEventList: list[string] = {
                "Test"
            }
            bankUnits: list2[embed] = {
                BankUnit {
                    name: string = "Test_Base_SFX"
                    bankPath: list[string] = {
                        "ASSETS/Sounds/Test/audio.bnk"
                        "ASSETS/Sounds/Test/events.bnk"
                    }
                    events: list[string] = {
                        "Play_sfx_Test_Attack"
                        "Play_sfx_Test_Death"
                    }
                }
            }
        }
        iconCircle: option[string] = {
            "ASSETS/Characters/Test/Icons/Circle.tex"
        }
        iconSquare: option[string] = {}
    }
}
"#;

#[test]
fn test_parse_sample() {
    let file = parse(SAMPLE_RITOBIN).expect("Failed to parse sample");

    // Verify basic fields
    assert_eq!(file.file_type(), Some("PROP"));
    assert_eq!(file.version(), Some(3));

    // Verify dependencies
    let linked = file.linked();
    assert_eq!(linked.len(), 2);
    assert!(linked[0].contains("Animations"));

    // Verify objects
    let objects = file.objects();
    assert_eq!(objects.len(), 1);

    // Convert to BinTree
    let tree = file.to_bin_tree();
    assert_eq!(tree.version, 3);
    assert_eq!(tree.dependencies.len(), 2);
    assert_eq!(tree.objects.len(), 1);
}

#[test]
fn test_roundtrip() {
    let file = parse(SAMPLE_RITOBIN).expect("Failed to parse sample");
    let tree = file.to_bin_tree();

    // Write back to text
    let output = write(&tree).expect("Failed to write");

    // Parse again
    let file2 = parse(&output).expect("Failed to parse output");
    let tree2 = file2.to_bin_tree();

    // Verify structure is preserved
    assert_eq!(tree.version, tree2.version);
    assert_eq!(tree.dependencies.len(), tree2.dependencies.len());
    assert_eq!(tree.objects.len(), tree2.objects.len());
}

#[test]
fn test_parse_primitives() {
    let input = r#"
test_bool: bool = true
test_i8: i8 = -128
test_u8: u8 = 255
test_i16: i16 = -32768
test_u16: u16 = 65535
test_i32: i32 = -2147483648
test_u32: u32 = 4294967295
test_f32: f32 = 3.14159
test_vec2: vec2 = { 1.0, 2.0 }
test_vec3: vec3 = { 1.0, 2.0, 3.0 }
test_vec4: vec4 = { 1.0, 2.0, 3.0, 4.0 }
test_rgba: rgba = { 255, 128, 64, 255 }
test_string: string = "Hello, World!"
test_hash: hash = 0xdeadbeef
test_link: link = "path/to/object"
test_flag: flag = false
"#;

    let file = parse(input).expect("Failed to parse primitives");
    assert!(file.entries.contains_key("test_bool"));
    assert!(file.entries.contains_key("test_f32"));
    assert!(file.entries.contains_key("test_vec3"));
    assert!(file.entries.contains_key("test_rgba"));
    assert!(file.entries.contains_key("test_string"));
}

#[test]
fn test_parse_containers() {
    let input = r#"
test_list: list[string] = {
    "item1"
    "item2"
    "item3"
}
test_list2: list2[u32] = {
    1
    2
    3
}
test_option_some: option[string] = {
    "value"
}
test_option_none: option[string] = {}
test_map: map[hash,string] = {
    0x12345678 = "value1"
    0xdeadbeef = "value2"
}
"#;

    let file = parse(input).expect("Failed to parse containers");
    assert!(file.entries.contains_key("test_list"));
    assert!(file.entries.contains_key("test_list2"));
    assert!(file.entries.contains_key("test_option_some"));
    assert!(file.entries.contains_key("test_option_none"));
    assert!(file.entries.contains_key("test_map"));
}

#[test]
fn test_parse_nested_embeds() {
    let input = r#"
data: embed = OuterClass {
    name: string = "outer"
    inner: embed = InnerClass {
        value: u32 = 42
        nested: embed = DeepClass {
            deep_value: f32 = 1.5
        }
    }
}
"#;

    let file = parse(input).expect("Failed to parse nested embeds");
    assert!(file.entries.contains_key("data"));
}

#[test]
fn test_parse_pointer_null() {
    let input = r#"
null_ptr: pointer = null
"#;

    let file = parse(input).expect("Failed to parse null pointer");
    assert!(file.entries.contains_key("null_ptr"));
}

#[test]
fn test_parse_hex_property_names() {
    let input = r#"
entries: map[hash,embed] = {
    "Test/Path" = TestClass {
        0xcb13aff1: f32 = -40
        normalName: string = "test"
    }
}
"#;

    let file = parse(input).expect("Failed to parse hex property names");
    assert!(file.entries.contains_key("entries"));
}

#[test]
fn test_error_span_unknown_type() {
    let input = "test: badtype = 42";
    let err = parse(input).unwrap_err();

    // Verify we get an UnknownType error with correct span
    match err {
        ParseError::UnknownType {
            type_name, span, ..
        } => {
            assert_eq!(type_name, "badtype");
            // "badtype" starts at position 6 (after "test: ")
            assert_eq!(span.offset(), 6);
            assert_eq!(span.len(), 7); // "badtype" is 7 chars
        }
        _ => panic!("Expected UnknownType error, got: {:?}", err),
    }
}

#[test]
fn test_error_span_multiline() {
    let input = r#"
valid: string = "hello"
broken: unknowntype = 123
"#;
    let err = parse(input).unwrap_err();

    match err {
        ParseError::UnknownType {
            type_name, span, ..
        } => {
            assert_eq!(type_name, "unknowntype");
            // The span offset should point into the second line
            assert!(span.offset() > 20); // After first line
        }
        _ => panic!("Expected UnknownType error, got: {:?}", err),
    }
}

#[test]
fn test_error_is_miette_diagnostic() {
    use miette::Diagnostic;

    let input = "test: badtype = 42";
    let err = parse(input).unwrap_err();

    // ParseError implements Diagnostic
    let _code = err.code();
    let _labels = err.labels();
    let _source = err.source_code();
}
