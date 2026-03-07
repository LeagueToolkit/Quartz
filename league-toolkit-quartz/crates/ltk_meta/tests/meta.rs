use std::io::{Cursor, Seek};

use insta::assert_ron_snapshot;
use ltk_meta::Bin;
#[test]
pub fn read() {
    let mut r = Cursor::new(include_bytes!("bins/leona_small.bin"));
    let bin = Bin::from_reader(&mut r).unwrap();
    insta::with_settings!({sort_maps => true}, {
        assert_ron_snapshot!(bin);
    });
}

#[test]
pub fn round_trip() {
    let mut r = Cursor::new(include_bytes!("bins/leona_small.bin"));
    let a = Bin::from_reader(&mut r).unwrap();
    r.rewind().unwrap();

    let mut out = Cursor::new(Vec::new());
    a.to_writer(&mut out).unwrap();

    out.rewind().unwrap();
    let b = Bin::from_reader(&mut out).unwrap();

    assert_eq!(a, b);
}
