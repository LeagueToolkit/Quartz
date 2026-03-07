/// Fnv1a hash function for lowercase strings.
pub fn hash_lower(input: &str) -> u32 {
    let mut hash: u32 = 0x811c9dc5;

    for c in input.chars().flat_map(|c| c.to_lowercase()) {
        let mut buf = [0u8; 4];
        let encoded = c.encode_utf8(&mut buf);
        for &byte in encoded.as_bytes() {
            hash ^= byte as u32;
            hash = hash.wrapping_mul(0x01000193);
        }
    }

    hash
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_hash_lower_basic() {
        let val = hash_lower("test");
        assert_eq!(
            val, 0xafd071e5,
            "Got {} (0x{:x}), expected {} (0x{:x})",
            val, val, 0xafd071e5u32, 0xafd071e5u32
        );
        assert_eq!(hash_lower("TEST"), 0xafd071e5);
    }

    #[test]
    fn test_hash_lower_unicode() {
        // "É" -> "é"
        let h1 = hash_lower("É");
        let h2 = hash_lower("é");
        assert_eq!(h1, h2);
    }
}
