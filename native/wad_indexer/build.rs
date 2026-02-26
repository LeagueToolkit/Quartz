fn main() {
  napi_build::setup();
  // LMDB (via lmdb-master-sys) uses Windows security APIs on Windows
  #[cfg(target_os = "windows")]
  println!("cargo:rustc-link-lib=advapi32");
}
