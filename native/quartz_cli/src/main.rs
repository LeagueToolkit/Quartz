mod commands;
mod hashes;
mod utils;

#[cfg(windows)]
#[link(name = "Advapi32")]
extern "C" {}

use std::env;
use std::io::{self, Read};
use std::path::{Path, PathBuf};
use std::process;

use hashes::default_hash_dir;

fn pause_and_exit(code: i32) -> ! {
    eprintln!();
    eprintln!("Press Enter to close...");
    let _ = io::stdin().read(&mut [0u8]);
    process::exit(code);
}

fn print_usage() {
    eprintln!("quartz_cli - League of Legends bin/py/texture converter");
    eprintln!();
    eprintln!("Usage:");
    eprintln!("  quartz_cli to-py         <file.bin>   Convert .bin to .py");
    eprintln!("  quartz_cli to-bin        <file.py>    Convert .py to .bin");
    eprintln!("  quartz_cli separate-vfx  <file.bin>   Extract VFX entries into a separate bin");
    eprintln!("  quartz_cli combine-linked <file.bin>  Merge linked bins into main bin");
    eprintln!("  quartz_cli noskinlite    <file.bin>   Clone skin0..99 with resolver fixes");
    eprintln!("  quartz_cli batch-split-vfx <file.bin> Split emitters for replay workflows");
    eprintln!("  quartz_cli tex2dds       <file.tex>   Convert .tex to .dds");
    eprintln!("  quartz_cli dds2tex       <file.dds>   Convert .dds to .tex");
    eprintln!("  quartz_cli tex2png       <file.tex>   Convert .tex to .png");
    eprintln!("  quartz_cli dds2png       <file.dds>   Convert .dds to .png");
    eprintln!("  quartz_cli png2tex       <file.png>   Convert .png to .tex");
    eprintln!("  quartz_cli png2dds       <file.png>   Convert .png to .dds");
    eprintln!("  quartz_cli tex2ddsdir    <folder>     Convert all .tex to .dds recursively");
    eprintln!("  quartz_cli dds2texdir    <folder>     Convert all .dds to .tex recursively");
    eprintln!("  quartz_cli tex2pngdir    <folder>     Convert all .tex to .png recursively");
    eprintln!("  quartz_cli dds2pngdir    <folder>     Convert all .dds to .png recursively");
    eprintln!("  quartz_cli png2texdir    <folder>     Convert all .png to .tex recursively");
    eprintln!("  quartz_cli png2ddsdir    <folder>     Convert all .png to .dds recursively");
    eprintln!("  quartz_cli ritobindir2py <folder>     Convert all .bin to .py recursively");
    eprintln!("  quartz_cli ritobindir2bin <folder>    Convert all .py to .bin recursively");
    eprintln!("  quartz_cli extract-hashes-bin <file.bin>  Extract hashes from one .bin into FrogTools/hashes");
    eprintln!("  quartz_cli extract-hashes-bin-dir <folder>  Extract hashes from all .bin files recursively");
    eprintln!("  quartz_cli pyntex-missing <folder>    List missing referenced files from .bin content");
    eprintln!("  quartz_cli pyntex-deljunk <folder>    Remove unreferenced junk files (LtMAO-like)");
    eprintln!("  quartz_cli extract-hashes-wad <file.wad|file.wad.client>  Extract hashes into FrogTools/hashes");
    eprintln!("  quartz_cli extract-unpack-wad <file.wad|file.wad.client> [output_dir]  Extract hashes, then unpack");
    eprintln!("  quartz_cli unpack-wad    <file.wad|file.wad.client> [output_dir]  Unpack WAD using available hashes");
    eprintln!("  quartz_cli pack-wad      <folder> [output.wad.client]  Pack folder into .wad.client");
    eprintln!();
    eprintln!("Options:");
    eprintln!("  --hash-dir <dir>  Custom hash directory (default: %APPDATA%/FrogTools/hashes/)");
}

