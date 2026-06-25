//! WEM → OGG/WAV decoder (Rust port of ww2ogg).
//!
//! Converts Wwise WEM audio files (RIFF-wrapped Vorbis) to standard OGG Vorbis
//! or WAV PCM that browsers can play via Web Audio API.

use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DecodedAudio {
    pub data: Vec<u8>,
    pub format: String, // "ogg" or "wav"
    pub sample_rate: Option<u32>,
}

const CODEBOOK_DATA: &[u8] = include_bytes!("../../resources/packed_codebooks_aoTuV_603.bin");

/// The packed Vorbis codebook embedded in the decoder.
pub fn codebook_bytes() -> &'static [u8] {
    CODEBOOK_DATA
}

// ---------------------------------------------------------------------------
// OGG CRC lookup table
// ---------------------------------------------------------------------------

#[rustfmt::skip]
const CRC_LOOKUP: [u32; 256] = [
    0x00000000, 0x04c11db7, 0x09823b6e, 0x0d4326d9,
    0x130476dc, 0x17c56b6b, 0x1a864db2, 0x1e475005,
    0x2608edb8, 0x22c9f00f, 0x2f8ad6d6, 0x2b4bcb61,
    0x350c9b64, 0x31cd86d3, 0x3c8ea00a, 0x384fbdbd,
    0x4c11db70, 0x48d0c6c7, 0x4593e01e, 0x4152fda9,
    0x5f15adac, 0x5bd4b01b, 0x569796c2, 0x52568b75,
    0x6a1936c8, 0x6ed82b7f, 0x639b0da6, 0x675a1011,
    0x791d4014, 0x7ddc5da3, 0x709f7b7a, 0x745e66cd,
    0x9823b6e0, 0x9ce2ab57, 0x91a18d8e, 0x95609039,
    0x8b27c03c, 0x8fe6dd8b, 0x82a5fb52, 0x8664e6e5,
    0xbe2b5b58, 0xbaea46ef, 0xb7a96036, 0xb3687d81,
    0xad2f2d84, 0xa9ee3033, 0xa4ad16ea, 0xa06c0b5d,
    0xd4326d90, 0xd0f37027, 0xddb056fe, 0xd9714b49,
    0xc7361b4c, 0xc3f706fb, 0xceb42022, 0xca753d95,
    0xf23a8028, 0xf6fb9d9f, 0xfbb8bb46, 0xff79a6f1,
    0xe13ef6f4, 0xe5ffeb43, 0xe8bccd9a, 0xec7dd02d,
    0x34867077, 0x30476dc0, 0x3d044b19, 0x39c556ae,
    0x278206ab, 0x23431b1c, 0x2e003dc5, 0x2ac12072,
    0x128e9dcf, 0x164f8078, 0x1b0ca6a1, 0x1fcdbb16,
    0x018aeb13, 0x054bf6a4, 0x0808d07d, 0x0cc9cdca,
    0x7897ab07, 0x7c56b6b0, 0x71159069, 0x75d48dde,
    0x6b93dddb, 0x6f52c06c, 0x6211e6b5, 0x66d0fb02,
    0x5e9f46bf, 0x5a5e5b08, 0x571d7dd1, 0x53dc6066,
    0x4d9b3063, 0x495a2dd4, 0x44190b0d, 0x40d816ba,
    0xaca5c697, 0xa864db20, 0xa527fdf9, 0xa1e6e04e,
    0xbfa1b04b, 0xbb60adfc, 0xb6238b25, 0xb2e29692,
    0x8aad2b2f, 0x8e6c3698, 0x832f1041, 0x87ee0df6,
    0x99a95df3, 0x9d684044, 0x902b669d, 0x94ea7b2a,
    0xe0b41de7, 0xe4750050, 0xe9362689, 0xedf73b3e,
    0xf3b06b3b, 0xf771768c, 0xfa325055, 0xfef34de2,
    0xc6bcf05f, 0xc27dede8, 0xcf3ecb31, 0xcbffd686,
    0xd5b88683, 0xd1799b34, 0xdc3abded, 0xd8fba05a,
    0x690ce0ee, 0x6dcdfd59, 0x608edb80, 0x644fc637,
    0x7a089632, 0x7ec98b85, 0x738aad5c, 0x774bb0eb,
    0x4f040d56, 0x4bc510e1, 0x46863638, 0x42472b8f,
    0x5c007b8a, 0x58c1663d, 0x558240e4, 0x51435d53,
    0x251d3b9e, 0x21dc2629, 0x2c9f00f0, 0x285e1d47,
    0x36194d42, 0x32d850f5, 0x3f9b762c, 0x3b5a6b9b,
    0x0315d626, 0x07d4cb91, 0x0a97ed48, 0x0e56f0ff,
    0x1011a0fa, 0x14d0bd4d, 0x19939b94, 0x1d528623,
    0xf12f560e, 0xf5ee4bb9, 0xf8ad6d60, 0xfc6c70d7,
    0xe22b20d2, 0xe6ea3d65, 0xeba91bbc, 0xef68060b,
    0xd727bbb6, 0xd3e6a601, 0xdea580d8, 0xda649d6f,
    0xc423cd6a, 0xc0e2d0dd, 0xcda1f604, 0xc960ebb3,
    0xbd3e8d7e, 0xb9ff90c9, 0xb4bcb610, 0xb07daba7,
    0xae3afba2, 0xaafbe615, 0xa7b8c0cc, 0xa379dd7b,
    0x9b3660c6, 0x9ff77d71, 0x92b45ba8, 0x9675461f,
    0x8832161a, 0x8cf30bad, 0x81b02d74, 0x857130c3,
    0x5d8a9099, 0x594b8d2e, 0x5408abf7, 0x50c9b640,
    0x4e8ee645, 0x4a4ffbf2, 0x470cdd2b, 0x43cdc09c,
    0x7b827d21, 0x7f436096, 0x7200464f, 0x76c15bf8,
    0x68860bfd, 0x6c47164a, 0x61043093, 0x65c52d24,
    0x119b4be9, 0x155a565e, 0x18197087, 0x1cd86d30,
    0x029f3d35, 0x065e2082, 0x0b1d065b, 0x0fdc1bec,
    0x3793a651, 0x3352bbe6, 0x3e119d3f, 0x3ad08088,
    0x2497d08d, 0x2056cd3a, 0x2d15ebe3, 0x29d4f654,
    0xc5a92679, 0xc1683bce, 0xcc2b1d17, 0xc8ea00a0,
    0xd6ad50a5, 0xd26c4d12, 0xdf2f6bcb, 0xdbee767c,
    0xe3a1cbc1, 0xe760d676, 0xea23f0af, 0xeee2ed18,
    0xf0a5bd1d, 0xf464a0aa, 0xf9278673, 0xfde69bc4,
    0x89b8fd09, 0x8d79e0be, 0x803ac667, 0x84fbdbd0,
    0x9abc8bd5, 0x9e7d9662, 0x933eb0bb, 0x97ffad0c,
    0xafb010b1, 0xab710d06, 0xa6322bdf, 0xa2f33668,
    0xbcb4666d, 0xb8757bda, 0xb5365d03, 0xb1f740b4,
];

