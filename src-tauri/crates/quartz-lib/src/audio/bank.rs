/* BNK/WPK containers and WEM audio, backed by ritoshark::audio.

Edits modify the parsed container rather than rebuilding it, so a bank keeps its header revision,
its bank id, its object hierarchy and every section this app does not model, and a package keeps
its entry names, its slot order and its dead slots. Rebuilding on each save is what produces a
file the engine cannot load even though the audio inside it is fine.

Replacement audio is encoded to Wwise Vorbis — the one codec the game ships — which is what
removed the need for an external Wwise toolchain. */

use std::collections::HashSet;

use ritoshark::audio::{
    AudioFormat, Bnk, PcmAudio, Wem, WemCodec, Wpk, encode_vorbis, encode_vorbis_like,
};
use ritoshark::prelude::{Parse, Serialize};
use serde::{Deserialize, Serialize as SerdeSerialize};

/// Vorbis convention: -0.2 worst, 1.0 best. 0.5 is the crate's documented default.
const VORBIS_QUALITY: f32 = 0.5;

#[derive(Debug, Clone)]
pub struct AudioEntry {
    pub id: u32,
    pub data: Vec<u8>,
}

/// A decoded WEM as playable bytes.
#[derive(Debug, Clone, SerdeSerialize, Deserialize)]
pub struct DecodedAudio {
    pub data: Vec<u8>,
    /// `"ogg"` or `"wav"`.
    pub format: String,
    pub sample_rate: Option<u32>,
}

/// Either Wwise container, parsed. Both hold WEM payloads addressed by a numeric id.
pub enum Bank {
    Bnk(Bnk),
    Wpk(Wpk),
}

impl Bank {
    pub fn parse(data: &[u8]) -> Result<Self, String> {
        match data.get(..4) {
            Some(b"BKHD") => Bnk::from_bytes(data)
                .map(Self::Bnk)
                .map_err(|e| format!("Failed to parse BNK: {e}")),
            Some(b"r3d2") => Wpk::from_bytes(data)
                .map(Self::Wpk)
                .map_err(|e| format!("Failed to parse WPK: {e}")),
            Some(magic) => Err(format!(
                "Unknown audio format (magic: {:02X}{:02X}{:02X}{:02X})",
                magic[0], magic[1], magic[2], magic[3]
            )),
            None => Err("Audio file too small".into()),
        }
    }

    /* A WPK entry whose name is not "<id>.wem" has no id to address it by, so it is left out
    rather than listed under a placeholder nothing could resolve. */
    pub fn entries(&self) -> Vec<AudioEntry> {
        match self {
            Self::Bnk(bnk) => bnk
                .wems()
                .into_iter()
                .map(|(id, data)| AudioEntry {
                    id,
                    data: data.to_vec(),
                })
                .collect(),
            Self::Wpk(wpk) => wpk
                .wems()
                .into_iter()
                .filter_map(|(id, _, data)| {
                    Some(AudioEntry {
                        id: id?,
                        data: data.to_vec(),
                    })
                })
                .collect(),
        }
    }

    pub fn ids(&self) -> Vec<u32> {
        self.entries().into_iter().map(|e| e.id).collect()
    }

    pub fn entry(&self, id: u32) -> Option<&[u8]> {
        match self {
            Self::Bnk(bnk) => bnk.wem(id),
            Self::Wpk(wpk) => wpk.wem(id),
        }
    }

    pub fn insert(&mut self, id: u32, data: Vec<u8>) -> Result<(), String> {
        match self {
            Self::Bnk(bnk) => bnk.insert_wem(id, data),
            Self::Wpk(wpk) => wpk.insert_wem(id, data),
        }
        .map_err(|e| format!("Failed to write entry {id}: {e}"))
    }

    pub fn remove(&mut self, id: u32) -> Result<(), String> {
        match self {
            Self::Bnk(bnk) => bnk.remove_wem(id),
            Self::Wpk(wpk) => wpk.remove_wem(id),
        }
        .map_err(|e| format!("Failed to remove entry {id}: {e}"))
    }

