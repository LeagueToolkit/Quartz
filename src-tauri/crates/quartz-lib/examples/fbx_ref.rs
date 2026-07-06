use fbxcel::pull_parser::any::AnyParser;
use fbxcel::pull_parser::v7400::Event;
use fbxcel::pull_parser::v7400::attribute::loaders::DirectLoader;
use fbxcel::low::v7400::AttributeValue;
use std::path::PathBuf;
fn av(v:&AttributeValue)->String{match v{AttributeValue::I64(x)=>format!("{}",x),AttributeValue::I32(x)=>format!("{}",x),AttributeValue::String(s)=>format!("{:?}",s),AttributeValue::F64(x)=>format!("{:.1}",x),AttributeValue::Bool(b)=>format!("{}",b),_=>"·".into()}}
fn main(){
    let fbx=PathBuf::from(std::env::args().nth(1).unwrap());
    let reader=std::io::BufReader::new(std::fs::File::open(&fbx).unwrap());
    let mut stack:Vec<String>=vec![];
    let mut printed_na=0; let mut printed_model=0; let mut in_target=false; let mut indent=0;
    if let AnyParser::V7400(mut p)=AnyParser::from_seekable_reader(reader).unwrap(){
        loop{match p.next_event().unwrap(){
            Event::StartNode(n)=>{
                let nm=n.name().to_string();
                let parent=stack.last().cloned().unwrap_or_default();
                let mut a=n.attributes(); let mut v=vec![];
                while let Ok(Some(x))=a.load_next(DirectLoader){ v.push(av(&x)); }
                // Print first NodeAttribute subtree and first bone Model subtree
                if parent=="Objects" && nm=="NodeAttribute" && printed_na<1 { in_target=true; indent=stack.len(); printed_na+=1; }
                if parent=="Objects" && nm=="Model" && v.get(1).map(|s|s.contains("LimbNode")||s.contains("Model")).unwrap_or(false) && printed_model<1 && v.iter().any(|s|s.contains("LimbNode")||s.contains("Skeleton")) { in_target=true; indent=stack.len(); printed_model+=1; }
                if in_target && stack.len()>=indent { println!("{}<{}> {}", "  ".repeat(stack.len()-indent), nm, v.join(", ")); }
                stack.push(nm);
            }
            Event::EndNode=>{ if in_target && stack.len()<=indent+1 { in_target=false; } stack.pop(); }
            Event::EndFbx(_)=>break,
        }}
    }
}
