/* Embedded hash->path reverse-map trailer for `.bin` files.

WHY: Riot is migrating asset refs from `string =` (a readable path) to `file =`
(an xxh64 hash). When a mod REPATHS an asset to a custom path, `xxh64(new_path)`
exists in NO hashtable anywhere (only that mod invented the path), so the path is
unrecoverable from the hash alone — "gone forever" the moment the bin holds only
the hash. This trailer preserves `hash -> path` for exactly those repathed refs.

FORMAT (appended AFTER the bin's real end, so the game and every bin parser that
reads to the declared entry/patch count ignore it completely — verified: a normal
bin read returns identical entries with the trailer present):

    [ ...bin body... ][ payload JSON ][ u32 payload_len (LE) ][ 8-byte MAGIC ]

MAGIC = b"CELMAP\0\0". Payload = JSON object `{ "<hex hash>": "<path>", ... }`
(File hashes are 16-hex xxh64; Hash/Link are 8-hex fnv1a32 — both stored as their
lowercase hex string, matching how ritoshark renders them).

LIFETIME: survives byte-copy, move, re-zip, and the game load. Does NOT survive a
tool that RESERIALIZES the bin from its parsed tree (that writes a fresh body with
no trailer) — so any code path that rewrites a `.bin` must re-append the trailer,
which the conversion helpers here do. */

use std::collections::HashMap;

const MAGIC: &[u8; 8] = b"CELMAP\0\0";

/// Read the reverse-map trailer from a `.bin`'s bytes, if present. Returns an
/// empty map when there is no trailer (a normal bin) or it is malformed — never
/// errors, so callers can unconditionally try it.
pub fn read_trailer(bytes: &[u8]) -> HashMap<String, String> {
    let n = bytes.len();
    if n < 12 {
        return HashMap::new();
    }
    if &bytes[n - 8..] != MAGIC {
        return HashMap::new();
    }
    let plen = u32::from_le_bytes([bytes[n - 12], bytes[n - 11], bytes[n - 10], bytes[n - 9]]) as usize;
    // payload occupies [n-12-plen .. n-12)
    if plen == 0 || 12 + plen > n {
        return HashMap::new();
    }
    let start = n - 12 - plen;
    let payload = &bytes[start..n - 12];
    serde_json::from_slice::<HashMap<String, String>>(payload).unwrap_or_default()
}

/// Strip a trailer off a `.bin`'s bytes if present, returning the bare bin body.
/// Safe to call on a trailer-free bin (returns the input unchanged).
pub fn strip_trailer(bytes: &[u8]) -> &[u8] {
    let n = bytes.len();
    if n < 12 || &bytes[n - 8..] != MAGIC {
        return bytes;
    }
    let plen = u32::from_le_bytes([bytes[n - 12], bytes[n - 11], bytes[n - 10], bytes[n - 9]]) as usize;
    if plen == 0 || 12 + plen > n {
        return bytes;
    }
    &bytes[..n - 12 - plen]
}

/// Append (or replace) the reverse-map trailer on a bin body. `body` should be a
/// freshly-serialized bin (no existing trailer); any existing trailer is stripped
/// first so re-embedding is idempotent. An empty map writes no trailer.
pub fn append_trailer(body: &[u8], map: &HashMap<String, String>) -> Vec<u8> {
    let base = strip_trailer(body);
    if map.is_empty() {
        return base.to_vec();
    }
    let payload = serde_json::to_vec(map).unwrap_or_default();
    let mut out = Vec::with_capacity(base.len() + payload.len() + 12);
    out.extend_from_slice(base);
    out.extend_from_slice(&payload);
    out.extend_from_slice(&(payload.len() as u32).to_le_bytes());
    out.extend_from_slice(MAGIC);
    out
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn roundtrip_trailer() {
        let body = b"PROP\x03\x00\x00\x00 fake bin body".to_vec();
        let mut map = HashMap::new();
        map.insert("26aec8e4beac48c0".to_string(), "assets/x/loadnewpath/a.tex".to_string());
        let with = append_trailer(&body, &map);
        // body recoverable
        assert_eq!(strip_trailer(&with), &body[..]);
        // map recoverable
        let got = read_trailer(&with);
        assert_eq!(got.get("26aec8e4beac48c0").map(String::as_str), Some("assets/x/loadnewpath/a.tex"));
        // idempotent re-append
        let with2 = append_trailer(&with, &map);
        assert_eq!(with2, with);
        // empty map = no trailer
        assert_eq!(append_trailer(&body, &HashMap::new()), body);
    }

    #[test]
    fn no_trailer_is_empty() {
        let body = b"PROP just a bin".to_vec();
        assert!(read_trailer(&body).is_empty());
        assert_eq!(strip_trailer(&body), &body[..]);
    }
}
