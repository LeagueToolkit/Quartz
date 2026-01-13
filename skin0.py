
    0xab9e706e = StaticMaterialDef {
        name: string = "ebaywishshader"
        samplerValues: list2[embed] = {
            StaticMaterialShaderSamplerDef {
                textureName: string = "Diffuse_Texture"
                texturePath: string = "ASSETS/Characters/Katarina/Skins/Skin29/threeb.dds"
                addressU: u32 = 1
                addressV: u32 = 1
                addressW: u32 = 1
            }
            StaticMaterialShaderSamplerDef {
                textureName: string = "ToonShadingTex"
                texturePath: string = "ASSETS/kata2brepath/ToonShading.tex"
                addressU: u32 = 1
                addressV: u32 = 1
                addressW: u32 = 1
            }
            StaticMaterialShaderSamplerDef {
                textureName: string = "ToonShadingOutlineTex"
                texturePath: string = "ASSETS/kata2brepath/OutlineToneMap.tex"
                addressU: u32 = 1
                addressV: u32 = 1
                addressW: u32 = 1
            }
        }
        paramValues: list2[embed] = {
            StaticMaterialShaderParamDef {
                name: string = "ToonShadePower"
                value: vec4 = { 8.39999962, 0, 0, 0 }
            }
            StaticMaterialShaderParamDef {
                name: string = "ToonOutlineControl"
                value: vec4 = { 0, 0, 0, 0 }
            }
            StaticMaterialShaderParamDef {
                name: string = "ToonRimControl"
                value: vec4 = { 1, 0.300000012, 0.100000001, 0 }
            }
            StaticMaterialShaderParamDef {
                name: string = "TintColorBase"
                value: vec4 = { 1, 1, 1, 1 }
            }
            StaticMaterialShaderParamDef {
                name: string = "TintColorOutline"
                value: vec4 = { 0, 0, 0, 1 }
            }
            StaticMaterialShaderParamDef {
                name: string = "TintColorRim"
                value: vec4 = { 0.270588249, 0.270588249, 0.270588249, 0.501960814 }
            }
            StaticMaterialShaderParamDef {
                name: string = "Rim_Color_Strength"
                value: vec4 = { 1, 0, 0, 0 }
            }
        }
        switches: list2[embed] = {
            StaticMaterialSwitchDef {
                name: string = "RIM_COLOR_ON"
            }
            StaticMaterialSwitchDef {
                name: string = "OUTLINE_ON"
            }
        }
        shaderMacros: map[string,string] = {
            "NUM_BLEND_WEIGHTS" = "4"
        }
        techniques: list[embed] = {
            StaticMaterialTechniqueDef {
                name: string = "normal"
                passes: list[embed] = {
                    StaticMaterialPassDef {
                        shader: link = "Shaders/SkinnedMesh/ToonShading"
                        blendEnable: bool = true
                        srcColorBlendFactor: u32 = 6
                        srcAlphaBlendFactor: u32 = 6
                        dstColorBlendFactor: u32 = 7
                        dstAlphaBlendFactor: u32 = 7
                    }
                }
            }
        }
        childTechniques: list[embed] = {
            StaticMaterialChildTechniqueDef {
                name: string = "transition"
                parentName: string = "normal"
                shaderMacros: map[string,string] = {
                    "TRANSITION" = "1"
                }
            }
        }
    }
    0xd59efafa = StaticMaterialDef {
        name: string = "robotshader"
        samplerValues: list2[embed] = {
            StaticMaterialShaderSamplerDef {
                textureName: string = "Diffuse_Texture"
                texturePath: string = "ASSETS/Characters/Katarina/Skins/Skin29/pod.dds"
                addressU: u32 = 1
                addressV: u32 = 1
                addressW: u32 = 1
            }
            StaticMaterialShaderSamplerDef {
                textureName: string = "ToonShadingTex"
                texturePath: string = "ASSETS/kata2brepath/ToonShading.tex"
                addressU: u32 = 1
                addressV: u32 = 1
                addressW: u32 = 1
            }
            StaticMaterialShaderSamplerDef {
                textureName: string = "ToonShadingOutlineTex"
                texturePath: string = "ASSETS/kata2brepath/OutlineToneMap.tex"
                addressU: u32 = 1
                addressV: u32 = 1
                addressW: u32 = 1
            }
        }
        paramValues: list2[embed] = {
            StaticMaterialShaderParamDef {
                name: string = "ToonShadePower"
                value: vec4 = { 8.39999962, 0, 0, 0 }
            }
            StaticMaterialShaderParamDef {
                name: string = "ToonOutlineControl"
                value: vec4 = { 0, 0, 0, 0 }
            }
            StaticMaterialShaderParamDef {
                name: string = "ToonRimControl"
                value: vec4 = { 1, 0.300000012, 0.100000001, 0 }
            }
            StaticMaterialShaderParamDef {
                name: string = "TintColorBase"
                value: vec4 = { 1, 1, 1, 1 }
            }
            StaticMaterialShaderParamDef {
                name: string = "TintColorOutline"
                value: vec4 = { 0, 0, 0, 1 }
            }
            StaticMaterialShaderParamDef {
                name: string = "TintColorRim"
                value: vec4 = { 0.270588249, 0.270588249, 0.270588249, 0.501960814 }
            }
            StaticMaterialShaderParamDef {
                name: string = "Rim_Color_Strength"
                value: vec4 = { 1, 0, 0, 0 }
            }
        }
        switches: list2[embed] = {
            StaticMaterialSwitchDef {
                name: string = "RIM_COLOR_ON"
            }
            StaticMaterialSwitchDef {
                name: string = "OUTLINE_ON"
            }
        }
        shaderMacros: map[string,string] = {
            "NUM_BLEND_WEIGHTS" = "4"
        }
        techniques: list[embed] = {
            StaticMaterialTechniqueDef {
                name: string = "normal"
                passes: list[embed] = {
                    StaticMaterialPassDef {
                        shader: link = "Shaders/SkinnedMesh/ToonShading"
                        blendEnable: bool = true
                        srcColorBlendFactor: u32 = 6
                        srcAlphaBlendFactor: u32 = 6
                        dstColorBlendFactor: u32 = 7
                        dstAlphaBlendFactor: u32 = 7
                    }
                }
            }
        }
        childTechniques: list[embed] = {
            StaticMaterialChildTechniqueDef {
                name: string = "transition"
                parentName: string = "normal"
                shaderMacros: map[string,string] = {
                    "TRANSITION" = "1"
                }
            }
        }
    }
    0x6e111b5c = StaticMaterialDef {
        name: string = "ebaytemushader"
        samplerValues: list2[embed] = {
            StaticMaterialShaderSamplerDef {
                textureName: string = "Diffuse_Texture"
                texturePath: string = "ASSETS/Characters/Katarina/Skins/Skin29/twob.dds"
                addressU: u32 = 1
                addressV: u32 = 1
                addressW: u32 = 1
            }
            StaticMaterialShaderSamplerDef {
                textureName: string = "ToonShadingTex"
                texturePath: string = "ASSETS/kata2brepath/ToonShading.tex"
                addressU: u32 = 1
                addressV: u32 = 1
                addressW: u32 = 1
            }
            StaticMaterialShaderSamplerDef {
                textureName: string = "ToonShadingOutlineTex"
                texturePath: string = "ASSETS/kata2brepath/OutlineToneMap.tex"
                addressU: u32 = 1
                addressV: u32 = 1
                addressW: u32 = 1
            }
        }
        paramValues: list2[embed] = {
            StaticMaterialShaderParamDef {
                name: string = "ToonShadePower"
                value: vec4 = { 8.39999962, 0, 0, 0 }
            }
            StaticMaterialShaderParamDef {
                name: string = "ToonOutlineControl"
                value: vec4 = { 0, 0, 0, 0 }
            }
            StaticMaterialShaderParamDef {
                name: string = "ToonRimControl"
                value: vec4 = { 1, 0.300000012, 0.100000001, 0 }
            }
            StaticMaterialShaderParamDef {
                name: string = "TintColorBase"
                value: vec4 = { 1, 1, 1, 1 }
            }
            StaticMaterialShaderParamDef {
                name: string = "TintColorOutline"
                value: vec4 = { 0, 0, 0, 1 }
            }
            StaticMaterialShaderParamDef {
                name: string = "TintColorRim"
                value: vec4 = { 0.270588249, 0.270588249, 0.270588249, 0.501960814 }
            }
            StaticMaterialShaderParamDef {
                name: string = "Rim_Color_Strength"
                value: vec4 = { 1, 0, 0, 0 }
            }
        }
        switches: list2[embed] = {
            StaticMaterialSwitchDef {
                name: string = "RIM_COLOR_ON"
            }
            StaticMaterialSwitchDef {
                name: string = "OUTLINE_ON"
            }
        }
        shaderMacros: map[string,string] = {
            "NUM_BLEND_WEIGHTS" = "4"
        }
        techniques: list[embed] = {
            StaticMaterialTechniqueDef {
                name: string = "normal"
                passes: list[embed] = {
                    StaticMaterialPassDef {
                        shader: link = "Shaders/SkinnedMesh/ToonShading"
                        blendEnable: bool = true
                        srcColorBlendFactor: u32 = 6
                        srcAlphaBlendFactor: u32 = 6
                        dstColorBlendFactor: u32 = 7
                        dstAlphaBlendFactor: u32 = 7
                    }
                }
            }
        }
        childTechniques: list[embed] = {
            StaticMaterialChildTechniqueDef {
                name: string = "transition"
                parentName: string = "normal"
                shaderMacros: map[string,string] = {
                    "TRANSITION" = "1"
                }
            }
        }
    }
    "Characters/Viego/Skins/Skin0/Materials/WeaponGlow_Mat" = StaticMaterialDef {
        name: string = "Characters/Viego/Skins/Skin0/Materials/WeaponGlow_Mat"
        samplerValues: list2[embed] = {
            StaticMaterialShaderSamplerDef {
                TextureName: string = "Diffuse_Texture"
                texturePath: string = "ASSETS/Characters/Viego/Skins/Base/Viego_Base_Crown_Sword_TX_CM.tex"
                addressU: u32 = 1
                addressV: u32 = 1
                addressW: u32 = 1
            }
        }
        paramValues: list2[embed] = {
            StaticMaterialShaderParamDef {
                name: string = "Glow_MinMax"
                value: vec4 = { 0, 0.5, 0, 0 }
            }
            StaticMaterialShaderParamDef {
                name: string = "Mask_Strength"
                value: vec4 = { 1, 0, 0, 0 }
            }
            StaticMaterialShaderParamDef {
                name: string = "Glow_Color"
                value: vec4 = { 0, 1, 0.400000006, 1 }
            }
            StaticMaterialShaderParamDef {
                name: string = "Glow_Factor"
                value: vec4 = { 3, 0, 0, 0 }
            }
        }
        switches: list2[embed] = {
            StaticMaterialSwitchDef {
                name: string = "MASK_GLOW"
                on: bool = false
            }
            StaticMaterialSwitchDef {
                name: string = "STROBE_GLOW"
            }
            StaticMaterialSwitchDef {
                name: string = "DEBUG_VIEW_MASK"
                on: bool = false
            }
        }
        shaderMacros: map[string,string] = {
            "NUM_BLEND_WEIGHTS" = "4"
        }
        techniques: list[embed] = {
            StaticMaterialTechniqueDef {
                name: string = "normal"
                passes: list[embed] = {
                    StaticMaterialPassDef {
                        shader: link = "Shaders/SkinnedMesh/Viego/WeaponGlow"
                        blendEnable: bool = true
                        srcColorBlendFactor: u32 = 6
                        srcAlphaBlendFactor: u32 = 6
                        dstColorBlendFactor: u32 = 7
                        dstAlphaBlendFactor: u32 = 7
                    }
                }
            }
        }
        childTechniques: list[embed] = {
            StaticMaterialChildTechniqueDef {
                name: string = "transition"
                parentName: string = "normal"
                shaderMacros: map[string,string] = {
                    "TRANSITION" = "1"
                }
            }
        }
        dynamicMaterial: pointer = DynamicMaterialDef {
            parameters: list[embed] = {
                DynamicMaterialParameterDef {
                    name: string = "Mask_Strength"
                    driver: pointer = BlendingSwitchMaterialDriver {
                        mElements: list[embed] = {
                            SwitchMaterialDriverElement {
                                mCondition: pointer = HasBuffDynamicMaterialBoolDriver {
                                    mScriptName: string = "ViegoEHaste"
                                }
                                mValue: pointer = FloatLiteralMaterialDriver {}
                            }
                        }
                        mDefaultValue: pointer = FloatLiteralMaterialDriver {
                            mValue: f32 = 1
                        }
                        mBlendTime: f32 = 0.0500000007
                    }
                }
            }
        }
    }
    "Characters/Viego/Skins/Skin0/Materials/MistCrown_Mat" = StaticMaterialDef {
        name: string = "Characters/Viego/Skins/Skin0/Materials/MistCrown_Mat"
        samplerValues: list2[embed] = {
            StaticMaterialShaderSamplerDef {
                TextureName: string = "Diffuse_Texture"
                texturePath: string = "ASSETS/Characters/Viego/Skins/Base/Viego_Base_Crown_Sword_TX_CM.tex"
                addressU: u32 = 1
                addressV: u32 = 1
                addressW: u32 = 1
            }
        }
        paramValues: list2[embed] = {
            StaticMaterialShaderParamDef {
                name: string = "Glow_MinMax"
                value: vec4 = { 3, 5, 0, 0 }
            }
            StaticMaterialShaderParamDef {
                name: string = "Mask_Strength"
                value: vec4 = { 1, 0, 0, 0 }
            }
            StaticMaterialShaderParamDef {
                name: string = "Glow_Color"
                value: vec4 = { 0, 1, 0.784313738, 1 }
            }
            StaticMaterialShaderParamDef {
                name: string = "Glow_Factor"
                value: vec4 = { 3, 0, 0, 0 }
            }
        }
        switches: list2[embed] = {
            StaticMaterialSwitchDef {
                name: string = "MASK_GLOW"
                on: bool = false
            }
            StaticMaterialSwitchDef {
                name: string = "STROBE_GLOW"
                on: bool = false
            }
            StaticMaterialSwitchDef {
                name: string = "DEBUG_VIEW_MASK"
                on: bool = false
            }
        }
        shaderMacros: map[string,string] = {
            "NUM_BLEND_WEIGHTS" = "4"
        }
        techniques: list[embed] = {
            StaticMaterialTechniqueDef {
                name: string = "normal"
                passes: list[embed] = {
                    StaticMaterialPassDef {
                        shader: link = "Shaders/SkinnedMesh/Viego/WeaponGlow"
                        blendEnable: bool = true
                        srcColorBlendFactor: u32 = 6
                        srcAlphaBlendFactor: u32 = 6
                        dstColorBlendFactor: u32 = 7
                        dstAlphaBlendFactor: u32 = 7
                    }
                }
            }
        }
        childTechniques: list[embed] = {
            StaticMaterialChildTechniqueDef {
                name: string = "transition"
                parentName: string = "normal"
                shaderMacros: map[string,string] = {
                    "TRANSITION" = "1"
                }
            }
        }
        dynamicMaterial: pointer = DynamicMaterialDef {}
    }
    "Characters/Viego/Skins/Skin0/Materials/MistBody_Mat" = StaticMaterialDef {
        name: string = "Characters/Viego/Skins/Skin0/Materials/MistBody_Mat"
        samplerValues: list2[embed] = {
            StaticMaterialShaderSamplerDef {
                TextureName: string = "Diffuse_Texture"
                texturePath: string = "ASSETS/Characters/Viego/Skins/Base/Viego_Base_Body_TX_CM.tex"
                addressU: u32 = 1
                addressV: u32 = 1
                addressW: u32 = 1
            }
            StaticMaterialShaderSamplerDef {
                TextureName: string = "Noise_Texture"
                texturePath: string = "ASSETS/Characters/Viego/Skins/Base/Viego_Base_Noise_TX.tex"
                addressW: u32 = 1
            }
            StaticMaterialShaderSamplerDef {
                TextureName: string = "FX_ColorRamp"
                texturePath: string = "ASSETS/Characters/Viego/Skins/Base/Viego_Smoke_TX.tex"
                addressU: u32 = 1
                addressV: u32 = 1
            }
        }
        paramValues: list2[embed] = {
            StaticMaterialShaderParamDef {
                name: string = "Screenspace_Tiles"
                value: vec4 = { 3, 3, 0, 0 }
            }
            StaticMaterialShaderParamDef {
                name: string = "FGColor"
                value: vec4 = { 0.0588235296, 1, 0.639215708, 1 }
            }
            StaticMaterialShaderParamDef {
                name: string = "Rim_Modifier"
                value: vec4 = { 1.70000005, 0, 0, 0 }
            }
            StaticMaterialShaderParamDef {
                name: string = "Fresnel_Input"
                value: vec4 = { 1.60000002, 0, 0, 0 }
            }
            StaticMaterialShaderParamDef {
                name: string = "Texture_Activation"
                value: vec4 = { 1, 0, 0, 0 }
            }
            StaticMaterialShaderParamDef {
                name: string = "ScreenSpace_ScrollSpeed"
                value: vec4 = { 0.0500000007, 0.0199999996, 0, 0 }
            }
            StaticMaterialShaderParamDef {
                name: string = "Noise_Tile"
                value: vec4 = { 1, 1, 0, 0 }
            }
            StaticMaterialShaderParamDef {
                name: string = "Noise_G_Tile"
                value: vec4 = { 3, 2, 0, 0 }
            }
            StaticMaterialShaderParamDef {
                name: string = "Noise_R_Tile"
                value: vec4 = { 1.20000005, 2.5, 0, 0 }
            }
            StaticMaterialShaderParamDef {
                name: string = "Noise_G_Speed_X"
                value: vec4 = { 0.150000006, 0, 0, 0 }
            }
            StaticMaterialShaderParamDef {
                name: string = "Noise_G_Speed_Y"
                value: vec4 = { -0.165000007, 0, 0, 0 }
            }
        }
        switches: list2[embed] = {
            StaticMaterialSwitchDef {
                name: string = "USE_BLUE_CH_MASK"
                on: bool = false
            }
            StaticMaterialSwitchDef {
                name: string = "USE_GLOW"
            }
        }
        shaderMacros: map[string,string] = {
            "NUM_BLEND_WEIGHTS" = "4"
        }
        techniques: list[embed] = {
            StaticMaterialTechniqueDef {
                name: string = "normal"
                passes: list[embed] = {
                    StaticMaterialPassDef {
                        shader: link = "Shaders/SkinnedMesh/Viego/MistBody"
                        blendEnable: bool = true
                        srcColorBlendFactor: u32 = 6
                        srcAlphaBlendFactor: u32 = 6
                        dstColorBlendFactor: u32 = 7
                        dstAlphaBlendFactor: u32 = 7
                    }
                }
            }
        }
        childTechniques: list[embed] = {
            StaticMaterialChildTechniqueDef {
                name: string = "transition"
                parentName: string = "normal"
                shaderMacros: map[string,string] = {
                    "TRANSITION" = "1"
                }
            }
        }
        dynamicMaterial: pointer = DynamicMaterialDef {
            parameters: list[embed] = {
                DynamicMaterialParameterDef {
                    name: string = "Texture_Activation"
                    driver: pointer = SwitchMaterialDriver {
                        mElements: list[embed] = {
                            SwitchMaterialDriverElement {
                                mCondition: pointer = HasBuffDynamicMaterialBoolDriver {
                                    mScriptName: string = "ViegoEMist"
                                }
                                mValue: pointer = FloatLiteralMaterialDriver {
                                    mValue: f32 = 1
                                }
                            }
                        }
                        mDefaultValue: pointer = FloatLiteralMaterialDriver {}
                    }
                }
                DynamicMaterialParameterDef {
                    name: string = "Noise_G_Speed_X"
                    Enabled: bool = false
                    driver: pointer = BlendingSwitchMaterialDriver {
                        mElements: list[embed] = {
                            SwitchMaterialDriverElement {
                                mCondition: pointer = HasBuffDynamicMaterialBoolDriver {
                                    mScriptName: string = "ViegoEHaste"
                                }
                                mValue: pointer = FloatLiteralMaterialDriver {
                                    mValue: f32 = 0.150000006
                                }
                            }
                        }
                        mDefaultValue: pointer = FloatLiteralMaterialDriver {
                            mValue: f32 = 0.0199999996
                        }
                        mBlendTime: f32 = 0.0500000007
                    }
                }
                DynamicMaterialParameterDef {
                    name: string = "Noise_G_Speed_Y"
                    Enabled: bool = false
                    driver: pointer = BlendingSwitchMaterialDriver {
                        mElements: list[embed] = {
                            SwitchMaterialDriverElement {
                                mCondition: pointer = HasBuffDynamicMaterialBoolDriver {
                                    mScriptName: string = "ViegoEHaste"
                                }
                                mValue: pointer = FloatLiteralMaterialDriver {
                                    mValue: f32 = -0.165000007
                                }
                            }
                        }
                        mDefaultValue: pointer = FloatLiteralMaterialDriver {
                            mValue: f32 = -0.0299999993
                        }
                        mBlendTime: f32 = 0.0500000007
                    }
                }
                DynamicMaterialParameterDef {
                    name: string = "Fresnel_Input"
                    Enabled: bool = false
                    driver: pointer = BlendingSwitchMaterialDriver {
                        mElements: list[embed] = {
                            SwitchMaterialDriverElement {
                                mCondition: pointer = HasBuffDynamicMaterialBoolDriver {
                                    mScriptName: string = "ViegoEHaste"
                                }
                                mValue: pointer = FloatLiteralMaterialDriver {
                                    mValue: f32 = 1.60000002
                                }
                            }
                        }
                        mDefaultValue: pointer = FloatLiteralMaterialDriver {
                            mValue: f32 = 0.270000011
                        }
                        mBlendTime: f32 = 0.0500000007
                    }
                }
                DynamicMaterialParameterDef {
                    name: string = "Rim_Modifier"
                    Enabled: bool = false
                    driver: pointer = BlendingSwitchMaterialDriver {
                        mElements: list[embed] = {
                            SwitchMaterialDriverElement {
                                mCondition: pointer = HasBuffDynamicMaterialBoolDriver {
                                    mScriptName: string = "ViegoEHaste"
                                }
                                mValue: pointer = FloatLiteralMaterialDriver {
                                    mValue: f32 = 1.70000005
                                }
                            }
                        }
                        mDefaultValue: pointer = FloatLiteralMaterialDriver {
                            mValue: f32 = 0.970000029
                        }
                        mBlendTime: f32 = 0.0500000007
                    }
                }
            }
        }
    }
    "Characters/Viego/Skins/Skin0/Materials/WraithBody_Mat" = StaticMaterialDef {
        name: string = "Characters/Viego/Skins/Skin0/Materials/WraithBody_Mat"
        samplerValues: list2[embed] = {
            StaticMaterialShaderSamplerDef {
                TextureName: string = "Diffuse_Texture"
                texturePath: string = "ASSETS/Characters/Viego/Skins/Base/Viego_Base_Wraith_TX_CM.tex"
                addressU: u32 = 1
                addressV: u32 = 1
                addressW: u32 = 1
            }
            StaticMaterialShaderSamplerDef {
                TextureName: string = "Noise_Texture"
                texturePath: string = "ASSETS/Characters/Viego/Skins/Base/Viego_Wraith_Noise_TX.tex"
                addressW: u32 = 1
            }
            StaticMaterialShaderSamplerDef {
                TextureName: string = "FX_ColorRamp"
                texturePath: string = "ASSETS/Characters/Viego/Skins/Base/Viego_Smoke_TX.tex"
                addressU: u32 = 1
                addressV: u32 = 1
            }
        }
        paramValues: list2[embed] = {
            StaticMaterialShaderParamDef {
                name: string = "Screenspace_Tiles"
                value: vec4 = { 3, 3, 0, 0 }
            }
            StaticMaterialShaderParamDef {
                name: string = "FGColor"
                value: vec4 = { 0.0588235296, 1, 0.639215708, 1 }
            }
            StaticMaterialShaderParamDef {
                name: string = "Rim_Modifier"
                value: vec4 = { 1.70000005, 0, 0, 0 }
            }
            StaticMaterialShaderParamDef {
                name: string = "Fresnel_Input"
                value: vec4 = { 1.60000002, 0, 0, 0 }
            }
            StaticMaterialShaderParamDef {
                name: string = "Texture_Activation"
                value: vec4 = { 1, 0, 0, 0 }
            }
            StaticMaterialShaderParamDef {
                name: string = "ScreenSpace_ScrollSpeed"
                value: vec4 = { 0.0500000007, 0.0199999996, 0, 0 }
            }
            StaticMaterialShaderParamDef {
                name: string = "Noise_Tile"
                value: vec4 = { 1, 1, 0, 0 }
            }
            StaticMaterialShaderParamDef {
                name: string = "Noise_G_Tile"
                value: vec4 = { 3, 2, 0, 0 }
            }
            StaticMaterialShaderParamDef {
                name: string = "Noise_R_Tile"
                value: vec4 = { 1.20000005, 2.5, 0, 0 }
            }
            StaticMaterialShaderParamDef {
                name: string = "Noise_G_Speed_X"
                value: vec4 = { 0.150000006, 0, 0, 0 }
            }
            StaticMaterialShaderParamDef {
                name: string = "Noise_G_Speed_Y"
                value: vec4 = { -0.165000007, 0, 0, 0 }
            }
        }
        switches: list2[embed] = {
            StaticMaterialSwitchDef {
                name: string = "USE_BLUE_CH_MASK"
            }
            StaticMaterialSwitchDef {
                name: string = "USE_GLOW"
            }
        }
        shaderMacros: map[string,string] = {
            "NUM_BLEND_WEIGHTS" = "4"
        }
        techniques: list[embed] = {
            StaticMaterialTechniqueDef {
                name: string = "normal"
                passes: list[embed] = {
                    StaticMaterialPassDef {
                        shader: link = "Shaders/SkinnedMesh/Viego/MistBody"
                        blendEnable: bool = true
                        srcColorBlendFactor: u32 = 6
                        srcAlphaBlendFactor: u32 = 6
                        dstColorBlendFactor: u32 = 7
                        dstAlphaBlendFactor: u32 = 7
                    }
                }
            }
        }
        childTechniques: list[embed] = {
            StaticMaterialChildTechniqueDef {
                name: string = "transition"
                parentName: string = "normal"
                shaderMacros: map[string,string] = {
                    "TRANSITION" = "1"
                }
            }
        }
        dynamicMaterial: pointer = DynamicMaterialDef {
            parameters: list[embed] = {
                DynamicMaterialParameterDef {
                    name: string = "Texture_Activation"
                    driver: pointer = SwitchMaterialDriver {
                        mElements: list[embed] = {
                            SwitchMaterialDriverElement {
                                mCondition: pointer = IsAnimationPlayingDynamicMaterialBoolDriver {
                                    mAnimationNames: list[hash] = {
                                        "Recall"
                                    }
                                }
                                mValue: pointer = FloatLiteralMaterialDriver {}
                            }
                            SwitchMaterialDriverElement {
                                mCondition: pointer = HasBuffDynamicMaterialBoolDriver {
                                    mScriptName: string = "ViegoEMist"
                                }
                                mValue: pointer = FloatLiteralMaterialDriver {
                                    mValue: f32 = 1
                                }
                            }
                        }
                        mDefaultValue: pointer = FloatLiteralMaterialDriver {}
                    }
                }
            }
        }
        
    }
}
