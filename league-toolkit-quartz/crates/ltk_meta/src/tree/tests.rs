//! Tests for Bin reading and writing

use std::io::Cursor;

use glam::{Mat4, Vec2, Vec3, Vec4};
use indexmap::IndexMap;
use ltk_primitives::Color;

use crate::property::{values, NoMeta};
use crate::property::{BinProperty, Kind, PropertyValueEnum};
use crate::{Bin, BinObject as Object};

/// Helper to roundtrip a property value through write/read
fn roundtrip_property(prop: &BinProperty) -> BinProperty {
    let mut buffer = Vec::new();
    let mut cursor = Cursor::new(&mut buffer);
    prop.to_writer(&mut cursor).expect("write failed");

    cursor.set_position(0);
    BinProperty::from_reader(&mut cursor, false).expect("read failed")
}

/// Helper to roundtrip a Bin through write/read
fn roundtrip_tree(tree: &Bin) -> Bin {
    let mut buffer = Vec::new();
    let mut cursor = Cursor::new(&mut buffer);
    tree.to_writer(&mut cursor).expect("write failed");

    cursor.set_position(0);
    Bin::from_reader(&mut cursor).expect("read failed")
}

/// Helper to create a BinProperty with a given name hash and value
fn make_prop(name_hash: u32, value: PropertyValueEnum) -> BinProperty {
    BinProperty { name_hash, value }
}

// =============================================================================
// Primitive Property Tests
// =============================================================================

#[test]
fn test_none_property_roundtrip() {
    let prop = make_prop(0x1234, PropertyValueEnum::None(values::None::default()));
    let result = roundtrip_property(&prop);
    assert_eq!(prop, result);
}

#[test]
fn test_bool_property_roundtrip() {
    for value in [true, false] {
        let prop = make_prop(0x1234, PropertyValueEnum::Bool(values::Bool::new(value)));
        let result = roundtrip_property(&prop);
        assert_eq!(prop, result);
    }
}

#[test]
fn test_bitbool_property_roundtrip() {
    for value in [true, false] {
        let prop = make_prop(
            0x1234,
            PropertyValueEnum::BitBool(values::BitBool::new(value)),
        );
        let result = roundtrip_property(&prop);
        assert_eq!(prop, result);
    }
}

#[test]
fn test_i8_property_roundtrip() {
    for value in [i8::MIN, -1, 0, 1, i8::MAX] {
        let prop = make_prop(0x1234, PropertyValueEnum::I8(values::I8::new(value)));
        let result = roundtrip_property(&prop);
        assert_eq!(prop, result);
    }
}

#[test]
fn test_u8_property_roundtrip() {
    for value in [u8::MIN, 1, 128, u8::MAX] {
        let prop = make_prop(0x1234, PropertyValueEnum::U8(values::U8::new(value)));
        let result = roundtrip_property(&prop);
        assert_eq!(prop, result);
    }
}

#[test]
fn test_i16_property_roundtrip() {
    for value in [i16::MIN, -1, 0, 1, i16::MAX] {
        let prop = make_prop(0x1234, PropertyValueEnum::I16(values::I16::new(value)));
        let result = roundtrip_property(&prop);
        assert_eq!(prop, result);
    }
}

#[test]
fn test_u16_property_roundtrip() {
    for value in [u16::MIN, 1, 32768, u16::MAX] {
        let prop = make_prop(0x1234, PropertyValueEnum::U16(values::U16::new(value)));
        let result = roundtrip_property(&prop);
        assert_eq!(prop, result);
    }
}

#[test]
fn test_i32_property_roundtrip() {
    for value in [i32::MIN, -1, 0, 1, i32::MAX] {
        let prop = make_prop(0x1234, PropertyValueEnum::I32(values::I32::new(value)));
        let result = roundtrip_property(&prop);
        assert_eq!(prop, result);
    }
}

#[test]
fn test_u32_property_roundtrip() {
    for value in [u32::MIN, 1, 0x8000_0000, u32::MAX] {
        let prop = make_prop(0x1234, PropertyValueEnum::U32(values::U32::new(value)));
        let result = roundtrip_property(&prop);
        assert_eq!(prop, result);
    }
}

