use fbxcel::pull_parser::any::AnyParser;
use fbxcel::pull_parser::v7400::Event;
use fbxcel::pull_parser::v7400::attribute::loaders::DirectLoader;
use fbxcel::low::v7400::AttributeValue;
use std::path::PathBuf;
fn av(v: &AttributeValue) -> String {
    match v {
        AttributeValue::I64(x)=>format!("{}",x),
        AttributeValue::I32(x)=>format!("i32:{}",x),
        AttributeValue::String(s)=>format!("{:?}",s),
        AttributeValue::F64(x)=>format!("{:.2}",x),
        _=>"·".into(),
    }
}
fn main() {
    let fbx = PathBuf::from(std::env::args().nth(1).unwrap());
    let reader = std::io::BufReader::new(std::fs::File::open(&fbx).unwrap());
    let mut oc=0; let mut cc=0;
    if let AnyParser::V7400(mut p) = AnyParser::from_seekable_reader(reader).unwrap() {
        loop { match p.next_event().unwrap() {
            Event::StartNode(n) => {
                let name = n.name().to_string();
                if matches!(name.as_str(), "Geometry"|"Model"|"Pose"|"Deformer") && oc<30 {
                    let mut a=n.attributes(); let mut v=vec![];
                    while let Ok(Some(x))=a.load_next(DirectLoader){ v.push(av(&x)); }
                    println!("OBJ {}: {}", name, v.join(", ")); oc+=1;
                } else if name=="C" && cc<30 {
                    let mut a=n.attributes(); let mut v=vec![];
                    while let Ok(Some(x))=a.load_next(DirectLoader){ v.push(av(&x)); }
                    println!("CONN: {}", v.join(", ")); cc+=1;
                }
            }
            Event::EndNode => {}
            Event::EndFbx(_) => break,
        }}
    }
}
