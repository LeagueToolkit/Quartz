use byteorder::{ReadBytesExt, LE};
use std::io::{Cursor, Read, Seek, SeekFrom};
use xxhash_rust::xxh64::xxh64;

use crate::defines::ShaderMacroDefinition;
use crate::toc::ShaderToc;
use crate::{create_shader_bundle_path, create_shader_object_path, GraphicsPlatform, ShaderType};
use ltk_wad::Wad;

const SHADERS_PER_BUNDLE: u32 = 100;

pub struct ShaderLoader;

impl ShaderLoader {
    /// Loads the bytecode for a shader object from a WAD file.
    /// # Arguments
    /// * `shader_object_path` - The path of the shader object to load.
    /// * `shader_type` - The type of the shader to load.
    /// * `platform` - The platform of the shader to load.
    /// * `defines` - The defines to use for the shader.
    /// * `wad` - The WAD file to load the shader from.
    /// # Returns
    /// A vector of bytes containing the bytecode for the shader object.
    /// # Errors
    /// Returns an error if the shader object is not found or if the shader object data cannot be read.
    pub fn load_bytecode<R: Read + Seek>(
        shader_object_path: &str,
        shader_type: ShaderType,
        platform: GraphicsPlatform,
        defines: &[ShaderMacroDefinition],
        wad: &mut Wad<R>,
    ) -> Result<Vec<u8>, Box<dyn std::error::Error>> {
        let full_shader_object_path =
            create_shader_object_path(shader_object_path, shader_type, platform);

        let path_hash = xxh64(full_shader_object_path.as_bytes(), 0);

        let chunk = *wad
            .chunks()
            .get(path_hash)
            .ok_or_else(|| format!("Shader object not found: {}", full_shader_object_path))?;

        let shader_object_data = wad.load_chunk_decompressed(&chunk)?;
        let mut shader_object_reader = Cursor::new(shader_object_data);
        let shader_toc = ShaderToc::read(&mut shader_object_reader)?;

        let filtered_defines_formatted = Self::filter_defines(defines, &shader_toc.base_defines);
        let filtered_defines_hash = xxh64(filtered_defines_formatted.as_bytes(), 0);

        let shader_index = shader_toc
            .shader_hashes
            .iter()
            .position(|&h| h == filtered_defines_hash);

        let shader_index = match shader_index {
            Some(idx) => idx,
            None => {
                return Err(format!(
                    "Shader not found for defines: {}",
                    filtered_defines_formatted
                )
                .into())
            }
        };

        let shader_id = shader_toc.shader_ids[shader_index];
        let shader_bundle_id = SHADERS_PER_BUNDLE * (shader_id / SHADERS_PER_BUNDLE);
        let shader_index_in_bundle = shader_id % SHADERS_PER_BUNDLE;
        let shader_bundle_path =
            create_shader_bundle_path(&full_shader_object_path, shader_bundle_id);

        let bundle_path_hash = xxh64(shader_bundle_path.as_bytes(), 0);
        let bundle_chunk = *wad
            .chunks()
            .get(bundle_path_hash)
            .ok_or_else(|| format!("Shader bundle not found: {}", shader_bundle_path))?;

        let shader_bundle_data = wad.load_chunk_decompressed(&bundle_chunk)?;
        let mut shader_bundle_reader = Cursor::new(shader_bundle_data);

        for _ in 0..shader_index_in_bundle {
            let shader_size = shader_bundle_reader.read_u32::<LE>()?;
            shader_bundle_reader.seek(SeekFrom::Current(shader_size as i64))?;
        }

        let requested_shader_size = shader_bundle_reader.read_u32::<LE>()? as usize;
        let mut bytecode = Vec::with_capacity(requested_shader_size);
        shader_bundle_reader.read_exact(&mut bytecode)?;

        Ok(bytecode)
    }

    /// Filters the defines to only include the defines that are in the base defines.
    /// # Arguments
    /// * `defines` - The defines to filter.
    /// * `base_defines` - The base defines to filter the defines against.
    /// # Returns
    /// A string containing the filtered defines.
    fn filter_defines(
        defines: &[ShaderMacroDefinition],
        base_defines: &[ShaderMacroDefinition],
    ) -> String {
        let mut filtered = Vec::new();
        for req in defines {
            if base_defines.iter().any(|b| b.hash == req.hash) {
                filtered.push(req);
            }
        }

        filtered.sort_by(|a, b| a.name.cmp(&b.name));

        filtered.iter().map(|d| d.to_string()).collect()
    }
}
