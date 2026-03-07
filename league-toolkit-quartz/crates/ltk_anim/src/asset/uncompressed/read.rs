//! Uncompressed animation reading (r3d2anmd)
//!
//! Supports versions:
//! - v5: Quantized quaternions (6 bytes), separate joint hash section
//! - v4: Full quaternions (16 bytes), joint hashes in frame data
//! - v3: Legacy format with 32-byte padded joint names

use crate::{
    asset::{self, uncompressed::UncompressedFrame},
    quantized, Uncompressed,
};
use byteorder::{ReadBytesExt, LE};
use glam::Vec3;
use ltk_hash::elf;
use ltk_io_ext::ReaderExt;
use std::collections::HashMap;
use std::io::{Read, Seek, SeekFrom};

/// Calculates element count from section size, validating alignment
fn section_count(
    section_name: &'static str,
    size: usize,
    element_size: usize,
) -> asset::Result<usize> {
    if !size.is_multiple_of(element_size) {
        return Err(asset::AssetParseError::InvalidField(
            section_name,
            format!(
                "invalid size {}; expected multiple of {} bytes",
                size, element_size
            ),
        ));
    }
    Ok(size / element_size)
}

impl Uncompressed {
    /// Parses an uncompressed animation from a reader
    ///
    /// Only use this if you already know the animation asset is uncompressed!
    /// If you aren't sure, please use `AnimationAsset::from_reader`
    pub fn from_reader<R: Read + Seek + ?Sized>(reader: &mut R) -> asset::Result<Self> {
        let _magic = reader.read_u64::<LE>()?; // "r3d2anmd"
        let version = reader.read_u32::<LE>()?;

        match version {
            5 => Self::read_v5(reader),
            4 => Self::read_v4(reader),
            3 => Self::read_v3_legacy(reader),
            _ => Err(asset::AssetParseError::InvalidFileVersion(version)),
        }
    }

