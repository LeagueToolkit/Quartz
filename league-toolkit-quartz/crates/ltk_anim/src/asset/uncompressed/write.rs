//! Uncompressed animation writing (r3d2anmd v5)
//!
//! Writes animations in the v5 format:
//! - Quantized quaternions (6 bytes)
//! - Separate joint hash section
//! - Indexed vector/quaternion palettes

use crate::{quantized, Uncompressed};
use byteorder::{WriteBytesExt, LE};
use glam::{Quat, Vec3};
use ltk_io_ext::WriterExt;
use std::collections::HashMap;
use std::io::{self, Seek, SeekFrom, Write};

/// Maps (joint_hash, frame_id) -> (translation_idx, scale_idx, rotation_idx)
type FrameMap = HashMap<(u32, usize), (u16, u16, u16)>;

impl Uncompressed {
    /// Writes the animation to a writer in v5 format
    pub fn to_writer<W: Write + Seek + ?Sized>(&self, writer: &mut W) -> io::Result<()> {
        // Build deduplicated palettes
        let (vec_palette, quat_palette, frames) = self.build_palettes();

        let vec_count = vec_palette.len();
        let quat_count = quat_palette.len();
        let track_count = self.joint_frames.len();

        // Validate palette sizes
        if vec_count > 65535 {
            return Err(io::Error::new(
                io::ErrorKind::InvalidData,
                format!("Vector palette size {} exceeds 65535", vec_count),
            ));
        }
        if quat_count > 65535 {
            return Err(io::Error::new(
                io::ErrorKind::InvalidData,
                format!("Quaternion palette size {} exceeds 65535", quat_count),
            ));
        }

        // Write magic and version
        writer.write_all(b"r3d2anmd")?;
        writer.write_u32::<LE>(5)?; // version

        // Placeholder for file size (we'll write it later)
        let file_size_pos = writer.stream_position()?;
        writer.write_u32::<LE>(0)?;

        writer.write_u32::<LE>(0)?; // format token
        writer.write_u32::<LE>(5)?; // flags/version
        writer.write_u32::<LE>(0)?; // flags2

        writer.write_u32::<LE>(track_count as u32)?;
        writer.write_u32::<LE>(self.frame_count as u32)?;
        writer.write_f32::<LE>(1.0 / self.fps)?; // frame duration

        // Placeholder offsets (we'll write them later)
        let offsets_pos = writer.stream_position()?;
        for _ in 0..6 {
            writer.write_i32::<LE>(0)?;
        }

        // Pad to 12-byte aligned data section
        writer.write_all(&[0u8; 12])?;

        // Data order: vecs -> quats -> joint_hashes -> frames
        // (must be in this order for offset calculations)

        // Write vector palette
        let vecs_offset = writer.stream_position()? as i32 - 12;
        for vec in &vec_palette {
            writer.write_vec3::<LE>(*vec)?;
        }

        // Write quaternion palette (quantized)
        let quats_offset = writer.stream_position()? as i32 - 12;
        for quat in &quat_palette {
            let compressed = quantized::compress_quat(*quat);
            writer.write_all(&compressed)?;
        }

        // Write joint hashes
        let joint_hashes_offset = writer.stream_position()? as i32 - 12;
        let mut joint_hashes: Vec<u32> = self.joint_frames.keys().copied().collect();
        joint_hashes.sort_unstable();
        for hash in &joint_hashes {
            writer.write_u32::<LE>(*hash)?;
        }

        // Write frames
        let frames_offset = writer.stream_position()? as i32 - 12;
        for frame_id in 0..self.frame_count {
            for joint_hash in joint_hashes.iter() {
                if let Some(frame_data) = frames.get(&(*joint_hash, frame_id)) {
                    writer.write_u16::<LE>(frame_data.0)?; // translation_id
                    writer.write_u16::<LE>(frame_data.1)?; // scale_id
                    writer.write_u16::<LE>(frame_data.2)?; // rotation_id
                } else {
                    // Missing frame (joint has fewer frames than frame_count) - write identity
                    writer.write_u16::<LE>(0)?;
                    writer.write_u16::<LE>(0)?;
                    writer.write_u16::<LE>(0)?;
                }
            }
        }

        // Get final file size
        let file_size = writer.stream_position()? as u32;

        // Write file size
        writer.seek(SeekFrom::Start(file_size_pos))?;
        writer.write_u32::<LE>(file_size)?;

        // Write offsets
        writer.seek(SeekFrom::Start(offsets_pos))?;
        writer.write_i32::<LE>(joint_hashes_offset)?; // joint_hashes_offset
        writer.write_i32::<LE>(0)?; // asset_name_offset (unused)
        writer.write_i32::<LE>(0)?; // time_offset (unused)
        writer.write_i32::<LE>(vecs_offset)?;
        writer.write_i32::<LE>(quats_offset)?;
        writer.write_i32::<LE>(frames_offset)?;

        // Seek back to end
        writer.seek(SeekFrom::End(0))?;

        Ok(())
    }

