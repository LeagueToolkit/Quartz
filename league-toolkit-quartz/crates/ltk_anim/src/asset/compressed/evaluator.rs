//! Stateful evaluator for compressed animations
//!
//! Provides efficient sequential playback by maintaining hot frame state
//! between evaluations, only reinitializing when seeking.

use super::{
    evaluate::{
        compress_time, decompress_vector3, HotFrameEvaluator, JointHotFrame, JumpFrame,
        JumpFrameU16, JumpFrameU32, QuaternionHotFrame, VectorHotFrame,
    },
    frame::TransformType,
    read::AnimationFlags,
    Compressed,
};
use crate::quantized;
use glam::{Quat, Vec3};
use std::collections::HashMap;
use std::mem::size_of;

/// A stateful evaluator for compressed animations.
///
/// This evaluator maintains hot frame state between evaluations, making it
/// efficient for sequential playback. It only reinitializes from jump caches
/// when seeking backwards or jumping too far forward.
///
/// # Example
///
/// ```ignore
/// let animation = Compressed::from_reader(&mut reader)?;
/// let mut evaluator = CompressedEvaluator::new(&animation);
///
/// // Efficient sequential playback
/// for frame in 0..100 {
///     let time = frame as f32 / 30.0;
///     let pose = evaluator.evaluate(time);
///     // Use pose...
/// }
/// ```
pub struct CompressedEvaluator<'a> {
    animation: &'a Compressed,
    state: HotFrameEvaluator,
}

impl<'a> CompressedEvaluator<'a> {
    /// Creates a new evaluator for the given animation.
    pub fn new(animation: &'a Compressed) -> Self {
        Self {
            state: HotFrameEvaluator::new(animation.joint_count()),
            animation,
        }
    }

    /// Resets the evaluator state, forcing reinitialization on next evaluate.
    pub fn reset(&mut self) {
        self.state.reset();
    }

    /// Evaluates the animation at the given time.
    ///
    /// Returns a map of joint hash -> (rotation, translation, scale).
    ///
    /// This method is optimized for sequential playback. When evaluating
    /// times in order, hot frames are updated incrementally. Seeking backwards
    /// or jumping too far forward triggers reinitialization from jump caches.
    pub fn evaluate(&mut self, time: f32) -> HashMap<u32, (Quat, Vec3, Vec3)> {
        let time = time.clamp(0.0, self.animation.duration);
        let parametrized = self
            .animation
            .flags
            .contains(AnimationFlags::UseKeyframeParametrization);

        // Update hot frames
        self.update_hot_frames(time);

        let compressed_time = compress_time(time, self.animation.duration);

        self.animation
            .joints
            .iter()
            .zip(self.state.hot_frames.iter())
            .map(|(&hash, hot_frame)| (hash, hot_frame.sample(compressed_time, parametrized)))
            .collect()
    }

    /// Updates hot frames for the given evaluation time.
    fn update_hot_frames(&mut self, time: f32) {
        // Check if we need to reinitialize from jump cache
        let needs_reinit = self.state.last_evaluation_time < 0.0
            || self.state.last_evaluation_time > time
            || (self.animation.jump_cache_count > 0
                && (time - self.state.last_evaluation_time)
                    > self.animation.duration / self.animation.jump_cache_count as f32);

        if needs_reinit {
            self.initialize_from_jump_cache(time);
        }

        // Walk through frames to update hot frames
        let compressed_time = compress_time(time, self.animation.duration);
        self.advance_cursor(compressed_time);

        self.state.last_evaluation_time = time;
    }

    /// Initializes hot frames from jump cache for the given time.
    fn initialize_from_jump_cache(&mut self, time: f32) {
        if self.animation.jump_cache_count == 0 || self.animation.duration <= 0.0 {
            return;
        }

        // Get cache id based on time
        let jump_cache_id = ((self.animation.jump_cache_count as f32
            * (time / self.animation.duration)) as usize)
            .min(self.animation.jump_cache_count - 1);

        self.state.cursor = 0;

        if self.animation.frames.len() < 0x10001 {
            self.init_from_cache::<JumpFrameU16>(jump_cache_id);
        } else {
            self.init_from_cache::<JumpFrameU32>(jump_cache_id);
        }

        self.state.cursor += 1;
    }

    fn init_from_cache<J: JumpFrame>(&mut self, jump_cache_id: usize) {
        let cache_start = jump_cache_id * size_of::<J>() * self.animation.joints.len();

        for joint_id in 0..self.animation.joints.len() {
            let offset = cache_start + joint_id * size_of::<J>();
            let Some(bytes) = self
                .animation
                .jump_caches
                .get(offset..offset + size_of::<J>())
            else {
                continue;
            };
            let jump_frame: &J = bytemuck::from_bytes(bytes);
            self.init_joint_hot_frame(joint_id, jump_frame);
        }
    }

