use crate::{joint, RigResource};
use std::collections::VecDeque;

/// Builder for [`RigResource`]
pub struct Builder {
    name: String,
    asset_name: String,
    root_joints: Vec<joint::Builder>,
}

impl Builder {
    pub fn new(name: impl Into<String>, asset_name: impl Into<String>) -> Self {
        Self {
            name: name.into(),
            asset_name: asset_name.into(),
            root_joints: vec![],
        }
    }

    pub fn with_root_joint(mut self, child: joint::Builder) -> Self {
        self.add_root_joint(child);
        self
    }

    /// Mutably add a root joint
    pub fn add_root_joint(&mut self, child: joint::Builder) {
        self.root_joints.push(child);
    }

    pub fn build(self) -> RigResource {
        let mut influences = vec![];
        // It's probably not much of a win traversing the joint tree to pre-allocate the Vec exactly,
        // but we could measure this at some point
        let mut joints = Vec::with_capacity(self.root_joints.len());
        let mut q = self
            .root_joints
            .into_iter()
            .rev()
            .map(|j| (j, -1))
            .collect::<VecDeque<_>>();
        while let Some((joint, parent_id)) = q.pop_back() {
            assert!(joints.len() < i16::MAX as usize);
            let i = joints.len() as i16;
            if joint.is_influence {
                influences.push(i);
            }
            let (joint, children) = joint.build(i, parent_id);
            joints.push(joint);
            for j in children.into_iter().rev() {
                q.push_back((*j, i));
            }
        }
        RigResource {
            flags: 0,
            name: self.name,
            asset_name: self.asset_name,
            joints,
            influences,
        }
    }
}

#[cfg(test)]
mod tests {
    use crate::Joint;

    use super::*;
    use insta::assert_debug_snapshot;

    #[test]
    fn build_rig() {
        let rig = RigResource::builder("my_rig", "my_rig_asset")
            .with_root_joint(Joint::builder("root_1").with_flags(10).with_children([
                Joint::builder("2a").with_flags(11),
                Joint::builder("2b").with_flags(12).with_influence(true),
            ]))
            .with_root_joint(
                Joint::builder("root_2")
                    .with_flags(20)
                    .with_children([Joint::builder("2a")
                        .with_flags(21)
                        .with_influence(true)
                        .with_children([Joint::builder("2aa").with_flags(211)])]),
            )
            .build();

        assert_debug_snapshot!(rig);
    }
}