    pub fn to_bytes(&self) -> Result<Vec<u8>, String> {
        match self {
            Self::Bnk(bnk) => bnk.to_bytes(),
            Self::Wpk(wpk) => wpk.to_bytes(),
        }
        .map_err(|e| format!("Failed to serialize audio bank: {e}"))
    }
}

/// Every embedded WEM in a BNK or WPK buffer, in container order.
pub fn all_entries(data: &[u8]) -> Result<Vec<AudioEntry>, String> {
    Ok(Bank::parse(data)?.entries())
}

/** Applies an edited entry set to the container it came from.

Starting from the original is what keeps the header, the hierarchy and every unmodelled section
intact. Ids the caller no longer lists are removed, so a bank saved after deleting a sound really
loses it. */
pub fn save_with_entries(original: &[u8], entries: &[AudioEntry]) -> Result<Vec<u8>, String> {
    let mut bank = Bank::parse(original)?;

    let keep: HashSet<u32> = entries.iter().map(|e| e.id).collect();
    for id in bank.ids() {
        if !keep.contains(&id) {
            bank.remove(id)?;
        }
    }
    for entry in entries {
        bank.insert(entry.id, entry.data.clone())?;
    }

    bank.to_bytes()
}

/// Decodes a WEM to a playable stream — Ogg for Wwise Vorbis, WAV for PCM.
pub fn decode_wem(data: &[u8]) -> Result<DecodedAudio, String> {
    let decoded = Wem::new(data)
        .and_then(|wem| wem.decode())
        .map_err(|e| format!("Failed to decode WEM: {e}"))?;

    Ok(DecodedAudio {
        data: decoded.data,
        format: match decoded.format {
            AudioFormat::Ogg => "ogg",
            AudioFormat::Wav => "wav",
        }
        .into(),
        sample_rate: Some(decoded.sample_rate),
    })
}

/// Decodes a WEM all the way to interleaved 16-bit samples.
pub fn wem_to_pcm(data: &[u8]) -> Result<PcmAudio, String> {
    Wem::new(data)
        .and_then(|wem| wem.to_pcm())
        .map_err(|e| format!("Failed to decode WEM: {e}"))
}

/// Wraps interleaved 16-bit samples in a RIFF/WAVE header.
pub fn pcm_to_wav(audio: &PcmAudio) -> Vec<u8> {
    let data_len = audio.samples.len() * 2;
    let byte_rate = audio.sample_rate * u32::from(audio.channels) * 2;
    let block_align = audio.channels * 2;

    let mut out = Vec::with_capacity(44 + data_len);
    out.extend_from_slice(b"RIFF");
    out.extend_from_slice(&(36 + data_len as u32).to_le_bytes());
    out.extend_from_slice(b"WAVEfmt ");
    out.extend_from_slice(&16u32.to_le_bytes());
    out.extend_from_slice(&1u16.to_le_bytes());
    out.extend_from_slice(&audio.channels.to_le_bytes());
    out.extend_from_slice(&audio.sample_rate.to_le_bytes());
    out.extend_from_slice(&byte_rate.to_le_bytes());
    out.extend_from_slice(&block_align.to_le_bytes());
    out.extend_from_slice(&16u16.to_le_bytes());
    out.extend_from_slice(b"data");
    out.extend_from_slice(&(data_len as u32).to_le_bytes());
    for sample in &audio.samples {
        out.extend_from_slice(&sample.to_le_bytes());
    }
    out
}

/// Encodes samples into a Wwise Vorbis WEM, cloning `reference`'s header when there is one.
pub fn encode_wem(audio: &PcmAudio, reference: Option<&[u8]>) -> Result<Vec<u8>, String> {
    /* A template only works if the reference really is Wwise Vorbis; League ships nothing else,
    but a bank holding PCM would otherwise fail outright. */
    let template = reference
        .filter(|bytes| Wem::new(bytes).is_ok_and(|wem| wem.format().codec == WemCodec::Vorbis));

    match template {
        Some(bytes) => encode_vorbis_like(bytes, audio, VORBIS_QUALITY),
        None => encode_vorbis(audio, VORBIS_QUALITY),
    }
    .map_err(|e| format!("Failed to encode WEM: {e}"))
}

