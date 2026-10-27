using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using UnityEditor;
using UnityEditor.Animations;
using UnityEditor.Build.Reporting;
using UnityEditor.Rendering.Universal.ShaderGUI;
using UnityEditor.SceneManagement;
using UnityEngine;
using UnityEngine.Rendering;
using UnityEngine.Rendering.Universal;

/// <summary>
/// Builds the separate visual study from exported Blender assets. All generated
/// content stays under Assets/Study; this does not read or modify the live game.
/// Run from Borrowed Time > Build Unity Study after copying the export directory
/// into Assets/Study/Imported in a Universal 3D project.
/// </summary>
public static class StudySceneBuilder
{
    private const string Root = "Assets/Study";
    private const string Imported = Root + "/Imported";
    private const string Generated = Root + "/Generated";
    private const string ScenePath = Root + "/Scenes/TunnelStudy.unity";
    private const string RunnerPath = Imported + "/SnowRunUnity.fbx";
    private const string TunnelPath = Imported + "/Tunnel.fbx";
    private const string MotionScenePath = Root + "/Scenes/GroundedMotion.unity";

    [MenuItem("Borrowed Time/Build New Movement Study")]
    public static void BuildMotionScene()
    {
        RequireAssets();
        ConfigurePipeline();
        Directory.CreateDirectory(Root + "/Scenes");
        string staticPath = Imported + "/SnowStatic.fbx";
        if (!File.Exists(staticPath)) File.Copy(RunnerPath, staticPath);
        AssetDatabase.ImportAsset(staticPath, ImportAssetOptions.ForceSynchronousImport);
        ConfigureModel(staticPath, false);
        var staticImporter = (ModelImporter)AssetImporter.GetAtPath(staticPath);
        staticImporter.isReadable = true; // The new rig is reconstructed from skin bind matrices at runtime.
        staticImporter.SaveAndReimport();
        var materials = AssetDatabase.FindAssets("t:Material", new[] { Generated + "/Materials" })
            .Select(AssetDatabase.GUIDToAssetPath).Select(AssetDatabase.LoadAssetAtPath<Material>)
            .Where(m => m != null).ToDictionary(m => m.name, m => m);
        var scene = EditorSceneManager.NewScene(NewSceneSetup.EmptyScene, NewSceneMode.Single);
        GameObject tunnel = InstantiateModel(TunnelPath, "Tunnel / movement stage", materials);
        GameObject runnerRoot = new GameObject("Runner / live movement");
        GameObject model = InstantiateModel(staticPath, "Temporary character / mesh and skeleton only", materials);
        PrefabUtility.UnpackPrefabInstance(model, PrefabUnpackMode.Completely, InteractionMode.AutomatedAction);
        model.transform.SetParent(runnerRoot.transform, true);
        foreach (Animator oldAnimator in model.GetComponentsInChildren<Animator>()) UnityEngine.Object.DestroyImmediate(oldAnimator);
        GroundedRunnerPose pose = runnerRoot.AddComponent<GroundedRunnerPose>();
        pose.modelRoot = model.transform;

        Report report = JsonUtility.FromJson<Report>(File.ReadAllText(Imported + "/transfer-report-urp.json"));
        ConfigureAtmosphere();
        CreateLights(report.lights, Vector3.forward, Vector3.left);
        Camera camera = CreateCamera(new CameraData { rear_distance = 4.3f, height = 1.9f, target_ahead = 3f }, Vector3.forward, Vector3.zero);
        GroundedMotionStudy movement = new GameObject("Movement study / live controls").AddComponent<GroundedMotionStudy>();
        movement.runnerRoot = runnerRoot.transform;
        movement.pose = pose;
        movement.followCamera = camera;
        movement.laneChangeSeconds = 0.40f;
        movement.jumpAtDistance = 10.4f;
        foreach (SkinnedMeshRenderer renderer in model.GetComponentsInChildren<SkinnedMeshRenderer>())
        {
            renderer.updateWhenOffscreen = true;
            renderer.quality = SkinQuality.Bone4;
        }
        foreach (MeshRenderer renderer in tunnel.GetComponentsInChildren<MeshRenderer>())
            GameObjectUtility.SetStaticEditorFlags(renderer.gameObject, StaticEditorFlags.BatchingStatic);
        PlayerSettings.productName = "Borrowed Time — New Movement Study";
        EditorBuildSettings.scenes = new[] { new EditorBuildSettingsScene(MotionScenePath, true) };
        EditorSceneManager.SaveScene(scene, MotionScenePath);
        AssetDatabase.SaveAssets();
        Debug.Log("New movement scene saved. Character animation import is disabled; motion is authored by GroundedRunnerPose and live controls.");
    }

