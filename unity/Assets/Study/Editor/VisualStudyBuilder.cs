using System;
using System.IO;
using System.Linq;
using UnityEditor;
using UnityEditor.Build.Reporting;
using UnityEditor.SceneManagement;
using UnityEngine;
using UnityEngine.Rendering;
using UnityEngine.Rendering.Universal;

/// <summary>Builds an independent art-direction scene; never reads the browser game's source.</summary>
public static class VisualStudyBuilder
{
    private const string Root = "Assets/Study/VisualPass";
    public const string Scene = "Assets/Study/Scenes/VisualPass.unity";

    [MenuItem("Borrowed Time/Build Full Visual Study")]
    public static void Build()
    {
        Directory.CreateDirectory(Root);
        AssetDatabase.Refresh();
        PrepareExternalTextures();
        var scene = EditorSceneManager.NewScene(NewSceneSetup.EmptyScene, NewSceneMode.Single);
        TunnelArtPass.Build();
        var root = new GameObject("Runner / original visual study");
        string modelPath = "Assets/Study/Imported/SnowStatic.fbx";
        var importer = (ModelImporter)AssetImporter.GetAtPath(modelPath);
        importer.importAnimation = false;
        importer.isReadable = true;
        importer.SaveAndReimport();
        var model = (GameObject)PrefabUtility.InstantiatePrefab(AssetDatabase.LoadAssetAtPath<GameObject>(modelPath));
        PrefabUtility.UnpackPrefabInstance(model, PrefabUnpackMode.Completely, InteractionMode.AutomatedAction);
        model.name = "Runner / tailored wardrobe and neutral skeleton";
        model.transform.SetParent(root.transform, false);
        foreach (Animator a in model.GetComponentsInChildren<Animator>(true)) UnityEngine.Object.DestroyImmediate(a);
        var existing = AssetDatabase.FindAssets("t:Material", new[]{"Assets/Study/Generated/Materials"})
            .Select(AssetDatabase.GUIDToAssetPath).Select(AssetDatabase.LoadAssetAtPath<Material>)
            .Where(m=>m != null).ToDictionary(m=>m.name,m=>m);
        foreach (Renderer r in model.GetComponentsInChildren<Renderer>(true))
        {
            r.sharedMaterials = r.sharedMaterials.Select(m=>m != null && existing.TryGetValue(m.name,out var v) ? v : m).ToArray();
            if (r is SkinnedMeshRenderer skin) { skin.updateWhenOffscreen=true; skin.quality=SkinQuality.Bone4; }
        }
        var pose = root.AddComponent<GroundedRunnerPose>();
        pose.modelRoot = model.transform;
        var camera = BuildCamera();
        var movement = new GameObject("Visual study / live controls").AddComponent<GroundedMotionStudy>();
        movement.runnerRoot = root.transform;
        movement.pose = pose;
        movement.followCamera = camera;
        movement.runSpeed = 4.6f;
        movement.laneChangeSeconds = .40f;
        movement.tunnelLength = 48f;
        movement.jumpAtDistance = 10.4f;
        movement.cameraOffset = new Vector3(0,1.95f,-4.7f);
        movement.cameraLookAhead = new Vector3(0,1.10f,4.5f);
        movement.lateralCameraFollow = .18f;
        movement.initialCameraPreset = 1;
        Atmosphere();
        Lighting(camera);
        Dust();
        PreserveRuntimeMaterialVariants();
        foreach (var guid in AssetDatabase.FindAssets("t:Material",new[]{Root+"/Materials"}))
        {
            var material=AssetDatabase.LoadAssetAtPath<Material>(AssetDatabase.GUIDToAssetPath(guid));
            if(material.shader.name=="Universal Render Pipeline/Lit")
                UnityEditor.BaseShaderGUI.SetMaterialKeywords(material,UnityEditor.Rendering.Universal.ShaderGUI.LitGUI.SetMaterialKeywords);
            EditorUtility.SetDirty(material);
        }
        PlayerSettings.productName = "Borrowed Time — Unity Visual Pass";
        PlayerSettings.colorSpace = ColorSpace.Linear;
        PlayerSettings.defaultScreenWidth=1280;
        PlayerSettings.defaultScreenHeight=720;
        PlayerSettings.runInBackground=true;
        EditorBuildSettings.scenes = new[]{new EditorBuildSettingsScene(Scene,true)};
        EditorSceneManager.SaveScene(scene,Scene);
        AssetDatabase.SaveAssets();
        Debug.Log("Full isolated visual scene saved: " + Scene);
    }

