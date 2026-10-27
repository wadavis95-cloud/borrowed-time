using System;
using System.Collections.Generic;
using System.IO;
using UnityEditor;
using UnityEngine;
using UnityEngine.Rendering;

/// <summary>Bakes scene-referenced race assets without changing the study scene.</summary>
public static class RaceEnvironmentBaker
{
    private const string Root="Assets/Study/RaceWorld";
    private static Material masonry,fracture,steel,dark,warning,pickup,dust;

    public static RaceWorld Build()
    {
        Directory.CreateDirectory(Root+"/Hazards");Directory.CreateDirectory(Root+"/Materials");
        AssetDatabase.Refresh();
        var world=new GameObject("RaceWorld / authoritative course presentation").AddComponent<RaceWorld>();
        var templates=new GameObject("Baked templates / inactive");templates.transform.SetParent(world.transform,false);
        world.interiorTemplate=TunnelArtPass.BuildRaceSegment(false);
        world.interiorTemplate.name="Interior / 50-unit seam-safe template";
        world.interiorTemplate.transform.SetParent(templates.transform,false);
        world.terminalTemplate=TunnelArtPass.BuildRaceSegment(true);
        world.terminalTemplate.name="Terminal / final exit only";
        world.terminalTemplate.transform.SetParent(templates.transform,false);
        masonry=Load("Vault_brick");fracture=Load("Fracture_faces");steel=Load("Blackened_steel");
        dark=Unlit("Gap depth",new Color(.009f,.015f,.018f),false);
        warning=Unlit("Falling masonry warning",new Color(.73f,.39f,.17f,.8f),true);
        pickup=Unlit("Time pickup",new Color(.30f,.55f,.46f),false);
        dust=Unlit("Masonry dust",new Color(.33f,.36f,.34f,.25f),true);
        Texture2D dustMap=AssetDatabase.LoadAssetAtPath<Texture2D>(TunnelArtPass.AssetRoot+"/Dust.png");
        if(dustMap!=null)dust.SetTexture("_BaseMap",dustMap);
        world.rubbleTemplate=MakeRubble("Rubble",templates.transform);
        world.barrierTemplate=MakeBarrier(templates.transform);
        world.gapTemplate=MakeGap(templates.transform);
        world.debrisTemplate=MakeDebris(templates.transform,world.rubbleTemplate);
        world.checkpointTemplate=MakeCheckpoint(templates.transform);
        templates.SetActive(false);
        AssetDatabase.SaveAssets();
        return world;
    }

    private static Material Load(string name)
    {
        Material material=AssetDatabase.LoadAssetAtPath<Material>(TunnelArtPass.AssetRoot+"/Materials/"+name+".mat");
        if(material==null)throw new InvalidOperationException("Missing approved tunnel material "+name);
        return material;
    }
    private static Material Unlit(string name,Color color,bool transparent)
    {
        string path=Root+"/Materials/"+name.Replace(' ','_')+".mat";
        Material material=AssetDatabase.LoadAssetAtPath<Material>(path);
        if(material==null){material=new Material(Shader.Find("Universal Render Pipeline/Unlit"));AssetDatabase.CreateAsset(material,path);}
        material.shader=Shader.Find("Universal Render Pipeline/Unlit");material.shaderKeywords=Array.Empty<string>();
        material.SetColor("_BaseColor",color);material.SetFloat("_Cull",0);material.SetFloat("_Surface",transparent?1:0);
        material.SetFloat("_ZWrite",transparent?0:1);material.SetFloat("_AlphaClip",0);
        material.SetInt("_SrcBlend",(int)(transparent?BlendMode.SrcAlpha:BlendMode.One));
        material.SetInt("_DstBlend",(int)(transparent?BlendMode.OneMinusSrcAlpha:BlendMode.Zero));
        material.SetOverrideTag("RenderType",transparent?"Transparent":"Opaque");material.renderQueue=transparent?3000:2000;
        if(transparent)material.EnableKeyword("_SURFACE_TYPE_TRANSPARENT");
        EditorUtility.SetDirty(material);return material;
    }
    private static GameObject Group(string name,Transform parent)
    {var result=new GameObject(name);result.transform.SetParent(parent,false);return result;}

