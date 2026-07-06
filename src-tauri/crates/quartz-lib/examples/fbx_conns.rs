use fbxcel::pull_parser::any::AnyParser;
use fbxcel::pull_parser::v7400::Event;
use fbxcel::pull_parser::v7400::attribute::loaders::DirectLoader;
use fbxcel::low::v7400::AttributeValue;
use std::collections::HashMap;
use std::path::PathBuf;
fn av(v:&AttributeValue)->String{match v{AttributeValue::I64(x)=>format!("{}",x),AttributeValue::String(s)=>s.split('\0').next().unwrap_or("").to_string(),_=>"·".into()}}
fn main(){
    let fbx=PathBuf::from(std::env::args().nth(1).unwrap());
    let reader=std::io::BufReader::new(std::fs::File::open(&fbx).unwrap());
    // First pass: id -> (nodetype, name, subclass)
    let mut id_kind:HashMap<i64,String>=HashMap::new();
    let mut stack:Vec<String>=vec![];
    let mut conns:Vec<(String,i64,i64)>=vec![];
    if let AnyParser::V7400(mut p)=AnyParser::from_seekable_reader(reader).unwrap(){
        loop{match p.next_event().unwrap(){
            Event::StartNode(n)=>{
                let nm=n.name().to_string();
                let parent=stack.last().cloned().unwrap_or_default();
                let mut a=n.attributes(); let mut vals=vec![]; let mut ids=vec![]; let mut strs=vec![];
                loop { let x = match a.load_next(DirectLoader) { Ok(Some(x))=>x, _=>break };
                    if let AttributeValue::I64(i)=x { ids.push(i); }
                    if let AttributeValue::String(ref s)=x { strs.push(s.clone()); }
                    vals.push(av(&x));
                }
                if parent=="Objects" {
                    if let Some(&id)=ids.first(){
                        let sub=strs.last().cloned().unwrap_or_default();
                        id_kind.insert(id, format!("{}:{}", nm, sub));
                    }
                }
                if nm=="C" && ids.len()>=2 { conns.push((strs.first().cloned().unwrap_or_default(), ids[0], ids[1])); }
                stack.push(nm);
            }
            Event::EndNode=>{stack.pop();}
            Event::EndFbx(_)=>break,
        }}
    }
    id_kind.insert(0,"SCENE_ROOT".into());
    // Print connections with kinds, sample
    let mut shown_types:HashMap<String,usize>=HashMap::new();
    for (ty,a,b) in &conns {
        let ka=id_kind.get(a).cloned().unwrap_or("?".into());
        let kb=id_kind.get(b).cloned().unwrap_or("?".into());
        let key=format!("{} {} -> {}", ty, ka.split(':').next().unwrap(), kb.split(':').next().unwrap());
        let c=shown_types.entry(key.clone()).or_insert(0);
        if *c<2 { println!("{}  ({} {} -> {})", key, ty, ka, kb); }
        *c+=1;
    }
    println!("--- connection type summary ---");
    let mut v:Vec<_>=shown_types.into_iter().collect(); v.sort();
    for (k,n) in v { println!("{} x{}", k, n); }
}