fn ogg_checksum(data: &[u8]) -> u32 {
    let mut crc: u32 = 0;
    for &b in data {
        crc = (crc << 8) ^ CRC_LOOKUP[((crc >> 24) as u8 ^ b) as usize];
    }
    crc
}

// ---------------------------------------------------------------------------
// Helper: read LE integers from byte slices
// ---------------------------------------------------------------------------

fn read_u16_le(data: &[u8], off: usize) -> u16 {
    u16::from_le_bytes([data[off], data[off + 1]])
}

fn read_u32_le(data: &[u8], off: usize) -> u32 {
    u32::from_le_bytes([data[off], data[off + 1], data[off + 2], data[off + 3]])
}

fn write_u16_le(data: &mut [u8], off: usize, val: u16) {
    let bytes = val.to_le_bytes();
    data[off] = bytes[0];
    data[off + 1] = bytes[1];
}

fn write_u32_le(data: &mut [u8], off: usize, val: u32) {
    let bytes = val.to_le_bytes();
    data[off] = bytes[0];
    data[off + 1] = bytes[1];
    data[off + 2] = bytes[2];
    data[off + 3] = bytes[3];
}

// ---------------------------------------------------------------------------
// BitReader — reads bits LSB-first from a byte stream
// ---------------------------------------------------------------------------

struct BitReader<'a> {
    data: &'a [u8],
    byte_offset: usize,
    bit_buffer: u8,
    bits_left: u8,
    total_bits_read: usize,
}

impl<'a> BitReader<'a> {
    fn new(data: &'a [u8], initial_offset: usize) -> Self {
        Self {
            data,
            byte_offset: initial_offset,
            bit_buffer: 0,
            bits_left: 0,
            total_bits_read: 0,
        }
    }

    fn get_bit(&mut self) -> Result<u32, String> {
        if self.bits_left == 0 {
            let pos = self.byte_offset + self.total_bits_read / 8;
            if pos >= self.data.len() {
                return Err("BitReader: out of bits".into());
            }
            self.bit_buffer = self.data[pos];
            self.bits_left = 8;
        }
        self.total_bits_read += 1;
        self.bits_left -= 1;
        Ok(if (self.bit_buffer & (0x80 >> self.bits_left)) != 0 {
            1
        } else {
            0
        })
    }

    fn read_bits(&mut self, count: u32) -> Result<u32, String> {
        let mut value: u32 = 0;
        for i in 0..count {
            if self.get_bit()? != 0 {
                value |= 1 << i;
            }
        }
        Ok(value)
    }

    fn total_bits_read(&self) -> usize {
        self.total_bits_read
    }
}

// ---------------------------------------------------------------------------
// BitOggWriter — writes bits and constructs OGG pages
// ---------------------------------------------------------------------------

struct BitOggWriter {
    output: Vec<u8>,
    bit_buffer: u8,
    bits_stored: u8,
    payload_bytes: usize,
    first: bool,
    continued: bool,
    granule: u32,
    seqno: u32,
    page_buffer: Vec<u8>,
}

impl BitOggWriter {
    fn new() -> Self {
        Self {
            output: Vec::new(),
            bit_buffer: 0,
            bits_stored: 0,
            payload_bytes: 0,
            first: true,
            continued: false,
            granule: 0,
            seqno: 0,
            page_buffer: vec![0u8; 27 + 255 + 255 * 255],
        }
    }

    fn put_bit(&mut self, bit: bool) {
        if bit {
            self.bit_buffer |= 1 << self.bits_stored;
        }
        self.bits_stored += 1;
        if self.bits_stored == 8 {
            self.flush_bits();
        }
    }

    fn write_bits(&mut self, value: u32, count: u32) {
        for i in 0..count {
            self.put_bit((value & (1 << i)) != 0);
        }
    }

    fn set_granule(&mut self, g: u32) {
        self.granule = g;
    }

    fn flush_bits(&mut self) {
        if self.bits_stored != 0 {
            if self.payload_bytes == 255 * 255 {
                self.flush_page(true, false);
            }
            self.page_buffer[27 + 255 + self.payload_bytes] = self.bit_buffer;
            self.payload_bytes += 1;
            self.bits_stored = 0;
            self.bit_buffer = 0;
        }
    }

