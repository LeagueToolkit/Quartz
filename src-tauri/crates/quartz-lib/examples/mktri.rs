use quartz_lib::model_bridge::xps_model::*;
fn main() {
    let mut m = XpsMesh {
        name: "T".into(),
        vertices: vec![],
        faces: vec![[0, 1, 2]],
    };
    for i in 0..3u32 {
        let mut v = XpsVertex::default();
        v.position = [i as f32, 0.0, 0.0];
        v.normal = [0.0, 0.0, 1.0];
        v.influences[0] = XpsInfluence {
            bone_index: 0,
            weight: 1.0,
        };
        m.vertices.push(v);
    }
    let model = XpsModel {
        bones: vec![XpsBone {
            name: "Root".into(),
            parent_index: -1,
            position: [0.0, 0.0, 0.0],
        }],
        meshes: vec![m],
    };
    quartz_lib::model_bridge::fbx_writer::write_fbx(
        &model,
        std::path::Path::new(&std::env::args().nth(1).unwrap()),
    )
    .unwrap();
    println!("wrote");
}
