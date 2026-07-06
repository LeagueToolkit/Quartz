use std::path::PathBuf;
fn main(){let i=PathBuf::from(std::env::args().nth(1).unwrap());let o=std::env::args().nth(2).map(PathBuf::from);quartz_lib::model_bridge::xps2fbx(&i,o.as_deref()).unwrap();println!("OK");}