    private static GameObject MakeRubble(string name,Transform parent)
    {
        GameObject result=Group(name,parent);
        MeshData data=new MeshData(2);
        Shard(data,new Vector3(-.15f,.015f,.08f),new Vector3(.59f,.19f,.48f),-17f);
        Shard(data,new Vector3(.22f,.005f,.04f),new Vector3(.34f,.12f,.39f),25f);
        Shard(data,new Vector3(-.31f,.005f,-.16f),new Vector3(.20f,.06f,.18f),-40f);
        Shard(data,new Vector3(.36f,.005f,.20f),new Vector3(.16f,.05f,.21f),12f);
        MeshObject("Broken masonry",result.transform,data,"Rubble",new[]{masonry,fracture});
        return result;
    }
    private static GameObject MakeBarrier(Transform parent)
    {
        GameObject result=Group("Barrier",parent);
        MeshData data=new MeshData(2);
        // An upright fallen wall section: broad aged faces, thin fresh breaks.
        // Peak is exactly the existing game clearance expressed in render units.
        float height=2.2f*RaceScale.Height;
        Vector2[] outline={new Vector2(-.48f,.01f),new Vector2(.48f,.01f),new Vector2(.46f,height*.69f),
            new Vector2(.35f,height*.76f),new Vector2(.36f,height*.94f),new Vector2(.16f,height),
            new Vector2(.035f,height*.88f),new Vector2(-.08f,height*.92f),new Vector2(-.31f,height*.88f),new Vector2(-.43f,height*.60f)};
        // All top notches are shallow and this polygon is star-shaped from
        // the lower-middle point, so the broad face uses a deliberate fan.
        Vector3 center=new Vector3(0,height*.36f,.02f);
        for(int i=0;i<outline.Length;i++)
        {
            int j=(i+1)%outline.Length;
            Vector3 a=new Vector3(outline[i].x,outline[i].y,.02f),b=new Vector3(outline[j].x,outline[j].y,.02f);
            Vector3 shift=new Vector3(.025f,0,.17f);
            data.Triangle(center,b,a,0);data.Triangle(center+shift,a+shift,b+shift,0);
            data.Quad(a,b,b+shift,a+shift,1);
        }
        Shard(data,new Vector3(-.32f,.003f,-.12f),new Vector3(.25f,.09f,.21f),-12f);
        Shard(data,new Vector3(.31f,.002f,.21f),new Vector3(.20f,.07f,.22f),21f);
        MeshObject("Fractured standing wall",result.transform,data,"Barrier",new[]{masonry,fracture});
        return result;
    }
    private static GameObject MakeGap(Transform parent)
    {
        GameObject result=Group("Gap",parent);
        MeshData hole=new MeshData(1);
        // The dark surface masks the continuous pavement. Its broken rim is
        // flush with the floor, so a gap reads as a hole rather than a wall.
        hole.Quad(new Vector3(-.48f,.013f,0),new Vector3(-.48f,.013f,1),new Vector3(.48f,.013f,1),new Vector3(.48f,.013f,0),0);
        MeshObject("Open floor",result.transform,hole,"GapDepth",new[]{dark},false);
        MeshData rim=new MeshData(2);
        for(int i=0;i<5;i++)
        {
            float x=-.39f+i*.195f;
            Shard(rim,new Vector3(x,.002f,-.017f+(i%2)*.013f),new Vector3(.20f,.035f,.07f),i%2==0?-9:7);
            Shard(rim,new Vector3(x,.002f,1.01f-(i%2)*.012f),new Vector3(.20f,.03f,.06f),i%2==0?12:-4);
        }
        rim.Box(new Vector3(-.50f,.014f,.5f),new Vector3(.045f,.025f,1.04f),0);
        rim.Box(new Vector3(.50f,.014f,.5f),new Vector3(.045f,.025f,1.04f),0);
        MeshObject("Fractured lip",result.transform,rim,"GapRim",new[]{masonry,fracture});
        return result;
    }
    private static GameObject MakeDebris(Transform parent,GameObject rubbleSource)
    {
        GameObject result=Group("Falling debris",parent);
        GameObject warningRoot=Group("Warning",result.transform);
        MeshData ring=new MeshData(1);
        for(int i=0;i<36;i++)
        {
            float a=i*Mathf.PI*2/36,b=(i+1)*Mathf.PI*2/36;
            Vector3 p0=new Vector3(Mathf.Cos(a)*.50f,.024f,Mathf.Sin(a)*.44f),p1=new Vector3(Mathf.Cos(b)*.50f,.024f,Mathf.Sin(b)*.44f);
            Vector3 p2=new Vector3(Mathf.Cos(b)*.43f,.024f,Mathf.Sin(b)*.37f),p3=new Vector3(Mathf.Cos(a)*.43f,.024f,Mathf.Sin(a)*.37f);
            ring.Quad(p0,p1,p2,p3,0);
        }
        ring.Box(new Vector3(0,.023f,0),new Vector3(.035f,.006f,.28f),0);
        ring.Box(new Vector3(0,.023f,0),new Vector3(.28f,.006f,.035f),0);
        MeshObject("Landing warning",warningRoot.transform,ring,"WarningRing",new[]{warning},false);
        GameObject chunk=Group("Chunk",result.transform);
        MeshData masonryChunk=new MeshData(2);
        Shard(masonryChunk,new Vector3(0,-.12f,0),new Vector3(.72f,.45f,.57f),12f);
        Shard(masonryChunk,new Vector3(.30f,.08f,.14f),new Vector3(.16f,.13f,.18f),-30f);
        MeshObject("Falling broken masonry",chunk.transform,masonryChunk,"FallingChunk",new[]{masonry,fracture});
        GameObject rubble=UnityEngine.Object.Instantiate(rubbleSource,result.transform,false);rubble.name="Rubble";
        GameObject cloud=Group("Dust",result.transform);
        MeshData puff=new MeshData(1);
        for(int i=0;i<3;i++)
        {
            Quaternion rotation=Quaternion.Euler(0,i*60,0);
            Vector3 center=new Vector3((i-1)*.13f,.22f,0);
            puff.QuadUv(center+rotation*new Vector3(-.48f,-.22f,0),center+rotation*new Vector3(.48f,-.22f,0),center+rotation*new Vector3(.48f,.50f,0),center+rotation*new Vector3(-.48f,.50f,0),0);
        }
        MeshObject("Impact dust",cloud.transform,puff,"ImpactDust",new[]{dust},false);
        return result;
    }
    private static GameObject MakeCheckpoint(Transform parent)
    {
        GameObject result=Group("Checkpoint",parent);
        MeshData frame=new MeshData(1),glow=new MeshData(1);
        for(int side=-1;side<=1;side+=2)
        {
            frame.Box(new Vector3(side*2.04f,.53f,0),new Vector3(.11f,1.06f,.13f),0);
            glow.Box(new Vector3(side*1.974f,.76f,0),new Vector3(.018f,.38f,.085f),0);
        }
        glow.Box(new Vector3(0,.015f,0),new Vector3(3.95f,.013f,.055f),0);
        MeshObject("Pickup housings",result.transform,frame,"CheckpointHousings",new[]{steel});
        MeshObject("Time pickup light",result.transform,glow,"CheckpointLight",new[]{pickup},false);
        return result;
    }

