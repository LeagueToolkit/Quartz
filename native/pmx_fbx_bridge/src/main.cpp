#include <filesystem>
#include <fstream>
#include <iostream>
#include <string>
#include <unordered_map>
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

bool parse_args(int argc, wchar_t** argv, CliArgs& out) {
    std::vector<std::wstring> args(argv + 1, argv + argc);
    for (size_t i = 0; i < args.size(); ++i) {
        if (args[i] == L"--input" && i + 1 < args.size()) {
            out.input = args[++i];
        } else if (args[i] == L"--output" && i + 1 < args.size()) {
            out.output = args[++i];
        } else if (args[i] == L"--help" || args[i] == L"-h") {
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

// Convert non-ASCII bytes to hex so FBX doesn't choke on Japanese names.
static std::string to_latin(const std::string& name) {
    std::string out;
    for (unsigned char ch : name) {
        if (ch > 0x7f) {
            char buf[4];
            snprintf(buf, sizeof(buf), "%02x", ch);
            out.append(buf);
        } else {
            out.push_back(static_cast<char>(ch));
        }
    }
    return out;
}

bool build_scene_from_pmx(FbxManager* manager, FbxScene* scene, const PmxReader& pmx,
                           const std::filesystem::path& input_dir, std::string& error) {
    FbxNode* root = scene->GetRootNode();
    if (!root) {
        error = "FBX root node missing";
        return false;
    }

    const int global_vert_count = static_cast<int>(pmx.VertexList.size());

    // ── Skeleton (shared across all material meshes) ─────────────────────
    std::vector<FbxNode*> bone_nodes(pmx.BoneList.size(), nullptr);

    for (size_t i = 0; i < pmx.BoneList.size(); ++i) {
        const auto& b = pmx.BoneList[i];
        const std::string bone_name = to_latin(b.Name.empty() ? ("bone_" + std::to_string(i)) : b.Name);

        FbxSkeleton* skel = FbxSkeleton::Create(scene, bone_name.c_str());
        skel->SetSkeletonType(b.Parent < 0 ? FbxSkeleton::eRoot : FbxSkeleton::eLimbNode);

        FbxNode* node = FbxNode::Create(scene, bone_name.c_str());
        node->SetNodeAttribute(skel);
        bone_nodes[i] = node;
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

    // ── One mesh per material ────────────────────────────────────────────
    std::vector<FbxNode*> mesh_nodes;
    int curr_face = 0;

    for (size_t matID = 0; matID < pmx.MaterialList.size(); ++matID) {
        const auto& src = pmx.MaterialList[matID];
        const int face_count = src.FaceCount;
        const int end_face = curr_face + face_count;
        const std::string mat_name = to_latin(src.Name.empty() ? ("mat_" + std::to_string(matID)) : src.Name);

        // Collect unique global vertex indices used by this material
        std::vector<int> global_indices;
        std::unordered_map<int, int> global_to_local;
        for (int fi = curr_face; fi < end_face && static_cast<size_t>(fi) < pmx.FaceList.size(); ++fi) {
            const int gvi = pmx.FaceList[static_cast<size_t>(fi)];
            if (gvi < 0 || gvi >= global_vert_count) continue;
            if (global_to_local.find(gvi) == global_to_local.end()) {
                global_to_local[gvi] = static_cast<int>(global_indices.size());
                global_indices.push_back(gvi);
            }
        }

        const int local_vert_count = static_cast<int>(global_indices.size());

        // Create mesh
        FbxMesh* mesh = FbxMesh::Create(scene, mat_name.c_str());
        FbxNode* mesh_node = FbxNode::Create(scene, mat_name.c_str());
        mesh_node->SetNodeAttribute(mesh);
        root->AddChild(mesh_node);
        mesh_nodes.push_back(mesh_node);

        // Vertices
        mesh->InitControlPoints(local_vert_count);
        FbxVector4* cps = mesh->GetControlPoints();
        auto* normals = mesh->CreateElementNormal();
        normals->SetMappingMode(FbxGeometryElement::eByControlPoint);
        normals->SetReferenceMode(FbxGeometryElement::eDirect);
        auto* uvs = mesh->CreateElementUV("UVSet1");
        uvs->SetMappingMode(FbxGeometryElement::eByControlPoint);
        uvs->SetReferenceMode(FbxGeometryElement::eDirect);

        for (int li = 0; li < local_vert_count; ++li) {
            const auto& v = pmx.VertexList[static_cast<size_t>(global_indices[li])];
            cps[li] = FbxVector4(v.Position.X, v.Position.Y, v.Position.Z, 1.0);
            normals->GetDirectArray().Add(FbxVector4(v.Normal.X, v.Normal.Y, v.Normal.Z, 0.0));
            uvs->GetDirectArray().Add(FbxVector2(v.UV.X, 1.0 - v.UV.Y));
        }

        // Material
        FbxSurfacePhong* phong = FbxSurfacePhong::Create(scene, mat_name.c_str());
        phong->Diffuse.Set(FbxDouble3(src.Diffuse.X, src.Diffuse.Y, src.Diffuse.Z));
        phong->Ambient.Set(FbxDouble3(src.Ambient.X, src.Ambient.Y, src.Ambient.Z));
        phong->Specular.Set(FbxDouble3(src.Specular.X, src.Specular.Y, src.Specular.Z));
        phong->Shininess.Set(static_cast<double>(src.Power));
        phong->TransparencyFactor.Set(1.0 - static_cast<double>(src.Diffuse.W));

        if (!src.Tex.empty()) {
            std::filesystem::path tex_abs = input_dir / src.Tex;
            std::string tex_path = tex_abs.u8string();

            FbxFileTexture* diff_tex = FbxFileTexture::Create(scene, (mat_name + "_diffuse").c_str());
            diff_tex->SetFileName(tex_path.c_str());
            diff_tex->SetTextureUse(FbxTexture::eStandard);
            diff_tex->SetMappingType(FbxTexture::eUV);
            diff_tex->SetMaterialUse(FbxFileTexture::eModelMaterial);
            diff_tex->SetSwapUV(false);
            diff_tex->SetTranslation(0.0, 0.0);
            diff_tex->SetScale(1.0, 1.0);
            diff_tex->SetRotation(0.0, 0.0);
            diff_tex->UVSet.Set("UVSet1");
            phong->Diffuse.ConnectSrcObject(diff_tex);

            FbxFileTexture* opacity_tex = FbxFileTexture::Create(scene, (mat_name + "_opacity").c_str());
            opacity_tex->SetFileName(tex_path.c_str());
            opacity_tex->SetTextureUse(FbxTexture::eStandard);
            opacity_tex->SetMappingType(FbxTexture::eUV);
            opacity_tex->SetMaterialUse(FbxFileTexture::eModelMaterial);
            opacity_tex->SetAlphaSource(FbxTexture::eBlack);
            opacity_tex->SetSwapUV(false);
            opacity_tex->SetTranslation(0.0, 0.0);
            opacity_tex->SetScale(1.0, 1.0);
            opacity_tex->SetRotation(0.0, 0.0);
            opacity_tex->UVSet.Set("UVSet1");
            phong->TransparentColor.ConnectSrcObject(opacity_tex);
        }

        mesh_node->AddMaterial(phong);

        // Faces (remapped to local indices)
        int tri_idx = 0;
        for (int fi = curr_face; fi < end_face && static_cast<size_t>(fi) < pmx.FaceList.size(); ++fi) {
            const int gvi = pmx.FaceList[static_cast<size_t>(fi)];
            if (gvi < 0 || gvi >= global_vert_count) continue;
            if (tri_idx == 0) {
                mesh->BeginPolygon(0);
            }
            mesh->AddPolygon(global_to_local[gvi]);
            if (tri_idx == 2) {
                mesh->EndPolygon();
                tri_idx = 0;
            } else {
                ++tri_idx;
            }
        }

        // Skin deformer (per-mesh, referencing shared bone nodes)
        if (!bone_nodes.empty()) {
            FbxSkin* skin = FbxSkin::Create(scene, (mat_name + "_skin").c_str());
            std::vector<FbxCluster*> clusters(bone_nodes.size(), nullptr);

            for (int li = 0; li < local_vert_count; ++li) {
                const auto& v = pmx.VertexList[static_cast<size_t>(global_indices[li])];
                for (int wi = 0; wi < 4; ++wi) {
                    const auto& w = v.Weight[wi];
                    if (!w.IsValid() || w.Bone < 0 || static_cast<size_t>(w.Bone) >= bone_nodes.size()) continue;
                    FbxCluster*& cluster = clusters[static_cast<size_t>(w.Bone)];
                    if (!cluster) {
                        cluster = FbxCluster::Create(scene, (mat_name + "_c" + std::to_string(w.Bone)).c_str());
                        cluster->SetLink(bone_nodes[static_cast<size_t>(w.Bone)]);
                        cluster->SetLinkMode(FbxCluster::eTotalOne);
                        skin->AddCluster(cluster);
                    }
                    cluster->AddControlPointIndex(li, w.Value);
                }
            }

            for (size_t bi = 0; bi < clusters.size(); ++bi) {
                if (!clusters[bi]) continue;
                clusters[bi]->SetTransformMatrix(mesh_node->EvaluateGlobalTransform());
                clusters[bi]->SetTransformLinkMatrix(
                    to_fbx_matrix(pmx.BoneList[bi].WorldMatrix));
            }

            mesh->AddDeformer(skin);
        }

        curr_face = end_face;
    }

    // ── Bind pose ────────────────────────────────────────────────────────
    FbxPose* bind_pose = FbxPose::Create(scene, "BindPose");
    bind_pose->SetIsBindPose(true);
    for (FbxNode* mn : mesh_nodes) {
        bind_pose->Add(mn, mn->EvaluateGlobalTransform());
    }
    for (FbxNode* bn : bone_nodes) {
        if (bn) bind_pose->Add(bn, bn->EvaluateGlobalTransform());
    }
    scene->AddPose(bind_pose);

    return true;
}
#endif

int run_bridge(const CliArgs& args) {
    if (!std::filesystem::exists(args.input)) {
        std::cerr << "Input file not found: " << args.input.u8string() << "\n";
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

    const auto input_dir = args.input.parent_path();
    if (!build_scene_from_pmx(manager, scene, *pmx, input_dir, error)) {
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
    if (!exporter->Initialize(args.output.u8string().c_str(), writer_id, manager->GetIOSettings())) {
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

    std::cerr << "OK: " << args.input.u8string() << " -> " << args.output.u8string() << "\n";
    return 0;
#endif
}

} // namespace

int wmain(int argc, wchar_t** argv) {
    CliArgs args;
    if (!parse_args(argc, argv, args)) {
        return 1;
    }
    return run_bridge(args);
}