#[test]
fn test_i64_property_roundtrip() {
    for value in [i64::MIN, -1, 0, 1, i64::MAX] {
        let prop = make_prop(0x1234, PropertyValueEnum::I64(values::I64::new(value)));
        let result = roundtrip_property(&prop);
        assert_eq!(prop, result);
    }
}

#[test]
fn test_u64_property_roundtrip() {
    for value in [u64::MIN, 1, 0x8000_0000_0000_0000, u64::MAX] {
        let prop = make_prop(0x1234, PropertyValueEnum::U64(values::U64::new(value)));
        let result = roundtrip_property(&prop);
        assert_eq!(prop, result);
    }
}

#[test]
fn test_f32_property_roundtrip() {
    for value in [0.0, 1.0, -1.0, f32::MIN, f32::MAX, std::f32::consts::PI] {
        let prop = make_prop(0x1234, PropertyValueEnum::F32(values::F32::new(value)));
        let result = roundtrip_property(&prop);
        assert_eq!(prop, result);
    }
}

#[test]
fn test_vector2_property_roundtrip() {
    let values = [
        Vec2::ZERO,
        Vec2::ONE,
        Vec2::new(-1.0, 2.5),
        Vec2::new(f32::MIN, f32::MAX),
    ];
    for value in values {
        let prop = make_prop(
            0x1234,
            PropertyValueEnum::Vector2(values::Vector2::new(value)),
        );
        let result = roundtrip_property(&prop);
        assert_eq!(prop, result);
    }
}

#[test]
fn test_vector3_property_roundtrip() {
    let values = [
        Vec3::ZERO,
        Vec3::ONE,
        Vec3::new(-1.0, 2.5, std::f32::consts::PI),
        Vec3::new(f32::MIN, 0.0, f32::MAX),
    ];
    for value in values {
        let prop = make_prop(
            0x1234,
            PropertyValueEnum::Vector3(values::Vector3::new(value)),
        );
        let result = roundtrip_property(&prop);
        assert_eq!(prop, result);
    }
}

#[test]
fn test_vector4_property_roundtrip() {
    let values = [
        Vec4::ZERO,
        Vec4::ONE,
        Vec4::new(-1.0, 2.5, std::f32::consts::PI, 0.0),
        Vec4::new(f32::MIN, 0.0, 0.0, f32::MAX),
    ];
    for value in values {
        let prop = make_prop(
            0x1234,
            PropertyValueEnum::Vector4(values::Vector4::new(value)),
        );
        let result = roundtrip_property(&prop);
        assert_eq!(prop, result);
    }
}

#[test]
fn test_matrix44_property_roundtrip() {
    let values = [
        Mat4::IDENTITY,
        Mat4::ZERO,
        Mat4::from_cols(
            Vec4::new(1.0, 2.0, 3.0, 4.0),
            Vec4::new(5.0, 6.0, 7.0, 8.0),
            Vec4::new(9.0, 10.0, 11.0, 12.0),
            Vec4::new(13.0, 14.0, 15.0, 16.0),
        ),
    ];
    for value in values {
        let prop = make_prop(
            0x1234,
            PropertyValueEnum::Matrix44(values::Matrix44::new(value)),
        );
        let result = roundtrip_property(&prop);
        assert_eq!(prop, result);
    }
}

#[test]
fn test_color_property_roundtrip() {
    let values = [
        Color::new(0, 0, 0, 0),
        Color::new(255, 255, 255, 255),
        Color::new(128, 64, 32, 16),
        Color::new(0, 128, 255, 100),
    ];
    for value in values {
        let prop = make_prop(0x1234, PropertyValueEnum::Color(values::Color::new(value)));
        let result = roundtrip_property(&prop);
        assert_eq!(prop, result);
    }
}