    fn flush_page(&mut self, next_continued: bool, last: bool) {
        if self.payload_bytes != 255 * 255 {
            self.flush_bits();
        }

        if self.payload_bytes == 0 {
            return;
        }

        let segment_size: usize = 255;
        let mut segments = self.payload_bytes.div_ceil(segment_size);
        if segments == 256 {
            segments = 255;
        }

        for i in 0..self.payload_bytes {
            self.page_buffer[27 + segments + i] = self.page_buffer[27 + 255 + i];
        }

        self.page_buffer[0] = b'O';
        self.page_buffer[1] = b'g';
        self.page_buffer[2] = b'g';
        self.page_buffer[3] = b'S';
        self.page_buffer[4] = 0; // stream_structure_version
        self.page_buffer[5] = (if self.continued { 1 } else { 0 })
            | (if self.first { 2 } else { 0 })
            | (if last { 4 } else { 0 });

        // Granule position (64 bits)
        write_u32_le(&mut self.page_buffer, 6, self.granule);
        if self.granule == 0xFFFFFFFF {
            write_u32_le(&mut self.page_buffer, 10, 0xFFFFFFFF);
        } else {
            write_u32_le(&mut self.page_buffer, 10, 0);
        }

        write_u32_le(&mut self.page_buffer, 14, 1); // stream serial number
        write_u32_le(&mut self.page_buffer, 18, self.seqno); // page sequence
        write_u32_le(&mut self.page_buffer, 22, 0); // checksum placeholder
        self.page_buffer[26] = segments as u8; // segment count

        // Lacing values
        let mut bytes_left = self.payload_bytes;
        for i in 0..segments {
            if bytes_left >= segment_size {
                bytes_left -= segment_size;
                self.page_buffer[27 + i] = segment_size as u8;
            } else {
                self.page_buffer[27 + i] = bytes_left as u8;
            }
        }

        let page_size = 27 + segments + self.payload_bytes;
        let crc = ogg_checksum(&self.page_buffer[..page_size]);
        write_u32_le(&mut self.page_buffer, 22, crc);

        self.output.extend_from_slice(&self.page_buffer[..page_size]);

        self.seqno += 1;
        self.first = false;
        self.continued = next_continued;
        self.payload_bytes = 0;
    }

    fn get_output(mut self) -> Vec<u8> {
        self.flush_page(false, false);
        self.output
    }
}

// ---------------------------------------------------------------------------
// Codebook library
// ---------------------------------------------------------------------------

struct CodebookLibrary {
    codebook_data: Vec<u8>,
    codebook_offsets: Vec<u32>,
    codebook_count: usize,
}

impl CodebookLibrary {
    fn load(data: &[u8]) -> Result<Self, String> {
        if data.len() < 8 {
            return Err("Codebook data too small".into());
        }

        let len = data.len();
        let offset_offset = read_u32_le(data, len - 4) as usize;

        if offset_offset >= len {
            return Err("Invalid codebook offset table position".into());
        }

        let num_offsets = (len - offset_offset) / 4;
        if num_offsets == 0 {
            return Err("No codebook offsets found".into());
        }
        let codebook_count = num_offsets - 1;

        let codebook_data = data[..offset_offset].to_vec();
        let mut codebook_offsets = Vec::with_capacity(num_offsets);
        for i in 0..num_offsets {
            let pos = offset_offset + i * 4;
            codebook_offsets.push(read_u32_le(data, pos));
        }

        Ok(Self {
            codebook_data,
            codebook_offsets,
            codebook_count,
        })
    }

    fn get_codebook(&self, id: usize) -> Result<&[u8], String> {
        if id >= self.codebook_count {
            return Err(format!("Invalid codebook id: {id} (max {})", self.codebook_count - 1));
        }
        let start = self.codebook_offsets[id] as usize;
        let end = self.codebook_offsets[id + 1] as usize;
        Ok(&self.codebook_data[start..end])
    }

    fn rebuild_from_id(&self, id: usize, bos: &mut BitOggWriter) -> Result<(), String> {
        let cb = self.get_codebook(id)?;
        let mut bis = BitReader::new(cb, 0);
        Self::rebuild(&mut bis, bos)
    }

    fn rebuild(bis: &mut BitReader, bos: &mut BitOggWriter) -> Result<(), String> {
        let dimensions = bis.read_bits(4)?;
        let entries = bis.read_bits(14)?;

        bos.write_bits(0x564342, 24);
        bos.write_bits(dimensions, 16);
        bos.write_bits(entries, 24);

        let ordered = bis.read_bits(1)?;
        bos.write_bits(ordered, 1);

        if ordered != 0 {
            let initial_length = bis.read_bits(5)?;
            bos.write_bits(initial_length, 5);

            let mut current_entry: u32 = 0;
            while current_entry < entries {
                let num_bits = ilog(entries - current_entry);
                let number = bis.read_bits(num_bits)?;
                bos.write_bits(number, num_bits);
                current_entry += number;
            }
            if current_entry > entries {
                return Err("current_entry out of range".into());
            }
        } else {
            let codeword_length_length = bis.read_bits(3)?;
            let sparse = bis.read_bits(1)?;

            if codeword_length_length == 0 || codeword_length_length > 5 {
                return Err("nonsense codeword length".into());
            }

            bos.write_bits(sparse, 1);

            for _ in 0..entries {
                let mut present_bool = true;
                if sparse != 0 {
                    let present = bis.read_bits(1)?;
                    bos.write_bits(present, 1);
                    present_bool = present != 0;
                }
                if present_bool {
                    let codeword_length = bis.read_bits(codeword_length_length)?;
                    bos.write_bits(codeword_length, 5);
                }
            }
        }

        let lookup_type = bis.read_bits(1)?;
        bos.write_bits(lookup_type, 4);

        if lookup_type == 1 {
            let min = bis.read_bits(32)?;
            let max = bis.read_bits(32)?;
            let value_length = bis.read_bits(4)?;
            let sequence_flag = bis.read_bits(1)?;

            bos.write_bits(min, 32);
            bos.write_bits(max, 32);
            bos.write_bits(value_length, 4);
            bos.write_bits(sequence_flag, 1);

            let quantvals = book_maptype1_quantvals(entries, dimensions);
            for _ in 0..quantvals {
                let val = bis.read_bits(value_length + 1)?;
                bos.write_bits(val, value_length + 1);
            }
        } else if lookup_type != 0 {
            return Err("Invalid lookup type".into());
        }

        Ok(())
    }

