/*!
Types for reading and writing League of Legends
property bin files (`.bin`).

Property bins are hierarchical data structures used throughout League's
game data. They contain objects with typed properties that can reference
other objects and external files.

## Quick Start

### Reading a bin file

```no_run
use std::fs::File;
use ltk_meta::Bin;

let mut file = File::open("data.bin")?;
let tree = Bin::from_reader(&mut file)?;

for (path_hash, object) in &tree.objects {
    println!("Object {:08x} has {} properties", path_hash, object.properties.len());
}
# Ok::<(), Box<dyn std::error::Error>>(())
```

### Creating a bin file programmatically

```
use ltk_meta::{Bin, BinObject};
use ltk_meta::property::values;

// Using the builder pattern
let tree = Bin::builder()
    .dependency("common.bin")
    .object(
        BinObject::builder(0x12345678, 0xABCDEF00)
            .property(0x1111, values::I32::new(42))
            .property(0x2222, values::String::from("hello"))
            .build()
    )
    .build();

// Or using the simple constructor
let tree = Bin::new(
    [BinObject::new(0x1234, 0x5678)],
    ["dependency.bin"],
);
```

### Modifying a bin file

```no_run
use std::fs::File;
use std::io::Cursor;
use ltk_meta::{Bin, BinObject};

let mut file = File::open("data.bin")?;
let mut tree = Bin::from_reader(&mut file)?;

// Add a new object
tree.add_object(BinObject::new(0x11112222, 0x33334444));

// Remove an object
tree.remove_object(0x55556666);

// Write back
let mut output = Cursor::new(Vec::new());
tree.to_writer(&mut output)?;
# Ok::<(), Box<dyn std::error::Error>>(())
```
*/
pub mod property;
pub use property::{BinProperty, Kind as PropertyKind, PropertyValueEnum};

mod tree;
pub use tree::*;

mod error;
pub use error::*;

pub mod traits;