    [MenuItem("Borrowed Time/Build New Movement Web Preview")]
    public static void BuildMotionWeb()
    {
        PlayerSettings.WebGL.compressionFormat = WebGLCompressionFormat.Disabled;
        PlayerSettings.WebGL.decompressionFallback = true;
        BuildReport report = BuildPipeline.BuildPlayer(new BuildPlayerOptions {
            scenes = new[] { MotionScenePath }, locationPathName = "Builds/Web", target = BuildTarget.WebGL, options = BuildOptions.None
        });
        if (report.summary.result != BuildResult.Succeeded) throw new InvalidOperationException("Motion Web build failed: " + report.summary.result);
        string viewerPath = Root + "/Web/index.html";
        if (File.Exists(viewerPath)) File.WriteAllText("Builds/Web/index.html", File.ReadAllText(viewerPath).Replace("Unity Visual Study", "New Movement Study"));
        Debug.Log("New independent motion Web preview built successfully.");
    }

    [Serializable] private class Report { public MaterialData[] materials; public LightData[] lights; public CameraData camera; }
    [Serializable] private class TextureData { public string name; }
    [Serializable] private class PaletteData { public float saturation = 1f; public float value = 1f; }
    [Serializable] private class RampData { public float position; public float[] color; }
    [Serializable] private class BrickData { public float[] Color1; public float[] Color2; public float[] Mortar; }
    [Serializable] private class MaterialData
    {
        public string name;
        public float[] base_color;
        public float roughness = 0.8f;
        public float metallic;
        public float[] emission_color;
        public float emission_strength;
        public TextureData[] textures;
        public PaletteData palette_adjustment;
        public bool procedural;
        public RampData[] procedural_color_ramp;
        public BrickData brick_parameters;
    }
    [Serializable] private class LightData { public string name; public float[] position; public float[] color; public float power_watts; }
    [Serializable] private class CameraData
    {
        public float horizontal_fov_degrees = 64.55f;
        public float rear_distance = 5.5f;
        public float height = 2.35f;
        public float target_ahead = 4.5f;
        public float target_height = 1.1f;
    }
    [Serializable] private class SkinMap { public SkinData[] materials; }
    [Serializable] private class SkinData { public string name; public string base_color_texture; public string metallic_smoothness_texture; }
    [Serializable] private class PackedMap { public PackedData[] items; }
    [Serializable] private class PackedData { public string material; public string metallic_smoothness_map; }

    [MenuItem("Borrowed Time/Build Unity Study")]
    public static void BuildScene()
    {
        RequireAssets();
        ConfigurePipeline();
        Directory.CreateDirectory(Generated + "/Materials");
        Directory.CreateDirectory(Generated + "/Textures");
        Directory.CreateDirectory(Root + "/Scenes");
        AssetDatabase.Refresh();

        Report report = JsonUtility.FromJson<Report>(File.ReadAllText(Imported + "/transfer-report-urp.json"));
        SkinMap skin = JsonUtility.FromJson<SkinMap>(File.ReadAllText(Imported + "/skin-material-map.json"));
        PackedMap packed = JsonUtility.FromJson<PackedMap>("{\"items\":" + File.ReadAllText(Imported + "/urp-packed-map.json") + "}");

        ConfigureModel(TunnelPath, false);
        ConfigureModel(RunnerPath, true);
        Dictionary<string, Material> materials = BuildMaterials(report, skin, packed);
        var scene = EditorSceneManager.NewScene(NewSceneSetup.EmptyScene, NewSceneMode.Single);
        GameObject tunnel = InstantiateModel(TunnelPath, "Tunnel / transferred Blender geometry", materials);
        GameObject runner = InstantiateModel(RunnerPath, "Snow / baked motion study", materials);
        Animator animator = runner.GetComponent<Animator>() ?? runner.AddComponent<Animator>();
        AnimationClip clip = AssetDatabase.LoadAllAssetsAtPath(RunnerPath).OfType<AnimationClip>()
            .Where(c => !c.name.StartsWith("__preview__", StringComparison.Ordinal)).OrderByDescending(c => c.length).FirstOrDefault();
        if (clip == null) throw new InvalidOperationException("SnowRunUnity.fbx did not import an animation clip.");

        string controllerPath = Generated + "/Study.controller";
        AssetDatabase.DeleteAsset(controllerPath);
        AnimatorController controller = AnimatorController.CreateAnimatorControllerAtPath(controllerPath);
        AnimatorState state = controller.layers[0].stateMachine.AddState("Study");
        state.motion = clip;
        controller.layers[0].stateMachine.defaultState = state;
        animator.runtimeAnimatorController = controller;
        animator.applyRootMotion = false;
        animator.cullingMode = AnimatorCullingMode.AlwaysAnimate;
        Transform animatedRoot = StudyPlayback.FindAnimatedRoot(animator);

        // Read the actual imported motion, instead of assuming Blender and Unity
        // use identical axes. This also exposes a broken root-motion import early.
        Vector3 forward, right;
        MeasureAxes(clip, runner, animatedRoot, out forward, out right);
        ConfigureAtmosphere();
        CreateLights(report.lights, forward, right);
        Camera camera = CreateCamera(report.camera ?? new CameraData(), forward, animatedRoot.position);
        var playback = new GameObject("Study playback / comparison controls").AddComponent<StudyPlayback>();
        playback.runnerAnimator = animator;
        playback.animatedRoot = animatedRoot;
        playback.followCamera = camera;
        playback.stateName = "Study";
        playback.duration = clip.length;
        playback.cameraOffset = -forward * (report.camera?.rear_distance ?? 5.5f) + Vector3.up * (report.camera?.height ?? 2.35f);
        playback.lookAhead = forward * (report.camera?.target_ahead ?? 4.5f) + Vector3.up * (report.camera?.target_height ?? 1.1f);
        playback.lateralFollow = 0.065f;

        foreach (SkinnedMeshRenderer renderer in runner.GetComponentsInChildren<SkinnedMeshRenderer>())
        {
            renderer.updateWhenOffscreen = true;
            renderer.quality = SkinQuality.Bone4;
        }
        foreach (MeshRenderer renderer in tunnel.GetComponentsInChildren<MeshRenderer>())
            GameObjectUtility.SetStaticEditorFlags(renderer.gameObject, StaticEditorFlags.BatchingStatic);

        PlayerSettings.companyName = "Borrowed Time";
        PlayerSettings.productName = "Borrowed Time — Unity Visual Study";
        PlayerSettings.colorSpace = ColorSpace.Linear;
        PlayerSettings.defaultScreenWidth = 1280;
        PlayerSettings.defaultScreenHeight = 720;
        EditorBuildSettings.scenes = new[] { new EditorBuildSettingsScene(ScenePath, true) };
        EditorSceneManager.SaveScene(scene, ScenePath);
        AssetDatabase.SaveAssets();
        Selection.activeGameObject = runner;
        Debug.Log("Study scene saved: " + ScenePath + ". Clip: " + clip.name + " (" + clip.length + "s). Forward: " + forward + ". Verify motion and lighting in Play mode before building.");
    }

