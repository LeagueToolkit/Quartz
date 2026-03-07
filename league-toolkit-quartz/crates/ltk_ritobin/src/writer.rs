//! Text writer for ritobin format.

use std::fmt::Write;

use ltk_meta::{
    property::{
        values::{Embedded, Struct, UnorderedContainer},
        PropertyValueEnum,
    },
    Bin, BinObject, BinProperty,
};

use crate::{
    error::WriteError,
    hashes::{HashMapProvider, HashProvider, HexHashProvider},
    types::kind_to_type_name,
};

/// Configuration for the text writer.
#[derive(Debug, Clone)]
pub struct WriterConfig {
    /// Number of spaces per indent level.
    pub indent_size: usize,
}

impl Default for WriterConfig {
    fn default() -> Self {
        Self { indent_size: 4 }
    }
}

/// Text writer for ritobin format with hash provider support.
pub struct TextWriter<'a, H: HashProvider = HexHashProvider> {
    buffer: String,
    indent_level: usize,
    config: WriterConfig,
    hashes: &'a H,
}

impl<'a> TextWriter<'a, HexHashProvider> {
    /// Create a new text writer without hash lookup (all hashes written as hex).
    pub fn new() -> Self {
        static HEX_PROVIDER: HexHashProvider = HexHashProvider;
        Self {
            buffer: String::new(),
            indent_level: 0,
            config: WriterConfig::default(),
            hashes: &HEX_PROVIDER,
        }
    }
}

impl<'a, H: HashProvider> TextWriter<'a, H> {
    /// Create a new text writer with a hash provider for name lookup.
    pub fn with_hashes(hashes: &'a H) -> Self {
        Self {
            buffer: String::new(),
            indent_level: 0,
            config: WriterConfig::default(),
            hashes,
        }
    }

    /// Create a new text writer with custom configuration and hash provider.
    pub fn with_config_and_hashes(config: WriterConfig, hashes: &'a H) -> Self {
        Self {
            buffer: String::new(),
            indent_level: 0,
            config,
            hashes,
        }
    }

    /// Consume the writer and return the generated string.
    pub fn into_string(self) -> String {
        self.buffer
    }

    /// Get a reference to the generated string.
    pub fn as_str(&self) -> &str {
        &self.buffer
    }

    fn indent(&mut self) {
        self.indent_level += self.config.indent_size;
    }

    fn dedent(&mut self) {
        self.indent_level = self.indent_level.saturating_sub(self.config.indent_size);
    }

    fn pad(&mut self) {
        for _ in 0..self.indent_level {
            self.buffer.push(' ');
        }
    }

    fn write_raw(&mut self, s: &str) {
        self.buffer.push_str(s);
    }

    fn write_type(&mut self, value: &PropertyValueEnum) {
        let type_name = kind_to_type_name(value.kind());
        self.write_raw(type_name);

        match value {
            PropertyValueEnum::Container(container)
            | PropertyValueEnum::UnorderedContainer(UnorderedContainer(container)) => {
                self.write_raw("[");
                self.write_raw(kind_to_type_name(container.item_kind()));
                self.write_raw("]");
            }
            PropertyValueEnum::Optional(optional) => {
                self.write_raw("[");
                self.write_raw(kind_to_type_name(optional.item_kind()));
                self.write_raw("]");
            }
            PropertyValueEnum::Map(map) => {
                self.write_raw("[");
                self.write_raw(kind_to_type_name(map.key_kind()));
                self.write_raw(",");
                self.write_raw(kind_to_type_name(map.value_kind()));
                self.write_raw("]");
            }
            _ => {}
        }
    }

    /// Write an entry/object path hash (looks up in entries table).
    fn write_entry_hash(&mut self, hash: u32) -> Result<(), WriteError> {
        if let Some(name) = self.hashes.lookup_entry(hash) {
            write!(self.buffer, "{:?}", name)?;
        } else {
            write!(self.buffer, "{:#x}", hash)?;
        }
        Ok(())
    }