    /// Reads v5 format (newest)
    ///
    /// - Joint hashes in separate section
    /// - Quaternions quantized to 6 bytes
    fn read_v5<R: Read + Seek + ?Sized>(reader: &mut R) -> asset::Result<Self> {
        let _resource_size = reader.read_u32::<LE>()?;
        let _format_token = reader.read_u32::<LE>()?;
        let _version = reader.read_u32::<LE>()?;
        let _flags = reader.read_u32::<LE>()?;

        let track_count = reader.read_u32::<LE>()? as usize;
        let frame_count = reader.read_u32::<LE>()? as usize;
        let frame_duration = reader.read_f32::<LE>()?;

        let fps = 1.0 / frame_duration;
        let duration = frame_count as f32 * frame_duration;

        let joint_hashes_offset = reader.read_i32::<LE>()?;
        let _asset_name_offset = reader.read_i32::<LE>()?;
        let _time_offset = reader.read_i32::<LE>()?;
        let vector_palette_offset = reader.read_i32::<LE>()?;
        let quat_palette_offset = reader.read_i32::<LE>()?;
        let frames_offset = reader.read_i32::<LE>()?;

        if joint_hashes_offset <= 0 {
            return Err(asset::AssetParseError::MissingData("joint hashes"));
        }
        if vector_palette_offset <= 0 {
            return Err(asset::AssetParseError::MissingData("vector palette"));
        }
        if quat_palette_offset <= 0 {
            return Err(asset::AssetParseError::MissingData("quaternion palette"));
        }
        if frames_offset <= 0 {
            return Err(asset::AssetParseError::MissingData("frames"));
        }

        let joint_hash_count = section_count(
            "joint hashes",
            (frames_offset - joint_hashes_offset) as usize,
            4,
        )?;
        let vector_count = section_count(
            "vector palette",
            (quat_palette_offset - vector_palette_offset) as usize,
            12,
        )?;
        let quat_count = section_count(
            "quaternion palette",
            (joint_hashes_offset - quat_palette_offset) as usize,
            6,
        )?;

        // Read joint hashes
        reader.seek(SeekFrom::Start(joint_hashes_offset as u64 + 12))?;
        let mut joint_hashes = Vec::with_capacity(joint_hash_count);
        for _ in 0..joint_hash_count {
            joint_hashes.push(reader.read_u32::<LE>()?);
        }

        // Read vector palette
        reader.seek(SeekFrom::Start(vector_palette_offset as u64 + 12))?;
        let mut vector_palette = Vec::with_capacity(vector_count);
        for _ in 0..vector_count {
            vector_palette.push(reader.read_vec3::<LE>()?);
        }

        // Read quaternion palette (6-byte quantized)
        reader.seek(SeekFrom::Start(quat_palette_offset as u64 + 12))?;
        let mut quat_palette = Vec::with_capacity(quat_count);
        for _ in 0..quat_count {
            let mut bytes = [0u8; 6];
            reader.read_exact(&mut bytes)?;
            quat_palette.push(quantized::decompress_quat(&bytes).normalize());
        }

        // Initialize joint frames map
        let mut joint_frames: HashMap<u32, Vec<UncompressedFrame>> =
            HashMap::with_capacity(track_count);
        for &hash in &joint_hashes {
            joint_frames.insert(hash, vec![UncompressedFrame::default(); frame_count]);
        }

        // Read frames
        reader.seek(SeekFrom::Start(frames_offset as u64 + 12))?;
        for frame_id in 0..frame_count {
            for track_id in 0..track_count {
                let translation_id = reader.read_u16::<LE>()?;
                let scale_id = reader.read_u16::<LE>()?;
                let rotation_id = reader.read_u16::<LE>()?;

                // Skip tracks without a valid joint hash
                let Some(&joint_hash) = joint_hashes.get(track_id) else {
                    continue;
                };
                if let Some(frames) = joint_frames.get_mut(&joint_hash) {
                    frames[frame_id] = UncompressedFrame {
                        translation_id,
                        scale_id,
                        rotation_id,
                    };
                }
            }
        }

        Ok(Self {
            duration,
            fps,
            frame_count,
            vector_palette,
            quat_palette,
            joint_frames,
        })
    }

