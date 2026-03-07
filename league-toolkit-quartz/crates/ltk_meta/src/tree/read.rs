use std::io;

use crate::Error;

use super::{Bin, BinObject};
use byteorder::{ReadBytesExt, LE};
use indexmap::IndexMap;
use ltk_io_ext::ReaderExt;

impl Bin {
    pub const PROP: u32 = u32::from_le_bytes(*b"PROP");
    pub const PTCH: u32 = u32::from_le_bytes(*b"PTCH");

    /// Reads a BinTree from a reader.
    ///
    /// # Arguments
    ///
    /// * `reader` - A reader that implements io::Read and io::Seek.
    pub fn from_reader<R: io::Read + std::io::Seek + ?Sized>(
        reader: &mut R,
    ) -> Result<Self, Error> {
        let magic = reader.read_u32::<LE>()?;
        let is_override = match magic {
            Self::PROP => false,
            Self::PTCH => {
                let override_version = reader.read_u32::<LE>()?;
                if override_version != 1 {
                    return Err(Error::InvalidFileVersion(override_version));
                }

                // It might be possible to create an override property bin
                // and set the original file as a dependency.
                // This seems to be the object count of the override section
                let _maybe_override_object_count = reader.read_u32::<LE>()?;

                let magic = reader.read_u32::<LE>()?;
                if magic != Self::PROP {
                    // TODO (alan): repr this in the error
                    log::error!(
                        "Expected PROP ({:#x}) section after PTCH ({:#x}), got '{:#x}'",
                        Self::PROP,
                        Self::PTCH,
                        magic
                    );
                    return Err(Error::InvalidFileSignature);
                }
                true
            }
            _ => return Err(Error::InvalidFileSignature),
        };

        let version = reader.read_u32::<LE>()?;
        if !matches!(version, 1..=3) {
            // TODO (alan): distinguish override/non-override version
            return Err(Error::InvalidFileVersion(version));
        }

        let dependencies = match version {
            2.. => {
                let dep_count = reader.read_u32::<LE>()?;
                let mut dependencies = Vec::with_capacity(dep_count as _);
                for _ in 0..dep_count {
                    dependencies.push(reader.read_sized_string_u16::<LE>()?);
                }
                dependencies
            }
            _ => Vec::new(),
        };

        let obj_count = reader.read_u32::<LE>()? as usize;
        let mut obj_classes = Vec::with_capacity(obj_count);
        for _ in 0..obj_count {
            obj_classes.push(reader.read_u32::<LE>()?);
        }

        let mut objects = IndexMap::with_capacity(obj_count);
        match Self::try_read_objects(reader, &obj_classes, &mut objects, false) {
            Ok(_) => {}
            Err(Error::InvalidPropertyTypePrimitive(kind)) => {
                log::warn!("Invalid prop type {kind}. Trying reading objects as legacy.");
                Self::try_read_objects(reader, &obj_classes, &mut objects, true)?;
            }
            e => e?,
        }

        let data_overrides = match (is_override, version) {
            (true, 3..) => {
                let count = reader.read_u32::<LE>()?;
                let mut v = Vec::with_capacity(count as _);
                for _ in 0..count {
                    v.push(()); // TODO: impl data overrides
                }
                v
            }
            _ => Vec::new(),
        };

        Ok(Self {
            version,
            is_override,
            objects,
            dependencies,
            data_overrides,
        })
    }

    fn try_read_objects<R: io::Read + std::io::Seek + ?Sized>(
        reader: &mut R,
        obj_classes: &[u32],
        objects: &mut IndexMap<u32, BinObject>,
        legacy: bool,
    ) -> Result<(), Error> {
        objects.clear();
        for &class_hash in obj_classes {
            let tree_obj = BinObject::from_reader(reader, class_hash, legacy)?;
            objects.insert(tree_obj.path_hash, tree_obj);
        }
        Ok(())
    }
}
