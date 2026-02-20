//! Simple BIN roundtrip test tool
//! 
//! Usage: cargo run --bin bin_roundtrip_test -- <path_to_bin_file>
//! 
//! This tool:
//! 1. Reads a BIN file
//! 2. Parses it with ltk_meta
//! 3. Writes it back using ltk_meta
//! 4. Compares the sizes and object counts
//! 5. Outputs both versions for comparison

use std::env;
use std::fs;
use std::io::Cursor;
use std::path::Path;

use ltk_meta::BinTree;
fn main() {
    let args: Vec<String> = env::args().collect();
    
    if args.len() < 2 {
        eprintln!("Usage: {} <path_to_bin_file>", args[0]);
        eprintln!("Example: {} C:/path/to/skin0.bin", args[0]);
        std::process::exit(1);
    }
    
    let input_path = Path::new(&args[1]);
    
    if !input_path.exists() {
        eprintln!("ERROR: File not found: {}", input_path.display());
        std::process::exit(1);
    }
    
    println!("=== BIN Roundtrip Test ===\n");
    println!("Input file: {}", input_path.display());
    
    // Step 1: Read original file
    let original_data = fs::read(input_path).expect("Failed to read input file");
    let original_size = original_data.len();
    
    println!("\n--- Step 1: Original File ---");
    println!("Size: {} bytes", original_size);
    println!("Magic: {:?}", String::from_utf8_lossy(&original_data[0..4]));
    
    // Step 2: Parse with ltk_meta
    println!("\n--- Step 2: Parsing with ltk_meta ---");
    let mut cursor = Cursor::new(&original_data);
    let bin_tree = match BinTree::from_reader(&mut cursor) {
        Ok(tree) => tree,
        Err(e) => {
            eprintln!("ERROR: Failed to parse BIN: {:?}", e);
            std::process::exit(1);
        }
    };
    
    println!("Objects count: {}", bin_tree.objects.len());
    println!("Dependencies count: {}", bin_tree.dependencies.len());
    
    // List objects
    println!("\nObjects (entry path hashes):");
    for (hash, obj) in &bin_tree.objects {
        let prop_count = obj.properties.len();
        println!("  0x{:08x} (class: 0x{:08x}) - {} properties", hash, obj.class_hash, prop_count);
    }
    
    // List dependencies
    if !bin_tree.dependencies.is_empty() {
        println!("\nDependencies (linked BINs):");
        for dep in &bin_tree.dependencies {
            println!("  {}", dep);
        }
    }
    
    // Step 3: Write back with ltk_meta
    println!("\n--- Step 3: Writing back with ltk_meta ---");
    let mut output_cursor = Cursor::new(Vec::new());
    if let Err(e) = bin_tree.to_writer(&mut output_cursor) {
        eprintln!("ERROR: Failed to write BIN: {:?}", e);
        std::process::exit(1);
    }
    let output_data = output_cursor.into_inner();
    let output_size = output_data.len();
    
    println!("Output size: {} bytes", output_size);
    println!("Size difference: {} bytes", output_size as i64 - original_size as i64);
    
    // Step 4: Re-parse the output to verify
    println!("\n--- Step 4: Re-parsing output ---");
    let mut verify_cursor = Cursor::new(&output_data);
    let verify_tree = match BinTree::from_reader(&mut verify_cursor) {
        Ok(tree) => tree,
        Err(e) => {
            eprintln!("ERROR: Failed to re-parse output: {:?}", e);
            std::process::exit(1);
        }
    };
    
    println!("Verified objects count: {}", verify_tree.objects.len());
    println!("Verified dependencies count: {}", verify_tree.dependencies.len());
    
    // Step 5: Compare
    println!("\n--- Step 5: Comparison ---");
    let objects_match = bin_tree.objects.len() == verify_tree.objects.len();
    let deps_match = bin_tree.dependencies.len() == verify_tree.dependencies.len();
    
    if objects_match {
        println!("✅ Object count matches: {}", bin_tree.objects.len());
    } else {
        println!("❌ Object count MISMATCH: {} -> {}", bin_tree.objects.len(), verify_tree.objects.len());
    }
    
    if deps_match {
        println!("✅ Dependencies count matches: {}", bin_tree.dependencies.len());
    } else {
        println!("❌ Dependencies count MISMATCH: {} -> {}", bin_tree.dependencies.len(), verify_tree.dependencies.len());
    }
    
    // Step 6: Convert to text for visual comparison (WITH HASH RESOLUTION)
    println!("\n--- Step 6: Converting to ritobin text with hash resolution ---");
    
    // Load hashes from RitoShark directory
    let mut hashes = ltk_ritobin::HashMapProvider::new();
    if let Ok(appdata) = std::env::var("APPDATA") {
        let hash_dir = std::path::PathBuf::from(appdata)
            .join("RitoShark")
            .join("Requirements")
            .join("Hashes");
        
        if hash_dir.exists() {
            println!("Loading hashes from: {}", hash_dir.display());
            hashes.load_from_directory(&hash_dir);
            println!("Loaded {} total hashes", hashes.total_count());
        } else {
            println!("WARNING: Hash directory not found: {}", hash_dir.display());
        }
    }
    
    let original_text = match ltk_ritobin::write_with_hashes(&bin_tree, &hashes) {
        Ok(text) => text,
        Err(e) => {
            eprintln!("WARNING: Failed to convert to text: {:?}", e);
            String::new()
        }
    };
    
    let output_text = match ltk_ritobin::write_with_hashes(&verify_tree, &hashes) {
        Ok(text) => text,
        Err(e) => {
            eprintln!("WARNING: Failed to convert output to text: {:?}", e);
            String::new()
        }
    };
    
    // Save outputs
    let parent = input_path.parent().unwrap_or(Path::new("."));
    let stem = input_path.file_stem().unwrap_or_default().to_string_lossy();
    
    let output_bin_path = parent.join(format!("{}_roundtrip.bin", stem));
    let original_text_path = parent.join(format!("{}_original.ritobin", stem));
    let output_text_path = parent.join(format!("{}_roundtrip.ritobin", stem));
    
    fs::write(&output_bin_path, &output_data).expect("Failed to write output bin");
    fs::write(&original_text_path, &original_text).expect("Failed to write original text");
    fs::write(&output_text_path, &output_text).expect("Failed to write output text");
    
    println!("\nSaved files:");
    println!("  Binary: {}", output_bin_path.display());
    println!("  Original text: {}", original_text_path.display());
    println!("  Roundtrip text: {}", output_text_path.display());
    
    // Final verdict
    println!("\n=== VERDICT ===");
    if original_size == output_size && objects_match && deps_match {
        println!("✅ Roundtrip appears SUCCESSFUL - no obvious data loss");
    } else {
        println!("⚠️  Roundtrip shows DIFFERENCES:");
        println!("   Size: {} -> {} ({} bytes)", original_size, output_size, output_size as i64 - original_size as i64);
        println!("   Objects: {} -> {}", bin_tree.objects.len(), verify_tree.objects.len());
        println!("   Deps: {} -> {}", bin_tree.dependencies.len(), verify_tree.dependencies.len());
    }
    
    println!("\n💡 Compare the .ritobin files to see exactly what changed!");
    println!("   Use: diff {} {}", original_text_path.display(), output_text_path.display());
}