#[test]
fn test_string_property_roundtrip() {
    let values = [
        String::new(),
        "hello".to_string(),
        "Hello, World! 🌍".to_string(),
        "a".repeat(1000),
    ];
    for value in values {
        let prop = make_prop(
            0x1234,
            PropertyValueEnum::String(values::String::new(value)),
        );
        let result = roundtrip_property(&prop);
        assert_eq!(prop, result);
    }
}

#[test]
fn test_hash_property_roundtrip() {
    for value in [0u32, 1, 0xDEADBEEF, u32::MAX] {
        let prop = make_prop(0x1234, PropertyValueEnum::Hash(values::Hash::new(value)));
        let result = roundtrip_property(&prop);
        assert_eq!(prop, result);
    }
}

#[test]
fn test_wad_chunk_link_property_roundtrip() {
    for value in [0u64, 1, 0xDEAD_BEEF_CAFE_BABE, u64::MAX] {
        let prop = make_prop(
            0x1234,
            PropertyValueEnum::WadChunkLink(values::WadChunkLink::new(value)),
        );
        let result = roundtrip_property(&prop);
        assert_eq!(prop, result);
    }
}

#[test]
fn test_object_link_property_roundtrip() {
    for value in [0u32, 1, 0xDEADBEEF, u32::MAX] {
        let prop = make_prop(
            0x1234,
            PropertyValueEnum::ObjectLink(values::ObjectLink::new(value)),
        );
        let result = roundtrip_property(&prop);
        assert_eq!(prop, result);
    }
}

// =============================================================================
// Container Property Tests
// =============================================================================

#[test]
fn test_container_empty_roundtrip() {
    let prop = make_prop(
        0x1234,
        PropertyValueEnum::Container(values::Container::empty::<values::I32>()),
    );
    let result = roundtrip_property(&prop);
    assert_eq!(prop, result);
}

#[test]
fn test_container_with_primitives_roundtrip() {
    let prop = make_prop(
        0x1234,
        PropertyValueEnum::Container(values::Container::from(vec![
            values::I32::new(1),
            values::I32::new(2),
            values::I32::new(3),
        ])),
    );
    let result = roundtrip_property(&prop);
    assert_eq!(prop, result);
}

#[test]
fn test_container_with_strings_roundtrip() {
    let prop = make_prop(
        0x1234,
        PropertyValueEnum::Container(values::Container::from(vec![
            values::String::from("hello"),
            values::String::from("world"),
        ])),
    );
    let result = roundtrip_property(&prop);
    assert_eq!(prop, result);
}

#[test]
fn test_container_with_structs_roundtrip() {
    let mut properties = IndexMap::new();
    properties.insert(
        0xAAAA,
        BinProperty {
            name_hash: 0xAAAA,
            value: PropertyValueEnum::I32(values::I32::new(42)),
        },
    );

    let prop = make_prop(
        0x1234,
        PropertyValueEnum::Container(values::Container::from(vec![values::Struct {
            class_hash: 0xBBBB,
            properties,
            meta: NoMeta,
        }])),
    );
    let result = roundtrip_property(&prop);
    assert_eq!(prop, result);
}

#[test]
fn test_unordered_container_roundtrip() {
    let prop = make_prop(
        0x1234,
        PropertyValueEnum::UnorderedContainer(values::UnorderedContainer(values::Container::from(
            vec![values::U32::new(100), values::U32::new(200)],
        ))),
    );
    let result = roundtrip_property(&prop);
    assert_eq!(prop, result);
}

// =============================================================================
// Optional Property Tests
// =============================================================================

#[test]
fn test_optional_none_roundtrip() {
    let prop = make_prop(
        0x1234,
        PropertyValueEnum::Optional(values::Optional::empty(Kind::I32).unwrap()),
    );
    let result = roundtrip_property(&prop);
    assert_eq!(prop, result);
}

#[test]
fn test_optional_some_primitive_roundtrip() {
    let prop = make_prop(
        0x1234,
        PropertyValueEnum::Optional(values::Optional::from(values::I32::new(42))),
    );
    let result = roundtrip_property(&prop);
    assert_eq!(prop, result);
}