    fn init_joint_hot_frame<J: JumpFrame>(&mut self, joint_id: usize, jump_frame: &J) {
        let mut hot_frame = JointHotFrame::default();

        // Initialize rotation hot frames
        for (i, &frame_idx) in jump_frame.rotation_keys().iter().enumerate() {
            self.state.cursor = self.state.cursor.max(frame_idx);
            if let Some(frame) = self.animation.frames.get(frame_idx) {
                hot_frame.rotation[i] = QuaternionHotFrame {
                    time: frame.time(),
                    value: quantized::decompress_quat_u16(&frame.value()),
                };
            }
        }

        // Initialize translation hot frames
        for (i, &frame_idx) in jump_frame.translation_keys().iter().enumerate() {
            self.state.cursor = self.state.cursor.max(frame_idx);
            if let Some(frame) = self.animation.frames.get(frame_idx) {
                hot_frame.translation[i] = VectorHotFrame {
                    time: frame.time(),
                    value: decompress_vector3(
                        &frame.value(),
                        self.animation.translation_min,
                        self.animation.translation_max,
                    ),
                };
            }
        }

        // Initialize scale hot frames
        for (i, &frame_idx) in jump_frame.scale_keys().iter().enumerate() {
            self.state.cursor = self.state.cursor.max(frame_idx);
            if let Some(frame) = self.animation.frames.get(frame_idx) {
                hot_frame.scale[i] = VectorHotFrame {
                    time: frame.time(),
                    value: decompress_vector3(
                        &frame.value(),
                        self.animation.scale_min,
                        self.animation.scale_max,
                    ),
                };
            }
        }

        // Rotate quaternions along shortest path
        for i in 1..4 {
            if hot_frame.rotation[i].value.dot(hot_frame.rotation[0].value) < 0.0 {
                hot_frame.rotation[i].value = -hot_frame.rotation[i].value;
            }
        }

        self.state.hot_frames[joint_id] = hot_frame;
    }

    /// Advances the cursor through frames, updating hot frames as needed.
    fn advance_cursor(&mut self, compressed_time: u16) {
        while self.state.cursor < self.animation.frames.len() {
            let frame = &self.animation.frames[self.state.cursor];
            let joint_id = frame.joint_id() as usize;
            let transform_type = frame.transform_type();

            // Check if we need this frame yet
            let hot_frame = &self.state.hot_frames[joint_id];
            let needs_update = match transform_type {
                TransformType::Rotation => compressed_time >= hot_frame.rotation[2].time,
                TransformType::Translation => compressed_time >= hot_frame.translation[2].time,
                TransformType::Scale => compressed_time >= hot_frame.scale[2].time,
            };

            if !needs_update {
                break;
            }

            // Fetch the new frame
            match transform_type {
                TransformType::Rotation => {
                    self.fetch_rotation_frame(joint_id, frame.time(), &frame.value())
                }
                TransformType::Translation => {
                    self.fetch_translation_frame(joint_id, frame.time(), &frame.value())
                }
                TransformType::Scale => {
                    self.fetch_scale_frame(joint_id, frame.time(), &frame.value())
                }
            }

            self.state.cursor += 1;
        }
    }

    /// Fetches a new rotation frame, shifting the hot frame window.
    fn fetch_rotation_frame(&mut self, joint_id: usize, time: u16, value: &[u16; 3]) {
        let hot_frame = &mut self.state.hot_frames[joint_id];

        // Shift frames: [P0, P1, P2, P3] -> [P1, P2, P3, new]
        hot_frame.rotation[0] = hot_frame.rotation[1];
        hot_frame.rotation[1] = hot_frame.rotation[2];
        hot_frame.rotation[2] = hot_frame.rotation[3];
        hot_frame.rotation[3] = QuaternionHotFrame {
            time,
            value: quantized::decompress_quat_u16(value),
        };

        // Rotate along shortest path
        for i in 1..4 {
            if hot_frame.rotation[i].value.dot(hot_frame.rotation[0].value) < 0.0 {
                hot_frame.rotation[i].value = -hot_frame.rotation[i].value;
            }
        }
    }

    /// Fetches a new translation frame, shifting the hot frame window.
    fn fetch_translation_frame(&mut self, joint_id: usize, time: u16, value: &[u16; 3]) {
        let hot_frame = &mut self.state.hot_frames[joint_id];

        // Shift frames: [P0, P1, P2, P3] -> [P1, P2, P3, new]
        hot_frame.translation[0] = hot_frame.translation[1];
        hot_frame.translation[1] = hot_frame.translation[2];
        hot_frame.translation[2] = hot_frame.translation[3];

        hot_frame.translation[3] = VectorHotFrame {
            time,
            value: decompress_vector3(
                value,
                self.animation.translation_min,
                self.animation.translation_max,
            ),
        };
    }

    /// Fetches a new scale frame, shifting the hot frame window.
    fn fetch_scale_frame(&mut self, joint_id: usize, time: u16, value: &[u16; 3]) {
        let hot_frame = &mut self.state.hot_frames[joint_id];

        // Shift frames: [P0, P1, P2, P3] -> [P1, P2, P3, new]
        hot_frame.scale[0] = hot_frame.scale[1];
        hot_frame.scale[1] = hot_frame.scale[2];
        hot_frame.scale[2] = hot_frame.scale[3];

        hot_frame.scale[3] = VectorHotFrame {
            time,
            value: decompress_vector3(value, self.animation.scale_min, self.animation.scale_max),
        };
    }
}