/** Turns whatever the user supplied into an embeddable WEM.

Anything that already parses as one is embedded verbatim, which keeps a WEM lifted out of another
bank bit-identical. Everything else is decoded to samples and encoded. */
pub fn to_wem(data: &[u8], reference: Option<&[u8]>) -> Result<Vec<u8>, String> {
    if Wem::new(data).is_ok() {
        return Ok(data.to_vec());
    }
    let pcm = super::decode::decode_any(data)?;
    encode_wem(&pcm, reference)
}

/// Scales a WEM by `gain_db`, re-encoding into the codec it already used.
pub fn amplify_wem(data: &[u8], gain_db: f32) -> Result<Vec<u8>, String> {
    let mut pcm = wem_to_pcm(data)?;
    let factor = 10f32.powf(gain_db / 20.0);
    for sample in &mut pcm.samples {
        *sample = (f32::from(*sample) * factor).clamp(f32::from(i16::MIN), f32::from(i16::MAX))
            as i16;
    }
    encode_wem(&pcm, Some(data))
}

#[cfg(test)]
mod tests {
    use super::*;
    use ritoshark::audio::{BnkSection, silence};

    fn bank_with_one_wem() -> Vec<u8> {
        let mut bnk = Bnk::new();
        bnk.sections.push(BnkSection {
            tag: *b"BKHD",
            data: vec![0x91, 0, 0, 0, 0xEF, 0xBE, 0xAD, 0xDE],
        });
        bnk.sections.push(BnkSection {
            tag: *b"HIRC",
            data: vec![0, 0, 0, 0],
        });
        bnk.insert_wem(100, silence(44100, 1, 4096).unwrap()).unwrap();
        bnk.to_bytes().unwrap()
    }

    #[test]
    fn saving_an_edited_entry_set_keeps_the_header_and_hierarchy() {
        let original = bank_with_one_wem();
        let entries = vec![AudioEntry {
            id: 100,
            data: silence(44100, 1, 2048).unwrap(),
        }];

        let saved = save_with_entries(&original, &entries).unwrap();
        let Bank::Bnk(bnk) = Bank::parse(&saved).unwrap() else {
            panic!("still a bnk");
        };

        assert_eq!(bnk.version(), Some(0x91), "header revision must survive");
        assert_eq!(bnk.bank_id(), Some(0xDEADBEEF), "bank id must survive");
        assert!(
            bnk.sections.iter().any(|s| s.tag == *b"HIRC"),
            "the object hierarchy must survive a save"
        );
    }

    #[test]
    fn saving_drops_entries_the_caller_no_longer_lists() {
        let original = bank_with_one_wem();
        let saved = save_with_entries(&original, &[]).unwrap();
        assert!(Bank::parse(&saved).unwrap().entries().is_empty());
    }

    #[test]
    fn an_existing_wem_is_embedded_verbatim() {
        let wem = silence(32000, 2, 64).unwrap();
        assert_eq!(to_wem(&wem, None).unwrap(), wem);
    }

    #[test]
    fn amplifying_keeps_the_stream_playable_and_vorbis() {
        let original = silence(44100, 1, 4096).unwrap();
        let louder = amplify_wem(&original, 6.0).unwrap();

        let wem = Wem::new(&louder).expect("amplified audio must still be a wem");
        assert_eq!(wem.format().codec, WemCodec::Vorbis);
        assert_eq!(wem.format().sample_rate, 44100);
    }

    #[test]
    fn pcm_round_trips_through_the_wav_wrapper() {
        let pcm = PcmAudio::new(22050, 2, vec![1, -1, 300, -300]);
        let wav = pcm_to_wav(&pcm);

        assert_eq!(&wav[..4], b"RIFF");
        assert_eq!(&wav[8..12], b"WAVE");
        assert_eq!(u32::from_le_bytes(wav[24..28].try_into().unwrap()), 22050);
        assert_eq!(u16::from_le_bytes(wav[22..24].try_into().unwrap()), 2);
        assert_eq!(wav.len(), 44 + 8);
    }
}