    private static void RequireAssets()
    {
        foreach (string path in new[] { RunnerPath, TunnelPath, Imported + "/transfer-report-urp.json", Imported + "/skin-material-map.json", Imported + "/urp-packed-map.json" })
            if (!File.Exists(path)) throw new FileNotFoundException("Copy the entire asset-prep/export tree into Assets/Study/Imported first.", path);
    }

    private static void ConfigurePipeline()
    {
        var pipeline = QualitySettings.renderPipeline as UniversalRenderPipelineAsset;
        if (pipeline == null) pipeline = GraphicsSettings.defaultRenderPipeline as UniversalRenderPipelineAsset;
        if (pipeline == null)
            pipeline = AssetDatabase.FindAssets("t:UniversalRenderPipelineAsset").Select(AssetDatabase.GUIDToAssetPath)
                .Select(AssetDatabase.LoadAssetAtPath<UniversalRenderPipelineAsset>).FirstOrDefault(p => p != null);
        if (pipeline == null) throw new InvalidOperationException("Create this isolated project with Unity's Universal 3D template before building the study.");
        GraphicsSettings.defaultRenderPipeline = pipeline;
        // The template uses a separate mobile quality profile for Web builds.
        // Keep this visual comparison consistent with the Editor: every quality
        // level must select the same pipeline, including its lights and shadows.
        int originalQuality = QualitySettings.GetQualityLevel();
        try
        {
            for (int index = 0; index < QualitySettings.names.Length; index++)
            {
                QualitySettings.SetQualityLevel(index, false);
                QualitySettings.renderPipeline = pipeline;
            }
        }
        finally
        {
            QualitySettings.SetQualityLevel(originalQuality, false);
        }
        EditorUtility.SetDirty(QualitySettings.GetQualitySettings());
        pipeline.shadowDistance = 40f;
        pipeline.msaaSampleCount = 2;
        pipeline.renderScale = 1f;
        EditorUtility.SetDirty(pipeline);
    }

