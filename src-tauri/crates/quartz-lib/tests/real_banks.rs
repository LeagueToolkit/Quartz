/*!
Exercises the BnkExtract save path against real shipped banks and packages, which is the only
place the things that actually break show up: a header revision that must survive, a HIRC section
that must come back byte for byte, and a package whose entry names and dead slots have to be
reproduced.

Real game audio is copyrighted and never committed, so every test skips when its fixture is
absent. Drop `.bnk` / `.wpk` samples in the path below to run them.
*/

use quartz_lib::audio::bank::{self, Bank};
use ritoshark::audio::Wem;
use std::path::PathBuf;

fn fixture(name: &str) -> Option<Vec<u8>> {
    let path = PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .join("../../../../RitoShark-Crates/Sample-Files")
        .join(name);
    std::fs::read(path).ok()
}

const BANKS: &[&str] = &[
    "aatrox_base_sfx_audio.bnk",
    "aatrox_base_sfx_events.bnk",
    "bank_v134_audio.bnk",
    "bank_v134_bare.bnk",
    "bank_v134_events.bnk",
    "bank_v145_audio.bnk",
    "bank_v145_bare.bnk",
    "bank_v145_events.bnk",
    "audio_package_4.wpk",
    "audio_package_37.wpk",
];

#[test]
fn reading_and_writing_a_real_bank_is_byte_exact() {
    let mut checked = 0;
    for name in BANKS {
        let Some(original) = fixture(name) else {
            continue;
        };
        let parsed = Bank::parse(&original).unwrap_or_else(|e| panic!("{name}: {e}"));
        assert_eq!(
            parsed.to_bytes().unwrap(),
            original,
            "{name} must re-serialize byte for byte"
        );
        checked += 1;
    }
    eprintln!("round-tripped {checked} real banks");
}

#[test]
fn saving_an_untouched_tree_does_not_rewrite_the_file() {
    for name in BANKS {
        let Some(original) = fixture(name) else {
            continue;
        };
        let entries = bank::all_entries(&original).unwrap();
        let saved = bank::save_with_entries(&original, &entries).unwrap();

        assert_eq!(
            saved, original,
            "{name}: saving without editing anything must not rewrite the file"
        );
    }
}

#[test]
fn a_save_keeps_the_header_and_every_section_we_do_not_model() {
    for name in BANKS {
        let Some(original) = fixture(name) else {
            continue;
        };
        let mut entries = bank::all_entries(&original).unwrap();
        let Some(first) = entries.first_mut() else {
            continue;
        };
        first.data = bank::to_wem(&first.data.clone(), None).unwrap();

        let saved = bank::save_with_entries(&original, &entries).unwrap();
        let after = Bank::parse(&saved).unwrap();
        let before = Bank::parse(&original).unwrap();

        assert_eq!(
            after.entries().len(),
            before.entries().len(),
            "{name}: an edit must not drop entries"
        );
        assert_eq!(
            after.ids(),
            before.ids(),
            "{name}: entry ids and their order must survive"
        );

        if let (Bank::Bnk(a), Bank::Bnk(b)) = (&after, &before) {
            assert_eq!(a.version(), b.version(), "{name}: header revision");
            assert_eq!(a.bank_id(), b.bank_id(), "{name}: bank id");
            for section in b
                .sections
                .iter()
                .filter(|s| s.tag != *b"DIDX" && s.tag != *b"DATA")
            {
                let same = a.sections.iter().find(|s| s.tag == section.tag);
                assert_eq!(
                    same.map(|s| &s.data),
                    Some(&section.data),
                    "{name}: section {} must survive verbatim",
                    String::from_utf8_lossy(&section.tag)
                );
            }
        }
    }
}

#[test]
fn every_embedded_payload_decodes() {
    for name in BANKS {
        let Some(original) = fixture(name) else {
            continue;
        };
        for entry in bank::all_entries(&original).unwrap() {
            bank::decode_wem(&entry.data)
                .unwrap_or_else(|e| panic!("{name}: entry {} did not decode: {e}", entry.id));
        }
    }
}

#[test]
fn a_replacement_lands_as_a_playable_wem_in_the_codec_it_replaced() {
    let Some(original) = fixture("bank_v145_audio.bnk").or_else(|| fixture("bank_v134_audio.bnk"))
    else {
        return;
    };
    let mut entries = bank::all_entries(&original).unwrap();
    let target = entries[0].id;
    let original_payload = entries[0].data.clone();

    /* What the replace dialog hands the backend once the user picks a non-wem file. */
    let mut wav = Vec::new();
    wav.extend_from_slice(b"RIFF");
    wav.extend_from_slice(&(36u32 + 2048).to_le_bytes());
    wav.extend_from_slice(b"WAVEfmt ");
    wav.extend_from_slice(&16u32.to_le_bytes());
    wav.extend_from_slice(&1u16.to_le_bytes());
    wav.extend_from_slice(&1u16.to_le_bytes());
    wav.extend_from_slice(&44100u32.to_le_bytes());
    wav.extend_from_slice(&88200u32.to_le_bytes());
    wav.extend_from_slice(&2u16.to_le_bytes());
    wav.extend_from_slice(&16u16.to_le_bytes());
    wav.extend_from_slice(b"data");
    wav.extend_from_slice(&2048u32.to_le_bytes());
    wav.extend_from_slice(&vec![0u8; 2048]);

    entries[0].data = bank::to_wem(&wav, None).unwrap();
    let saved = bank::save_with_entries(&original, &entries).unwrap();

    let stored = Bank::parse(&saved).unwrap().entry(target).unwrap().to_vec();
    let wem = Wem::new(&stored).expect("a wav must be encoded into a real wem");
    assert_eq!(wem.format().sample_rate, 44100);
    assert_eq!(
        wem.format().codec,
        Wem::new(&original_payload).unwrap().format().codec,
        "a replacement must use the same codec as the sound it replaces"
    );
    bank::decode_wem(&stored).expect("and it must decode back");
    assert!(
        stored.len() < wav.len(),
        "encoded {} bytes from a {} byte wav — that is PCM, not Vorbis",
        stored.len(),
        wav.len()
    );
}