    private static void PrepareExternalTextures()
    {
        foreach(string path in Directory.GetFiles(Root+"/External","*.png"))
        {
            var importer=(TextureImporter)AssetImporter.GetAtPath(path);
            importer.textureType=path.Contains("_Normal")?TextureImporterType.NormalMap:TextureImporterType.Default;
            importer.sRGBTexture=path.Contains("_Base");
            importer.alphaSource=TextureImporterAlphaSource.FromInput;
            importer.alphaIsTransparency=false;
            importer.wrapMode=TextureWrapMode.Repeat;
            importer.mipmapEnabled=true;importer.maxTextureSize=2048;
            importer.SaveAndReimport();
        }
    }

    private static void PreserveRuntimeMaterialVariants()
    {
        // The wardrobe is created at runtime. Explicit scene references retain
        // its matte and normal-mapped shader combinations in stripped Web builds.
        var holder=new GameObject("Internal / runtime material references");
        holder.SetActive(false);
        for(int i=0;i<4;i++)
        {
            string path=Root+"/Materials/Runtime_cloth_variant_"+i+".mat";
            var material=AssetDatabase.LoadAssetAtPath<Material>(path);
            if(material==null){material=new Material(Shader.Find("Universal Render Pipeline/Lit"));AssetDatabase.CreateAsset(material,path);}
            material.SetTexture("_BumpMap",i<2 ? AssetDatabase.LoadAssetAtPath<Texture2D>(Root+"/External/Concrete_Normal.png") : null);
            // The skin uses both plain and smoothness-mapped variants. Its
            // runtime matte response must survive Web shader stripping too.
            var sourceSkin=AssetDatabase.LoadAssetAtPath<Material>("Assets/Study/Generated/Materials/snow.skin.tile1001.mat");
            material.SetTexture("_MetallicGlossMap",i==3 && sourceSkin!=null ? sourceSkin.GetTexture("_MetallicGlossMap") : null);
            material.SetFloat("_Cull",0);material.SetFloat("_SpecularHighlights",i==0?1:0);material.SetFloat("_EnvironmentReflections",i==0?1:0);
            UnityEditor.BaseShaderGUI.SetMaterialKeywords(material,UnityEditor.Rendering.Universal.ShaderGUI.LitGUI.SetMaterialKeywords);
            var reference=GameObject.CreatePrimitive(PrimitiveType.Quad);reference.name="Runtime cloth shader variant "+i;reference.transform.SetParent(holder.transform,false);
            reference.GetComponent<MeshRenderer>().sharedMaterial=material;
            UnityEngine.Object.DestroyImmediate(reference.GetComponent<Collider>());
            EditorUtility.SetDirty(material);
        }
    }

    private static Camera BuildCamera()
    {
        var c = new GameObject("Main Camera / composed rear view").AddComponent<Camera>();
        c.tag="MainCamera";
        c.fieldOfView=41f;
        c.nearClipPlane=.08f;
        c.farClipPlane=120;
        c.allowHDR=true;
        c.clearFlags=CameraClearFlags.SolidColor;
        c.backgroundColor=new Color(.095f,.12f,.13f);
        c.transform.position=new Vector3(0,1.95f,-4.7f);
        c.transform.LookAt(new Vector3(0,1.1f,4.5f));
        c.gameObject.AddComponent<AudioListener>();
        var extra = c.GetUniversalAdditionalCameraData();
        extra.renderPostProcessing=true;
        extra.antialiasing=AntialiasingMode.SubpixelMorphologicalAntiAliasing;
        return c;
    }