#[test]
fn test_optional_some_string_roundtrip() {
    let prop = make_prop(
        0x1234,
        PropertyValueEnum::Optional(values::Optional::from(values::String::from(
            "optional value",
        ))),
    );
    let result = roundtrip_property(&prop);
    assert_eq!(prop, result);
}

#[test]
fn test_optional_some_struct_roundtrip() {
    let mut properties = IndexMap::new();
    properties.insert(
        0xAAAA,
        BinProperty {
            name_hash: 0xAAAA,
            value: PropertyValueEnum::Bool(values::Bool::from(true)),
        },
    );

    let prop = make_prop(
        0x1234,
        PropertyValueEnum::Optional(values::Optional::from(values::Struct {
            class_hash: 0xCCCC,
            properties,
            meta: NoMeta,
        })),
    );
    let result = roundtrip_property(&prop);
    assert_eq!(prop, result);
}

// =============================================================================
// Map Property Tests
// =============================================================================

#[test]
fn test_map_empty_roundtrip() {
    let prop = make_prop(
        0x1234,
        PropertyValueEnum::Map(values::Map::empty(Kind::U32, Kind::String)),
    );
    let result = roundtrip_property(&prop);
    assert_eq!(prop, result);
}

#[test]
fn test_map_u32_to_string_roundtrip() {
    let entries = vec![
        (
            PropertyValueEnum::U32(values::U32::new(1)),
            PropertyValueEnum::String(values::String::from("one")),
        ),
        (
            PropertyValueEnum::U32(values::U32::new(2)),
            PropertyValueEnum::String(values::String::from("two")),
        ),
    ];

    let prop = make_prop(
        0x1234,
        PropertyValueEnum::Map(values::Map::new(Kind::U32, Kind::String, entries).unwrap()),
    );
    let result = roundtrip_property(&prop);
    assert_eq!(prop, result);
}

#[test]
fn test_map_hash_to_struct_roundtrip() {
    let mut struct_props = IndexMap::new();
    struct_props.insert(
        0x1111,
        BinProperty {
            name_hash: 0x1111,
            value: PropertyValueEnum::F32(values::F32::new(std::f32::consts::PI)),
        },
    );

    let entries = vec![(
        PropertyValueEnum::Hash(values::Hash::new(0xDEAD)),
        PropertyValueEnum::Struct(values::Struct {
            class_hash: 0xBEEF,
            properties: struct_props,
            meta: NoMeta,
        }),
    )];

    let prop = make_prop(
        0x1234,
        PropertyValueEnum::Map(values::Map::new(Kind::Hash, Kind::Struct, entries).unwrap()),
    );
    let result = roundtrip_property(&prop);
    assert_eq!(prop, result);
}

// =============================================================================
// Struct Property Tests
// =============================================================================

#[test]
fn test_struct_empty_roundtrip() {
    let prop = make_prop(
        0x1234,
        PropertyValueEnum::Struct(values::Struct {
            class_hash: 0,
            properties: IndexMap::new(),
            meta: NoMeta,
        }),
    );
    let result = roundtrip_property(&prop);
    assert_eq!(prop, result);
}

#[test]
fn test_struct_with_properties_roundtrip() {
    let mut properties = IndexMap::new();
    properties.insert(
        0x1111,
        BinProperty {
            name_hash: 0x1111,
            value: PropertyValueEnum::I32(values::I32::new(42)),
        },
    );
    properties.insert(
        0x2222,
        BinProperty {
            name_hash: 0x2222,
            value: PropertyValueEnum::String(values::String::from("test")),
        },
    );
    properties.insert(
        0x3333,
        BinProperty {
            name_hash: 0x3333,
            value: PropertyValueEnum::Bool(values::Bool::new(true)),
        },
    );

    let prop = make_prop(
        0x1234,
        PropertyValueEnum::Struct(values::Struct {
            class_hash: 0xABCD,
            properties,
            meta: NoMeta,
        }),
    );
    let result = roundtrip_property(&prop);
    assert_eq!(prop, result);
}