    /// Write a field/property name hash (looks up in fields table).
    fn write_field_hash(&mut self, hash: u32) -> Result<(), WriteError> {
        if let Some(name) = self.hashes.lookup_field(hash) {
            self.write_raw(name);
        } else {
            write!(self.buffer, "{:#x}", hash)?;
        }
        Ok(())
    }

    /// Write a hash property value (looks up in hashes table).
    fn write_hash_value(&mut self, hash: u32) -> Result<(), WriteError> {
        if let Some(name) = self.hashes.lookup_hash(hash) {
            write!(self.buffer, "{:?}", name)?;
        } else {
            write!(self.buffer, "{:#x}", hash)?;
        }
        Ok(())
    }

    /// Write a type/class hash (looks up in types table).
    fn write_type_hash(&mut self, hash: u32) -> Result<(), WriteError> {
        if let Some(name) = self.hashes.lookup_type(hash) {
            self.write_raw(name);
        } else {
            write!(self.buffer, "{:#x}", hash)?;
        }
        Ok(())
    }

    /// Write a link hash (looks up in entries table, same as entry paths).
    fn write_link_hash(&mut self, hash: u32) -> Result<(), WriteError> {
        if let Some(name) = self.hashes.lookup_entry(hash) {
            write!(self.buffer, "{:?}", name)?;
        } else {
            write!(self.buffer, "{:#x}", hash)?;
        }
        Ok(())
    }

    fn write_value(&mut self, value: &PropertyValueEnum) -> Result<(), WriteError> {
        match value {
            PropertyValueEnum::None(_) => self.write_raw("null"),
            PropertyValueEnum::Bool(v) => self.write_raw(if **v { "true" } else { "false" }),
            PropertyValueEnum::I8(v) => write!(self.buffer, "{}", v.value)?,
            PropertyValueEnum::U8(v) => write!(self.buffer, "{}", v.value)?,
            PropertyValueEnum::I16(v) => write!(self.buffer, "{}", v.value)?,
            PropertyValueEnum::U16(v) => write!(self.buffer, "{}", v.value)?,
            PropertyValueEnum::I32(v) => write!(self.buffer, "{}", v.value)?,
            PropertyValueEnum::U32(v) => write!(self.buffer, "{}", v.value)?,
            PropertyValueEnum::I64(v) => write!(self.buffer, "{}", v.value)?,
            PropertyValueEnum::U64(v) => write!(self.buffer, "{}", v.value)?,
            PropertyValueEnum::F32(v) => write!(self.buffer, "{}", v.value)?,
            PropertyValueEnum::Vector2(v) => {
                write!(self.buffer, "{{ {}, {} }}", v.value.x, v.value.y)?;
            }
            PropertyValueEnum::Vector3(v) => {
                write!(
                    self.buffer,
                    "{{ {}, {}, {} }}",
                    v.value.x, v.value.y, v.value.z
                )?;
            }
            PropertyValueEnum::Vector4(v) => {
                write!(
                    self.buffer,
                    "{{ {}, {}, {}, {} }}",
                    v.value.x, v.value.y, v.value.z, v.value.w
                )?;
            }
            PropertyValueEnum::Matrix44(v) => {
                self.write_raw("{\n");
                self.indent();
                let arr = v.value;
                for (i, val) in arr.iter().enumerate() {
                    if i % 4 == 0 {
                        self.pad();
                    }
                    write!(self.buffer, "{}", val)?;
                    if i % 4 == 3 {
                        self.write_raw("\n");
                        if i == 15 {
                            self.dedent();
                        }
                    } else {
                        self.write_raw(", ");
                    }
                }
                self.pad();
                self.write_raw("}");
            }
            PropertyValueEnum::Color(v) => {
                write!(
                    self.buffer,
                    "{{ {}, {}, {}, {} }}",
                    v.value.r, v.value.g, v.value.b, v.value.a
                )?;
            }
            PropertyValueEnum::String(v) => {
                write!(self.buffer, "{:?}", v.value)?;
            }
            PropertyValueEnum::Hash(v) => {
                self.write_hash_value(v.value)?;
            }
            PropertyValueEnum::WadChunkLink(v) => {
                // WAD chunk links are u64 xxhash, we don't have lookup for these yet
                write!(self.buffer, "{:#x}", v.value)?;
            }
            PropertyValueEnum::ObjectLink(v) => {
                self.write_link_hash(v.value)?;
            }
            PropertyValueEnum::BitBool(v) => self.write_raw(if v.value { "true" } else { "false" }),

            PropertyValueEnum::Container(container)
            | PropertyValueEnum::UnorderedContainer(UnorderedContainer(container)) => {
                let items = container.clone().into_items().collect::<Vec<_>>();
                if items.is_empty() {
                    self.write_raw("{}");
                } else {
                    self.write_raw("{\n");
                    self.indent();
                    for item in items {
                        self.pad();
                        self.write_value(&item)?;
                        self.write_raw("\n");
                    }
                    self.dedent();
                    self.pad();
                    self.write_raw("}");
                }
            }
            PropertyValueEnum::Optional(value) => {
                if let Some(inner) = value.clone().into_inner() {
                    self.write_raw("{\n");
                    self.indent();
                    self.pad();
                    self.write_value(&inner)?;
                    self.write_raw("\n");
                    self.dedent();
                    self.pad();
                    self.write_raw("}");
                } else {
                    self.write_raw("{}");
                }
            }
            PropertyValueEnum::Map(map) => {
                let entries = map.entries();
                if entries.is_empty() {
                    self.write_raw("{}");
                } else {
                    self.write_raw("{\n");
                    self.indent();
                    for (key, value) in entries {
                        self.pad();
                        self.write_value(key)?;
                        self.write_raw(" = ");
                        self.write_value(value)?;
                        self.write_raw("\n");
                    }
                    self.dedent();
                    self.pad();
                    self.write_raw("}");
                }
            }
            PropertyValueEnum::Struct(v) => {
                self.write_struct_value(v)?;
            }
            PropertyValueEnum::Embedded(Embedded(v)) => {
                self.write_struct_value(v)?;
            }
        }
        Ok(())
    }

