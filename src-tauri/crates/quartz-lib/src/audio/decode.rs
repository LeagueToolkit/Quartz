/* Decoding user-supplied audio files down to PCM samples.

rs_audio deliberately stops at PCM in both directions — reading mp3/flac/ogg is the application's
job — so this is where the app meets it. Everything a normal editor exports is handled in-process,
which is what let the external decoder binary go. */

use ritoshark::audio::PcmAudio;
use symphonia::core::audio::{AudioBufferRef, Signal};
use symphonia::core::codecs::{DecoderOptions, CODEC_TYPE_NULL};
use symphonia::core::conv::IntoSample;
use symphonia::core::formats::FormatOptions;
use symphonia::core::io::MediaSourceStream;
use symphonia::core::meta::MetadataOptions;
use symphonia::core::probe::Hint;

/** Decodes MP3, FLAC, OGG/Vorbis, WAV or M4A/AAC into interleaved 16-bit samples.

The container is identified from the bytes rather than a file extension, so a mislabelled file
still decodes and a renamed one does not silently take the wrong path. */
pub fn decode_any(data: &[u8]) -> Result<PcmAudio, String> {
    let source = MediaSourceStream::new(Box::new(std::io::Cursor::new(data.to_vec())), <_>::default());

    let probed = symphonia::default::get_probe()
        .format(
            &Hint::new(),
            source,
            &FormatOptions::default(),
            &MetadataOptions::default(),
        )
        .map_err(|_| {
            "Unsupported audio file. Supported: WAV, MP3, OGG, FLAC, M4A and .wem.".to_string()
        })?;

    let mut format = probed.format;
    let track = format
        .tracks()
        .iter()
        .find(|t| t.codec_params.codec != CODEC_TYPE_NULL)
        .ok_or("Audio file contains no decodable track")?;
    let track_id = track.id;

    let mut decoder = symphonia::default::get_codecs()
        .make(&track.codec_params, &DecoderOptions::default())
        .map_err(|e| format!("No decoder for this audio codec: {e}"))?;

    let mut samples: Vec<i16> = Vec::new();
    let mut sample_rate = track.codec_params.sample_rate.unwrap_or(0);
    let mut channels = track
        .codec_params
        .channels
        .map(|c| c.count() as u16)
        .unwrap_or(0);

    // The loop ends on the first packet error, which covers both a clean end of
    // stream and a truncated tail — whatever decoded before it is still usable.
    while let Ok(packet) = format.next_packet() {
        if packet.track_id() != track_id {
            continue;
        }

        match decoder.decode(&packet) {
            Ok(buffer) => {
                let spec = *buffer.spec();
                if sample_rate == 0 {
                    sample_rate = spec.rate;
                }
                if channels == 0 {
                    channels = spec.channels.count() as u16;
                }
                append_interleaved(&buffer, &mut samples);
            }
            // A damaged packet costs one packet, not the whole file.
            Err(symphonia::core::errors::Error::DecodeError(_)) => continue,
            Err(e) => return Err(format!("Audio decode failed: {e}")),
        }
    }

    if samples.is_empty() {
        return Err("Audio file decoded to no samples".into());
    }
    if sample_rate == 0 || channels == 0 {
        return Err("Audio file declares no sample rate or no channels".into());
    }

    Ok(PcmAudio::new(sample_rate, channels, samples))
}

/// Flattens a planar decode buffer into the interleaved layout the encoder wants.
fn append_interleaved(buffer: &AudioBufferRef<'_>, out: &mut Vec<i16>) {
    macro_rules! planar {
        ($buf:expr) => {{
            let channels = $buf.spec().channels.count();
            let frames = $buf.frames();
            out.reserve(frames * channels);
            for frame in 0..frames {
                for channel in 0..channels {
                    out.push($buf.chan(channel)[frame].into_sample());
                }
            }
        }};
    }

    match buffer {
        AudioBufferRef::U8(b) => planar!(b),
        AudioBufferRef::U16(b) => planar!(b),
        AudioBufferRef::U24(b) => planar!(b),
        AudioBufferRef::U32(b) => planar!(b),
        AudioBufferRef::S8(b) => planar!(b),
        AudioBufferRef::S16(b) => planar!(b),
        AudioBufferRef::S24(b) => planar!(b),
        AudioBufferRef::S32(b) => planar!(b),
        AudioBufferRef::F32(b) => planar!(b),
        AudioBufferRef::F64(b) => planar!(b),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn wav(sample_rate: u32, channels: u16, frames: &[i16]) -> Vec<u8> {
        let data_len = frames.len() * 2;
        let mut out = Vec::new();
        out.extend_from_slice(b"RIFF");
        out.extend_from_slice(&(36 + data_len as u32).to_le_bytes());
        out.extend_from_slice(b"WAVEfmt ");
        out.extend_from_slice(&16u32.to_le_bytes());
        out.extend_from_slice(&1u16.to_le_bytes());
        out.extend_from_slice(&channels.to_le_bytes());
        out.extend_from_slice(&sample_rate.to_le_bytes());
        out.extend_from_slice(&(sample_rate * u32::from(channels) * 2).to_le_bytes());
        out.extend_from_slice(&(channels * 2).to_le_bytes());
        out.extend_from_slice(&16u16.to_le_bytes());
        out.extend_from_slice(b"data");
        out.extend_from_slice(&(data_len as u32).to_le_bytes());
        for sample in frames {
            out.extend_from_slice(&sample.to_le_bytes());
        }
        out
    }

    #[test]
    fn a_wav_decodes_to_the_samples_it_declares() {
        let decoded = decode_any(&wav(44100, 1, &[0, 1000, -1000, 32767])).unwrap();
        assert_eq!(decoded.sample_rate, 44100);
        assert_eq!(decoded.channels, 1);
        assert_eq!(decoded.samples, vec![0, 1000, -1000, 32767]);
    }

    #[test]
    fn stereo_stays_interleaved() {
        let decoded = decode_any(&wav(22050, 2, &[1, -1, 2, -2])).unwrap();
        assert_eq!(decoded.channels, 2);
        assert_eq!(decoded.samples, vec![1, -1, 2, -2]);
    }

    #[test]
    fn a_non_audio_file_is_an_error_rather_than_silence() {
        assert!(decode_any(b"not audio, just some bytes here at all").is_err());
        assert!(decode_any(&[]).is_err());
    }
}
