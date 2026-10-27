using System;
using System.IO;
using System.Linq;
using UnityEditor;
using UnityEditor.Build.Reporting;
using UnityEditor.SceneManagement;
using UnityEngine;
using UnityEngine.Rendering;

/// <summary>Creates the game scene from the approved art, leaving the study scene/build intact.</summary>
public static class RaceSceneBuilder
{
    public const string Scene = "Assets/Study/Scenes/Race.unity";
    [MenuItem("Borrowed Time/Game/Assemble Unity Race Scene")]
    public static void Build()
    {
        var scene=EditorSceneManager.OpenScene(VisualStudyBuilder.Scene,OpenSceneMode.Single);
        EditorSceneManager.SaveScene(scene,Scene,true);
        scene=EditorSceneManager.OpenScene(Scene,OpenSceneMode.Single);
        var pose=UnityEngine.Object.FindFirstObjectByType<GroundedRunnerPose>();
        PrepareRaceMaterials(pose);
        var camera=Camera.main;
        foreach(var controller in UnityEngine.Object.FindObjectsByType<GroundedMotionStudy>(FindObjectsSortMode.None))
            UnityEngine.Object.DestroyImmediate(controller.gameObject);
        foreach(var root in scene.GetRootGameObjects())
            if(root.name.StartsWith("Tunnel /")||root.GetComponent<ParticleSystem>()!=null)
                UnityEngine.Object.DestroyImmediate(root);
        // Preserve the authored light offsets. The receiver moves this camera
        // back to the approved view without changing the runner's light rig.
        camera.transform.position=new Vector3(0,1.95f,-4.7f);
        camera.transform.LookAt(new Vector3(0,1.1f,4.5f));
        camera.fieldOfView=41;
        var world=RaceEnvironmentBaker.Build();
        pose.gameObject.name="Runner template / approved silhouette";
        pose.gameObject.SetActive(false);
        var receiver=new GameObject("BorrowedTimeRaceRenderer").AddComponent<BorrowedTimeRaceRenderer>();
        receiver.runnerTemplate=pose;receiver.followCamera=camera;receiver.world=world;
        receiver.ghostMaterial=GhostMaterial();
        var lights=UnityEngine.Object.FindObjectsByType<Light>(FindObjectsSortMode.None)
            .Where(l=>!l.transform.IsChildOf(camera.transform)).ToArray();
        var lighting=new GameObject("Race / pooled practical lights").AddComponent<RaceLighting>();
        lighting.world=world;
        lighting.exitLight=lights.FirstOrDefault(l=>l.name.StartsWith("Daylight /"));
        lighting.tiledLights=lights.Where(l=>l!=lighting.exitLight).ToArray();
        PlayerSettings.productName="Borrowed Time";
        PlayerSettings.runInBackground=true;
        PlayerSettings.defaultScreenWidth=1280;PlayerSettings.defaultScreenHeight=720;
        EditorSceneManager.SaveScene(scene,Scene);
        AssetDatabase.SaveAssets();
        Debug.Log("Race scene assembled with authoritative JSON receiver: "+Scene);
    }

