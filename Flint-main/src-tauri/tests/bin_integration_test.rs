use flint::core::bin::{read_bin, write_bin, Bin, BinType, BinValue, Field};

#[test]
fn test_all_primitive_types() {
    let mut bin = Bin::new();
    bin.sections.insert("type".to_string(), BinValue::String("PROP".to_string()));
    bin.sections.insert("version".to_string(), BinValue::U32(1));
    
    // Create an entry with various primitive types
    let fields = vec![
        Field { key: 1, key_str: None, value: BinValue::Bool(true) },
        Field { key: 2, key_str: None, value: BinValue::I8(-42) },
        Field { key: 3, key_str: None, value: BinValue::U8(255) },
        Field { key: 4, key_str: None, value: BinValue::I16(-1000) },
        Field { key: 5, key_str: None, value: BinValue::U16(65000) },
        Field { key: 6, key_str: None, value: BinValue::I32(-100000) },
        Field { key: 7, key_str: None, value: BinValue::U32(4000000000) },
        Field { key: 8, key_str: None, value: BinValue::F32(3.14159) },
        Field { key: 9, key_str: None, value: BinValue::Vec2([1.0, 2.0]) },
        Field { key: 10, key_str: None, value: BinValue::Vec3([1.0, 2.0, 3.0]) },
        Field { key: 11, key_str: None, value: BinValue::Vec4([1.0, 2.0, 3.0, 4.0]) },
        Field { key: 12, key_str: None, value: BinValue::Rgba([255, 128, 64, 32]) },
        Field { key: 13, key_str: None, value: BinValue::String("test".to_string()) },
        Field { key: 14, key_str: None, value: BinValue::Hash { value: 0x12345678, name: None } },
    ];
    
    let entry = BinValue::Embed {
        name: 0xABCDEF,
        name_str: None,
        items: fields,
    };
    
    bin.sections.insert(
        "entries".to_string(),
        BinValue::Map {
            key_type: BinType::Hash,
            value_type: BinType::Embed,
            items: vec![(BinValue::Hash { value: 0x11111111, name: None }, entry)],
        },
    );
    
    // Write and read back
    let data = write_bin(&bin).expect("Failed to write bin");
    let bin2 = read_bin(&data).expect("Failed to read bin");
    
    // Verify structure is preserved
    assert_eq!(bin.sections.get("type"), bin2.sections.get("type"));
    assert_eq!(bin.sections.get("version"), bin2.sections.get("version"));
    
    if let (Some(BinValue::Map { items: items1, .. }), Some(BinValue::Map { items: items2, .. })) = 
        (bin.sections.get("entries"), bin2.sections.get("entries")) {
        assert_eq!(items1.len(), items2.len());
    } else {
        panic!("Entries not found or not a map");
    }
}

#[test]
fn test_list_type() {
    let mut bin = Bin::new();
    bin.sections.insert("type".to_string(), BinValue::String("PROP".to_string()));
    bin.sections.insert("version".to_string(), BinValue::U32(1));
    
    // Test List
    let list_value = BinValue::List {
        value_type: BinType::U32,
        items: vec![BinValue::U32(1), BinValue::U32(2), BinValue::U32(3)],
    };
    
    let fields = vec![
        Field { key: 1, key_str: None, value: list_value },
    ];
    
    let entry = BinValue::Embed {
        name: 0xABCDEF,
        name_str: None,
        items: fields,
    };
    
    bin.sections.insert(
        "entries".to_string(),
        BinValue::Map {
            key_type: BinType::Hash,
            value_type: BinType::Embed,
            items: vec![(BinValue::Hash { value: 0x11111111, name: None }, entry)],
        },
    );
    
    // Write and read back
    let data = write_bin(&bin).expect("Failed to write bin");
    let bin2 = read_bin(&data).expect("Failed to read bin");
    
    // Verify
    assert_eq!(bin.sections.get("type"), bin2.sections.get("type"));
    assert_eq!(bin.sections.get("version"), bin2.sections.get("version"));
}