#[test]
fn test_struct_nested_roundtrip() {
    let mut inner_props = IndexMap::new();
    inner_props.insert(
        0xAAAA,
        BinProperty {
            name_hash: 0xAAAA,
            value: PropertyValueEnum::F32(values::F32::new(1.5)),
        },
    );

    let mut outer_props = IndexMap::new();
    outer_props.insert(
        0xBBBB,
        BinProperty {
            name_hash: 0xBBBB,
            value: PropertyValueEnum::Struct(values::Struct {
                class_hash: 0x1111,
                properties: inner_props,
                meta: NoMeta,
            }),
        },
    );

    let prop = make_prop(
        0x1234,
        PropertyValueEnum::Struct(values::Struct {
            class_hash: 0x2222,
            properties: outer_props,
            meta: NoMeta,
        }),
    );
    let result = roundtrip_property(&prop);
    assert_eq!(prop, result);
}

// =============================================================================
// Embedded Property Tests
// =============================================================================

#[test]
fn test_embedded_roundtrip() {
    let mut properties = IndexMap::new();
    properties.insert(
        0x1111,
        BinProperty {
            name_hash: 0x1111,
            value: PropertyValueEnum::Vector3(values::Vector3::new(Vec3::new(1.0, 2.0, 3.0))),
        },
    );

    let prop = make_prop(
        0x1234,
        PropertyValueEnum::Embedded(values::Embedded(values::Struct {
            class_hash: 0xEEEE,
            properties,
            meta: NoMeta,
        })),
    );
    let result = roundtrip_property(&prop);
    assert_eq!(prop, result);
}

// =============================================================================
// Object Tests
// =============================================================================

#[test]
fn test_bin_tree_object_empty_roundtrip() {
    let obj = Object {
        path_hash: 0x1234,
        class_hash: 0x5678,
        properties: IndexMap::new(),
    };

    let mut buffer = Vec::new();
    let mut cursor = Cursor::new(&mut buffer);
    obj.to_writer(&mut cursor).expect("write failed");

    cursor.set_position(0);
    let result = Object::from_reader(&mut cursor, obj.class_hash, false).expect("read failed");
    assert_eq!(obj, result);
}

#[test]
fn test_bin_tree_object_with_properties_roundtrip() {
    let mut properties = IndexMap::new();
    properties.insert(
        0xAAAA,
        BinProperty {
            name_hash: 0xAAAA,
            value: PropertyValueEnum::I32(values::I32::new(100)),
        },
    );
    properties.insert(
        0xBBBB,
        BinProperty {
            name_hash: 0xBBBB,
            value: PropertyValueEnum::String(values::String::from("object property")),
        },
    );

    let obj = Object {
        path_hash: 0x1234,
        class_hash: 0x5678,
        properties,
    };

    let mut buffer = Vec::new();
    let mut cursor = Cursor::new(&mut buffer);
    obj.to_writer(&mut cursor).expect("write failed");

    cursor.set_position(0);
    let result = Object::from_reader(&mut cursor, obj.class_hash, false).expect("read failed");
    assert_eq!(obj, result);
}

// =============================================================================
// Bin Tests
// =============================================================================

#[test]
fn test_bin_tree_empty_roundtrip() {
    let tree = Bin::new([], std::iter::empty::<String>());
    let result = roundtrip_tree(&tree);
    assert_eq!(tree, result);
}

#[test]
fn test_bin_tree_with_dependencies_roundtrip() {
    let tree = Bin::new(
        [],
        ["dependency1.bin".to_string(), "dependency2.bin".to_string()],
    );
    let result = roundtrip_tree(&tree);
    assert_eq!(tree, result);
}

#[test]
fn test_bin_tree_with_objects_roundtrip() {
    let mut properties = IndexMap::new();
    properties.insert(
        0xAAAA,
        BinProperty {
            name_hash: 0xAAAA,
            value: PropertyValueEnum::I32(values::I32::new(42)),
        },
    );

    let obj = Object {
        path_hash: 0x1234,
        class_hash: 0x5678,
        properties,
    };

    let tree = Bin::new([obj], std::iter::empty::<String>());
    let result = roundtrip_tree(&tree);
    assert_eq!(tree, result);
}

