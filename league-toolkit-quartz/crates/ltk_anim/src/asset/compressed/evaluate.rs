//! Compressed animation evaluation
//!
//! Implements hot frame-based Catmull-Rom interpolation for compressed animations.

use glam::{Quat, Vec3};

/// Decompresses a compressed time value to actual time
#[allow(dead_code)]
pub fn decompress_time(compressed_time: u16, duration: f32) -> f32 {
    (compressed_time as f32 / u16::MAX as f32) * duration
}

/// Compresses a time value to u16 range
pub fn compress_time(time: f32, duration: f32) -> u16 {
    if duration <= 0.0 {
        return 0;
    }
    ((time / duration) * u16::MAX as f32) as u16
}

/// Decompresses a vector from quantized u16 components
pub fn decompress_vector3(value: &[u16; 3], min: Vec3, max: Vec3) -> Vec3 {
    let scale = max - min;
    Vec3::new(
        (value[0] as f32 / u16::MAX as f32) * scale.x + min.x,
        (value[1] as f32 / u16::MAX as f32) * scale.y + min.y,
        (value[2] as f32 / u16::MAX as f32) * scale.z + min.z,
    )
}

/// A hot frame for vector transforms (translation/scale)
#[derive(Clone, Copy, Debug, Default)]
pub struct VectorHotFrame {
    pub time: u16,
    pub value: Vec3,
}

/// A hot frame for quaternion transforms (rotation)
#[derive(Clone, Copy, Debug)]
pub struct QuaternionHotFrame {
    pub time: u16,
    pub value: Quat,
}

impl Default for QuaternionHotFrame {
    fn default() -> Self {
        Self {
            time: 0,
            value: Quat::IDENTITY,
        }
    }
}

/// Joint hot frame state containing 4 control points for each transform
#[derive(Clone, Debug, Default)]
pub struct JointHotFrame {
    pub rotation: [QuaternionHotFrame; 4],
    pub translation: [VectorHotFrame; 4],
    pub scale: [VectorHotFrame; 4],
}

impl JointHotFrame {
    /// Samples all transforms at the given time
    ///
    /// Returns (rotation, translation, scale)
    pub fn sample(&self, time: u16, parametrized: bool) -> (Quat, Vec3, Vec3) {
        if parametrized {
            (
                self.sample_rotation_parametrized(time),
                self.sample_translation_parametrized(time),
                self.sample_scale_parametrized(time),
            )
        } else {
            (
                self.sample_rotation_uniform(time),
                self.sample_translation_uniform(time),
                self.sample_scale_uniform(time),
            )
        }
    }

    /// Samples rotation using uniform Catmull-Rom interpolation
    fn sample_rotation_uniform(&self, time: u16) -> Quat {
        let t_d = self.rotation[2].time.saturating_sub(self.rotation[1].time);
        if t_d == 0 {
            return self.rotation[1].value;
        }
        let amount = (time.saturating_sub(self.rotation[1].time)) as f32 / t_d as f32;

        interpolate_quat_catmull(
            amount,
            0.5,
            0.5,
            self.rotation[0].value,
            self.rotation[1].value,
            self.rotation[2].value,
            self.rotation[3].value,
        )
    }

    /// Samples translation using uniform Catmull-Rom interpolation
    fn sample_translation_uniform(&self, time: u16) -> Vec3 {
        let t_d = self.translation[2]
            .time
            .saturating_sub(self.translation[1].time);
        if t_d == 0 {
            return self.translation[1].value;
        }
        let amount = (time.saturating_sub(self.translation[1].time)) as f32 / t_d as f32;

        interpolate_vec3_catmull(
            amount,
            0.5,
            0.5,
            self.translation[0].value,
            self.translation[1].value,
            self.translation[2].value,
            self.translation[3].value,
        )
    }

    /// Samples scale using uniform Catmull-Rom interpolation
    fn sample_scale_uniform(&self, time: u16) -> Vec3 {
        let t_d = self.scale[2].time.saturating_sub(self.scale[1].time);
        if t_d == 0 {
            return self.scale[1].value;
        }
        let amount = (time.saturating_sub(self.scale[1].time)) as f32 / t_d as f32;

        interpolate_vec3_catmull(
            amount,
            0.5,
            0.5,
            self.scale[0].value,
            self.scale[1].value,
            self.scale[2].value,
            self.scale[3].value,
        )
    }

    /// Samples rotation using parametrized Catmull-Rom interpolation
    fn sample_rotation_parametrized(&self, time: u16) -> Quat {
        let (amount, scale_in, scale_out) = create_keyframe_weights(
            time,
            self.rotation[0].time,
            self.rotation[1].time,
            self.rotation[2].time,
            self.rotation[3].time,
        );

        interpolate_quat_catmull(
            amount,
            scale_in,
            scale_out,
            self.rotation[0].value,
            self.rotation[1].value,
            self.rotation[2].value,
            self.rotation[3].value,
        )
    }

    /// Samples translation using parametrized Catmull-Rom interpolation
    fn sample_translation_parametrized(&self, time: u16) -> Vec3 {
        let (amount, scale_in, scale_out) = create_keyframe_weights(
            time,
            self.translation[0].time,
            self.translation[1].time,
            self.translation[2].time,
            self.translation[3].time,
        );

        interpolate_vec3_catmull(
            amount,
            scale_in,
            scale_out,
            self.translation[0].value,
            self.translation[1].value,
            self.translation[2].value,
            self.translation[3].value,
        )
    }