    private static void ConfigureModel(string path, bool animated)
    {
        var importer = AssetImporter.GetAtPath(path) as ModelImporter;
        if (importer == null) throw new InvalidOperationException("Missing model importer for " + path);
        importer.importCameras = false;
        importer.importLights = false;
        importer.importNormals = ModelImporterNormals.Import;
        importer.importTangents = ModelImporterTangents.CalculateMikk;
        importer.importAnimation = animated;
        importer.isReadable = false;
        if (animated)
        {
            importer.animationType = ModelImporterAnimationType.Generic;
            importer.avatarSetup = ModelImporterAvatarSetup.CreateFromThisModel;
            importer.optimizeGameObjects = false;
            importer.animationCompression = ModelImporterAnimationCompression.Off;
            ModelImporterClipAnimation[] clips = importer.defaultClipAnimations;
            foreach (ModelImporterClipAnimation c in clips)
            {
                c.name = "Study";
                c.loopTime = false;
                c.loopPose = false;
                c.keepOriginalOrientation = true;
                c.keepOriginalPositionXZ = true;
                c.keepOriginalPositionY = true;
                c.lockRootRotation = true;
                c.lockRootPositionXZ = true;
                c.lockRootHeightY = true;
            }
            importer.clipAnimations = clips;
        }
        importer.SaveAndReimport();
    }

    private static Dictionary<string, Material> BuildMaterials(Report report, SkinMap skin, PackedMap packed)
    {
        Shader shader = Shader.Find("Universal Render Pipeline/Lit");
        if (shader == null) throw new InvalidOperationException("URP/Lit shader not available.");
        var result = new Dictionary<string, Material>(StringComparer.OrdinalIgnoreCase);
        var masks = packed.items.ToDictionary(x => x.material, x => x.metallic_smoothness_map);
        foreach (MaterialData source in report.materials)
        {
            var material = new Material(shader) { name = source.name };
            material.SetColor("_BaseColor", ReadColor(source.base_color).gamma);
            material.SetFloat("_Smoothness", 1f - source.roughness);
            material.SetFloat("_Metallic", source.metallic);
            string diffuseName = source.textures?.FirstOrDefault(x => x.name.Contains("diffuse"))?.name;
            string normalName = source.textures?.FirstOrDefault(x => x.name.Contains("normal"))?.name;
            bool hasPalette = HasPalette(source.palette_adjustment);
            if (diffuseName != null)
            {
                Texture2D diffuse = LoadTexture("Textures/" + diffuseName, false, true, false, hasPalette);
                if (hasPalette) diffuse = MutedTexture(diffuse, source.name, source.palette_adjustment);
                material.SetTexture("_BaseMap", diffuse);
                material.SetColor("_BaseColor", Color.white);
            }
            else if (source.procedural)
            {
                material.SetTexture("_BaseMap", EnvironmentTexture(source));
                material.SetColor("_BaseColor", Color.white);
                if (HasBrick(source.brick_parameters))
                {
                    material.SetTextureScale("_BaseMap", new Vector2(1f / 0.60f, 1f / 0.21f));
                    material.SetFloat("_Cull", (float)CullMode.Off);
                }
                else
                {
                    // Corrected tunnel UVs are measured in metres. The generated
                    // 6/96-frequency noise therefore repeats every 3.33 metres,
                    // matching the source's broad wear and fine surface grain.
                    material.SetTextureScale("_BaseMap", new Vector2(0.3f, 0.3f));
                }
            }
            if (normalName != null)
            {
                material.SetTexture("_BumpMap", LoadTexture("Textures/" + normalName, true, false));
                material.SetFloat("_BumpScale", 0.7f);
                material.EnableKeyword("_NORMALMAP");
            }
            if (masks.TryGetValue(source.name, out string mask)) ApplyPackedMask(material, mask);
            if (source.emission_strength > 0f && ReadColor(source.emission_color).maxColorComponent > 0f)
            {
                material.SetColor("_EmissionColor", ReadColor(source.emission_color) * source.emission_strength);
                material.EnableKeyword("_EMISSION");
            }
            if (source.name == "snow.eyes_cornea") MakeTransparent(material, 0.10f);
            if (source.name == "snow.eye_dot") material.SetColor("_BaseColor", Color.black);
            result[source.name] = SaveMaterial(material);
        }
        foreach (SkinData source in skin.materials)
        {
            var material = new Material(shader) { name = source.name };
            material.SetColor("_BaseColor", Color.white);
            material.SetTexture("_BaseMap", LoadTexture(source.base_color_texture, false, true, true));
            material.SetFloat("_Metallic", 0f);
            ApplyPackedMask(material, source.metallic_smoothness_texture, true);
            result[source.name] = SaveMaterial(material);
        }
        ValidateAndPersistMaterials(result);
        return result;
    }

    private static void ApplyPackedMask(Material material, string path, bool clamp = false)
    {
        material.SetTexture("_MetallicGlossMap", LoadTexture(path, false, false, clamp));
        material.SetFloat("_Smoothness", 1f);
        material.SetFloat("_SmoothnessTextureChannel", 0f);
        material.EnableKeyword("_METALLICSPECGLOSSMAP");
    }

