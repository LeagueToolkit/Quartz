/* quartz-lib wraps the RitoShark league-toolkit crates. All LTK dependencies
   and Quartz-specific helpers (WAD, BIN, texture, audio) live here so the
   binary crate's command modules stay thin. */

pub fn version() -> &'static str {
    env!("CARGO_PKG_VERSION")
}

#[cfg(test)]
mod tests {
    #[test]
    fn version_is_non_empty() {
        assert!(!super::version().is_empty());
    }
}