#[test]
fn test_option_type() {
    let mut bin = Bin::new();
    bin.sections.insert("type".to_string(), BinValue::String("PROP".to_string()));
    bin.sections.insert("version".to_string(), BinValue::U32(1));
    
    // Test Option with Some
    let option_some = BinValue::Option {
        value_type: BinType::String,
        item: Some(Box::new(BinValue::String("test".to_string()))),
    };
    
    // Test Option with None
    let option_none = BinValue::Option {
        value_type: BinType::U32,
        item: None,
    };
    
    let fields = vec![
        Field { key: 1, key_str: None, value: option_some },
        Field { key: 2, key_str: None, value: option_none },
    ];
    
    let entry = BinValue::Embed {
        name: 0xABCDEF,
        name_str: None,
        items: fields,
    };
    
    bin.sections.insert(
        "entries".to_string(),
        BinValue::Map {
            key_type: BinType::Hash,
            value_type: BinType::Embed,
            items: vec![(BinValue::Hash { value: 0x11111111, name: None }, entry)],
        },
    );
    
    // Write and read back
    let data = write_bin(&bin).expect("Failed to write bin");
    let bin2 = read_bin(&data).expect("Failed to read bin");
    
    // Verify
    assert_eq!(bin.sections.get("type"), bin2.sections.get("type"));
    assert_eq!(bin.sections.get("version"), bin2.sections.get("version"));
}

#[test]
fn test_map_type() {
    let mut bin = Bin::new();
    bin.sections.insert("type".to_string(), BinValue::String("PROP".to_string()));
    bin.sections.insert("version".to_string(), BinValue::U32(1));
    
    // Test Map
    let map_value = BinValue::Map {
        key_type: BinType::U32,
        value_type: BinType::String,
        items: vec![
            (BinValue::U32(1), BinValue::String("one".to_string())),
            (BinValue::U32(2), BinValue::String("two".to_string())),
        ],
    };
    
    let fields = vec![
        Field { key: 1, key_str: None, value: map_value },
    ];
    
    let entry = BinValue::Embed {
        name: 0xABCDEF,
        name_str: None,
        items: fields,
    };
    
    bin.sections.insert(
        "entries".to_string(),
        BinValue::Map {
            key_type: BinType::Hash,
            value_type: BinType::Embed,
            items: vec![(BinValue::Hash { value: 0x11111111, name: None }, entry)],
        },
    );
    
    // Write and read back
    let data = write_bin(&bin).expect("Failed to write bin");
    
    // Debug: print the hex dump of the data
    println!("Binary data length: {}", data.len());
    for (i, chunk) in data.chunks(16).enumerate() {
        print!("{:04x}: ", i * 16);
        for byte in chunk {
            print!("{:02x} ", byte);
        }
        println!();
    }
    
    let bin2 = read_bin(&data).expect("Failed to read bin");
    
    // Verify
    assert_eq!(bin.sections.get("type"), bin2.sections.get("type"));
    assert_eq!(bin.sections.get("version"), bin2.sections.get("version"));
}

#[test]
fn test_nested_structures() {
    let mut bin = Bin::new();
    bin.sections.insert("type".to_string(), BinValue::String("PROP".to_string()));
    bin.sections.insert("version".to_string(), BinValue::U32(1));
    
    // Test Pointer
    let pointer_value = BinValue::Pointer {
        name: 0x12345,
        name_str: None,
        items: vec![
            Field { key: 1, key_str: None, value: BinValue::U32(100) },
            Field { key: 2, key_str: None, value: BinValue::String("nested".to_string()) },
        ],
    };
    
    // Test Embed
    let embed_value = BinValue::Embed {
        name: 0x67890,
        name_str: None,
        items: vec![
            Field { key: 1, key_str: None, value: BinValue::F32(1.5) },
            Field { key: 2, key_str: None, value: BinValue::Bool(false) },
        ],
    };
    
    let fields = vec![
        Field { key: 1, key_str: None, value: pointer_value },
        Field { key: 2, key_str: None, value: embed_value },
        Field { key: 3, key_str: None, value: BinValue::Link { value: 0xABCD, name: None } },
    ];
    
    let entry = BinValue::Embed {
        name: 0xABCDEF,
        name_str: None,
        items: fields,
    };
    
    bin.sections.insert(
        "entries".to_string(),
        BinValue::Map {
            key_type: BinType::Hash,
            value_type: BinType::Embed,
            items: vec![(BinValue::Hash { value: 0x11111111, name: None }, entry)],
        },
    );
    
    // Write and read back
    let data = write_bin(&bin).expect("Failed to write bin");
    let bin2 = read_bin(&data).expect("Failed to read bin");
    
    // Verify
    assert_eq!(bin.sections.get("type"), bin2.sections.get("type"));
    assert_eq!(bin.sections.get("version"), bin2.sections.get("version"));
}