    private static void Atmosphere()
    {
        RenderSettings.skybox=null;
        RenderSettings.ambientMode=AmbientMode.Trilight;
        RenderSettings.ambientSkyColor=new Color(.19f,.23f,.26f);
        RenderSettings.ambientEquatorColor=new Color(.085f,.10f,.115f);
        RenderSettings.ambientGroundColor=new Color(.026f,.031f,.036f);
        RenderSettings.fog=true;
        RenderSettings.fogMode=FogMode.ExponentialSquared;
        RenderSettings.fogColor=new Color(.10f,.13f,.14f);
        RenderSettings.fogDensity=.0215f;
        var volume=new GameObject("Atmosphere / cool depth and restrained film response").AddComponent<Volume>();
        volume.isGlobal=true;
        var profile=ScriptableObject.CreateInstance<VolumeProfile>();
        profile.Add<Tonemapping>(true).mode.Override(TonemappingMode.ACES);
        var color=profile.Add<ColorAdjustments>(true);
        color.postExposure.Override(.30f);
        color.contrast.Override(7f);
        color.saturation.Override(-18f);
        var bloom=profile.Add<Bloom>(true); bloom.intensity.Override(.18f);bloom.threshold.Override(1.25f);
        var vignette=profile.Add<Vignette>(true);vignette.intensity.Override(.23f);vignette.smoothness.Override(.55f);
        var grain=profile.Add<FilmGrain>(true);grain.type.Override(FilmGrainLookup.Thin1);grain.intensity.Override(.085f);grain.response.Override(.75f);
        string path=Root+"/VisualAtmosphere.asset";
        AssetDatabase.DeleteAsset(path);AssetDatabase.CreateAsset(profile,path);
        foreach(var component in profile.components)AssetDatabase.AddObjectToAsset(component,profile);
        volume.sharedProfile=profile;
        var pipeline=GraphicsSettings.currentRenderPipeline as UniversalRenderPipelineAsset;
        if(pipeline != null){pipeline.shadowDistance=45;pipeline.additionalLightsShadowmapResolution=2048;pipeline.msaaSampleCount=2;pipeline.renderScale=1;EditorUtility.SetDirty(pipeline);}
    }

    private static Light Spot(string name, Vector3 position, Vector3 target, Color color,float intensity,float range,float angle,bool shadow)
    {
        var light=new GameObject(name).AddComponent<Light>();
        light.type=LightType.Spot;light.transform.position=position;light.transform.LookAt(target);
        light.color=color;light.intensity=intensity;light.range=range;
        light.spotAngle=angle;light.innerSpotAngle=angle*.58f;
        light.shadows=shadow?LightShadows.Soft:LightShadows.None;
        light.shadowStrength=.86f;light.shadowBias=.025f;light.shadowNormalBias=.075f;
        return light;
    }

    private static void Lighting(Camera camera)
    {
        // Four unequal oblique light fields describe the large architectural
        // masses. A quiet interval between them is intentional; the runner's
        // low reflected light keeps its silhouette readable through that gap.
        float[] output = { 74f, 52f, 80f, 66f };
        float[] reach = { 4.8f, 3.3f, 5.4f, 4.2f };
        for(int i=0;i<TunnelArtPass.LampZ.Length;i++)
        {
            float z=TunnelArtPass.LampZ[i],side=i%2==0?-1:1;
            Spot("Wall practical / "+i,new Vector3(side*2.72f,2.6f,z),
                new Vector3(-side*.75f,.55f,z+reach[i%reach.Length]),
                i==1 ? new Color(.81f,.72f,.60f) : new Color(.70f,.77f,.80f),
                output[i%output.Length],13f,92f,true);
        }
        Spot("Maintenance recess / weak service light",new Vector3(-2.85f,2.2f,10.8f),new Vector3(-3.4f,.7f,10.2f),new Color(.72f,.69f,.59f),19f,4.5f,100f,false);
        Spot("Daylight / distant stairwell",new Vector3(.4f,4.3f,53),new Vector3(0,.3f,31),new Color(.61f,.76f,.88f),140f,38f,94f,true);
        Spot("Roof breach / cold shaft",new Vector3(1.1f,5.8f,22.7f),new Vector3(1.7f,0,23.2f),new Color(.66f,.76f,.83f),125f,14f,62f,true);
        var fill=new GameObject("Camera / restrained bounce").AddComponent<Light>();
        fill.type=LightType.Point;fill.transform.SetParent(camera.transform,false);
        fill.transform.localPosition=new Vector3(-.7f,.7f,2);
        fill.color=new Color(.54f,.64f,.70f);fill.intensity=6f;fill.range=6;fill.shadows=LightShadows.None;
        // A broad, low bounce separates trouser folds from the floor without
        // putting the strongest character highlight on the exposed neck.
        // GroundedMotionStudy anchors this to the baseline tracking rig, so
        // comparing camera presets does not also change the lighting.
        var legBounce=Spot("Runner / low reflected light",new Vector3(1.9f,1.25f,-1.3f),
            new Vector3(0,.55f,.15f),new Color(.57f,.66f,.71f),12f,5.5f,78f,false);
        legBounce.transform.SetParent(camera.transform,true);
        var rim=Spot("Runner / soft rim",Vector3.zero,Vector3.forward,new Color(.72f,.77f,.80f),5f,5.5f,100f,false);
        rim.transform.SetParent(camera.transform,false);rim.transform.localPosition=new Vector3(1.5f,2,4.8f);rim.transform.localRotation=Quaternion.Euler(55,200,0);
    }