    /// Samples scale using parametrized Catmull-Rom interpolation
    fn sample_scale_parametrized(&self, time: u16) -> Vec3 {
        let (amount, scale_in, scale_out) = create_keyframe_weights(
            time,
            self.scale[0].time,
            self.scale[1].time,
            self.scale[2].time,
            self.scale[3].time,
        );

        interpolate_vec3_catmull(
            amount,
            scale_in,
            scale_out,
            self.scale[0].value,
            self.scale[1].value,
            self.scale[2].value,
            self.scale[3].value,
        )
    }
}

const SLERP_EPSILON: f32 = 0.000001;

/// Creates Catmull-Rom keyframe weights for parametrized interpolation
fn create_keyframe_weights(time: u16, t0: u16, t1: u16, t2: u16, t3: u16) -> (f32, f32, f32) {
    let t_d = t2.saturating_sub(t1) as f32;
    let amount = time.saturating_sub(t1) as f32 / (t_d + SLERP_EPSILON);
    let scale_in = t_d / (t2.saturating_sub(t0) as f32 + SLERP_EPSILON);
    let scale_out = t_d / (t3.saturating_sub(t1) as f32 + SLERP_EPSILON);
    (amount, scale_in, scale_out)
}

/// Creates Catmull-Rom weights for interpolation
fn create_catmull_rom_weights(amount: f32, ease_in: f32, ease_out: f32) -> (f32, f32, f32, f32) {
    let m0 = (((2.0 - amount) * amount) - 1.0) * (amount * ease_in);
    let m1 = ((((2.0 - ease_out) * amount) + (ease_out - 3.0)) * (amount * amount)) + 1.0;
    let m2 = ((((3.0 - ease_in * 2.0) + ((ease_in - 2.0) * amount)) * amount) + ease_in) * amount;
    let m3 = ((amount - 1.0) * amount) * (amount * ease_out);
    (m0, m1, m2, m3)
}

/// Interpolates Vec3 using Catmull-Rom spline
fn interpolate_vec3_catmull(
    amount: f32,
    tau20: f32,
    tau31: f32,
    p0: Vec3,
    p1: Vec3,
    p2: Vec3,
    p3: Vec3,
) -> Vec3 {
    let (m0, m1, m2, m3) = create_catmull_rom_weights(amount, tau20, tau31);
    Vec3::new(
        m1 * p1.x + m0 * p0.x + m3 * p3.x + m2 * p2.x,
        m1 * p1.y + m0 * p0.y + m3 * p3.y + m2 * p2.y,
        m1 * p1.z + m0 * p0.z + m3 * p3.z + m2 * p2.z,
    )
}

/// Interpolates Quaternion using Catmull-Rom spline
fn interpolate_quat_catmull(
    amount: f32,
    tau20: f32,
    tau31: f32,
    p0: Quat,
    p1: Quat,
    p2: Quat,
    p3: Quat,
) -> Quat {
    let (m0, m1, m2, m3) = create_catmull_rom_weights(amount, tau20, tau31);
    Quat::from_xyzw(
        m1 * p1.x + m0 * p0.x + m3 * p3.x + m2 * p2.x,
        m1 * p1.y + m0 * p0.y + m3 * p3.y + m2 * p2.y,
        m1 * p1.z + m0 * p0.z + m3 * p3.z + m2 * p2.z,
        m1 * p1.w + m0 * p0.w + m3 * p3.w + m2 * p2.w,
    )
    .normalize()
}

/// Trait for jump frames that provide frame indices for hot frame initialization
pub trait JumpFrame: bytemuck::Pod {
    fn rotation_keys(&self) -> [usize; 4];
    fn translation_keys(&self) -> [usize; 4];
    fn scale_keys(&self) -> [usize; 4];
}

/// Jump frame with 16-bit keys (used when frame_count < 0x10001)
#[derive(Clone, Copy, Debug, bytemuck::Pod, bytemuck::Zeroable)]
#[repr(C)]
pub struct JumpFrameU16 {
    pub rotation_keys: [u16; 4],
    pub translation_keys: [u16; 4],
    pub scale_keys: [u16; 4],
}

impl JumpFrame for JumpFrameU16 {
    fn rotation_keys(&self) -> [usize; 4] {
        self.rotation_keys.map(|k| k as usize)
    }
    fn translation_keys(&self) -> [usize; 4] {
        self.translation_keys.map(|k| k as usize)
    }
    fn scale_keys(&self) -> [usize; 4] {
        self.scale_keys.map(|k| k as usize)
    }
}

/// Jump frame with 32-bit keys (used when frame_count >= 0x10001)
#[derive(Clone, Copy, Debug, bytemuck::Pod, bytemuck::Zeroable)]
#[repr(C)]
pub struct JumpFrameU32 {
    pub rotation_keys: [u32; 4],
    pub translation_keys: [u32; 4],
    pub scale_keys: [u32; 4],
}

impl JumpFrame for JumpFrameU32 {
    fn rotation_keys(&self) -> [usize; 4] {
        self.rotation_keys.map(|k| k as usize)
    }
    fn translation_keys(&self) -> [usize; 4] {
        self.translation_keys.map(|k| k as usize)
    }
    fn scale_keys(&self) -> [usize; 4] {
        self.scale_keys.map(|k| k as usize)
    }
}

/// Hot frame evaluator state (internal)
#[derive(Clone, Debug)]
pub(crate) struct HotFrameEvaluator {
    pub last_evaluation_time: f32,
    pub cursor: usize,
    pub hot_frames: Vec<JointHotFrame>,
}

impl HotFrameEvaluator {
    pub fn new(joint_count: usize) -> Self {
        Self {
            last_evaluation_time: -1.0,
            cursor: 0,
            hot_frames: vec![JointHotFrame::default(); joint_count],
        }
    }

    pub fn reset(&mut self) {
        self.last_evaluation_time = -1.0;
        self.cursor = 0;
        for hf in &mut self.hot_frames {
            *hf = JointHotFrame::default();
        }
    }
}
