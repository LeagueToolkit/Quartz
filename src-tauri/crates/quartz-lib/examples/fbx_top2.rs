use fbxcel::pull_parser::any::AnyParser;
use fbxcel::pull_parser::v7400::Event;
use std::path::PathBuf;
fn main() {
    let fbx = PathBuf::from(std::env::args().nth(1).unwrap());
    let reader = std::io::BufReader::new(std::fs::File::open(&fbx).unwrap());
    let mut depth = 0i32;
    let mut objkids: Vec<String> = vec![];
    let mut inobj = 0i32;
    if let AnyParser::V7400(mut p) = AnyParser::from_seekable_reader(reader).unwrap() {
        loop {
            match p.next_event().unwrap() {
                Event::StartNode(n) => {
                    let nm = n.name().to_string();
                    if depth == 0 {
                        println!("TOP: {}", nm);
                    }
                    if nm == "Objects" {
                        inobj = depth + 1;
                    }
                    if depth == inobj && inobj > 0 && objkids.len() < 12 && !objkids.contains(&nm) {
                        objkids.push(nm.clone());
                    }
                    depth += 1;
                }
                Event::EndNode => depth -= 1,
                Event::EndFbx(_) => break,
            }
        }
    }
    println!("OBJECT KINDS: {:?}", objkids);
}
