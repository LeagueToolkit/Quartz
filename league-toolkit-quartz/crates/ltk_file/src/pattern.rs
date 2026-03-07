use super::LeagueFileKind;

pub static LEAGUE_FILE_MAGIC_BYTES: &[LeagueFilePattern] = &[
    // Fixed headers have highest prio since they have the most confidence
    LeagueFilePattern::from_bytes(b"r3d2anmd", LeagueFileKind::Animation),
    LeagueFilePattern::from_bytes(b"r3d2canm", LeagueFileKind::Animation),
    LeagueFilePattern::from_bytes(b"OEGM", LeagueFileKind::MapGeometry),
    LeagueFilePattern::from_bytes(b"PreLoad", LeagueFileKind::Preload),
    LeagueFilePattern::from_bytes(b"PROP", LeagueFileKind::PropertyBin),
    LeagueFilePattern::from_bytes(b"PTCH", LeagueFileKind::PropertyBinOverride),
    LeagueFilePattern::from_bytes(b"RST", LeagueFileKind::RiotStringTable),
    LeagueFilePattern::from_bytes(&[0x33, 0x22, 0x11, 0x00], LeagueFileKind::SimpleSkin),
    LeagueFilePattern::from_bytes(b"r3d2sklt", LeagueFileKind::Skeleton),
    LeagueFilePattern::from_bytes(b"[Obj", LeagueFileKind::StaticMeshAscii),
    LeagueFilePattern::from_bytes(b"r3d2Mesh", LeagueFileKind::StaticMeshBinary),
    LeagueFilePattern::from_bytes(b"<svg", LeagueFileKind::Svg),
    LeagueFilePattern::from_bytes(b"TEX\0", LeagueFileKind::Texture),
    LeagueFilePattern::from_bytes(b"DDS ", LeagueFileKind::TextureDds),
    LeagueFilePattern::from_bytes(b"WGEO", LeagueFileKind::WorldGeometry),
    LeagueFilePattern::from_bytes(b"BKHD", LeagueFileKind::WwiseBank),
    // These are also effectively fixed headers
    LeagueFilePattern::from_fn(|data| &data[1..5] == b"LuaQ", 5, LeagueFileKind::LuaObj),
    LeagueFilePattern::from_fn(|data| &data[1..4] == b"PNG", 4, LeagueFileKind::Png),
    LeagueFilePattern::from_fn(
        |data| &data[0..4] == b"r3d2" && u32::from_le_bytes(data[4..8].try_into().unwrap()) == 1,
        8,
        LeagueFileKind::WwisePackage,
    ),
    // Slightly less confident fixed headers
    LeagueFilePattern::from_fn(
        |data| u32::from_le_bytes(data[4..8].try_into().unwrap()) == 0x22FD4FC3,
        8,
        LeagueFileKind::Skeleton,
    ),
    LeagueFilePattern::from_fn(
        |data| (u32::from_le_bytes(data[..4].try_into().unwrap()) & 0x00FFFFFF) == 0x00FFD8FF,
        3,
        LeagueFileKind::Jpeg,
    ),
    // Much higher entropy patterns
    // TGA does not have a fixed magic at the beginning. Heuristics: byte 1 (color map type)
    // is 0 or 1, and byte 2 (image type) is one of the valid values.
    LeagueFilePattern::from_fn(
        |data| {
            let color_map_type = data[1];
            let image_type = data[2];
            (color_map_type == 0 || color_map_type == 1)
                && matches!(image_type, 1 | 2 | 3 | 9 | 10 | 11)
        },
        3,
        LeagueFileKind::Tga,
    ),
    LeagueFilePattern::from_fn(
        |data| u32::from_le_bytes(data[..4].try_into().unwrap()) == 3,
        4,
        LeagueFileKind::LightGrid,
    ),
];

/// The length of the largest possible file type magic, in bytes.
pub const MAX_MAGIC_SIZE: usize = 8;

pub enum LeagueFilePatternKind {
    Bytes(&'static [u8]),
    Fn(fn(&[u8]) -> bool),
}

pub struct LeagueFilePattern {
    pub pattern: LeagueFilePatternKind,
    pub min_length: usize,
    pub kind: LeagueFileKind,
}

impl LeagueFilePattern {
    const fn from_bytes(bytes: &'static [u8], kind: LeagueFileKind) -> Self {
        Self {
            pattern: LeagueFilePatternKind::Bytes(bytes),
            min_length: bytes.len(),
            kind,
        }
    }

    const fn from_fn(f: fn(&[u8]) -> bool, min_length: usize, kind: LeagueFileKind) -> Self {
        Self {
            pattern: LeagueFilePatternKind::Fn(f),
            min_length,
            kind,
        }
    }

    pub fn matches(&self, data: &[u8]) -> bool {
        data.len() >= self.min_length
            && match self.pattern {
                LeagueFilePatternKind::Bytes(bytes) => &data[..bytes.len()] == bytes,
                LeagueFilePatternKind::Fn(f) => f(data),
            }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn validate_max_magic_size() {
        assert_eq!(
            MAX_MAGIC_SIZE,
            LEAGUE_FILE_MAGIC_BYTES
                .iter()
                .map(|p| p.min_length)
                .max()
                .unwrap()
        );
    }
}
