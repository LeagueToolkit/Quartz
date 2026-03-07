use super::BinObject;
use crate::Bin;

/// A builder for constructing [`Bin`] instances.
///
/// # Examples
///
/// ```
/// use ltk_meta::{Bin, BinObject};
///
/// let tree = Bin::builder()
///     .is_override(false)
///     .dependency("base.bin")
///     .dependencies(["extra1.bin", "extra2.bin"])
///     .object(BinObject::new(0x1234, 0x5678))
///     .build();
/// ```
#[derive(Debug, Default, Clone)]
pub struct Builder {
    is_override: bool,
    objects: Vec<BinObject>,
    dependencies: Vec<String>,
}

impl Builder {
    /// See: [`Bin::builder`]
    pub fn new() -> Self {
        Self::default()
    }

    /// Sets whether this is an override bin file.
    ///
    /// Default is `false`.
    pub fn is_override(mut self, is_override: bool) -> Self {
        self.is_override = is_override;
        self
    }

    /// Adds a single dependency.
    pub fn dependency(mut self, dep: impl Into<String>) -> Self {
        self.dependencies.push(dep.into());
        self
    }

    /// Adds multiple dependencies.
    pub fn dependencies(mut self, deps: impl IntoIterator<Item = impl Into<String>>) -> Self {
        self.dependencies.extend(deps.into_iter().map(Into::into));
        self
    }

    /// Adds a single object.
    pub fn object(mut self, obj: BinObject) -> Self {
        self.objects.push(obj);
        self
    }

    /// Adds multiple objects.
    pub fn objects(mut self, objs: impl IntoIterator<Item = BinObject>) -> Self {
        self.objects.extend(objs);
        self
    }

    /// Build the final [`Bin`].
    ///
    /// The resulting tree will have version 3, which is always used when writing.
    pub fn build(self) -> Bin {
        Bin {
            version: 3,
            is_override: self.is_override,
            objects: self.objects.into_iter().map(|o| (o.path_hash, o)).collect(),
            dependencies: self.dependencies,
            data_overrides: Vec::new(),
        }
    }
}