    fn copy_codebook(bis: &mut BitReader, bos: &mut BitOggWriter) -> Result<(), String> {
        let id = bis.read_bits(24)?;
        let dimensions = bis.read_bits(16)?;
        let entries = bis.read_bits(24)?;

        if id != 0x564342 {
            return Err("Invalid codebook identifier".into());
        }

        bos.write_bits(id, 24);
        bos.write_bits(dimensions, 16);
        bos.write_bits(entries, 24);

        let ordered = bis.read_bits(1)?;
        bos.write_bits(ordered, 1);

        if ordered != 0 {
            let initial_length = bis.read_bits(5)?;
            bos.write_bits(initial_length, 5);

            let mut current_entry: u32 = 0;
            while current_entry < entries {
                let num_bits = ilog(entries - current_entry);
                let number = bis.read_bits(num_bits)?;
                bos.write_bits(number, num_bits);
                current_entry += number;
            }
        } else {
            let sparse = bis.read_bits(1)?;
            bos.write_bits(sparse, 1);

            for _ in 0..entries {
                let mut present_bool = true;
                if sparse != 0 {
                    let present = bis.read_bits(1)?;
                    bos.write_bits(present, 1);
                    present_bool = present != 0;
                }
                if present_bool {
                    let codeword_length = bis.read_bits(5)?;
                    bos.write_bits(codeword_length, 5);
                }
            }
        }

        let lookup_type = bis.read_bits(4)?;
        bos.write_bits(lookup_type, 4);

        if lookup_type == 1 {
            let min = bis.read_bits(32)?;
            let max = bis.read_bits(32)?;
            let value_length = bis.read_bits(4)?;
            let sequence_flag = bis.read_bits(1)?;

            bos.write_bits(min, 32);
            bos.write_bits(max, 32);
            bos.write_bits(value_length, 4);
            bos.write_bits(sequence_flag, 1);

            let quantvals = book_maptype1_quantvals(entries, dimensions);
            for _ in 0..quantvals {
                let val = bis.read_bits(value_length + 1)?;
                bos.write_bits(val, value_length + 1);
            }
        } else if lookup_type == 2 {
            return Err("Didn't expect lookup type 2".into());
        } else if lookup_type != 0 {
            return Err("Invalid lookup type".into());
        }

        Ok(())
    }
}

// ---------------------------------------------------------------------------
// Helper math
// ---------------------------------------------------------------------------

fn ilog(v: u32) -> u32 {
    if v == 0 {
        return 0;
    }
    32 - v.leading_zeros()
}

fn book_maptype1_quantvals(entries: u32, dimensions: u32) -> u32 {
    if dimensions == 0 || entries == 0 {
        return 0;
    }
    let bits = ilog(entries);
    let mut vals = entries >> ((bits - 1) * (dimensions - 1) / dimensions);

    loop {
        let mut acc: u64 = 1;
        let mut acc1: u64 = 1;
        for _ in 0..dimensions {
            acc *= vals as u64;
            acc1 *= (vals + 1) as u64;
        }
        if acc <= entries as u64 && acc1 > entries as u64 {
            return vals;
        }
        if acc > entries as u64 {
            vals -= 1;
        } else {
            vals += 1;
        }
    }
}

// ---------------------------------------------------------------------------
// Packet header readers
// ---------------------------------------------------------------------------

struct PacketHeader {
    header_size: usize,
    size: usize,
    granule: u32,
}

impl PacketHeader {
    /// Modern 2 or 6 byte header
    fn read(data: &[u8], offset: usize, no_granule: bool) -> Result<Self, String> {
        if offset + 2 > data.len() {
            return Err("Packet header truncated".into());
        }
        let size = read_u16_le(data, offset) as usize;
        let (header_size, granule) = if no_granule {
            (2, 0)
        } else {
            if offset + 6 > data.len() {
                return Err("Packet header truncated (6-byte)".into());
            }
            (6, read_u32_le(data, offset + 2))
        };
        Ok(Self { header_size, size, granule })
    }

    /// Old 8-byte header
    fn read_old(data: &[u8], offset: usize) -> Result<Self, String> {
        if offset + 8 > data.len() {
            return Err("Old packet header truncated".into());
        }
        Ok(Self {
            header_size: 8,
            size: read_u32_le(data, offset) as usize,
            granule: read_u32_le(data, offset + 4),
        })
    }

    fn payload_offset(&self, base: usize) -> usize {
        base + self.header_size
    }

    fn next_offset(&self, base: usize) -> usize {
        base + self.header_size + self.size
    }
}

// ---------------------------------------------------------------------------
// WwiseRiffVorbis — main converter
// ---------------------------------------------------------------------------

struct WwiseRiffVorbis<'a> {
    data: &'a [u8],
    is_wav: bool,

    data_offset: usize,
    data_size: usize,

    channels: u32,
    sample_rate: u32,
    avg_bytes_per_second: u32,
    block_align: u16,
    bits_per_sample: u16,

    setup_packet_offset: u32,
    first_audio_packet_offset: u32,
    blocksize_0_pow: u8,
    blocksize_1_pow: u8,

    header_triad_present: bool,
    old_packet_headers: bool,
    no_granule: bool,
    mod_packets: bool,

    loop_count: u32,
    loop_start: u32,
    loop_end: u32,

    codebook_lib: &'a CodebookLibrary,
}