    fn write_struct_value(&mut self, v: &Struct) -> Result<(), WriteError> {
        if v.class_hash == 0 && v.properties.is_empty() {
            self.write_raw("null");
        } else {
            self.write_type_hash(v.class_hash)?;
            self.write_raw(" ");
            if v.properties.is_empty() {
                self.write_raw("{}");
            } else {
                self.write_raw("{\n");
                self.indent();
                for prop in v.properties.values() {
                    self.write_property(prop)?;
                }
                self.dedent();
                self.pad();
                self.write_raw("}");
            }
        }
        Ok(())
    }

    fn write_property(&mut self, prop: &BinProperty) -> Result<(), WriteError> {
        self.pad();
        self.write_field_hash(prop.name_hash)?;
        self.write_raw(": ");
        self.write_type(&prop.value);
        self.write_raw(" = ");
        self.write_value(&prop.value)?;
        self.write_raw("\n");
        Ok(())
    }

    /// Write a Bin to the buffer.
    pub fn write_tree(&mut self, tree: &Bin) -> Result<(), WriteError> {
        // Header
        self.write_raw("#PROP_text\n");

        // Type
        self.write_raw("type: string = \"PROP\"\n");

        // Version
        writeln!(self.buffer, "version: u32 = {}", tree.version)?;

        // Dependencies (linked)
        if !tree.dependencies.is_empty() {
            self.write_raw("linked: list[string] = {\n");
            self.indent();
            for dep in &tree.dependencies {
                self.pad();
                writeln!(self.buffer, "{:?}", dep)?;
            }
            self.dedent();
            self.write_raw("}\n");
        }

        // Entries (objects)
        if !tree.objects.is_empty() {
            self.write_raw("entries: map[hash,embed] = {\n");
            self.indent();
            for obj in tree.objects.values() {
                self.write_object(obj)?;
            }
            self.dedent();
            self.write_raw("}\n");
        }

        Ok(())
    }