    private static void Shard(MeshData data,Vector3 origin,Vector3 size,float yaw)
    {
        Vector2[] outline={new Vector2(-.50f,-.26f),new Vector2(-.25f,-.50f),new Vector2(.33f,-.44f),new Vector2(.50f,-.12f),new Vector2(.39f,.40f),new Vector2(.03f,.50f),new Vector2(-.43f,.33f)};
        float[] tops={.67f,.93f,.79f,.56f,.80f,1f,.72f};
        Quaternion rotation=Quaternion.Euler(0,yaw,0);
        Vector3 center=origin+rotation*new Vector3(-size.x*.03f,size.y*.72f,size.z*.03f);
        for(int i=0;i<outline.Length;i++)
        {
            int j=(i+1)%outline.Length;
            Vector3 a=origin+rotation*new Vector3(outline[i].x*size.x,0,outline[i].y*size.z);
            Vector3 b=origin+rotation*new Vector3(outline[j].x*size.x,0,outline[j].y*size.z);
            Vector3 c=origin+rotation*new Vector3(outline[j].x*size.x*.91f,size.y*tops[j],outline[j].y*size.z*.91f);
            Vector3 d=origin+rotation*new Vector3(outline[i].x*size.x*.91f,size.y*tops[i],outline[i].y*size.z*.91f);
            data.Quad(a,d,c,b,i%4==0?1:0);data.Triangle(center,d,c,0);
        }
    }
    private static GameObject MeshObject(string name,Transform parent,MeshData data,string assetName,Material[] materials,bool shadows=true)
    {
        GameObject result=Group(name,parent);Mesh mesh=data.Create(assetName);
        string path=Root+"/Hazards/"+assetName+".asset";Mesh existing=AssetDatabase.LoadAssetAtPath<Mesh>(path);
        if(existing==null)AssetDatabase.CreateAsset(mesh,path);
        else{EditorUtility.CopySerialized(mesh,existing);UnityEngine.Object.DestroyImmediate(mesh);mesh=existing;EditorUtility.SetDirty(existing);}
        result.AddComponent<MeshFilter>().sharedMesh=mesh;
        MeshRenderer renderer=result.AddComponent<MeshRenderer>();renderer.sharedMaterials=materials;
        renderer.shadowCastingMode=shadows?ShadowCastingMode.On:ShadowCastingMode.Off;renderer.receiveShadows=shadows;
        return result;
    }
    private sealed class MeshData
    {
        private readonly List<Vector3> vertices=new List<Vector3>();
        private readonly List<Vector2> uv=new List<Vector2>();
        private readonly List<int>[] triangles;
        public MeshData(int materials){triangles=new List<int>[materials];for(int i=0;i<materials;i++)triangles[i]=new List<int>();}
        public void Triangle(Vector3 a,Vector3 b,Vector3 c,int material)
        {
            int first=vertices.Count;vertices.Add(a);vertices.Add(b);vertices.Add(c);
            uv.Add(new Vector2(a.x,a.y+a.z));uv.Add(new Vector2(b.x,b.y+b.z));uv.Add(new Vector2(c.x,c.y+c.z));
            triangles[material].Add(first);triangles[material].Add(first+1);triangles[material].Add(first+2);
        }
        public void Quad(Vector3 a,Vector3 b,Vector3 c,Vector3 d,int material)
        {Triangle(a,b,c,material);Triangle(a,c,d,material);}
        public void QuadUv(Vector3 a,Vector3 b,Vector3 c,Vector3 d,int material)
        {
            int first=vertices.Count;vertices.Add(a);vertices.Add(b);vertices.Add(c);vertices.Add(d);
            uv.Add(Vector2.zero);uv.Add(Vector2.right);uv.Add(Vector2.one);uv.Add(Vector2.up);
            triangles[material].AddRange(new[]{first,first+1,first+2,first,first+2,first+3});
        }
        public void Box(Vector3 center,Vector3 size,int material)
        {
            Vector3 h=size*.5f;
            Vector3 a=center+new Vector3(-h.x,-h.y,-h.z),b=center+new Vector3(h.x,-h.y,-h.z),c=center+new Vector3(h.x,h.y,-h.z),d=center+new Vector3(-h.x,h.y,-h.z);
            Vector3 e=center+new Vector3(-h.x,-h.y,h.z),f=center+new Vector3(h.x,-h.y,h.z),g=center+new Vector3(h.x,h.y,h.z),j=center+new Vector3(-h.x,h.y,h.z);
            Quad(a,d,c,b,material);Quad(e,f,g,j,material);Quad(a,e,j,d,material);Quad(b,c,g,f,material);Quad(d,j,g,c,material);Quad(a,b,f,e,material);
        }
        public Mesh Create(string name)
        {
            var mesh=new Mesh{name=name,indexFormat=IndexFormat.UInt32};mesh.SetVertices(vertices);mesh.SetUVs(0,uv);mesh.subMeshCount=triangles.Length;
            for(int i=0;i<triangles.Length;i++)mesh.SetTriangles(triangles[i],i);
            mesh.RecalculateNormals();mesh.RecalculateTangents();mesh.RecalculateBounds();return mesh;
        }
    }
}
