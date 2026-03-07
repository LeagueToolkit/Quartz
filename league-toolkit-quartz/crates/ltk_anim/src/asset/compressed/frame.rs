use num_enum::{IntoPrimitive, TryFromPrimitive};

#[derive(Clone, Debug)]
#[repr(C, packed)]
pub struct Frame {
    time: u16,
    joint_id: u16,
    value: [u16; 3],
}

#[allow(dead_code)]
impl Frame {
    pub fn time(&self) -> u16 {
        self.time
    }
    pub fn value(&self) -> [u16; 3] {
        self.value
    }
    pub fn joint_id(&self) -> u16 {
        self.joint_id & 0x3fff
    }
    pub fn transform_type(&self) -> TransformType {
        TransformType::try_from_primitive((self.joint_id >> 14) as u8)
            .expect("invalid transform type")
    }
}

#[derive(TryFromPrimitive, IntoPrimitive)]
#[repr(u8)]
pub enum TransformType {
    Rotation = 0,
    Translation = 1,
    Scale = 2,
}
