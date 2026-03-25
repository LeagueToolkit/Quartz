#include <algorithm>
#include <filesystem>
#include <fstream>
#include <iostream>
#include <string>
#include <vector>

#ifdef HAS_FBXSDK
#include <fbxsdk.h>
#endif

namespace {

struct CliArgs {
    std::filesystem::path output;
    std::filesystem::path qmesh;
};

void print_usage() {
    std::cerr << "xps_fbx_bridge\n";
    std::cerr << "Usage:\n";
    std::cerr << "  xps_fbx_bridge --qmesh <file.qmesh> --output <file.fbx>\n";
}

bool parse_args(int argc, wchar_t** argv, CliArgs& out) {
    std::vector<std::wstring> args(argv + 1, argv + argc);
    for (size_t i = 0; i < args.size(); ++i) {
        if (args[i] == L"--output" && i + 1 < args.size()) {
            out.output = args[++i];
        } else if (args[i] == L"--qmesh" && i + 1 < args.size()) {
            out.qmesh = args[++i];
        } else if (args[i] == L"--help" || args[i] == L"-h") {
            print_usage();
            return false;
        }
    }

    if (out.output.empty() || out.qmesh.empty()) {
        print_usage();
        return false;
    }
    return true;
}

#ifdef HAS_FBXSDK
struct QInfluence {
    int bone_index = -1;
    double weight = 0.0;
};

struct QVertex {
    double px = 0.0;
    double py = 0.0;
    double pz = 0.0;
    double nx = 0.0;
    double ny = 0.0;
    double nz = 1.0;
    double u = 0.0;
    double v = 0.0;
    std::vector<QInfluence> influences;
};

struct QMesh {
    std::string name;
    std::vector<QVertex> vertices;
    std::vector<FbxVector4> faces;
};

struct QBone {
    std::string name;
    int parent_index = -1;
    double x = 0.0;
    double y = 0.0;
    double z = 0.0;
};

struct QModel {
    std::vector<QBone> bones;
    std::vector<QMesh> meshes;
};

bool parse_qmesh(const std::filesystem::path& path, QModel& out, std::string& error) {
    std::ifstream in(path);
    if (!in) {
        error = "Failed to open qmesh: " + path.u8string();
        return false;
    }

    std::string token;
    in >> token;
    if (token != "QXPS1") {
        error = "Invalid qmesh header";
        return false;
    }

    size_t bone_count = 0;
    in >> token >> bone_count;
    if (!in || token != "BONES") {
        error = "Invalid BONES section";
        return false;
    }

    out.bones.clear();
    out.bones.reserve(bone_count);
    for (size_t i = 0; i < bone_count; ++i) {
        std::string row;
        QBone bone;
        in >> row >> bone.parent_index >> bone.x >> bone.y >> bone.z >> bone.name;
        if (!in || row != "B") {
            error = "Invalid bone row";
            return false;
        }
        out.bones.push_back(bone);
    }

    size_t mesh_count = 0;
    in >> token >> mesh_count;
    if (!in || token != "MESHES") {
        error = "Invalid MESHES section";
        return false;
    }

    out.meshes.clear();
    out.meshes.reserve(mesh_count);
    for (size_t mi = 0; mi < mesh_count; ++mi) {
        std::string row;
        QMesh mesh;
        size_t vcount = 0;
        size_t fcount = 0;
        in >> row >> mesh.name >> vcount >> fcount;
        if (!in || row != "M") {
            error = "Invalid mesh header row";
            return false;
        }

        mesh.vertices.resize(vcount);
        for (size_t vi = 0; vi < vcount; ++vi) {
            QVertex vtx;
            size_t influence_count = 0;
            in >> row >> vtx.px >> vtx.py >> vtx.pz >> vtx.nx >> vtx.ny >> vtx.nz >> vtx.u >> vtx.v >> influence_count;
            if (!in || row != "V") {
                error = "Invalid vertex row";
                return false;
            }

            vtx.influences.reserve(influence_count);
            for (size_t ii = 0; ii < influence_count; ++ii) {
                QInfluence inf;
                in >> inf.bone_index >> inf.weight;
                if (!in) {
                    error = "Invalid vertex influence pair";
                    return false;
                }
                vtx.influences.push_back(inf);
            }
            mesh.vertices[vi] = vtx;
        }

        mesh.faces.resize(fcount);
        for (size_t fi = 0; fi < fcount; ++fi) {
            unsigned int a = 0;
            unsigned int b = 0;
            unsigned int c = 0;
            in >> row >> a >> b >> c;
            if (!in || row != "F") {
                error = "Invalid face row";
                return false;
            }
            mesh.faces[fi] = FbxVector4(static_cast<double>(a), static_cast<double>(b), static_cast<double>(c), 0.0);
        }

        out.meshes.push_back(std::move(mesh));
    }

    return true;
}

void ensure_output_dir(const std::filesystem::path& output_path, std::string& error) {
    const auto parent = output_path.parent_path();
    if (parent.empty()) {
        return;
    }
    std::error_code ec;
    std::filesystem::create_directories(parent, ec);
    if (ec) {
        error = "Failed to create output directory: " + ec.message();
    }
}

bool export_scene(FbxManager* manager, FbxScene* scene, const std::string& output_path, std::string& error) {
    FbxExporter* exporter = FbxExporter::Create(manager, "Exporter");
    int writer_id = manager->GetIOPluginRegistry()->FindWriterIDByExtension("fbx");
    if (!exporter->Initialize(output_path.c_str(), writer_id, manager->GetIOSettings())) {
        error = std::string("Failed to initialize FBX exporter: ") + exporter->GetStatus().GetErrorString();
        exporter->Destroy();
        return false;
    }

    if (!exporter->Export(scene)) {
        error = std::string("Failed to export FBX: ") + exporter->GetStatus().GetErrorString();
        exporter->Destroy();
        return false;
    }

    exporter->Destroy();
    return true;
}

bool build_scene_from_qmesh(FbxManager* manager, FbxScene* scene, const QModel& model, std::string& error) {
    FbxNode* root = scene->GetRootNode();
    if (!root) {
        error = "Scene root node not found";
        return false;
    }

    std::vector<FbxNode*> bone_nodes(model.bones.size(), nullptr);
    for (size_t i = 0; i < model.bones.size(); ++i) {
        const QBone& src = model.bones[i];
        FbxSkeleton* skel = FbxSkeleton::Create(manager, src.name.c_str());
        skel->SetSkeletonType(src.parent_index < 0 ? FbxSkeleton::eRoot : FbxSkeleton::eLimbNode);

        FbxNode* node = FbxNode::Create(manager, src.name.c_str());
        node->SetNodeAttribute(skel);
        bone_nodes[i] = node;
    }

    for (size_t i = 0; i < model.bones.size(); ++i) {
        const int p = model.bones[i].parent_index;
        if (p >= 0 && static_cast<size_t>(p) < bone_nodes.size() && bone_nodes[p]) {
            bone_nodes[p]->AddChild(bone_nodes[i]);
        } else {
            root->AddChild(bone_nodes[i]);
        }
    }

    for (size_t i = 0; i < model.bones.size(); ++i) {
        const QBone& b = model.bones[i];
        FbxDouble3 local_t(b.x, b.y, b.z);
        if (b.parent_index >= 0 && static_cast<size_t>(b.parent_index) < model.bones.size()) {
            const QBone& p = model.bones[b.parent_index];
            local_t = FbxDouble3(b.x - p.x, b.y - p.y, b.z - p.z);
        }
        bone_nodes[i]->LclTranslation.Set(local_t);
        bone_nodes[i]->LclRotation.Set(FbxDouble3(0.0, 0.0, 0.0));
        bone_nodes[i]->LclScaling.Set(FbxDouble3(1.0, 1.0, 1.0));
    }

    std::vector<FbxNode*> mesh_nodes;
    mesh_nodes.reserve(model.meshes.size());

    for (size_t mi = 0; mi < model.meshes.size(); ++mi) {
        const QMesh& src_mesh = model.meshes[mi];

        FbxMesh* mesh = FbxMesh::Create(scene, src_mesh.name.c_str());
        FbxNode* mesh_node = FbxNode::Create(scene, src_mesh.name.c_str());
        mesh_node->SetNodeAttribute(mesh);
        root->AddChild(mesh_node);
        mesh_nodes.push_back(mesh_node);

        const int cp_count = static_cast<int>(src_mesh.vertices.size());
        mesh->InitControlPoints(cp_count);
        FbxVector4* cps = mesh->GetControlPoints();
        for (int i = 0; i < cp_count; ++i) {
            const QVertex& v = src_mesh.vertices[static_cast<size_t>(i)];
            cps[i] = FbxVector4(v.px, v.py, v.pz, 1.0);
        }

        auto* normals = mesh->CreateElementNormal();
        normals->SetMappingMode(FbxGeometryElement::eByControlPoint);
        normals->SetReferenceMode(FbxGeometryElement::eDirect);

        auto* uvs = mesh->CreateElementUV("UVSet0");
        uvs->SetMappingMode(FbxGeometryElement::eByControlPoint);
        uvs->SetReferenceMode(FbxGeometryElement::eDirect);

        for (const QVertex& v : src_mesh.vertices) {
            normals->GetDirectArray().Add(FbxVector4(v.nx, v.ny, v.nz, 0.0));
            uvs->GetDirectArray().Add(FbxVector2(v.u, 1.0 - v.v));
        }

        for (const FbxVector4& f : src_mesh.faces) {
            const int a = static_cast<int>(f[0]);
            const int b = static_cast<int>(f[1]);
            const int c = static_cast<int>(f[2]);
            if (a < 0 || b < 0 || c < 0 || a >= cp_count || b >= cp_count || c >= cp_count) {
                continue;
            }
            mesh->BeginPolygon(-1, -1, false);
            mesh->AddPolygon(a);
            mesh->AddPolygon(b);
            mesh->AddPolygon(c);
            mesh->EndPolygon();
        }

        if (!bone_nodes.empty()) {
            FbxSkin* skin = FbxSkin::Create(scene, (src_mesh.name + "_Skin").c_str());
            std::vector<FbxCluster*> clusters(bone_nodes.size(), nullptr);
            bool any_weight = false;

            for (size_t vi = 0; vi < src_mesh.vertices.size(); ++vi) {
                for (const QInfluence& inf : src_mesh.vertices[vi].influences) {
                    if (inf.weight <= 0.0 || inf.bone_index < 0 || static_cast<size_t>(inf.bone_index) >= bone_nodes.size()) {
                        continue;
                    }

                    FbxCluster* cluster = clusters[static_cast<size_t>(inf.bone_index)];
                    if (!cluster) {
                        cluster = FbxCluster::Create(scene, (src_mesh.name + "_c_" + std::to_string(inf.bone_index)).c_str());
                        cluster->SetLink(bone_nodes[static_cast<size_t>(inf.bone_index)]);
                        cluster->SetLinkMode(FbxCluster::eTotalOne);
                        clusters[static_cast<size_t>(inf.bone_index)] = cluster;
                        skin->AddCluster(cluster);
                    }

                    cluster->AddControlPointIndex(static_cast<int>(vi), inf.weight);
                    any_weight = true;
                }
            }

            if (any_weight) {
                for (size_t bi = 0; bi < clusters.size(); ++bi) {
                    FbxCluster* cluster = clusters[bi];
                    if (!cluster) {
                        continue;
                    }
                    cluster->SetTransformMatrix(mesh_node->EvaluateGlobalTransform());
                    cluster->SetTransformLinkMatrix(bone_nodes[bi]->EvaluateGlobalTransform());
                }
                mesh->AddDeformer(skin);
            } else {
                skin->Destroy();
            }
        }
    }

    FbxPose* bind_pose = FbxPose::Create(scene, "BindPose");
    bind_pose->SetIsBindPose(true);
    for (FbxNode* mesh_node : mesh_nodes) {
        if (mesh_node) {
            bind_pose->Add(mesh_node, mesh_node->EvaluateGlobalTransform());
        }
    }
    for (FbxNode* bone_node : bone_nodes) {
        if (bone_node) {
            bind_pose->Add(bone_node, bone_node->EvaluateGlobalTransform());
        }
    }
    if (bind_pose->GetCount() > 0) {
        scene->AddPose(bind_pose);
    } else {
        bind_pose->Destroy();
    }

    return true;
}

#endif

int run_bridge(const CliArgs& args) {
    if (!args.qmesh.empty() && !std::filesystem::exists(args.qmesh)) {
        std::cerr << "QMesh file not found: " << args.qmesh.u8string() << "\n";
        return 2;
    }

#ifndef HAS_FBXSDK
    std::cerr << "FBX SDK is not configured in this build.\n";
    std::cerr << "Rebuild xps_fbx_bridge with -DFBXSDK_ROOT=<Autodesk FBX SDK path>.\n";
    return 3;
#else
    FbxManager* manager = FbxManager::Create();
    if (!manager) {
        std::cerr << "Failed to initialize FBX Manager.\n";
        return 4;
    }

    FbxIOSettings* io_settings = FbxIOSettings::Create(manager, IOSROOT);
    manager->SetIOSettings(io_settings);

    FbxScene* scene = FbxScene::Create(manager, "QuartzScene");
    if (!scene) {
        std::cerr << "Failed to create FBX scene.\n";
        manager->Destroy();
        return 5;
    }

    std::string error;

    QModel model;
    if (!parse_qmesh(args.qmesh, model, error)) {
        std::cerr << error << "\n";
        scene->Destroy();
        manager->Destroy();
        return 6;
    }
    if (!build_scene_from_qmesh(manager, scene, model, error)) {
        std::cerr << error << "\n";
        scene->Destroy();
        manager->Destroy();
        return 7;
    }

    ensure_output_dir(args.output, error);
    if (!error.empty()) {
        std::cerr << error << "\n";
        scene->Destroy();
        manager->Destroy();
        return 9;
    }

    if (!export_scene(manager, scene, args.output.u8string(), error)) {
        std::cerr << error << "\n";
        scene->Destroy();
        manager->Destroy();
        return 10;
    }

    scene->Destroy();
    manager->Destroy();

    std::cerr << "OK: " << args.qmesh.u8string() << " -> " << args.output.u8string() << "\n";
    return 0;
#endif
}

}  // namespace

int wmain(int argc, wchar_t** argv) {
    CliArgs args;
    if (!parse_args(argc, argv, args)) {
        return 1;
    }
    return run_bridge(args);
}
