use crate::Compressed;
use std::io::Write;

impl Compressed {
    pub fn to_writer<W: Write + ?Sized>(&self, _writer: &mut W) -> crate::Result<()> {
        unimplemented!("TODO: animation::asset::Compressed writing");
    }
}
