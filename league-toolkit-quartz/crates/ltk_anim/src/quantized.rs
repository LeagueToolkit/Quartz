//! Quantized quaternion compression/decompression
//!
//! League uses a 48-bit (6 byte) compressed quaternion format where:
//! - 2 bits identify which component has the largest absolute value (and is omitted)
//! - 3 x 15 bits store the other 3 components, normalized to [-1/√2, 1/√2]
//! - The omitted component is reconstructed via sqrt(1 - a² - b² - c²)

use glam::Quat;

const SQRT_2: f32 = std::f32::consts::SQRT_2;

/// One divided by sqrt(2), used for quaternion compression range
const ONE_DIV_SQRT2: f32 = SQRT_2 / 2.0;

/// sqrt(2) divided by 32767, used for decompression scaling
const SQRT2_DIV_32767: f32 = SQRT_2 / 32767.0;

/// Decompresses a 48-bit quantized quaternion from packed u16 values
pub fn decompress_quat_u16(values: &[u16; 3]) -> Quat {
    decompress_quat(bytemuck::bytes_of(values).try_into().unwrap())
}

/// Decompresses a 48-bit (6 byte) quantized quaternion
///
/// The format stores 3 components in 15 bits each, with 2 bits identifying
/// which component was the largest (and omitted). The omitted component is
/// reconstructed to ensure the quaternion is normalized.
pub fn decompress_quat(bytes: &[u8; 6]) -> Quat {
    let first = bytes[0] as u64 | ((bytes[1] as u64) << 8);
    let second = bytes[2] as u64 | ((bytes[3] as u64) << 8);
    let third = bytes[4] as u64 | ((bytes[5] as u64) << 8);
    let bits = first | (second << 16) | (third << 32);

    // Extract the index of the largest component (2 bits at position 45-46)
    let max_index = ((bits >> 45) & 3) as u8;

    // Extract and decompress the 3 stored components (15 bits each)
    let a = (((bits >> 30) & 32767) as f32) * SQRT2_DIV_32767 - ONE_DIV_SQRT2;
    let b = (((bits >> 15) & 32767) as f32) * SQRT2_DIV_32767 - ONE_DIV_SQRT2;
    let c = ((bits & 32767) as f32) * SQRT2_DIV_32767 - ONE_DIV_SQRT2;

    // Reconstruct the 4th component
    let d = (1.0 - (a * a + b * b + c * c)).max(0.0).sqrt();

    // Return quaternion with components in correct positions
    match max_index {
        0 => Quat::from_xyzw(d, a, b, c),
        1 => Quat::from_xyzw(a, d, b, c),
        2 => Quat::from_xyzw(a, b, d, c),
        _ => Quat::from_xyzw(a, b, c, d),
    }
}

/// Compresses a quaternion to 48-bit (6 byte) format
///
/// Finds the largest component, stores the other 3 in 15 bits each,
/// and uses 2 bits to identify which was omitted.
pub fn compress_quat(quat: Quat) -> [u8; 6] {
    // Find component with largest absolute value
    let abs_x = quat.x.abs();
    let abs_y = quat.y.abs();
    let abs_z = quat.z.abs();
    let abs_w = quat.w.abs();

    let (max_index, q) = if abs_x >= abs_w && abs_x >= abs_y && abs_x >= abs_z {
        (0u64, if quat.x < 0.0 { -quat } else { quat })
    } else if abs_y >= abs_w && abs_y >= abs_x && abs_y >= abs_z {
        (1u64, if quat.y < 0.0 { -quat } else { quat })
    } else if abs_z >= abs_w && abs_z >= abs_x && abs_z >= abs_y {
        (2u64, if quat.z < 0.0 { -quat } else { quat })
    } else {
        (3u64, if quat.w < 0.0 { -quat } else { quat })
    };

    let mut bits = max_index << 45;
    let quat_values = [q.x, q.y, q.z, q.w];

    let mut compressed_index = 0u64;
    for (i, &val) in quat_values.iter().enumerate() {
        if i as u64 == max_index {
            continue;
        }
        let temp = ((16383.5 * (SQRT_2 * val + 1.0)).round() as u64) & 32767;
        bits |= temp << (30 - 15 * compressed_index);
        compressed_index += 1;
    }

    [
        (bits & 0xFF) as u8,
        ((bits >> 8) & 0xFF) as u8,
        ((bits >> 16) & 0xFF) as u8,
        ((bits >> 24) & 0xFF) as u8,
        ((bits >> 32) & 0xFF) as u8,
        ((bits >> 40) & 0xFF) as u8,
    ]
}

#[cfg(test)]
mod tests {
    use super::*;
    use approx::assert_relative_eq;

    #[test]
    fn test_decompress_identity() {
        // Identity quaternion compressed (w=1, x=y=z=0)
        // When w is largest (index 3), stored values are x, y, z scaled
        // Each should be 0.5 * 32767 ≈ 16383 when the value is 0
        // Actually: value = (stored * sqrt2/32767) - 1/sqrt2
        // For 0: stored = (0 + 1/sqrt2) * 32767/sqrt2 = 32767/2 ≈ 16383
        let identity_bytes: [u8; 6] = compress_quat(Quat::IDENTITY);
        let result = decompress_quat(&identity_bytes);

        assert_relative_eq!(result.x, 0.0, epsilon = 0.001);
        assert_relative_eq!(result.y, 0.0, epsilon = 0.001);
        assert_relative_eq!(result.z, 0.0, epsilon = 0.001);
        assert_relative_eq!(result.w.abs(), 1.0, epsilon = 0.001);
    }

    #[test]
    fn test_roundtrip() {
        let original = Quat::from_xyzw(0.5, 0.5, 0.5, 0.5);
        let compressed = compress_quat(original);
        let decompressed = decompress_quat(&compressed);

        // Allow for some precision loss due to 15-bit quantization
        assert_relative_eq!(original.x, decompressed.x, epsilon = 0.001);
        assert_relative_eq!(original.y, decompressed.y, epsilon = 0.001);
        assert_relative_eq!(original.z, decompressed.z, epsilon = 0.001);
        assert_relative_eq!(original.w, decompressed.w, epsilon = 0.001);
    }
}