    private static void MakeTransparent(Material material, float alpha)
    {
        material.SetColor("_BaseColor", new Color(1f, 1f, 1f, alpha));
        material.SetFloat("_Surface", 1f);
        material.SetFloat("_Blend", 0f);
        material.SetFloat("_ZWrite", 0f);
        material.SetFloat("_SrcBlend", (float)BlendMode.SrcAlpha);
        material.SetFloat("_DstBlend", (float)BlendMode.OneMinusSrcAlpha);
        material.EnableKeyword("_SURFACE_TYPE_TRANSPARENT");
        material.SetOverrideTag("RenderType", "Transparent");
        material.renderQueue = (int)RenderQueue.Transparent;
    }

    private static Material SaveMaterial(Material material)
    {
        ValidateLitMaterial(material);
        string path = Generated + "/Materials/" + SafeName(material.name) + ".mat";
        Material existing = AssetDatabase.LoadAssetAtPath<Material>(path);
        if (existing == null) { AssetDatabase.CreateAsset(material, path); return material; }
        EditorUtility.CopySerialized(material, existing);
        EditorUtility.SetDirty(existing);
        UnityEngine.Object.DestroyImmediate(material);
        return existing;
    }

    private static void ValidateLitMaterial(Material material)
    {
        // Setting a color/texture and enabling a keyword on a temporary Material
        // is insufficient: URP validates imported assets and derives keywords
        // from their persistent surface properties and GI flags. Use URP's own
        // public validator, with the emission state established first.
        bool emits = material.GetColor("_EmissionColor").maxColorComponent > 0.0001f;
        material.globalIlluminationFlags = emits
            ? MaterialGlobalIlluminationFlags.BakedEmissive
            : MaterialGlobalIlluminationFlags.EmissiveIsBlack;
        material.SetFloat("_WorkflowMode", 1f);
        BaseShaderGUI.SetMaterialKeywords(material, LitGUI.SetMaterialKeywords);
        EditorUtility.SetDirty(material);
    }

    private static void ValidateAndPersistMaterials(Dictionary<string, Material> materials)
    {
        // Finish pending texture/material imports before validating the final
        // assets. A roundtrip then catches keywords lost to an import callback.
        AssetDatabase.SaveAssets();
        AssetDatabase.Refresh(ImportAssetOptions.ForceSynchronousImport);
        foreach (string name in materials.Keys.ToArray())
        {
            string path = Generated + "/Materials/" + SafeName(name) + ".mat";
            Material material = AssetDatabase.LoadAssetAtPath<Material>(path);
            ValidateLitMaterial(material);
            AssetDatabase.SaveAssetIfDirty(material);
            AssetDatabase.ImportAsset(path, ImportAssetOptions.ForceUpdate | ImportAssetOptions.ForceSynchronousImport);
            material = AssetDatabase.LoadAssetAtPath<Material>(path);
            RequireKeyword(material, "_NORMALMAP", material.GetTexture("_BumpMap") != null);
            RequireKeyword(material, "_METALLICSPECGLOSSMAP", material.GetTexture("_MetallicGlossMap") != null);
            bool emits = material.GetColor("_EmissionColor").maxColorComponent > 0.0001f;
            RequireKeyword(material, "_EMISSION", emits);
            if (emits && (material.globalIlluminationFlags & MaterialGlobalIlluminationFlags.EmissiveIsBlack) != 0)
                throw new InvalidOperationException("Emission flag did not survive material import: " + path);
            materials[name] = material;
        }
    }

    private static void RequireKeyword(Material material, string keyword, bool expected)
    {
        if (material.IsKeywordEnabled(keyword) != expected)
            throw new InvalidOperationException("URP keyword " + keyword + " did not survive import for " + material.name + ". Expected enabled=" + expected);
    }

    [MenuItem("Borrowed Time/Validate Study Materials")]
    public static void ValidateStudyMaterials()
    {
        var materials = AssetDatabase.FindAssets("t:Material", new[] { Generated + "/Materials" })
            .Select(AssetDatabase.GUIDToAssetPath).Select(AssetDatabase.LoadAssetAtPath<Material>)
            .Where(m => m != null).ToDictionary(m => m.name, m => m);
        ValidateAndPersistMaterials(materials);
        Debug.Log("Validated and reimported " + materials.Count + " persistent URP study materials.");
    }

    private static Texture2D LoadTexture(string relative, bool normal, bool srgb, bool clamp = false, bool readable = false)
    {
        string path = Imported + "/" + relative;
        var importer = AssetImporter.GetAtPath(path) as TextureImporter;
        if (importer == null) throw new FileNotFoundException("Required transferred texture is missing.", path);
        importer.textureType = normal ? TextureImporterType.NormalMap : TextureImporterType.Default;
        importer.sRGBTexture = srgb;
        importer.alphaSource = TextureImporterAlphaSource.FromInput;
        importer.alphaIsTransparency = false;
        importer.maxTextureSize = 2048;
        importer.mipmapEnabled = true;
        importer.wrapMode = clamp ? TextureWrapMode.Clamp : TextureWrapMode.Repeat;
        importer.isReadable = readable;
        importer.SaveAndReimport();
        return AssetDatabase.LoadAssetAtPath<Texture2D>(path);
    }

