#include <filesystem>
#include <fstream>
#include <iostream>
#include <string>
#include <vector>

#include "../../Pmx2Fbx-master/PmxLib/PmxReader.h"

#ifdef HAS_FBXSDK
#include <fbxsdk.h>
#include <DirectXMath.h>
#endif

namespace {

struct CliArgs {
    std::filesystem::path input;
    std::filesystem::path output;
};

void print_usage() {
    std::cerr << "pmx_fbx_bridge\n";
    std::cerr << "Usage:\n";
    std::cerr << "  pmx_fbx_bridge --input <file.pmx> --output <file.fbx>\n";
}

bool parse_args(int argc, char** argv, CliArgs& out) {
    std::vector<std::string> args(argv + 1, argv + argc);
    for (size_t i = 0; i < args.size(); ++i) {
        if (args[i] == "--input" && i + 1 < args.size()) {
            out.input = args[++i];
        } else if (args[i] == "--output" && i + 1 < args.size()) {
            out.output = args[++i];
        } else if (args[i] == "--help" || args[i] == "-h") {
            print_usage();
            return false;
        }
    }
    if (out.input.empty() || out.output.empty()) {
        print_usage();
        return false;
    }
    return true;
}

#ifdef HAS_FBXSDK
bool load_file(const std::filesystem::path& path, std::vector<unsigned char>& bytes, std::string& error) {
    std::ifstream in(path, std::ios::binary);
    if (!in) {
        error = "Failed to open input file";
        return false;
    }
    in.seekg(0, std::ios::end);
    const std::streamoff size = in.tellg();
    in.seekg(0, std::ios::beg);
    if (size <= 0) {
        error = "Input file is empty";
        return false;
    }
    bytes.resize(static_cast<size_t>(size));
    in.read(reinterpret_cast<char*>(bytes.data()), size);
    if (!in) {
        error = "Failed to read full PMX file";
        return false;
    }
    return true;
}

FbxAMatrix to_fbx_matrix(const DirectX::XMMATRIX& xm) {
    DirectX::XMFLOAT4X4 m;
    DirectX::XMStoreFloat4x4(&m, xm);
    FbxAMatrix out;
    out.SetRow(0, FbxVector4(m._11, m._12, m._13, m._14));
    out.SetRow(1, FbxVector4(m._21, m._22, m._23, m._24));
    out.SetRow(2, FbxVector4(m._31, m._32, m._33, m._34));
    out.SetRow(3, FbxVector4(m._41, m._42, m._43, m._44));
    return out;
}

bool build_scene_from_pmx(FbxManager* manager, FbxScene* scene, const PmxReader& pmx, std::string& error) {
    FbxNode* root = scene->GetRootNode();
    if (!root) {
        error = "FBX root node missing";
        return false;
    }

    const std::string mesh_name = pmx.ModelName.empty() ? "pmx_model" : pmx.ModelName;
    FbxMesh* mesh = FbxMesh::Create(scene, mesh_name.c_str());
    FbxNode* mesh_node = FbxNode::Create(scene, mesh_name.c_str());
    mesh_node->SetNodeAttribute(mesh);
    root->AddChild(mesh_node);

    const int vertex_count = static_cast<int>(pmx.VertexList.size());
    mesh->InitControlPoints(vertex_count);
    FbxVector4* cps = mesh->GetControlPoints();
    for (int i = 0; i < vertex_count; ++i) {
        const auto& v = pmx.VertexList[static_cast<size_t>(i)];
        cps[i] = FbxVector4(v.Position.X, v.Position.Y, v.Position.Z, 1.0);
    }

    auto* normals = mesh->CreateElementNormal();
    normals->SetMappingMode(FbxGeometryElement::eByControlPoint);
    normals->SetReferenceMode(FbxGeometryElement::eDirect);

    auto* uvs = mesh->CreateElementUV("UVSet0");
    uvs->SetMappingMode(FbxGeometryElement::eByControlPoint);
    uvs->SetReferenceMode(FbxGeometryElement::eDirect);

    for (const auto& v : pmx.VertexList) {
        normals->GetDirectArray().Add(FbxVector4(v.Normal.X, v.Normal.Y, v.Normal.Z, 0.0));
        uvs->GetDirectArray().Add(FbxVector2(v.UV.X, 1.0 - v.UV.Y));
    }

    for (size_t i = 0; i + 2 < pmx.FaceList.size(); i += 3) {
        const int a = pmx.FaceList[i];
        const int b = pmx.FaceList[i + 1];
        const int c = pmx.FaceList[i + 2];
        if (a < 0 || b < 0 || c < 0 || a >= vertex_count || b >= vertex_count || c >= vertex_count) {
            continue;
        }
        mesh->BeginPolygon(-1, -1, false);
        mesh->AddPolygon(a);
        mesh->AddPolygon(b);
        mesh->AddPolygon(c);
        mesh->EndPolygon();
    }

    std::vector<FbxNode*> bone_nodes(pmx.BoneList.size(), nullptr);
    std::vector<FbxCluster*> clusters(pmx.BoneList.size(), nullptr);

    FbxSkin* skin = FbxSkin::Create(scene, "pmx_skin");
    mesh->AddDeformer(skin);

    for (size_t i = 0; i < pmx.BoneList.size(); ++i) {
        const auto& b = pmx.BoneList[i];
        const std::string bone_name = b.Name.empty() ? ("bone_" + std::to_string(i)) : b.Name;

        FbxSkeleton* skel = FbxSkeleton::Create(scene, bone_name.c_str());
        skel->SetSkeletonType(b.Parent < 0 ? FbxSkeleton::eRoot : FbxSkeleton::eLimbNode);

        FbxNode* node = FbxNode::Create(scene, bone_name.c_str());
        node->SetNodeAttribute(skel);
        bone_nodes[i] = node;

        FbxCluster* cluster = FbxCluster::Create(scene, ("cluster_" + std::to_string(i)).c_str());
        cluster->SetLink(node);
        cluster->SetLinkMode(FbxCluster::eTotalOne);
        clusters[i] = cluster;
        skin->AddCluster(cluster);
    }

    for (size_t i = 0; i < pmx.BoneList.size(); ++i) {
        const auto& b = pmx.BoneList[i];
        if (b.Parent >= 0 && static_cast<size_t>(b.Parent) < bone_nodes.size()) {
            bone_nodes[b.Parent]->AddChild(bone_nodes[i]);
        } else {
            root->AddChild(bone_nodes[i]);
        }
    }

    for (size_t i = 0; i < pmx.BoneList.size(); ++i) {
        const auto& b = pmx.BoneList[i];
        const FbxAMatrix local = to_fbx_matrix(b.LocalMatrix);
        bone_nodes[i]->LclTranslation.Set(FbxDouble3(local.GetT()));
        bone_nodes[i]->LclRotation.Set(FbxDouble3(local.GetR()));
        bone_nodes[i]->LclScaling.Set(FbxDouble3(local.GetS()));
    }

    for (size_t vid = 0; vid < pmx.VertexList.size(); ++vid) {
        const auto& v = pmx.VertexList[vid];
        for (int wi = 0; wi < 4; ++wi) {
            const auto& w = v.Weight[wi];
            if (!w.IsValid()) {
                continue;
            }
            if (w.Bone < 0 || static_cast<size_t>(w.Bone) >= clusters.size()) {
                continue;
            }
            clusters[static_cast<size_t>(w.Bone)]->AddControlPointIndex(static_cast<int>(vid), w.Value);
        }
    }

    for (size_t i = 0; i < clusters.size(); ++i) {
        FbxCluster* cluster = clusters[i];
        if (!cluster) {
            continue;
        }
        cluster->SetTransformMatrix(mesh_node->EvaluateGlobalTransform());
        const FbxAMatrix world = to_fbx_matrix(pmx.BoneList[i].WorldMatrix);
        cluster->SetTransformLinkMatrix(world);
    }

    FbxPose* bind_pose = FbxPose::Create(scene, "BindPose");
    bind_pose->SetIsBindPose(true);
    bind_pose->Add(mesh_node, mesh_node->EvaluateGlobalTransform());
    for (FbxNode* b : bone_nodes) {
        if (b) {
            bind_pose->Add(b, b->EvaluateGlobalTransform());
        }
    }
    scene->AddPose(bind_pose);

    return true;
}
#endif

int run_bridge(const CliArgs& args) {
    if (!std::filesystem::exists(args.input)) {
        std::cerr << "Input file not found: " << args.input.string() << "\n";
        return 2;
    }

#ifndef HAS_FBXSDK
    std::cerr << "FBX SDK is not configured in this build.\n";
    std::cerr << "Rebuild pmx_fbx_bridge with -DFBXSDK_ROOT=<Autodesk FBX SDK path>.\n";
    return 3;
#else
    std::vector<unsigned char> bytes;
    std::string error;
    if (!load_file(args.input, bytes, error)) {
        std::cerr << error << "\n";
        return 4;
    }

    PmxReader* pmx = nullptr;
    try {
        pmx = new PmxReader(bytes.data(), bytes.size());
    } catch (const std::wstring& werr) {
        std::string msg;
        Platform_Utf16To8(werr, msg);
        std::cerr << "Failed to parse PMX: " << msg << "\n";
        return 5;
    } catch (...) {
        std::cerr << "Failed to parse PMX: unknown parser error\n";
        return 5;
    }

    FbxManager* manager = FbxManager::Create();
    if (!manager) {
        delete pmx;
        std::cerr << "Failed to create FBX manager\n";
        return 6;
    }
    FbxIOSettings* io = FbxIOSettings::Create(manager, IOSROOT);
    manager->SetIOSettings(io);
    FbxScene* scene = FbxScene::Create(manager, "Scene");
    if (!scene) {
        delete pmx;
        manager->Destroy();
        std::cerr << "Failed to create FBX scene\n";
        return 7;
    }

    if (!build_scene_from_pmx(manager, scene, *pmx, error)) {
        delete pmx;
        scene->Destroy();
        manager->Destroy();
        std::cerr << "Failed to build FBX scene: " << error << "\n";
        return 8;
    }
    delete pmx;

    const auto parent = args.output.parent_path();
    if (!parent.empty()) {
        std::error_code ec;
        std::filesystem::create_directories(parent, ec);
        if (ec) {
            scene->Destroy();
            manager->Destroy();
            std::cerr << "Failed to create output directory: " << ec.message() << "\n";
            return 9;
        }
    }

    FbxExporter* exporter = FbxExporter::Create(manager, "Exporter");
    int writer_id = manager->GetIOPluginRegistry()->FindWriterIDByExtension("fbx");
    if (!exporter->Initialize(args.output.string().c_str(), writer_id, manager->GetIOSettings())) {
        std::cerr << "Failed to initialize FBX exporter: " << exporter->GetStatus().GetErrorString() << "\n";
        exporter->Destroy();
        scene->Destroy();
        manager->Destroy();
        return 10;
    }
    if (!exporter->Export(scene)) {
        std::cerr << "Failed to export FBX: " << exporter->GetStatus().GetErrorString() << "\n";
        exporter->Destroy();
        scene->Destroy();
        manager->Destroy();
        return 11;
    }
    exporter->Destroy();

    scene->Destroy();
    manager->Destroy();

    std::cerr << "OK: " << args.input.string() << " -> " << args.output.string() << "\n";
    return 0;
#endif
}

} // namespace

int main(int argc, char** argv) {
    CliArgs args;
    if (!parse_args(argc, argv, args)) {
        return 1;
    }
    return run_bridge(args);
}
