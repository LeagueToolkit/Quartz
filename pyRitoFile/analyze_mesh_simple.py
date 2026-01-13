#!/usr/bin/env python3
"""
Analyze SKL and SKN files to extract information needed for creating a minimal mesh
"""
import sys
from skl import SKL
from skn import SKN


def analyze_skeleton(skl_path):
    """Analyze SKL file and extract bone information"""
    import os
    print(f"\n{'='*60}")
    print(f"ANALYZING SKELETON: {os.path.basename(skl_path)}")
    print(f"{'='*60}")
    
    skl = SKL()
    skl.read(skl_path)
    
    print(f"\nSkeleton Info:")
    print(f"  Version: {skl.version}")
    print(f"  Total Joints: {len(skl.joints) if skl.joints else 0}")
    
    if skl.joints:
        # Find root bone (parent == -1)
        root_bones = [j for j in skl.joints if j.parent == -1]
        
        print(f"\n{'─'*60}")
        print("ROOT BONES (parent == -1):")
        print(f"{'─'*60}")
        for bone in root_bones:
            print(f"  • {bone.name}")
            print(f"    - ID: {bone.id}")
            print(f"    - Hash: 0x{bone.hash:08x}")
            print(f"    - Bin Hash: {bone.bin_hash}")
        
        print(f"\n{'─'*60}")
        print("ALL BONES:")
        print(f"{'─'*60}")
        for i, joint in enumerate(skl.joints[:10]):  # Show first 10
            parent_name = skl.joints[joint.parent].name if joint.parent >= 0 else "ROOT"
            print(f"  [{i}] {joint.name}")
            print(f"      Parent: {parent_name} (ID: {joint.parent})")
            print(f"      Hash: 0x{joint.hash:08x}")
        
        if len(skl.joints) > 10:
            print(f"  ... and {len(skl.joints) - 10} more bones")
    
    return skl


def analyze_mesh(skn_path):
    """Analyze SKN file and extract mesh information"""
    import os
    print(f"\n{'='*60}")
    print(f"ANALYZING MESH: {os.path.basename(skn_path)}")
    print(f"{'='*60}")
    
    skn = SKN()
    skn.read(skn_path)
    
    print(f"\nMesh Info:")
    print(f"  Version: {skn.version}")
    print(f"  Vertex Type: {skn.vertex_type}")
    print(f"  Vertex Size: {skn.vertex_size}")
    print(f"  Total Vertices: {len(skn.vertices) if skn.vertices else 0}")
    print(f"  Total Indices: {len(skn.indices) if skn.indices else 0}")
    print(f"  Total Triangles: {len(skn.indices) // 3 if skn.indices else 0}")
    
    if skn.submeshes:
        print(f"\n{'─'*60}")
        print(f"SUBMESHES ({len(skn.submeshes)} total):")
        print(f"{'─'*60}")
        for i, submesh in enumerate(skn.submeshes):
            print(f"  [{i}] '{submesh.name}'")
            print(f"      Bin Hash: {submesh.bin_hash}")
            print(f"      Vertices: {submesh.vertex_count} (start: {submesh.vertex_start})")
            print(f"      Indices: {submesh.index_count} (start: {submesh.index_start})")
            print(f"      Triangles: {submesh.index_count // 3}")
    
    if skn.vertices:
        print(f"\n{'─'*60}")
        print("SAMPLE VERTEX DATA (first vertex):")
        print(f"{'─'*60}")
        v = skn.vertices[0]
        print(f"  Position: {v.position}")
        print(f"  Normal: {v.normal}")
        print(f"  UV: {v.uv}")
        print(f"  Bone Influences: {v.influences}")
        print(f"  Bone Weights: {v.weights}")
        if v.color:
            print(f"  Color: {v.color}")
        if v.tangent:
            print(f"  Tangent: {v.tangent}")
    
    if skn.bounding_box:
        print(f"\n{'─'*60}")
        print("BOUNDING DATA:")
        print(f"{'─'*60}")
        print(f"  Bounding Box: {skn.bounding_box}")
        print(f"  Bounding Sphere: {skn.bounding_sphere}")
    
    return skn


def main():
    import os
    if len(sys.argv) < 3:
        print("Usage: python analyze_mesh_simple.py <skl_file> <skn_file>")
        sys.exit(1)
    
    skl_path = sys.argv[1]
    skn_path = sys.argv[2]
    
    # Validate files exist
    if not os.path.exists(skl_path):
        print(f"Error: SKL file not found: {skl_path}")
        sys.exit(1)
    
    if not os.path.exists(skn_path):
        print(f"Error: SKN file not found: {skn_path}")
        sys.exit(1)
    
    # Analyze files
    skl = analyze_skeleton(skl_path)
    skn = analyze_mesh(skn_path)
    
    # Summary for creating minimal mesh
    print(f"\n{'='*60}")
    print("SUMMARY FOR MINIMAL MESH CREATION")
    print(f"{'='*60}")
    
    if skl.joints:
        root_bones = [j for j in skl.joints if j.parent == -1]
        if root_bones:
            root = root_bones[0]
            print(f"\n✓ Root Bone to Bind To:")
            print(f"  Name: {root.name}")
            print(f"  ID: {root.id}")
            print(f"  Hash: 0x{root.hash:08x}")
    
    if skn.submeshes:
        print(f"\n✓ Example Submesh Names:")
        for submesh in skn.submeshes[:3]:
            print(f"  • {submesh.name}")
    
    print(f"\n✓ Required Vertex Properties:")
    print(f"  • Vertex Type: {skn.vertex_type}")
    print(f"  • Has Color: {skn.vertex_type.name in ['COLOR', 'TANGENT']}")
    print(f"  • Has Tangent: {skn.vertex_type.name == 'TANGENT'}")
    
    print(f"\n{'='*60}\n")


if __name__ == "__main__":
    main()