    // The runtime wardrobe deliberately replaces these imported maps with
    // matte colour. Remove their build dependencies in race-only copies too;
    // otherwise the Web download still carries textures it never displays.
    private static void PrepareRaceMaterials(GroundedRunnerPose pose)
    {
        if(pose==null)throw new InvalidOperationException("The race scene requires its runner template.");
        const string folder="Assets/Study/RaceWorld/Materials/CharacterBuild";
        string parent="Assets";
        foreach(string part in "Study/RaceWorld/Materials/CharacterBuild".Split('/'))
        {
            string next=parent+"/"+part;
            if(!AssetDatabase.IsValidFolder(next))AssetDatabase.CreateFolder(parent,part);
            parent=next;
        }
        var copies=new System.Collections.Generic.Dictionary<Material,Material>();
        foreach(Renderer renderer in pose.GetComponentsInChildren<Renderer>(true))
        {
            string name=renderer.name;
            bool replaced=name=="GEO-snow-head"||name=="GEO-snow-body"||name=="GEO-snow-pants"
                ||name=="GEO-snow-shirt"||name.StartsWith("GEO-snow-shoes",StringComparison.Ordinal);
            if(!replaced)continue;
            Material[] materials=renderer.sharedMaterials;
            for(int i=0;i<materials.Length;i++)
            {
                Material source=materials[i];
                if(source==null)continue;
                if(!copies.TryGetValue(source,out Material copy))
                {
                    string safeName=new string(source.name.Select(c=>char.IsLetterOrDigit(c)||c=='.'||c=='-'||c=='_'?c:'_').ToArray());
                    string guid=AssetDatabase.AssetPathToGUID(AssetDatabase.GetAssetPath(source));
                    string suffix=string.IsNullOrEmpty(guid)?"local":guid.Substring(0,8);
                    string path=folder+"/"+safeName+"-"+suffix+".mat";
                    copy=AssetDatabase.LoadAssetAtPath<Material>(path);
                    if(copy==null)
                    {
                        copy=new Material(source);
                        AssetDatabase.CreateAsset(copy,path);
                    }
                    else EditorUtility.CopySerialized(source,copy);
                    // Keep the original name: RunnerWardrobe uses the skin
                    // material prefix as part of its runtime matching.
                    copy.name=source.name;
                    foreach(string slot in new[]{"_BaseMap","_BumpMap","_MetallicGlossMap","_MainTex"})
                        if(copy.HasProperty(slot))copy.SetTexture(slot,null);
                    // Match the features the runtime QuietSurface/skin pass
                    // leaves enabled. The plain matte variant remains explicitly
                    // referenced by the scene's runtime-material holder.
                    copy.DisableKeyword("_NORMALMAP");
                    copy.DisableKeyword("_METALLICSPECGLOSSMAP");
                    EditorUtility.SetDirty(copy);
                    copies.Add(source,copy);
                }
                materials[i]=copy;
            }
            renderer.sharedMaterials=materials;
            EditorUtility.SetDirty(renderer);
        }
        // Do not strip snow.hair: the hidden bun and visible eyebrows share it.
        // Eye/cornea materials and runtime shader-variant references stay intact.
    }

    private static Material GhostMaterial()
    {
        const string path="Assets/Study/RaceWorld/Materials/Ghost.mat";
        var mat=AssetDatabase.LoadAssetAtPath<Material>(path);
        if(mat==null){mat=new Material(Shader.Find("Universal Render Pipeline/Unlit"));AssetDatabase.CreateAsset(mat,path);}
        mat.SetColor("_BaseColor",new Color(.48f,.72f,.72f,.28f));
        mat.SetFloat("_Surface",1);mat.SetFloat("_ZWrite",0);
        mat.SetFloat("_Cull",2);mat.SetFloat("_AlphaClip",0);
        mat.SetInt("_SrcBlend",(int)BlendMode.SrcAlpha);
        mat.SetInt("_DstBlend",(int)BlendMode.OneMinusSrcAlpha);
        mat.EnableKeyword("_SURFACE_TYPE_TRANSPARENT");
        mat.SetOverrideTag("RenderType","Transparent");mat.renderQueue=3000;
        EditorUtility.SetDirty(mat);return mat;
    }

    [MenuItem("Borrowed Time/Game/Export Unity Race for Web")]
    public static void BuildWeb()
    {
        PlayerSettings.WebGL.compressionFormat=WebGLCompressionFormat.Gzip;
        PlayerSettings.WebGL.decompressionFallback=false;
        var report=BuildPipeline.BuildPlayer(new BuildPlayerOptions {
            scenes=new[]{Scene},locationPathName="Builds/Race",
            target=BuildTarget.WebGL,options=BuildOptions.None
        });
        if(report.summary.result!=BuildResult.Succeeded)
            throw new InvalidOperationException("Race Web build failed: "+report.summary.result);
        Debug.Log("Race Web export succeeded: "+report.summary.totalSize+" bytes");
    }
}