fn main() {
    let args: Vec<String> = env::args().collect();

    // File-association fallback:
    // When Windows launches quartz_cli.exe directly as the default app for a file,
    // it typically passes only the file path (no explicit subcommand).
    if args.len() == 2 {
        let path = Path::new(&args[1]);
        if path.exists() && path.is_file() {
            let ext = path
                .extension()
                .and_then(|e| e.to_str())
                .unwrap_or("")
                .to_ascii_lowercase();

            match ext.as_str() {
                "bin" => {
                    let hash_dir = default_hash_dir();
                    if let Err(e) = commands::to_py::run(path, hash_dir.as_deref()) {
                        eprintln!("Error: {}", e);
                        pause_and_exit(1);
                    }
                    return;
                }
                "py" => {
                    if let Err(e) = commands::to_bin::run(path) {
                        eprintln!("Error: {}", e);
                        pause_and_exit(1);
                    }
                    return;
                }
                _ => {}
            }
        }
    }

    if args.len() < 2 {
        print_usage();
        pause_and_exit(1);
    }

    match args[1].as_str() {
        "to-py" => {
            if args.len() < 3 {
                eprintln!("Error: missing .bin file path");
                pause_and_exit(1);
            }

            let path = Path::new(&args[2]);
            if !path.exists() {
                eprintln!("Error: file not found: {}", path.display());
                pause_and_exit(1);
            }

            let hash_dir = if args.len() >= 5 && args[3] == "--hash-dir" {
                Some(PathBuf::from(&args[4]))
            } else {
                default_hash_dir()
            };

            if let Err(e) = commands::to_py::run(path, hash_dir.as_deref()) {
                eprintln!("Error: {}", e);
                pause_and_exit(1);
            }
        }
        "to-bin" => {
            if args.len() < 3 {
                eprintln!("Error: missing .py file path");
                pause_and_exit(1);
            }

            let path = Path::new(&args[2]);
            if !path.exists() {
                eprintln!("Error: file not found: {}", path.display());
                pause_and_exit(1);
            }

            if let Err(e) = commands::to_bin::run(path) {
                eprintln!("Error: {}", e);
                pause_and_exit(1);
            }
        }
        "separate-vfx" => {
            if args.len() < 3 {
                eprintln!("Error: missing .bin file path");
                pause_and_exit(1);
            }

            let path = Path::new(&args[2]);
            if !path.exists() {
                eprintln!("Error: file not found: {}", path.display());
                pause_and_exit(1);
            }

            if let Err(e) = commands::separate_vfx::run(path) {
                eprintln!("Error: {}", e);
                pause_and_exit(1);
            }
        }
        "combine-linked" => {
            if args.len() < 3 {
                eprintln!("Error: missing .bin file path");
                pause_and_exit(1);
            }

            let path = Path::new(&args[2]);
            if !path.exists() {
                eprintln!("Error: file not found: {}", path.display());
                pause_and_exit(1);
            }

            if let Err(e) = commands::combine_linked::run(path) {
                eprintln!("Error: {}", e);
                pause_and_exit(1);
            }
        }
        "noskinlite" => {
            if args.len() < 3 {
                eprintln!("Error: missing .bin file path");
                pause_and_exit(1);
            }

            let path = Path::new(&args[2]);
            if !path.exists() {
                eprintln!("Error: file not found: {}", path.display());
                pause_and_exit(1);
            }

            if let Err(e) = commands::noskinlite::run(path) {
                eprintln!("Error: {}", e);
                pause_and_exit(1);
            }
        }
        "batch-split-vfx" => {
            if args.len() < 3 {
                eprintln!("Error: missing .bin file path");
                pause_and_exit(1);
            }

            let path = Path::new(&args[2]);
            if !path.exists() {
                eprintln!("Error: file not found: {}", path.display());
                pause_and_exit(1);
            }

            if let Err(e) = commands::batch_split_vfx::run(path) {
                eprintln!("Error: {}", e);
                pause_and_exit(1);
            }
        }
        "tex2dds" => {
            if args.len() < 3 {
                eprintln!("Error: missing .tex file path");
                pause_and_exit(1);
            }

            let path = Path::new(&args[2]);
            if !path.exists() {
                eprintln!("Error: file not found: {}", path.display());
                pause_and_exit(1);
            }

            if let Err(e) = commands::texture::tex2dds(path) {
                eprintln!("Error: {}", e);
                pause_and_exit(1);
            }
        }
        "dds2tex" => {
            if args.len() < 3 {
                eprintln!("Error: missing .dds file path");
                pause_and_exit(1);
            }

            let path = Path::new(&args[2]);
            if !path.exists() {
                eprintln!("Error: file not found: {}", path.display());
                pause_and_exit(1);
            }

            if let Err(e) = commands::texture::dds2tex(path) {
                eprintln!("Error: {}", e);
                pause_and_exit(1);
            }
        }
        "tex2png" => {
            if args.len() < 3 {
                eprintln!("Error: missing .tex file path");
                pause_and_exit(1);
            }

            let path = Path::new(&args[2]);
            if !path.exists() {
                eprintln!("Error: file not found: {}", path.display());
                pause_and_exit(1);
            }

            if let Err(e) = commands::texture::tex2png(path) {
                eprintln!("Error: {}", e);
                pause_and_exit(1);
            }
        }
        "dds2png" => {
            if args.len() < 3 {
                eprintln!("Error: missing .dds file path");
                pause_and_exit(1);
            }

            let path = Path::new(&args[2]);
            if !path.exists() {
                eprintln!("Error: file not found: {}", path.display());
                pause_and_exit(1);
            }

            if let Err(e) = commands::texture::dds2png(path) {
                eprintln!("Error: {}", e);
                pause_and_exit(1);
            }
        }
        "png2tex" => {
            if args.len() < 3 {
                eprintln!("Error: missing .png file path");
                pause_and_exit(1);
            }

            let path = Path::new(&args[2]);
            if !path.exists() {
                eprintln!("Error: file not found: {}", path.display());
                pause_and_exit(1);
            }

            if let Err(e) = commands::texture::png2tex(path) {
                eprintln!("Error: {}", e);
                pause_and_exit(1);
            }
        }
        "png2dds" => {
            if args.len() < 3 {
                eprintln!("Error: missing .png file path");
                pause_and_exit(1);
            }

            let path = Path::new(&args[2]);
            if !path.exists() {
                eprintln!("Error: file not found: {}", path.display());
                pause_and_exit(1);
            }

            if let Err(e) = commands::texture::png2dds(path) {
                eprintln!("Error: {}", e);
                pause_and_exit(1);
            }
        }
        "tex2ddsdir" => {
            if args.len() < 3 {
                eprintln!("Error: missing folder path");
                pause_and_exit(1);
            }

            let path = Path::new(&args[2]);
            if !path.exists() {
                eprintln!("Error: folder not found: {}", path.display());
                pause_and_exit(1);
            }

            if let Err(e) = commands::texture::tex2dds_dir(path) {
                eprintln!("Error: {}", e);
                pause_and_exit(1);
            }
        }
        "dds2texdir" => {
            if args.len() < 3 {
                eprintln!("Error: missing folder path");
                pause_and_exit(1);
            }

            let path = Path::new(&args[2]);
            if !path.exists() {
                eprintln!("Error: folder not found: {}", path.display());
                pause_and_exit(1);
            }

            if let Err(e) = commands::texture::dds2tex_dir(path) {
                eprintln!("Error: {}", e);
                pause_and_exit(1);
            }
        }
        "tex2pngdir" => {
            if args.len() < 3 {
                eprintln!("Error: missing folder path");
                pause_and_exit(1);
            }

            let path = Path::new(&args[2]);
            if !path.exists() {
                eprintln!("Error: folder not found: {}", path.display());
                pause_and_exit(1);
            }

            if let Err(e) = commands::texture::tex2png_dir(path) {
                eprintln!("Error: {}", e);
                pause_and_exit(1);
            }
        }
        "dds2pngdir" => {
            if args.len() < 3 {
                eprintln!("Error: missing folder path");
                pause_and_exit(1);
            }

            let path = Path::new(&args[2]);
            if !path.exists() {
                eprintln!("Error: folder not found: {}", path.display());
                pause_and_exit(1);
            }

            if let Err(e) = commands::texture::dds2png_dir(path) {
                eprintln!("Error: {}", e);
                pause_and_exit(1);
            }
        }
        "png2texdir" => {
            if args.len() < 3 {
                eprintln!("Error: missing folder path");
                pause_and_exit(1);
            }

            let path = Path::new(&args[2]);
            if !path.exists() {
                eprintln!("Error: folder not found: {}", path.display());
                pause_and_exit(1);
            }

            if let Err(e) = commands::texture::png2tex_dir(path) {
                eprintln!("Error: {}", e);
                pause_and_exit(1);
            }
        }
        "png2ddsdir" => {
            if args.len() < 3 {
                eprintln!("Error: missing folder path");
                pause_and_exit(1);
            }

            let path = Path::new(&args[2]);
            if !path.exists() {
                eprintln!("Error: folder not found: {}", path.display());
                pause_and_exit(1);
            }

            if let Err(e) = commands::texture::png2dds_dir(path) {
                eprintln!("Error: {}", e);
                pause_and_exit(1);
            }
        }
        "ritobindir2py" => {
            if args.len() < 3 {
                eprintln!("Error: missing folder path");
                pause_and_exit(1);
            }
            let path = Path::new(&args[2]);
            if !path.exists() {
                eprintln!("Error: folder not found: {}", path.display());
                pause_and_exit(1);
            }
            let hash_dir = default_hash_dir();
            if let Err(e) = commands::ritobin_dir::bin_to_py_dir(path, hash_dir.as_deref()) {
                eprintln!("Error: {}", e);
                pause_and_exit(1);
            }
        }
        "ritobindir2bin" => {
            if args.len() < 3 {
                eprintln!("Error: missing folder path");
                pause_and_exit(1);
            }
            let path = Path::new(&args[2]);
            if !path.exists() {
                eprintln!("Error: folder not found: {}", path.display());
                pause_and_exit(1);
            }
            if let Err(e) = commands::ritobin_dir::py_to_bin_dir(path) {
                eprintln!("Error: {}", e);
                pause_and_exit(1);
            }
        }
        "extract-hashes-bin" => {
            if args.len() < 3 {
                eprintln!("Error: missing .bin file path");
                pause_and_exit(1);
            }
            let path = Path::new(&args[2]);
            if !path.exists() {
                eprintln!("Error: file not found: {}", path.display());
                pause_and_exit(1);
            }
            let Some(hash_dir) = default_hash_dir() else {
                eprintln!("Error: could not resolve default hash directory");
                pause_and_exit(1);
            };
            if let Err(e) = commands::bin_hashes::extract_hashes(path, &hash_dir) {
                eprintln!("Error: {}", e);
                pause_and_exit(1);
            }
        }
        "extract-hashes-bin-dir" => {
            if args.len() < 3 {
                eprintln!("Error: missing folder path");
                pause_and_exit(1);
            }
            let path = Path::new(&args[2]);
            if !path.exists() {
                eprintln!("Error: folder not found: {}", path.display());
                pause_and_exit(1);
            }
            let Some(hash_dir) = default_hash_dir() else {
                eprintln!("Error: could not resolve default hash directory");
                pause_and_exit(1);
            };
            if let Err(e) = commands::bin_hashes::extract_hashes_dir(path, &hash_dir) {
                eprintln!("Error: {}", e);
                pause_and_exit(1);
            }
        }
        "pyntex-missing" => {
            if args.len() < 3 {
                eprintln!("Error: missing folder path");
                pause_and_exit(1);
            }
            let path = Path::new(&args[2]);
            if !path.exists() {
                eprintln!("Error: folder not found: {}", path.display());
                pause_and_exit(1);
            }
            if let Err(e) = commands::pyntex::check_missing_files(path) {
                eprintln!("Error: {}", e);
                pause_and_exit(1);
            }
        }
        "pyntex-deljunk" => {
            if args.len() < 3 {
                eprintln!("Error: missing folder path");
                pause_and_exit(1);
            }
            let path = Path::new(&args[2]);
            if !path.exists() {
                eprintln!("Error: folder not found: {}", path.display());
                pause_and_exit(1);
            }
            if let Err(e) = commands::pyntex::remove_junk_files(path) {
                eprintln!("Error: {}", e);
                pause_and_exit(1);
            }
        }
        "extract-hashes-wad" => {
            if args.len() < 3 {
                eprintln!("Error: missing .wad/.wad.client file path");
                pause_and_exit(1);
            }
            let wad_path = Path::new(&args[2]);
            if !wad_path.exists() {
                eprintln!("Error: file not found: {}", wad_path.display());
                pause_and_exit(1);
            }
            let Some(hash_dir) = default_hash_dir() else {
                eprintln!("Error: could not resolve default hash directory");
                pause_and_exit(1);
            };
            if let Err(e) = commands::wad::extract_hashes(wad_path, &hash_dir) {
                eprintln!("Error: {}", e);
                pause_and_exit(1);
            }
        }
        "unpack-wad" => {
            if args.len() < 3 {
                eprintln!("Error: missing .wad/.wad.client file path");
                pause_and_exit(1);
            }
            let wad_path = Path::new(&args[2]);
            if !wad_path.exists() {
                eprintln!("Error: file not found: {}", wad_path.display());
                pause_and_exit(1);
            }
            let output_dir = if args.len() >= 4 {
                Some(Path::new(&args[3]))
            } else {
                None
            };
            let hash_dir = default_hash_dir();
            if let Err(e) = commands::wad::unpack(wad_path, output_dir, hash_dir.as_deref()) {
                eprintln!("Error: {}", e);
                pause_and_exit(1);
            }
        }
        "extract-unpack-wad" => {
            if args.len() < 3 {
                eprintln!("Error: missing .wad/.wad.client file path");
                pause_and_exit(1);
            }
            let wad_path = Path::new(&args[2]);
            if !wad_path.exists() {
                eprintln!("Error: file not found: {}", wad_path.display());
                pause_and_exit(1);
            }
            let output_dir = if args.len() >= 4 {
                Some(Path::new(&args[3]))
            } else {
                None
            };
            let Some(hash_dir) = default_hash_dir() else {
                eprintln!("Error: could not resolve default hash directory");
                pause_and_exit(1);
            };
            if let Err(e) = commands::wad::extract_and_unpack(wad_path, output_dir, &hash_dir) {
                eprintln!("Error: {}", e);
                pause_and_exit(1);
            }
        }
        "pack-wad" => {
            if args.len() < 3 {
                eprintln!("Error: missing folder path");
                pause_and_exit(1);
            }
            let input_dir = Path::new(&args[2]);
            if !input_dir.exists() {
                eprintln!("Error: folder not found: {}", input_dir.display());
                pause_and_exit(1);
            }
            let output_wad = if args.len() >= 4 {
                Some(Path::new(&args[3]))
            } else {
                None
            };
            if let Err(e) = commands::wad::pack_dir_to_wad(input_dir, output_wad) {
                eprintln!("Error: {}", e);
                pause_and_exit(1);
            }
        }
        "help" | "--help" | "-h" => print_usage(),
        other => {
            eprintln!("Unknown command: {}", other);
            print_usage();
            pause_and_exit(1);
        }
    }
}