    private static Texture2D MutedTexture(Texture2D original, string name, PaletteData palette)
    {
        const int size = 1024;
        var texture = new Texture2D(size, size, TextureFormat.RGBA32, false);
        var pixels = new Color[size * size];
        for (int y = 0; y < size; y++) for (int x = 0; x < size; x++)
        {
            Color source = original.GetPixelBilinear((x + 0.5f) / size, (y + 0.5f) / size);
            Color.RGBToHSV(source, out float h, out float s, out float v);
            Color c = Color.HSVToRGB(h, s * palette.saturation, v * palette.value);
            c.a = source.a;
            pixels[y * size + x] = c;
        }
        texture.SetPixels(pixels);
        texture.Apply();
        return SaveTexture(texture, SafeName(name) + "_Muted");
    }

    private static Texture2D EnvironmentTexture(MaterialData source)
    {
        const int size = 1024;
        var texture = new Texture2D(size, size, TextureFormat.RGBA32, false);
        var pixels = new Color[size * size];
        Color a = ReadColor(source.base_color), b = a * 1.2f;
        if (source.procedural_color_ramp != null && source.procedural_color_ramp.Length > 1)
        {
            a = ReadColor(source.procedural_color_ramp[0].color);
            b = ReadColor(source.procedural_color_ramp[source.procedural_color_ramp.Length - 1].color);
        }
        bool brick = HasBrick(source.brick_parameters);
        if (brick) { a = ReadColor(source.brick_parameters.Color1); b = ReadColor(source.brick_parameters.Color2); }
        for (int y = 0; y < size; y++) for (int x = 0; x < size; x++)
        {
            float u = (x + 0.5f) / size, v = (y + 0.5f) / size;
            float broad = SeamlessNoise(u, v, 6f);
            float grain = SeamlessNoise(u, v, 96f);
            Color color = Color.Lerp(a, b, broad * 0.75f + grain * 0.25f);
            if (brick)
            {
                int row = Mathf.FloorToInt(v * 2f);
                float bx = Mathf.Repeat(u * 2f + (row % 2) * 0.5f, 1f);
                float by = Mathf.Repeat(v * 2f, 1f);
                float edge = Mathf.Min(Mathf.Min(bx, 1f - bx) * 0.30f, Mathf.Min(by, 1f - by) * 0.105f);
                float mortar = 1f - Mathf.SmoothStep(0f, 1f, Mathf.InverseLerp(0.003f, 0.007f, edge));
                color = Color.Lerp(color, ReadColor(source.brick_parameters.Mortar), mortar);
            }
            pixels[y * size + x] = color.gamma;
        }
        texture.SetPixels(pixels);
        texture.Apply();
        return SaveTexture(texture, SafeName(source.name) + "_Surface");
    }

    private static float SeamlessNoise(float u, float v, float frequency)
    {
        float a = Mathf.PerlinNoise(u * frequency, v * frequency);
        float b = Mathf.PerlinNoise((u - 1f) * frequency, v * frequency);
        float c = Mathf.PerlinNoise(u * frequency, (v - 1f) * frequency);
        float d = Mathf.PerlinNoise((u - 1f) * frequency, (v - 1f) * frequency);
        return Mathf.Lerp(Mathf.Lerp(a, b, u), Mathf.Lerp(c, d, u), v);
    }

    private static Texture2D SaveTexture(Texture2D texture, string name)
    {
        string path = Generated + "/Textures/" + name + ".png";
        File.WriteAllBytes(path, texture.EncodeToPNG());
        UnityEngine.Object.DestroyImmediate(texture);
        AssetDatabase.ImportAsset(path);
        var importer = (TextureImporter)AssetImporter.GetAtPath(path);
        importer.sRGBTexture = true;
        importer.mipmapEnabled = true;
        importer.wrapMode = TextureWrapMode.Repeat;
        importer.SaveAndReimport();
        return AssetDatabase.LoadAssetAtPath<Texture2D>(path);
    }