    /// Write a single [`BinObject`].
    fn write_object(&mut self, obj: &BinObject) -> Result<(), WriteError> {
        self.pad();
        self.write_entry_hash(obj.path_hash)?;
        self.write_raw(" = ");
        self.write_type_hash(obj.class_hash)?;
        self.write_raw(" ");

        if obj.properties.is_empty() {
            self.write_raw("{}\n");
        } else {
            self.write_raw("{\n");
            self.indent();
            for prop in obj.properties.values() {
                self.write_property(prop)?;
            }
            self.dedent();
            self.pad();
            self.write_raw("}\n");
        }

        Ok(())
    }
}

impl Default for TextWriter<'_, HexHashProvider> {
    fn default() -> Self {
        Self::new()
    }
}

// ============================================================================
// Public API Functions
// ============================================================================

/// Write a [`Bin`] to ritobin text format (hashes as hex).
pub fn write(tree: &Bin) -> Result<String, WriteError> {
    let mut writer = TextWriter::new();
    writer.write_tree(tree)?;
    Ok(writer.into_string())
}

/// Write a [`Bin`] to ritobin text format with custom configuration.
pub fn write_with_config(tree: &Bin, config: WriterConfig) -> Result<String, WriteError> {
    static HEX_PROVIDER: HexHashProvider = HexHashProvider;
    let mut writer = TextWriter::with_config_and_hashes(config, &HEX_PROVIDER);
    writer.write_tree(tree)?;
    Ok(writer.into_string())
}

/// Write a [`Bin`] to ritobin text format with hash name lookup.
pub fn write_with_hashes<H: HashProvider>(tree: &Bin, hashes: &H) -> Result<String, WriteError> {
    let mut writer = TextWriter::with_hashes(hashes);
    writer.write_tree(tree)?;
    Ok(writer.into_string())
}

/// Write a [`Bin`] to ritobin text format with configuration and hash name lookup.
pub fn write_with_config_and_hashes<H: HashProvider>(
    tree: &Bin,
    config: WriterConfig,
    hashes: &H,
) -> Result<String, WriteError> {
    let mut writer = TextWriter::with_config_and_hashes(config, hashes);
    writer.write_tree(tree)?;
    Ok(writer.into_string())
}

// ============================================================================
// Builder
// ============================================================================

/// A builder for creating ritobin files programmatically and converting to text.
///
/// This is a convenience wrapper around [`ltk_meta::Builder`]
/// that adds methods for direct text output.
///
/// # Examples
///
/// ```
/// use ltk_ritobin::writer::RitobinBuilder;
/// use ltk_meta::BinObject;
///
/// let text = RitobinBuilder::new()
///     .dependency("base.bin")
///     .object(BinObject::new(0x1234, 0x5678))
///     .to_text()
///     .unwrap();
/// ```
#[derive(Debug, Default, Clone)]
pub struct RitobinBuilder {
    is_override: bool,
    dependencies: Vec<String>,
    objects: Vec<BinObject>,
}

impl RitobinBuilder {
    /// Creates a new [`RitobinBuilder`] with default values.
    pub fn new() -> Self {
        Self::default()
    }

    /// Sets whether this is an override bin file.
    ///
    /// Default is `false`.
    pub fn is_override(mut self, is_override: bool) -> Self {
        self.is_override = is_override;
        self
    }

    /// Adds a single dependency.
    pub fn dependency(mut self, dep: impl Into<String>) -> Self {
        self.dependencies.push(dep.into());
        self
    }

    /// Adds multiple dependencies.
    pub fn dependencies(mut self, deps: impl IntoIterator<Item = impl Into<String>>) -> Self {
        self.dependencies.extend(deps.into_iter().map(Into::into));
        self
    }

