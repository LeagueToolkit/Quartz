#[derive(Debug, Clone, Default)]
pub struct XpsModel {
    pub bones: Vec<XpsBone>,
    pub meshes: Vec<XpsMesh>,
}

#[derive(Debug, Clone, Default)]
pub struct XpsMesh {
    pub name: String,
    pub vertices: Vec<XpsVertex>,
    pub faces: Vec<[u32; 3]>,
}

#[derive(Debug, Clone, Copy, Default)]
pub struct XpsVertex {
    pub position: [f32; 3],
    pub normal: [f32; 3],
    pub uv: [f32; 2],
    pub influences: [XpsInfluence; 4],
}

#[derive(Debug, Clone, Copy)]
pub struct XpsInfluence {
    pub bone_index: u16,
    pub weight: f32,
}

impl Default for XpsInfluence {
    fn default() -> Self {
        Self {
            bone_index: 0,
            weight: 0.0,
        }
    }
}

#[derive(Debug, Clone, Default)]
pub struct XpsBone {
    pub name: String,
    pub parent_index: i16,
    pub position: [f32; 3],
}