    /// Reads v4 format
    ///
    /// - Joint hashes embedded in frame data
    /// - Full 16-byte quaternions
    fn read_v4<R: Read + Seek + ?Sized>(reader: &mut R) -> asset::Result<Self> {
        let _resource_size = reader.read_u32::<LE>()?;
        let _format_token = reader.read_u32::<LE>()?;
        let _version = reader.read_u32::<LE>()?;
        let _flags = reader.read_u32::<LE>()?;

        let track_count = reader.read_u32::<LE>()? as usize;
        let frame_count = reader.read_u32::<LE>()? as usize;
        let frame_duration = reader.read_f32::<LE>()?;

        let fps = 1.0 / frame_duration;
        let duration = frame_count as f32 * frame_duration;

        let _joint_hashes_offset = reader.read_i32::<LE>()?;
        let _asset_name_offset = reader.read_i32::<LE>()?;
        let _time_offset = reader.read_i32::<LE>()?;
        let vector_palette_offset = reader.read_i32::<LE>()?;
        let quat_palette_offset = reader.read_i32::<LE>()?;
        let frames_offset = reader.read_i32::<LE>()?;

        if vector_palette_offset <= 0 {
            return Err(asset::AssetParseError::MissingData("vector palette"));
        }
        if quat_palette_offset <= 0 {
            return Err(asset::AssetParseError::MissingData("quaternion palette"));
        }
        if frames_offset <= 0 {
            return Err(asset::AssetParseError::MissingData("frames"));
        }

        let vector_count = section_count(
            "vector palette",
            (quat_palette_offset - vector_palette_offset) as usize,
            12,
        )?;
        let quat_count = section_count(
            "quaternion palette",
            (frames_offset - quat_palette_offset) as usize,
            16, // v4 uses full 16-byte quaternions
        )?;

        // Read vector palette
        reader.seek(SeekFrom::Start(vector_palette_offset as u64 + 12))?;
        let mut vector_palette = Vec::with_capacity(vector_count);
        for _ in 0..vector_count {
            vector_palette.push(reader.read_vec3::<LE>()?);
        }

        // Read quaternion palette (full 16-byte)
        reader.seek(SeekFrom::Start(quat_palette_offset as u64 + 12))?;
        let mut quat_palette = Vec::with_capacity(quat_count);
        for _ in 0..quat_count {
            quat_palette.push(reader.read_quat::<LE>()?.normalize());
        }

        // Read frames - joint hash is embedded in each frame
        let mut joint_frames: HashMap<u32, Vec<UncompressedFrame>> =
            HashMap::with_capacity(track_count);

        reader.seek(SeekFrom::Start(frames_offset as u64 + 12))?;
        for frame_id in 0..frame_count {
            for _ in 0..track_count {
                let joint_hash = reader.read_u32::<LE>()?;
                let translation_id = reader.read_u16::<LE>()?;
                let scale_id = reader.read_u16::<LE>()?;
                let rotation_id = reader.read_u16::<LE>()?;
                let _padding = reader.read_u16::<LE>()?;

                let frames = joint_frames
                    .entry(joint_hash)
                    .or_insert_with(|| vec![UncompressedFrame::default(); frame_count]);
                frames[frame_id] = UncompressedFrame {
                    translation_id,
                    scale_id,
                    rotation_id,
                };
            }
        }

        Ok(Self {
            duration,
            fps,
            frame_count,
            vector_palette,
            quat_palette,
            joint_frames,
        })
    }

    /// Reads v3 legacy format
    ///
    /// - 32-byte padded joint names (hashed using ELF)
    /// - Per-track frame storage
    /// - No scale support (defaults to 1.0)
    fn read_v3_legacy<R: Read + Seek + ?Sized>(reader: &mut R) -> asset::Result<Self> {
        let _skeleton_id = reader.read_u32::<LE>()?;
        let track_count = reader.read_u32::<LE>()? as usize;
        let frame_count = reader.read_u32::<LE>()? as usize;
        let fps = reader.read_u32::<LE>()? as f32;

        let duration = frame_count as f32 / fps;

        // Build palettes and frames as we read
        let mut quat_palette = Vec::with_capacity(frame_count * track_count);
        let mut vector_palette = Vec::with_capacity(frame_count * track_count + 1);
        let mut joint_frames: HashMap<u32, Vec<UncompressedFrame>> =
            HashMap::with_capacity(track_count);

        // Add artificial static scale vector at index 0
        vector_palette.push(Vec3::ONE);

        for _ in 0..track_count {
            // Read 32-byte padded joint name and hash it
            let joint_name: String = reader.read_padded_string::<LE, 32>()?;
            let joint_hash = elf::elf(&joint_name) as u32;
            let _flags = reader.read_u32::<LE>()?;

            let mut frames = Vec::with_capacity(frame_count);

            for _ in 0..frame_count {
                // Read rotation (quaternion) and translation directly
                let rotation = reader.read_quat::<LE>()?;
                let translation = reader.read_vec3::<LE>()?;

                let rotation_id = quat_palette.len() as u16;
                quat_palette.push(rotation);

                let translation_id = vector_palette.len() as u16;
                vector_palette.push(translation);

                // Scale is always 1.0 (index 0)
                frames.push(UncompressedFrame {
                    translation_id,
                    scale_id: 0,
                    rotation_id,
                });
            }

            joint_frames.insert(joint_hash, frames);
        }

        Ok(Self {
            duration,
            fps,
            frame_count,
            vector_palette,
            quat_palette,
            joint_frames,
        })
    }
}