#[test]
fn test_bin_tree_complex_roundtrip() {
    // Create a complex tree with multiple objects and various property types
    let mut obj1_props = IndexMap::new();
    obj1_props.insert(
        0x1111,
        BinProperty {
            name_hash: 0x1111,
            value: PropertyValueEnum::Bool(values::Bool::new(true)),
        },
    );
    obj1_props.insert(
        0x2222,
        BinProperty {
            name_hash: 0x2222,
            value: PropertyValueEnum::String(values::String::from("test string")),
        },
    );
    obj1_props.insert(
        0x3333,
        BinProperty {
            name_hash: 0x3333,
            value: PropertyValueEnum::Container(values::Container::from(vec![
                values::I32::new(1),
                values::I32::new(2),
                values::I32::new(3),
            ])),
        },
    );

    let obj1 = Object {
        path_hash: 0xAAAA,
        class_hash: 0xBBBB,
        properties: obj1_props,
    };

    let mut obj2_props = IndexMap::new();
    obj2_props.insert(
        0x4444,
        BinProperty {
            name_hash: 0x4444,
            value: PropertyValueEnum::Vector3(values::Vector3::new(Vec3::new(1.0, 2.0, 3.0))),
        },
    );
    obj2_props.insert(
        0x5555,
        BinProperty {
            name_hash: 0x5555,
            value: PropertyValueEnum::Optional(values::F32::new(std::f32::consts::PI).into()),
        },
    );

    let obj2 = Object {
        path_hash: 0xCCCC,
        class_hash: 0xDDDD,
        properties: obj2_props,
    };

    let tree = Bin::new(
        [obj1, obj2],
        ["dep1.bin".to_string(), "dep2.bin".to_string()],
    );
    let result = roundtrip_tree(&tree);
    assert_eq!(tree, result);
}

// =============================================================================
// Property Kind Tests
// =============================================================================

#[test]
fn test_property_kind_roundtrip() {
    use crate::traits::{ReaderExt, WriterExt};

    let kinds = [
        Kind::None,
        Kind::Bool,
        Kind::I8,
        Kind::U8,
        Kind::I16,
        Kind::U16,
        Kind::I32,
        Kind::U32,
        Kind::I64,
        Kind::U64,
        Kind::F32,
        Kind::Vector2,
        Kind::Vector3,
        Kind::Vector4,
        Kind::Matrix44,
        Kind::Color,
        Kind::String,
        Kind::Hash,
        Kind::WadChunkLink,
        Kind::Container,
        Kind::UnorderedContainer,
        Kind::Struct,
        Kind::Embedded,
        Kind::ObjectLink,
        Kind::Optional,
        Kind::Map,
        Kind::BitBool,
    ];

    for kind in kinds {
        let mut buffer = Vec::new();
        let mut cursor = Cursor::new(&mut buffer);
        cursor.write_property_kind(kind).expect("write failed");

        cursor.set_position(0);
        let result = cursor.read_property_kind(false).expect("read failed");
        assert_eq!(kind, result, "Kind mismatch for {:?}", kind);
    }
}

// =============================================================================
// Edge Case Tests
// =============================================================================

#[test]
fn test_deeply_nested_struct() {
    // Create a deeply nested struct to test recursion handling
    let mut deepest_props = IndexMap::new();
    deepest_props.insert(
        0x1111,
        BinProperty {
            name_hash: 0x1111,
            value: PropertyValueEnum::I32(values::I32::new(42)),
        },
    );

    let mut level2_props = IndexMap::new();
    level2_props.insert(
        0x2222,
        BinProperty {
            name_hash: 0x2222,
            value: PropertyValueEnum::Struct(values::Struct {
                class_hash: 0xAAAA,
                properties: deepest_props,
                meta: NoMeta,
            }),
        },
    );

    let mut level1_props = IndexMap::new();
    level1_props.insert(
        0x3333,
        BinProperty {
            name_hash: 0x3333,
            value: PropertyValueEnum::Struct(values::Struct {
                class_hash: 0xBBBB,
                properties: level2_props,
                meta: NoMeta,
            }),
        },
    );

    let prop = make_prop(
        0x4444,
        PropertyValueEnum::Struct(values::Struct {
            class_hash: 0xCCCC,
            properties: level1_props,
            meta: NoMeta,
        }),
    );
    let result = roundtrip_property(&prop);
    assert_eq!(prop, result);
}