impl<'a> WwiseRiffVorbis<'a> {
    fn parse(data: &'a [u8], codebook_lib: &'a CodebookLibrary) -> Result<Self, String> {
        if data.len() < 12 {
            return Err("Data too small for RIFF".into());
        }

        let magic = &data[0..4];
        if magic != b"RIFF" && magic != b"RIFX" {
            return Err("Missing RIFF header".into());
        }
        if magic == b"RIFX" {
            return Err("RIFX (big-endian) not supported".into());
        }

        let riff_size = read_u32_le(data, 4) as usize + 8;
        if riff_size > data.len() {
            return Err("RIFF truncated".into());
        }

        if &data[8..12] != b"WAVE" {
            return Err("Missing WAVE header".into());
        }

        let mut fmt_offset = 0usize;
        let mut fmt_size = 0usize;
        let mut smpl_offset = 0usize;
        let mut vorb_offset = 0usize;
        let mut vorb_size: i32 = -1;
        let mut data_offset = 0usize;
        let mut data_size = 0usize;

        let mut chunk_offset = 12usize;
        while chunk_offset + 8 <= riff_size {
            let chunk_type = &data[chunk_offset..chunk_offset + 4];
            let chunk_len = read_u32_le(data, chunk_offset + 4) as usize;

            match chunk_type {
                b"fmt " => {
                    fmt_offset = chunk_offset + 8;
                    fmt_size = chunk_len;
                }
                b"smpl" => {
                    smpl_offset = chunk_offset + 8;
                }
                b"vorb" => {
                    vorb_offset = chunk_offset + 8;
                    vorb_size = chunk_len as i32;
                }
                b"data" => {
                    data_offset = chunk_offset + 8;
                    data_size = chunk_len;
                }
                _ => {}
            }

            chunk_offset += 8 + chunk_len;
        }

        if fmt_offset == 0 || data_offset == 0 {
            return Err("Expected fmt, data chunks".into());
        }

        let mut is_wav = false;

        if vorb_offset == 0 {
            if fmt_size == 0x18 {
                is_wav = true;
            } else if fmt_size == 0x42 {
                vorb_offset = fmt_offset + 0x18;
                vorb_size = -1;
            } else {
                return Err("Expected fmt_size of 0x18 or 0x42 if vorb section missing".into());
            }
        }

        let codec_id = read_u16_le(data, fmt_offset);
        if is_wav {
            if codec_id != 0xFFFE {
                return Err(format!("Bad codec id for WAV: 0x{codec_id:04X}"));
            }
        } else if codec_id != 0xFFFF {
            return Err(format!("Bad codec id: 0x{codec_id:04X}"));
        }

        let channels = read_u16_le(data, fmt_offset + 2) as u32;
        let sample_rate = read_u32_le(data, fmt_offset + 4);
        let avg_bytes_per_second = read_u32_le(data, fmt_offset + 8);
        let block_align = read_u16_le(data, fmt_offset + 12);
        let bits_per_sample = read_u16_le(data, fmt_offset + 14);

        if is_wav {
            return Ok(Self {
                data,
                is_wav: true,
                data_offset,
                data_size,
                channels,
                sample_rate,
                avg_bytes_per_second,
                block_align,
                bits_per_sample,
                setup_packet_offset: 0,
                first_audio_packet_offset: 0,
                blocksize_0_pow: 0,
                blocksize_1_pow: 0,
                header_triad_present: false,
                old_packet_headers: false,
                no_granule: false,
                mod_packets: false,
                loop_count: 0,
                loop_start: 0,
                loop_end: 0,
                codebook_lib,
            });
        }

        let mut loop_count = 0u32;
        let mut loop_start = 0u32;
        let mut loop_end = 0u32;
        if smpl_offset != 0 {
            loop_count = read_u32_le(data, smpl_offset + 0x1C);
            if loop_count == 1 {
                loop_start = read_u32_le(data, smpl_offset + 0x2C);
                loop_end = read_u32_le(data, smpl_offset + 0x30);
            }
        }

        let valid_vorb_sizes: &[i32] = &[-1, 0x28, 0x2A, 0x2C, 0x32, 0x34];
        if !valid_vorb_sizes.contains(&vorb_size) {
            return Err(format!("Bad vorb size: {vorb_size}"));
        }

        let sample_count = read_u32_le(data, vorb_offset);

        let mut no_granule = false;
        let mut mod_packets = false;
        let mut header_triad_present = false;
        let mut old_packet_headers = false;
        let mut blocksize_0_pow: u8 = 0;
        let mut blocksize_1_pow: u8 = 0;

        let file_pos;
        if vorb_size == -1 || vorb_size == 0x2A {
            no_granule = true;
            let mod_signal = read_u32_le(data, vorb_offset + 0x4);
            if mod_signal != 0x4A && mod_signal != 0x4B && mod_signal != 0x69 && mod_signal != 0x70
            {
                mod_packets = true;
            }
            file_pos = vorb_offset + 0x10;
        } else {
            file_pos = vorb_offset + 0x18;
        }

        let setup_packet_offset = read_u32_le(data, file_pos);
        let first_audio_packet_offset = read_u32_le(data, file_pos + 4);

        if vorb_size == 0x28 || vorb_size == 0x2C {
            header_triad_present = true;
            old_packet_headers = true;
        } else {
            let bp_pos = if vorb_size == -1 || vorb_size == 0x2A {
                vorb_offset + 0x24
            } else {
                vorb_offset + 0x2C
            };
            // uid skipped
            blocksize_0_pow = data[bp_pos + 4];
            blocksize_1_pow = data[bp_pos + 5];
        }

        if loop_count != 0 {
            if loop_end == 0 {
                loop_end = sample_count;
            } else {
                loop_end += 1;
            }
        }

        Ok(Self {
            data,
            is_wav: false,
            data_offset,
            data_size,
            channels,
            sample_rate,
            avg_bytes_per_second,
            block_align,
            bits_per_sample,
            setup_packet_offset,
            first_audio_packet_offset,
            blocksize_0_pow,
            blocksize_1_pow,
            header_triad_present,
            old_packet_headers,
            no_granule,
            mod_packets,
            loop_count,
            loop_start,
            loop_end,
            codebook_lib,
        })
    }