    private static GameObject InstantiateModel(string path, string name, Dictionary<string, Material> materials)
    {
        var model = AssetDatabase.LoadAssetAtPath<GameObject>(path);
        GameObject instance = (GameObject)PrefabUtility.InstantiatePrefab(model);
        instance.name = name;
        foreach (Renderer renderer in instance.GetComponentsInChildren<Renderer>(true))
        {
            Material[] slots = renderer.sharedMaterials;
            // Older exports included Blender's volume-only haze cube. URP fog
            // replaces that volume; an opaque version would enclose the camera.
            if (slots.Any(m => m != null && m.name.StartsWith("Cool hanging tunnel dust", StringComparison.OrdinalIgnoreCase)))
            {
                renderer.enabled = false;
                continue;
            }
            for (int i = 0; i < slots.Length; i++)
            {
                string originalName = slots[i] != null ? slots[i].name.Replace(" (Instance)", "") : "";
                string materialPath = Generated + "/Materials/" + SafeName(originalName) + ".mat";
                Material replacement;
                if (!materials.TryGetValue(originalName, out replacement))
                    replacement = AssetDatabase.LoadAssetAtPath<Material>(materialPath);
                if (replacement != null) slots[i] = replacement;
                else Debug.LogWarning("No material mapping for " + originalName + " on " + renderer.name);
            }
            renderer.sharedMaterials = slots;
        }
        return instance;
    }

    private static void MeasureAxes(AnimationClip clip, GameObject runner, Transform root, out Vector3 forward, out Vector3 right)
    {
        clip.SampleAnimation(runner, 0f);
        Vector3 start = root.position;
        clip.SampleAnimation(runner, Mathf.Max(0f, clip.length - 0.001f));
        Vector3 travel = Vector3.ProjectOnPlane(root.position - start, Vector3.up);
        forward = travel.sqrMagnitude > 1f ? travel.normalized : Vector3.forward;
        clip.SampleAnimation(runner, Mathf.Min(2f, clip.length));
        Vector3 laneOffset = Vector3.ProjectOnPlane(root.position - start, Vector3.up);
        laneOffset -= forward * Vector3.Dot(laneOffset, forward);
        right = laneOffset.sqrMagnitude > 0.1f ? -laneOffset.normalized : Vector3.right;
        clip.SampleAnimation(runner, 0f);
        if (travel.sqrMagnitude < 1f)
            Debug.LogWarning("Imported RIG-Snow translation was not visible during clip sampling. Verify Generic root baking in Play mode; provisional source -Y maps to Unity +Z.");
        else Debug.Log("Imported sequence travel: " + travel + "; source X maps to " + right);
    }

    private static void ConfigureAtmosphere()
    {
        RenderSettings.skybox = null;
        RenderSettings.ambientMode = AmbientMode.Trilight;
        RenderSettings.ambientSkyColor = new Color(0.30f, 0.34f, 0.37f);
        RenderSettings.ambientEquatorColor = new Color(0.18f, 0.21f, 0.23f);
        RenderSettings.ambientGroundColor = new Color(0.035f, 0.045f, 0.05f);
        RenderSettings.fog = true;
        RenderSettings.fogMode = FogMode.ExponentialSquared;
        RenderSettings.fogColor = new Color(0.105f, 0.14f, 0.155f);
        RenderSettings.fogDensity = 0.022f;
        var volume = new GameObject("Atmosphere / ACES + restrained bloom").AddComponent<Volume>();
        volume.isGlobal = true;
        var profile = ScriptableObject.CreateInstance<VolumeProfile>();
        profile.Add<Tonemapping>(true).mode.Override(TonemappingMode.ACES);
        Bloom bloom = profile.Add<Bloom>(true);
        bloom.intensity.Override(0.16f);
        bloom.threshold.Override(1.1f);
        ColorAdjustments grade = profile.Add<ColorAdjustments>(true);
        grade.postExposure.Override(0.0f);
        grade.contrast.Override(10f);
        grade.saturation.Override(-10f);
        Vignette vignette = profile.Add<Vignette>(true);
        vignette.intensity.Override(0.20f);
        vignette.smoothness.Override(0.5f);
        string path = Generated + "/StudyVolume.asset";
        AssetDatabase.DeleteAsset(path);
        AssetDatabase.CreateAsset(profile, path);
        foreach (VolumeComponent component in profile.components) AssetDatabase.AddObjectToAsset(component, profile);
        volume.sharedProfile = profile;
    }

