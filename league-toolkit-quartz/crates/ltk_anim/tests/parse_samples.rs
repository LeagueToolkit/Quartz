//! Integration tests for animation parsing

use ltk_anim::AnimationAsset;
use std::fs::File;
use std::io::BufReader;

const TEST_FILES: &[&str] = &[
    "../../aphelios_a_attack1.anm",
    "../../aphelios_a_attack1_to_idle.anm",
    "../../aphelios_a_attack1_to_run1.anm",
    "../../aphelios_a_attack1_to_run2.anm",
    "../../aphelios_a_attack2.anm",
    "../../aphelios_a_attack2_to_idle.anm",
];

#[test]
fn test_parse_all_sample_animations() {
    for file_path in TEST_FILES {
        let full_path = std::path::Path::new(env!("CARGO_MANIFEST_DIR")).join(file_path);

        if !full_path.exists() {
            println!("Skipping missing file: {:?}", full_path);
            continue;
        }

        let file =
            File::open(&full_path).unwrap_or_else(|_| panic!("Failed to open {:?}", full_path));
        let mut reader = BufReader::new(file);

        match AnimationAsset::from_reader(&mut reader) {
            Ok(asset) => {
                match asset {
                    AnimationAsset::Uncompressed(u) => {
                        println!(
                            "✓ {} - Uncompressed: duration={:.2}s, fps={:.0}, frames={}, joints={}",
                            file_path,
                            u.duration(),
                            u.fps(),
                            u.frame_count(),
                            u.joint_hashes().count()
                        );
                    }
                    AnimationAsset::Compressed(c) => {
                        println!(
                            "✓ {} - Compressed: duration={:.2}s, fps={:.0}, joints={}",
                            file_path,
                            c.duration(),
                            c.fps(),
                            c.joint_count()
                        );

                        // Test evaluation at time 0
                        let pose = c.evaluate(0.0);
                        println!("  Evaluated {} joints at t=0", pose.len());
                    }
                }
            }
            Err(e) => {
                panic!("Failed to parse {}: {:?}", file_path, e);
            }
        }
    }
}