    fn generate_ogg(&self) -> Result<Vec<u8>, String> {
        if self.is_wav {
            return Ok(self.generate_wav());
        }

        let mut os = BitOggWriter::new();
        let mut mode_blockflag: Option<Vec<bool>> = None;
        let mut mode_bits: u32 = 0;
        let mut prev_blockflag = false;

        if self.header_triad_present {
            self.generate_ogg_header_with_triad(&mut os)?;
        } else {
            let result = self.generate_ogg_header(&mut os)?;
            mode_blockflag = Some(result.0);
            mode_bits = result.1;
        }

        let mut offset = self.data_offset + self.first_audio_packet_offset as usize;
        let data_end = self.data_offset + self.data_size;

        while offset < data_end {
            let packet = if self.old_packet_headers {
                PacketHeader::read_old(self.data, offset)?
            } else {
                PacketHeader::read(self.data, offset, self.no_granule)?
            };

            let size = packet.size;
            let payload_offset = packet.payload_offset(offset);
            let granule = packet.granule;
            let next_offset = packet.next_offset(offset);

            if offset + packet.header_size > data_end {
                return Err("Page header truncated".into());
            }

            if granule == 0xFFFFFFFF {
                os.set_granule(1);
            } else {
                os.set_granule(granule);
            }

            if self.mod_packets {
                let mbf = mode_blockflag
                    .as_ref()
                    .ok_or("Didn't load mode_blockflag")?;

                // 1-bit packet type (0 = audio)
                os.write_bits(0, 1);

                let mut ss = BitReader::new(self.data, payload_offset);

                let mode_number = ss.read_bits(mode_bits)?;
                os.write_bits(mode_number, mode_bits);

                let remainder = ss.read_bits(8 - mode_bits)?;

                if mbf.get(mode_number as usize).copied().unwrap_or(false) {
                    // Long window — peek at next frame
                    let mut next_blockflag = false;
                    if next_offset + packet.header_size <= data_end {
                        let next_packet =
                            PacketHeader::read(self.data, next_offset, self.no_granule)?;
                        if next_packet.size > 0 {
                            let mut next_ss =
                                BitReader::new(self.data, next_packet.payload_offset(next_offset));
                            let next_mode = next_ss.read_bits(mode_bits)?;
                            next_blockflag =
                                mbf.get(next_mode as usize).copied().unwrap_or(false);
                        }
                    }

                    os.write_bits(if prev_blockflag { 1 } else { 0 }, 1);
                    os.write_bits(if next_blockflag { 1 } else { 0 }, 1);
                }

                prev_blockflag = mbf.get(mode_number as usize).copied().unwrap_or(false);

                os.write_bits(remainder, 8 - mode_bits);
            } else {
                os.write_bits(self.data[payload_offset] as u32, 8);
            }

            for i in 1..size {
                os.write_bits(self.data[payload_offset + i] as u32, 8);
            }

            offset = next_offset;
            os.flush_page(false, offset >= data_end);
        }

        Ok(os.get_output())
    }

    fn generate_wav(&self) -> Vec<u8> {
        let total_size = 44 + self.data_size;
        let mut output = vec![0u8; total_size];

        output[0..4].copy_from_slice(b"RIFF");
        write_u32_le(&mut output, 4, (total_size - 8) as u32);
        output[8..12].copy_from_slice(b"WAVE");

        output[12..16].copy_from_slice(b"fmt ");
        write_u32_le(&mut output, 16, 16);
        write_u16_le(&mut output, 20, 1); // PCM
        write_u16_le(&mut output, 22, self.channels as u16);
        write_u32_le(&mut output, 24, self.sample_rate);
        write_u32_le(&mut output, 28, self.avg_bytes_per_second);
        write_u16_le(&mut output, 32, self.block_align);
        write_u16_le(&mut output, 34, self.bits_per_sample);

        output[36..40].copy_from_slice(b"data");
        write_u32_le(&mut output, 40, self.data_size as u32);

        let src = &self.data[self.data_offset..self.data_offset + self.data_size];
        output[44..44 + self.data_size].copy_from_slice(src);

        output
    }