    private static void Dust()
    {
        var texture=new Texture2D(32,32,TextureFormat.RGBA32,false);
        var pixels=new Color[32*32];
        for(int y=0;y<32;y++)for(int x=0;x<32;x++){float r=Vector2.Distance(new Vector2(x+.5f,y+.5f),new Vector2(16,16))/16f;pixels[y*32+x]=new Color(1,1,1,Mathf.Pow(Mathf.Clamp01(1-r),3));}
        texture.SetPixels(pixels);texture.Apply();
        File.WriteAllBytes(Root+"/Dust.png",texture.EncodeToPNG());UnityEngine.Object.DestroyImmediate(texture);
        AssetDatabase.ImportAsset(Root+"/Dust.png");
        var material=new Material(Shader.Find("Universal Render Pipeline/Particles/Unlit"));
        material.name="Fine suspended dust";
        material.SetTexture("_BaseMap",AssetDatabase.LoadAssetAtPath<Texture2D>(Root+"/Dust.png"));
        material.SetColor("_BaseColor",new Color(.64f,.70f,.72f,.2f));
        material.SetFloat("_Surface",1);material.SetFloat("_Blend",0);material.SetFloat("_ZWrite",0);
        material.SetFloat("_SrcBlend",(float)BlendMode.SrcAlpha);material.SetFloat("_DstBlend",(float)BlendMode.OneMinusSrcAlpha);
        material.EnableKeyword("_SURFACE_TYPE_TRANSPARENT");material.renderQueue=3000;
        AssetDatabase.DeleteAsset(Root+"/Dust.mat");AssetDatabase.CreateAsset(material,Root+"/Dust.mat");
        var system=new GameObject("Air / suspended dust in the light").AddComponent<ParticleSystem>();
        system.Stop(true,ParticleSystemStopBehavior.StopEmittingAndClear);
        system.transform.position=new Vector3(0,2,24);
        var main=system.main;main.startLifetime=16;main.startSpeed=.018f;main.startSize=new ParticleSystem.MinMaxCurve(.014f,.035f);main.maxParticles=180;main.simulationSpace=ParticleSystemSimulationSpace.World;main.prewarm=true;main.startColor=new Color(.70f,.75f,.75f,.22f);
        var shape=system.shape;shape.shapeType=ParticleSystemShapeType.Box;shape.scale=new Vector3(5,3.3f,48);
        var emission=system.emission;emission.rateOverTime=10;
        var velocity=system.velocityOverLifetime;velocity.enabled=true;velocity.space=ParticleSystemSimulationSpace.World;velocity.y=-.015f;velocity.x=.012f;
        system.GetComponent<ParticleSystemRenderer>().sharedMaterial=material;
        system.Play();
    }

    [MenuItem("Borrowed Time/Build Full Visual Web Preview")]
    public static void BuildWeb()
    {
        PlayerSettings.WebGL.compressionFormat=WebGLCompressionFormat.Disabled;
        PlayerSettings.WebGL.decompressionFallback=true;
        var report=BuildPipeline.BuildPlayer(new BuildPlayerOptions{scenes=new[]{Scene},locationPathName="Builds/Web",target=BuildTarget.WebGL,options=BuildOptions.None});
        if(report.summary.result!=BuildResult.Succeeded)throw new InvalidOperationException("Visual Web build failed: "+report.summary.result);
        string html=File.ReadAllText("Assets/Study/Web/index.html").Replace("Unity Visual Study","Unity Visual Pass");
        File.WriteAllText("Builds/Web/index.html",html);
        Debug.Log("Full visual Web preview succeeded; runtime and browser visual check still required.");
    }
}