    /// Builds deduplicated vector and quaternion palettes
    /// Returns (vec_palette, quat_palette, frame_map)
    fn build_palettes(&self) -> (Vec<Vec3>, Vec<Quat>, FrameMap) {
        let mut vec_bank: HashMap<[u32; 3], u16> = HashMap::new();
        let mut quat_bank: HashMap<[u32; 4], u16> = HashMap::new();
        let mut vec_palette = Vec::new();
        let mut quat_palette = Vec::new();
        let mut frame_map = HashMap::new();

        for (&joint_hash, frames) in &self.joint_frames {
            for (frame_id, frame) in frames.iter().enumerate() {
                // Get actual values from palettes
                let translation = self
                    .vector_palette
                    .get(frame.translation_id as usize)
                    .copied()
                    .unwrap_or(Vec3::ZERO);
                let scale = self
                    .vector_palette
                    .get(frame.scale_id as usize)
                    .copied()
                    .unwrap_or(Vec3::ONE);
                let rotation = self
                    .quat_palette
                    .get(frame.rotation_id as usize)
                    .copied()
                    .unwrap_or(Quat::IDENTITY);

                // Deduplicate vectors
                let translation_key = vec3_to_key(translation);
                let translation_idx = *vec_bank.entry(translation_key).or_insert_with(|| {
                    let idx = vec_palette.len() as u16;
                    vec_palette.push(translation);
                    idx
                });

                let scale_key = vec3_to_key(scale);
                let scale_idx = *vec_bank.entry(scale_key).or_insert_with(|| {
                    let idx = vec_palette.len() as u16;
                    vec_palette.push(scale);
                    idx
                });

                // Deduplicate quaternions
                let rotation_key = quat_to_key(rotation);
                let rotation_idx = *quat_bank.entry(rotation_key).or_insert_with(|| {
                    let idx = quat_palette.len() as u16;
                    quat_palette.push(rotation);
                    idx
                });

                frame_map.insert(
                    (joint_hash, frame_id),
                    (translation_idx, scale_idx, rotation_idx),
                );
            }
        }

        (vec_palette, quat_palette, frame_map)
    }
}

/// Converts a Vec3 to a hashable key (using bit representation)
fn vec3_to_key(v: Vec3) -> [u32; 3] {
    [v.x.to_bits(), v.y.to_bits(), v.z.to_bits()]
}

/// Converts a Quat to a hashable key (using bit representation)
fn quat_to_key(q: Quat) -> [u32; 4] {
    [q.x.to_bits(), q.y.to_bits(), q.z.to_bits(), q.w.to_bits()]
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::asset::uncompressed::UncompressedFrame;
    use std::io::Cursor;

    #[test]
    fn test_roundtrip_write_read() {
        // Create a simple animation
        let mut joint_frames = HashMap::new();
        joint_frames.insert(
            0x12345678,
            vec![
                UncompressedFrame {
                    translation_id: 0,
                    scale_id: 1,
                    rotation_id: 0,
                },
                UncompressedFrame {
                    translation_id: 2,
                    scale_id: 1,
                    rotation_id: 1,
                },
            ],
        );

        let anim = Uncompressed::new(
            30.0,
            vec![
                Vec3::new(0.0, 0.0, 0.0),
                Vec3::new(1.0, 1.0, 1.0),
                Vec3::new(1.0, 2.0, 3.0),
            ],
            vec![Quat::IDENTITY, Quat::from_xyzw(0.5, 0.5, 0.5, 0.5)],
            joint_frames,
        );

        // Write to buffer
        let mut buffer = Cursor::new(Vec::new());
        anim.to_writer(&mut buffer).expect("Failed to write");

        // Read back
        buffer.set_position(0);
        let read_anim = Uncompressed::from_reader(&mut buffer).expect("Failed to read");

        // Verify basic properties
        assert_eq!(read_anim.frame_count(), 2);
        assert_eq!(read_anim.joint_hashes().count(), 1);
    }
}