    fn generate_ogg_header(
        &self,
        os: &mut BitOggWriter,
    ) -> Result<(Vec<bool>, u32), String> {
        self.write_vorbis_packet_header(os, 1);

        os.write_bits(0, 32); // version
        os.write_bits(self.channels, 8);
        os.write_bits(self.sample_rate, 32);
        os.write_bits(0, 32); // bitrate max
        os.write_bits(self.avg_bytes_per_second * 8, 32); // bitrate nominal
        os.write_bits(0, 32); // bitrate min
        os.write_bits(self.blocksize_0_pow as u32, 4);
        os.write_bits(self.blocksize_1_pow as u32, 4);
        os.write_bits(1, 1); // framing

        os.flush_page(false, false);

        self.write_vorbis_packet_header(os, 3);

        let vendor = b"converted from Audiokinetic Wwise by ww2ogg (Rust)";
        os.write_bits(vendor.len() as u32, 32);
        for &b in vendor {
            os.write_bits(b as u32, 8);
        }

        if self.loop_count == 0 {
            os.write_bits(0, 32); // no user comments
        } else {
            os.write_bits(2, 32);

            let ls = format!("LoopStart={}", self.loop_start);
            os.write_bits(ls.len() as u32, 32);
            for b in ls.bytes() {
                os.write_bits(b as u32, 8);
            }

            let le = format!("LoopEnd={}", self.loop_end);
            os.write_bits(le.len() as u32, 32);
            for b in le.bytes() {
                os.write_bits(b as u32, 8);
            }
        }

        os.write_bits(1, 1); // framing
        os.flush_page(false, false);

        self.write_vorbis_packet_header(os, 5);

        let setup_packet = PacketHeader::read(
            self.data,
            self.data_offset + self.setup_packet_offset as usize,
            self.no_granule,
        )?;

        if setup_packet.granule != 0 {
            return Err("Setup packet granule != 0".into());
        }

        let setup_payload = setup_packet
            .payload_offset(self.data_offset + self.setup_packet_offset as usize);
        let mut ss = BitReader::new(self.data, setup_payload);

        let codebook_count_less1 = ss.read_bits(8)?;
        let codebook_count = codebook_count_less1 + 1;
        os.write_bits(codebook_count_less1, 8);

        for _ in 0..codebook_count {
            let codebook_id = ss.read_bits(10)?;
            self.codebook_lib.rebuild_from_id(codebook_id as usize, os)?;
        }

        // Time domain transforms
        os.write_bits(0, 6); // count - 1
        os.write_bits(0, 16); // dummy

        let result = self.rebuild_setup(&mut ss, os, codebook_count)?;

        os.write_bits(1, 1); // framing
        os.flush_page(false, false);

        Ok(result)
    }

    fn rebuild_setup(
        &self,
        ss: &mut BitReader,
        os: &mut BitOggWriter,
        codebook_count: u32,
    ) -> Result<(Vec<bool>, u32), String> {
        let floor_count_less1 = ss.read_bits(6)?;
        let floor_count = floor_count_less1 + 1;
        os.write_bits(floor_count_less1, 6);

        for _ in 0..floor_count {
            os.write_bits(1, 16); // floor type 1

            let floor1_partitions = ss.read_bits(5)?;
            os.write_bits(floor1_partitions, 5);

            let mut partition_class_list = Vec::new();
            let mut maximum_class: u32 = 0;

            for _ in 0..floor1_partitions {
                let pc = ss.read_bits(4)?;
                os.write_bits(pc, 4);
                partition_class_list.push(pc);
                if pc > maximum_class {
                    maximum_class = pc;
                }
            }

            let mut class_dimensions_list = Vec::new();

            for _ in 0..=maximum_class {
                let cd_less1 = ss.read_bits(3)?;
                os.write_bits(cd_less1, 3);
                class_dimensions_list.push(cd_less1 + 1);

                let class_subclasses = ss.read_bits(2)?;
                os.write_bits(class_subclasses, 2);

                if class_subclasses != 0 {
                    let masterbook = ss.read_bits(8)?;
                    os.write_bits(masterbook, 8);
                    if masterbook >= codebook_count {
                        return Err("Invalid floor1 masterbook".into());
                    }
                }

                for _ in 0..(1u32 << class_subclasses) {
                    let sb = ss.read_bits(8)?;
                    os.write_bits(sb, 8);
                }
            }

            let multiplier_less1 = ss.read_bits(2)?;
            os.write_bits(multiplier_less1, 2);

            let rangebits = ss.read_bits(4)?;
            os.write_bits(rangebits, 4);

            for &pc in &partition_class_list {
                let ccn = pc as usize;
                for _ in 0..class_dimensions_list[ccn] {
                    let x = ss.read_bits(rangebits)?;
                    os.write_bits(x, rangebits);
                }
            }
        }

        let residue_count_less1 = ss.read_bits(6)?;
        let residue_count = residue_count_less1 + 1;
        os.write_bits(residue_count_less1, 6);

        for _ in 0..residue_count {
            let residue_type = ss.read_bits(2)?;
            os.write_bits(residue_type, 16);

            if residue_type > 2 {
                return Err("Invalid residue type".into());
            }

            let begin = ss.read_bits(24)?;
            let end = ss.read_bits(24)?;
            let partition_size_less1 = ss.read_bits(24)?;
            let classifications_less1 = ss.read_bits(6)?;
            let classbook = ss.read_bits(8)?;
            let classifications = classifications_less1 + 1;

            os.write_bits(begin, 24);
            os.write_bits(end, 24);
            os.write_bits(partition_size_less1, 24);
            os.write_bits(classifications_less1, 6);
            os.write_bits(classbook, 8);

            if classbook >= codebook_count {
                return Err("Invalid residue classbook".into());
            }

            let mut cascade = Vec::new();
            for _ in 0..classifications {
                let low_bits = ss.read_bits(3)?;
                os.write_bits(low_bits, 3);

                let bitflag = ss.read_bits(1)?;
                os.write_bits(bitflag, 1);

                let mut high_bits = 0u32;
                if bitflag != 0 {
                    high_bits = ss.read_bits(5)?;
                    os.write_bits(high_bits, 5);
                }
                cascade.push(high_bits * 8 + low_bits);
            }

            for &cas in &cascade {
                for k in 0..8u32 {
                    if cas & (1 << k) != 0 {
                        let book = ss.read_bits(8)?;
                        os.write_bits(book, 8);
                        if book >= codebook_count {
                            return Err("Invalid residue book".into());
                        }
                    }
                }
            }
        }

        let mapping_count_less1 = ss.read_bits(6)?;
        let mapping_count = mapping_count_less1 + 1;
        os.write_bits(mapping_count_less1, 6);

        for _ in 0..mapping_count {
            os.write_bits(0, 16); // mapping type 0

            let submaps_flag = ss.read_bits(1)?;
            os.write_bits(submaps_flag, 1);

            let mut submaps = 1u32;
            if submaps_flag != 0 {
                let sl = ss.read_bits(4)?;
                submaps = sl + 1;
                os.write_bits(sl, 4);
            }

            let square_polar = ss.read_bits(1)?;
            os.write_bits(square_polar, 1);

            if square_polar != 0 {
                let coupling_less1 = ss.read_bits(8)?;
                let coupling_steps = coupling_less1 + 1;
                os.write_bits(coupling_less1, 8);

                let channel_bits = ilog(self.channels - 1);
                for _ in 0..coupling_steps {
                    let magnitude = ss.read_bits(channel_bits)?;
                    let angle = ss.read_bits(channel_bits)?;
                    os.write_bits(magnitude, channel_bits);
                    os.write_bits(angle, channel_bits);
                }
            }

            let reserved = ss.read_bits(2)?;
            os.write_bits(reserved, 2);
            if reserved != 0 {
                return Err("Mapping reserved field nonzero".into());
            }

            if submaps > 1 {
                for _ in 0..self.channels {
                    let mux = ss.read_bits(4)?;
                    os.write_bits(mux, 4);
                }
            }

            for _ in 0..submaps {
                let time_config = ss.read_bits(8)?;
                os.write_bits(time_config, 8);

                let floor_number = ss.read_bits(8)?;
                os.write_bits(floor_number, 8);
                if floor_number >= floor_count {
                    return Err("Invalid floor mapping".into());
                }

                let residue_number = ss.read_bits(8)?;
                os.write_bits(residue_number, 8);
                if residue_number >= residue_count {
                    return Err("Invalid residue mapping".into());
                }
            }
        }

        let mode_count_less1 = ss.read_bits(6)?;
        let mode_count = mode_count_less1 + 1;
        os.write_bits(mode_count_less1, 6);

        let mut mode_blockflag = Vec::new();
        let mode_bits = ilog(mode_count - 1);

        for _ in 0..mode_count {
            let block_flag = ss.read_bits(1)?;
            os.write_bits(block_flag, 1);
            mode_blockflag.push(block_flag != 0);

            os.write_bits(0, 16); // window type
            os.write_bits(0, 16); // transform type

            let mapping = ss.read_bits(8)?;
            os.write_bits(mapping, 8);
            if mapping >= mapping_count {
                return Err("Invalid mode mapping".into());
            }
        }

        Ok((mode_blockflag, mode_bits))
    }