    /// Adds a single object.
    pub fn object(mut self, obj: BinObject) -> Self {
        self.objects.push(obj);
        self
    }

    /// Adds multiple objects.
    pub fn objects(mut self, objs: impl IntoIterator<Item = BinObject>) -> Self {
        self.objects.extend(objs);
        self
    }

    /// Builds the [`Bin`].
    ///
    /// The resulting tree will have version 3, which is always used when writing.
    pub fn build(self) -> Bin {
        Bin::builder()
            .is_override(self.is_override)
            .dependencies(self.dependencies)
            .objects(self.objects)
            .build()
    }

    /// Build and write to ritobin text format (hashes as hex).
    pub fn to_text(self) -> Result<String, WriteError> {
        write(&self.build())
    }

    /// Build and write to ritobin text format with hash name lookup.
    pub fn to_text_with_hashes<H: HashProvider>(self, hashes: &H) -> Result<String, WriteError> {
        write_with_hashes(&self.build(), hashes)
    }
}

// ============================================================================
// Convenience type aliases
// ============================================================================

/// A pre-configured writer that outputs all hashes as hex values.
pub type HexWriter<'a> = TextWriter<'a, HexHashProvider>;

/// A pre-configured writer that looks up hashes from HashMaps.
pub type NamedWriter<'a> = TextWriter<'a, HashMapProvider>;

#[cfg(test)]
mod tests {
    use super::*;
    use crate::hashes::HashMapProvider;

    #[test]
    fn test_write_simple() {
        let tree = Bin::new([], std::iter::empty::<&str>());
        let text = write(&tree).unwrap();
        assert!(text.contains("#PROP_text"));
        assert!(text.contains("type: string = \"PROP\""));
        assert!(text.contains("version: u32 = 3"));
    }

    #[test]
    fn test_write_with_dependencies() {
        let tree = Bin::new(
            std::iter::empty(),
            vec![
                "path/to/dep1.bin".to_string(),
                "path/to/dep2.bin".to_string(),
            ],
        );
        let text = write(&tree).unwrap();
        assert!(text.contains("linked: list[string] = {"));
        assert!(text.contains("\"path/to/dep1.bin\""));
        assert!(text.contains("\"path/to/dep2.bin\""));
    }

    #[test]
    fn test_builder() {
        let tree = RitobinBuilder::new().dependency("path/to/dep.bin").build();

        assert_eq!(tree.dependencies.len(), 1);
        assert_eq!(tree.version, 3); // Version is always 3
    }

    #[test]
    fn test_write_with_hash_lookup() {
        use indexmap::IndexMap;
        use ltk_meta::property::values::String;

        // Create a simple tree with a hash value
        let mut properties = IndexMap::new();
        let name_hash = ltk_hash::fnv1a::hash_lower("testField");
        properties.insert(
            name_hash,
            BinProperty {
                name_hash,
                value: PropertyValueEnum::String(String::from("hello")),
            },
        );

        let path_hash = ltk_hash::fnv1a::hash_lower("Test/Path");
        let class_hash = ltk_hash::fnv1a::hash_lower("TestClass");

        let obj = BinObject {
            path_hash,
            class_hash,
            properties,
        };

        let tree = Bin::new(std::iter::once(obj), std::iter::empty::<&str>());

        // Without hash lookup - should have hex values
        let text_hex = write(&tree).unwrap();
        assert!(text_hex.contains(&format!("{:#x}", path_hash)));

        // With hash lookup - should have named values
        let mut hashes = HashMapProvider::new();
        hashes.insert_entry(path_hash, "Test/Path");
        hashes.insert_field(name_hash, "testField");
        hashes.insert_type(class_hash, "TestClass");

        let text_named = write_with_hashes(&tree, &hashes).unwrap();
        assert!(text_named.contains("\"Test/Path\""));
        assert!(text_named.contains("testField:"));
        assert!(text_named.contains("TestClass {"));
    }
}