    private static void CreateLights(LightData[] sources, Vector3 forward, Vector3 right)
    {
        Transform group = new GameObject("Practical lights / URP translation").transform;
        foreach (LightData source in sources)
        {
            if (source.name.Contains("Camera-side")) continue;
            bool reflected = source.name.Contains("reflected");
            bool exit = source.name.Contains("Daylight beyond");
            bool practical = source.name.Contains("Warm lamp");
            Vector3 p = right * source.position[0] - forward * source.position[1] + Vector3.up * source.position[2];
            if (practical) p -= right * Mathf.Sign(source.position[0]) * 0.30f + Vector3.up * 0.18f;
            Light light = new GameObject(source.name).AddComponent<Light>();
            light.transform.SetParent(group);
            light.transform.position = p;
            light.type = reflected ? LightType.Point : LightType.Spot;
            light.color = ReadColor(source.color).gamma;
            // Blender area-light watts have no exact point/spot equivalent. These
            // are deliberate starting values for a real-time visual comparison.
            float baseIntensity = reflected ? source.power_watts / 95f : Mathf.Clamp(source.power_watts / 55f, 0.7f, 14f);
            light.intensity = baseIntensity * 8f * (practical ? 2f : reflected ? 3f : 1f);
            light.range = exit ? 22f : reflected ? 5.8f : 8.5f;
            light.spotAngle = practical ? 115f : 95f;
            light.innerSpotAngle = practical ? 70f : 45f;
            Vector3 target = p + (exit ? -forward * 12f : forward * 0.8f) - Vector3.up * (practical ? 2.7f : 2.0f);
            if (practical) target -= right * source.position[0] * 0.8f;
            light.transform.LookAt(target);
            light.shadows = !reflected && source.power_watts >= 145f ? LightShadows.Soft : LightShadows.None;
            light.shadowStrength = 0.8f;
            light.shadowBias = 0.04f;
            light.shadowNormalBias = 0.15f;
        }
    }

    private static Camera CreateCamera(CameraData data, Vector3 forward, Vector3 start)
    {
        Camera camera = new GameObject("Main Camera / rear runner view").AddComponent<Camera>();
        camera.tag = "MainCamera";
        camera.clearFlags = CameraClearFlags.SolidColor;
        camera.backgroundColor = RenderSettings.fogColor;
        camera.nearClipPlane = 0.08f;
        camera.farClipPlane = 90f;
        camera.fieldOfView = Camera.HorizontalToVerticalFieldOfView(data.horizontal_fov_degrees, 16f / 9f);
        camera.allowHDR = true;
        camera.transform.position = start - forward * data.rear_distance + Vector3.up * data.height;
        camera.transform.LookAt(start + forward * data.target_ahead + Vector3.up * data.target_height);
        camera.gameObject.AddComponent<AudioListener>();
        UniversalAdditionalCameraData extra = camera.GetUniversalAdditionalCameraData();
        extra.renderPostProcessing = true;
        extra.antialiasing = AntialiasingMode.SubpixelMorphologicalAntiAliasing;
        Light fill = new GameObject("Subtle camera-side bounce").AddComponent<Light>();
        fill.transform.SetParent(camera.transform, false);
        fill.transform.localPosition = new Vector3(-0.7f, 0.8f, 1.5f);
        fill.type = LightType.Point;
        fill.color = new Color(0.65f, 0.75f, 0.80f);
        fill.intensity = 0.55f * 8f;
        fill.range = 8f;
        fill.shadows = LightShadows.None;
        return camera;
    }

    [MenuItem("Borrowed Time/Build Web Study")]
    public static void BuildWeb()
    {
        if (!File.Exists(ScenePath)) throw new FileNotFoundException("Build the study scene first.", ScenePath);
        PlayerSettings.WebGL.compressionFormat = WebGLCompressionFormat.Disabled;
        PlayerSettings.WebGL.decompressionFallback = true;
        BuildReport report = BuildPipeline.BuildPlayer(new BuildPlayerOptions
        {
            scenes = new[] { ScenePath }, locationPathName = "Builds/Web", target = BuildTarget.WebGL,
            options = BuildOptions.None
        });
        if (report.summary.result != BuildResult.Succeeded)
            throw new InvalidOperationException("Web study build failed: " + report.summary.result);
        string viewerPath = Root + "/Web/index.html";
        if (File.Exists(viewerPath)) File.Copy(viewerPath, "Builds/Web/index.html", true);
        Debug.Log("Web study built at Builds/Web. Serve it through a local HTTP server.");
    }

    private static Color ReadColor(float[] values)
    {
        return values != null && values.Length >= 3 ? new Color(values[0], values[1], values[2], values.Length > 3 ? values[3] : 1f) : Color.black;
    }

    private static bool HasBrick(BrickData brick)
    {
        // JsonUtility may instantiate a missing nested object with empty fields.
        // Presence of the object alone therefore does not identify brick data.
        return brick != null && brick.Color1 != null && brick.Color1.Length >= 3
            && brick.Color2 != null && brick.Color2.Length >= 3
            && brick.Mortar != null && brick.Mortar.Length >= 3;
    }

    private static bool HasPalette(PaletteData palette)
    {
        // All authored adjustments retain positive brightness. An empty nested
        // palette must not turn an otherwise unchanged texture completely black.
        return palette != null && palette.value > 0f && palette.saturation >= 0f && palette.saturation <= 1f;
    }

    private static string SafeName(string value)
    {
        return new string(value.Select(c => char.IsLetterOrDigit(c) || c == '-' || c == '_' || c == '.' ? c : '_').ToArray());
    }
}