    fn generate_ogg_header_with_triad(&self, os: &mut BitOggWriter) -> Result<(), String> {
        let mut offset = self.data_offset + self.setup_packet_offset as usize;

        // Identification packet (old 8-byte header)
        let info_packet = PacketHeader::read_old(self.data, offset)?;
        if info_packet.granule != 0 {
            return Err("Information packet granule != 0".into());
        }

        let info_payload = info_packet.payload_offset(offset);
        if self.data[info_payload] != 1 {
            return Err("Wrong type for information packet".into());
        }

        for i in 0..info_packet.size {
            os.write_bits(self.data[info_payload + i] as u32, 8);
        }
        os.flush_page(false, false);

        offset = info_packet.next_offset(offset);

        let comment_packet = PacketHeader::read_old(self.data, offset)?;
        if comment_packet.granule != 0 {
            return Err("Comment packet granule != 0".into());
        }

        let comment_payload = comment_packet.payload_offset(offset);
        if self.data[comment_payload] != 3 {
            return Err("Wrong type for comment packet".into());
        }

        for i in 0..comment_packet.size {
            os.write_bits(self.data[comment_payload + i] as u32, 8);
        }
        os.flush_page(false, false);

        offset = comment_packet.next_offset(offset);

        let setup_packet = PacketHeader::read_old(self.data, offset)?;
        if setup_packet.granule != 0 {
            return Err("Setup packet granule != 0".into());
        }

        let setup_payload = setup_packet.payload_offset(offset);
        let mut ss = BitReader::new(self.data, setup_payload);

        let setup_type = ss.read_bits(8)?;
        if setup_type != 5 {
            return Err("Wrong type for setup packet".into());
        }
        os.write_bits(setup_type, 8);

        // "vorbis"
        for _ in 0..6 {
            os.write_bits(ss.read_bits(8)?, 8);
        }

        let codebook_count_less1 = ss.read_bits(8)?;
        let codebook_count = codebook_count_less1 + 1;
        os.write_bits(codebook_count_less1, 8);

        for _ in 0..codebook_count {
            CodebookLibrary::copy_codebook(&mut ss, os)?;
        }

        while ss.total_bits_read() < setup_packet.size * 8 {
            os.write_bits(ss.read_bits(1)?, 1);
        }

        os.flush_page(false, false);
        Ok(())
    }

    fn write_vorbis_packet_header(&self, os: &mut BitOggWriter, packet_type: u8) {
        os.write_bits(packet_type as u32, 8);
        for &b in b"vorbis" {
            os.write_bits(b as u32, 8);
        }
    }
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

pub fn decode_wem(wem_data: &[u8]) -> Result<DecodedAudio, String> {
    let codebook_lib = CodebookLibrary::load(CODEBOOK_DATA)?;
    let converter = WwiseRiffVorbis::parse(wem_data, &codebook_lib)?;

    if converter.is_wav {
        let wav = converter.generate_wav();
        Ok(DecodedAudio {
            sample_rate: Some(converter.sample_rate),
            data: wav,
            format: "wav".into(),
        })
    } else {
        let ogg = converter.generate_ogg()?;
        Ok(DecodedAudio {
            sample_rate: Some(converter.sample_rate),
            data: ogg,
            format: "ogg".into(),
        })
    }
}