#[test]
fn test_container_with_embedded_roundtrip() {
    let mut embedded_props = IndexMap::new();
    embedded_props.insert(
        0x1111,
        BinProperty {
            name_hash: 0x1111,
            value: PropertyValueEnum::U32(values::U32::new(999)),
        },
    );

    let prop = make_prop(
        0x1234,
        PropertyValueEnum::Container(
            values::Container::try_from(vec![
                PropertyValueEnum::Embedded(values::Embedded(values::Struct {
                    class_hash: 0xAAAA,
                    properties: embedded_props.clone(),
                    meta: NoMeta,
                })),
                PropertyValueEnum::Embedded(values::Embedded(values::Struct {
                    class_hash: 0xBBBB,
                    properties: embedded_props,
                    meta: NoMeta,
                })),
            ])
            .unwrap(),
        ),
    );
    let result = roundtrip_property(&prop);
    assert_eq!(prop, result);
}

#[test]
fn test_all_primitive_kinds_in_container() {
    // Test that all primitive kinds can be stored in containers
    let test_cases: Vec<(Kind, PropertyValueEnum)> = vec![
        (Kind::Bool, PropertyValueEnum::Bool(values::Bool::new(true))),
        (Kind::I8, PropertyValueEnum::I8(values::I8::new(-1))),
        (Kind::U8, PropertyValueEnum::U8(values::U8::new(1))),
        (Kind::I16, PropertyValueEnum::I16(values::I16::new(-100))),
        (Kind::U16, PropertyValueEnum::U16(values::U16::new(100))),
        (Kind::I32, PropertyValueEnum::I32(values::I32::new(-1000))),
        (Kind::U32, PropertyValueEnum::U32(values::U32::new(1000))),
        (Kind::I64, PropertyValueEnum::I64(values::I64::new(-10000))),
        (Kind::U64, PropertyValueEnum::U64(values::U64::new(10000))),
        (Kind::F32, PropertyValueEnum::F32(values::F32::new(1.5))),
        (
            Kind::Vector2,
            PropertyValueEnum::Vector2(values::Vector2::new(Vec2::ONE)),
        ),
        (
            Kind::Vector3,
            PropertyValueEnum::Vector3(values::Vector3::new(Vec3::ONE)),
        ),
        (
            Kind::Vector4,
            PropertyValueEnum::Vector4(values::Vector4::new(Vec4::ONE)),
        ),
        (
            Kind::Matrix44,
            PropertyValueEnum::Matrix44(values::Matrix44::new(Mat4::IDENTITY)),
        ),
        (
            Kind::Color,
            PropertyValueEnum::Color(values::Color::new(Color::new(255, 128, 64, 32))),
        ),
        (
            Kind::String,
            PropertyValueEnum::String(values::String::from("test")),
        ),
        (
            Kind::Hash,
            PropertyValueEnum::Hash(values::Hash::new(0xDEADBEEF)),
        ),
        (
            Kind::WadChunkLink,
            PropertyValueEnum::WadChunkLink(values::WadChunkLink::new(0xCAFEBABE)),
        ),
        (
            Kind::ObjectLink,
            PropertyValueEnum::ObjectLink(values::ObjectLink::new(0x12345678)),
        ),
    ];

    for (kind, value) in test_cases {
        let prop = make_prop(
            0x1234,
            PropertyValueEnum::Container(values::Container::try_from(vec![value]).unwrap()),
        );
        let result = roundtrip_property(&prop);
        assert_eq!(prop, result, "Failed for kind {:?}", kind);
    }
}
