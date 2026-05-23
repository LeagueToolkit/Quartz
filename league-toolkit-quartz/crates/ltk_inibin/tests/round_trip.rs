use ltk_inibin::{InibinFile, InibinFlags, InibinValue};

const FIXTURE: &[u8] = include_bytes!("fixtures/slime_environmentminion_idle.troybin");

#[test]
fn read_real_troybin() {
    let file = ltk_inibin::from_slice(FIXTURE).unwrap();
    assert_eq!(file.version(), 2);
    assert!(!file.is_empty());
    // Should have multiple sets
    assert!(file.sets().count() > 1);
}

#[test]
fn round_trip_binary() {
    let file = ltk_inibin::from_slice(FIXTURE).unwrap();
    let mut buf = Vec::new();
    ltk_inibin::write(&mut buf, &file).unwrap();
    let file2 = ltk_inibin::from_slice(&buf).unwrap();
    assert_eq!(file.len(), file2.len());
    assert_eq!(file.version(), file2.version());

    // All hashes and values should match
    for (hash, val) in file.iter() {
        let val2 = file2.get(*hash).expect("hash missing after round-trip");
        assert_eq!(val, val2, "value mismatch for hash {hash:#010X}");
    }
}

#[test]
fn round_trip_numbers() {
    let mut file = InibinFile::new();
    file.add_value(100, InibinValue::I32(42), InibinFlags::Int32List);
    file.add_value(200, InibinValue::F32(2.78), InibinFlags::Float32List);
    file.add_value(
        300,
        InibinValue::F32Vec3([1.0, 2.0, 3.0]),
        InibinFlags::Float32ListVec3,
    );

    let mut buf = Vec::new();
    ltk_inibin::write(&mut buf, &file).unwrap();
    let file2 = ltk_inibin::from_slice(&buf).unwrap();
    assert_eq!(file2.len(), 3);
    assert_eq!(file2.get(100), Some(&InibinValue::I32(42)));
    assert_eq!(file2.get(200), Some(&InibinValue::F32(2.78)));
    assert_eq!(file2.get(300), Some(&InibinValue::F32Vec3([1.0, 2.0, 3.0])));
}

#[test]
fn round_trip_strings() {
    let mut file = InibinFile::new();
    file.add_value(
        400,
        InibinValue::String("hello.dds".to_string()),
        InibinFlags::StringList,
    );
    file.add_value(
        500,
        InibinValue::String("world.png".to_string()),
        InibinFlags::StringList,
    );

    let mut buf = Vec::new();
    ltk_inibin::write(&mut buf, &file).unwrap();
    let file2 = ltk_inibin::from_slice(&buf).unwrap();
    assert_eq!(file2.len(), 2);
    assert_eq!(
        file2.get(400),
        Some(&InibinValue::String("hello.dds".to_string()))
    );
    assert_eq!(
        file2.get(500),
        Some(&InibinValue::String("world.png".to_string()))
    );
}

#[test]
fn round_trip_bools() {
    let mut file = InibinFile::new();
    file.add_value(600, InibinValue::Bool(true), InibinFlags::BitList);
    file.add_value(700, InibinValue::Bool(false), InibinFlags::BitList);
    file.add_value(800, InibinValue::Bool(true), InibinFlags::BitList);

    let mut buf = Vec::new();
    ltk_inibin::write(&mut buf, &file).unwrap();
    let file2 = ltk_inibin::from_slice(&buf).unwrap();
    assert_eq!(file2.len(), 3);
    assert_eq!(file2.get(600), Some(&InibinValue::Bool(true)));
    assert_eq!(file2.get(700), Some(&InibinValue::Bool(false)));
    assert_eq!(file2.get(800), Some(&InibinValue::Bool(true)));
}

#[test]
fn round_trip_mixed() {
    let mut file = InibinFile::new();
    file.add_value(10, InibinValue::I32(7), InibinFlags::Int32List);
    file.add_value(20, InibinValue::F32(1.5), InibinFlags::Float32List);
    file.add_value(30, InibinValue::Bool(true), InibinFlags::BitList);
    file.add_value(
        40,
        InibinValue::String("test.dds".to_string()),
        InibinFlags::StringList,
    );
    file.add_value(
        50,
        InibinValue::F32Vec2([0.5, 0.6]),
        InibinFlags::Float32ListVec2,
    );

    let mut buf = Vec::new();
    ltk_inibin::write(&mut buf, &file).unwrap();
    let file2 = ltk_inibin::from_slice(&buf).unwrap();
    assert_eq!(file2.len(), 5);
}

#[test]
fn bucket_api_get_set_remove() {
    let mut file = InibinFile::new();

    // Insert
    assert!(file
        .add_value(1, InibinValue::I32(10), InibinFlags::Int32List)
        .is_none());
    assert!(file.contains(1));
    assert_eq!(file.get(1), Some(&InibinValue::I32(10)));
    assert_eq!(file.len(), 1);

    // Overwrite returns old value
    let old = file.add_value(1, InibinValue::I32(20), InibinFlags::Int32List);
    assert_eq!(old, Some(InibinValue::I32(10)));
    assert_eq!(file.get(1), Some(&InibinValue::I32(20)));

    // get_from specific set
    assert_eq!(
        file.get_from(InibinFlags::Int32List, 1),
        Some(&InibinValue::I32(20))
    );
    assert_eq!(file.get_from(InibinFlags::Float32List, 1), None);

    // Remove
    let removed = file.remove(1);
    assert_eq!(removed, Some(InibinValue::I32(20)));
    assert!(!file.contains(1));
    assert_eq!(file.len(), 0);
}

#[test]
fn set_level_api() {
    let mut file = InibinFile::new();
    file.add_value(1, InibinValue::I32(10), InibinFlags::Int32List);
    file.add_value(2, InibinValue::I32(20), InibinFlags::Int32List);
    file.add_value(3, InibinValue::F32(3.0), InibinFlags::Float32List);

    // Access set
    let set = file.set(InibinFlags::Int32List).unwrap();
    assert_eq!(set.len(), 2);
    assert_eq!(set.flags(), InibinFlags::Int32List);

    // Mutate through set_mut
    let set = file.set_mut(InibinFlags::Int32List).unwrap();
    set.insert(4, InibinValue::I32(40));
    assert_eq!(file.len(), 4);
}

#[test]
fn empty_file() {
    let file = InibinFile::new();
    assert!(file.is_empty());
    assert_eq!(file.len(), 0);
    assert!(file.get(0).is_none());
    assert!(!file.contains(0));

    // Writing empty is fine
    let mut buf = Vec::new();
    ltk_inibin::write(&mut buf, &file).unwrap();
}
