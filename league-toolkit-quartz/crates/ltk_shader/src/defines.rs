use crate::read_sized_string;
use std::fmt;
use std::io::Read;

#[derive(Debug, Clone)]
pub struct ShaderMacroDefinition {
    pub name: String,
    pub value: String,
    pub hash: u32,
}

impl ShaderMacroDefinition {
    pub fn new(name: String, value: String) -> Self {
        let hash = Self::calculate_hash(&name, &value);
        Self { name, value, hash }
    }

    pub fn read<R: Read>(reader: &mut R) -> std::io::Result<Self> {
        let name = read_sized_string(reader)?;
        let value = read_sized_string(reader)?;
        Ok(Self::new(name, value))
    }

    pub fn calculate_hash(name: &str, value: &str) -> u32 {
        let s = if value.is_empty() {
            name.to_string()
        } else {
            format!("{}={}", name, value)
        };

        ltk_hash::fnv1a::hash_lower(&s)
    }
}

impl PartialEq for ShaderMacroDefinition {
    fn eq(&self, other: &Self) -> bool {
        self.hash == other.hash
    }
}

impl Eq for ShaderMacroDefinition {}

impl fmt::Display for ShaderMacroDefinition {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        if self.value.is_empty() {
            write!(f, "{}", self.name)
        } else {
            write!(f, "{}={}", self.name, self.value)
        }
    }
}
