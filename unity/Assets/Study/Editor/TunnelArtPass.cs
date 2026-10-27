using System;
using System.Collections.Generic;
using System.IO;
using UnityEditor;
using UnityEngine;
using UnityEngine.Rendering;

/// <summary>
/// Original, self-contained environment art for the separate visual study.
/// Geometry carries the large damage; restrained surface maps carry fine wear.
/// No asset, scene, or service in the multiplayer game is touched.
/// </summary>
public static class TunnelArtPass
{
    public const string AssetRoot = "Assets/Study/VisualPass";
    public const float Length = 50f;
    public static readonly float[] LampZ = { 3f, 14f, 29f, 43f };
    private static System.Random random;
    private static Transform root;
    private static bool raceBake;
    private static string meshFolder;
    private static readonly Dictionary<string, Surface> surfaces = new Dictionary<string, Surface>();
    private sealed class Surface
    {
        public Material material;
        public readonly List<Vector3> vertices = new List<Vector3>();
        public readonly List<Vector3> normals = new List<Vector3>();
        public readonly List<Vector2> uv = new List<Vector2>();
        public readonly List<int> triangles = new List<int>();
    }

    public static GameObject Build() { return BuildInternal(false,true); }

    // Separate mesh assets preserve the approved study. Race scenery has no
    // authored lane hazards; those must come from the authoritative course.
    public static GameObject BuildRaceSegment(bool terminal)
    { return BuildInternal(true,terminal); }

    private static GameObject BuildInternal(bool forRace,bool terminal)
    {
        raceBake=forRace;
        meshFolder=forRace ? "Assets/Study/RaceWorld/"+(terminal?"Terminal":"Interior") : AssetRoot+"/Meshes";
        Directory.CreateDirectory(meshFolder);
        Directory.CreateDirectory(AssetRoot + "/Meshes");
        Directory.CreateDirectory(AssetRoot + "/Materials");
        Directory.CreateDirectory(AssetRoot + "/Textures");
        AssetDatabase.Refresh();
        random = new System.Random(27183);
        surfaces.Clear();
        root = new GameObject("Tunnel / weathered transit passage").transform;
        DefineMaterials();
        BuildShell();
        BuildStructuralRibs();
        BuildMaintenanceBay();
        BuildServices();
        BuildDamage();
        BuildSurfaceHistory();
        if(terminal)BuildExit();
        if(forRace)CropRaceSurfaces(0f,terminal?float.PositiveInfinity:50f);
        SaveSurfaces();
        AssetDatabase.SaveAssets();
        return root.gameObject;
    }

    private static void DefineMaterials()
    {
        AddSurface("Vault brick", MakeMaterial("Vault brick", new Color(.62f,.60f,.54f), 0f,.10f, "Brick", 0));
        AddSurface("Lower wall plaster", MakeMaterial("Lower wall plaster", new Color(.68f,.69f,.64f),0f,.12f,"Concrete",1));
        AddSurface("Worn concrete floor", MakeMaterial("Worn concrete floor",new Color(.57f,.60f,.59f),0f,.20f,"Concrete",2));
        AddSurface("Cut stone ribs", MakeMaterial("Cut stone ribs",new Color(.39f,.415f,.405f),0f,.10f,null,3));
        AddSurface("Fracture faces", MakeMaterial("Fracture faces",new Color(.42f,.445f,.425f),0f,.07f,null,3));
        AddSurface("Blackened steel", MakeMaterial("Blackened steel",new Color(.095f,.115f,.12f),.65f,.28f,null,4));
        AddSurface("Oxide steel", MakeMaterial("Oxide steel",new Color(.20f,.135f,.09f),.35f,.17f,null,4));
        AddSurface("Dark joints", MakeMaterial("Dark joints",new Color(.055f,.065f,.06f),0f,.04f,null,3));
        AddSurface("Wet concrete", MakeWetMaterial());
        AddSurface("Distant structure", MakeMaterial("Distant structure",new Color(.115f,.155f,.165f),0f,.06f,null,3));
        AddSurface("Lamp glass", MakeMaterial("Lamp glass",new Color(.71f,.74f,.68f),0f,.4f,null,-1,new Color(1.0f,1.04f,.89f)*2.2f));
        AddSurface("Emergency red", MakeMaterial("Emergency red",new Color(.32f,.055f,.028f),0f,.2f,null,-1,new Color(.8f,.055f,.016f)*1.3f));
        AddSurface("Damp staining", MakeStain());
        AddSurface("Exit atmosphere", MakeExitMaterial());
        // Distance is art-directed here: these quiet silhouettes must remain
        // readable inside the small exit aperture instead of being erased by
        // the tunnel's exponential fog. Their values approach the haze in depth.
        AddSurface("Exit silhouette near",MakeSilhouetteMaterial("Exit silhouette near",new Color(.14f,.19f,.20f)));
        AddSurface("Exit silhouette middle",MakeSilhouetteMaterial("Exit silhouette middle",new Color(.24f,.30f,.31f)));
        AddSurface("Exit silhouette far",MakeSilhouetteMaterial("Exit silhouette far",new Color(.36f,.43f,.44f)));
    }

    private static void AddSurface(string name, Material material) { surfaces[name] = new Surface { material = material }; }

    private static Material MakeMaterial(string name, Color tint, float metal, float smooth, string external, int textureKind, Color? emission=null)
    {
        string path = AssetRoot + "/Materials/" + Safe(name) + ".mat";
        Material mat = AssetDatabase.LoadAssetAtPath<Material>(path);
        if (mat == null) { mat = new Material(Shader.Find("Universal Render Pipeline/Lit")); AssetDatabase.CreateAsset(mat,path); }
        mat.name = name;
        mat.shader = Shader.Find("Universal Render Pipeline/Lit");
        mat.shaderKeywords = Array.Empty<string>();
        mat.SetTexture("_BaseMap",null);mat.SetTexture("_BumpMap",null);mat.SetTexture("_MetallicGlossMap",null);
        mat.SetFloat("_Surface",0f);mat.SetFloat("_ZWrite",1f);mat.SetInt("_SrcBlend",(int)BlendMode.One);mat.SetInt("_DstBlend",(int)BlendMode.Zero);
        mat.SetOverrideTag("RenderType","Opaque");mat.renderQueue=2000;
        mat.SetColor("_EmissionColor",Color.black);mat.globalIlluminationFlags=MaterialGlobalIlluminationFlags.EmissiveIsBlack;
        mat.SetColor("_BaseColor",tint);
        mat.SetFloat("_Metallic",metal);
        mat.SetFloat("_Smoothness",smooth);
        mat.SetFloat("_SpecularHighlights",1f);
        if (textureKind >= 0)
        {
            Texture2D a = null, n = null, m = null;
            if (!string.IsNullOrEmpty(external))
            {
                a = AssetDatabase.LoadAssetAtPath<Texture2D>(AssetRoot+"/External/"+external+"_Base.png");
                n = AssetDatabase.LoadAssetAtPath<Texture2D>(AssetRoot+"/External/"+external+"_Normal.png");
                m = AssetDatabase.LoadAssetAtPath<Texture2D>(AssetRoot+"/External/"+external+"_Mask.png");
            }
            if (a == null) MakeSurfaceMaps(name,textureKind,metal,smooth,out a,out n,out m);
            // Broad value masses carry this stylization pass. Keep the original
            // scanned variation as a restrained undertone, with micro-relief
            // well below the architectural silhouettes in the visual hierarchy.
            mat.SetTexture("_BaseMap",QuietSurface(a,name,textureKind));
            if (n != null) { mat.SetTexture("_BumpMap",n); mat.SetFloat("_BumpScale",textureKind==0 ? .14f : textureKind==2 ? .11f : .045f); mat.EnableKeyword("_NORMALMAP"); }
            if (m != null) { mat.SetTexture("_MetallicGlossMap",m);mat.SetFloat("_Smoothness",1f);mat.EnableKeyword("_METALLICSPECGLOSSMAP"); }
        }
        if (emission.HasValue) { mat.SetColor("_EmissionColor",emission.Value);mat.EnableKeyword("_EMISSION");mat.globalIlluminationFlags=MaterialGlobalIlluminationFlags.BakedEmissive; }
        EditorUtility.SetDirty(mat);
        return mat;
    }

    private static Texture2D QuietSurface(Texture2D original,string name,int kind)
    {
        string source=AssetDatabase.GetAssetPath(original);
        if(string.IsNullOrEmpty(source)||!File.Exists(source))return original;
        var read=new Texture2D(2,2,TextureFormat.RGBA32,false,true);
        if(!ImageConversion.LoadImage(read,File.ReadAllBytes(source))){UnityEngine.Object.DestroyImmediate(read);return original;}
        const int size=256;Color[] pixels=new Color[size*size];
        float contrast=kind==2?.44f:kind==4?.28f:.22f;
        for(int y=0;y<size;y++)for(int x=0;x<size;x++)
        {
            float u=(x+.5f)/size,v=(y+.5f)/size,d=.0025f;
            Color c=(read.GetPixelBilinear(u-d,v-d)+read.GetPixelBilinear(u+d,v-d)+read.GetPixelBilinear(u-d,v+d)+read.GetPixelBilinear(u+d,v+d))*.25f;
            float l=.59f+(c.grayscale-.59f)*contrast;
            Color quiet=Color.Lerp(new Color(l,l,l,1),new Color(c.r,c.g,c.b,1),.08f);
            pixels[y*size+x]=quiet;
        }
        UnityEngine.Object.DestroyImmediate(read);
        return SaveTexture("Quiet_"+Safe(name),pixels,size,false,true);
    }

    private static Material MakeWetMaterial()
    {
        Material m=MakeMaterial("Wet concrete",new Color(.12f,.125f,.12f,.62f),0f,.42f,null,-1);
        const int size=128;Color[] pixels=new Color[size*size];
        for(int y=0;y<size;y++)for(int x=0;x<size;x++)
        {
            float u=x/(float)(size-1),v=y/(float)(size-1);
            float angle=Mathf.Atan2(v-.5f,u-.5f),radius=Vector2.Distance(new Vector2(u,v),Vector2.one*.5f)*2;
            float edgeRadius=.78f+.08f*Mathf.Sin(angle*5+.4f)+.05f*Mathf.Sin(angle*9+1.4f);
            float alpha=(1-Edge(edgeRadius-.18f,edgeRadius,radius))*(.75f+.25f*Mathf.PerlinNoise(u*8,v*8));
            pixels[y*size+x]=new Color(1,1,1,alpha);
        }
        m.SetTexture("_BaseMap",SaveTexture("WetEdge",pixels,size,false,false));
        m.SetFloat("_Surface",1);m.SetFloat("_Blend",0);m.SetFloat("_ZWrite",0);
        m.SetInt("_SrcBlend",(int)BlendMode.SrcAlpha);m.SetInt("_DstBlend",(int)BlendMode.OneMinusSrcAlpha);
        m.SetFloat("_EnvironmentReflections",0f);m.EnableKeyword("_ENVIRONMENTREFLECTIONS_OFF");
        m.EnableKeyword("_SURFACE_TYPE_TRANSPARENT");m.SetOverrideTag("RenderType","Transparent");m.renderQueue=3000;
        return m;
    }

    private static Material MakeExitMaterial()
    {
        string path=AssetRoot+"/Materials/Exit_atmosphere.mat";
        Shader shader=Shader.Find("BorrowedTime/AtmosphericBackdrop");
        if(shader==null)throw new InvalidOperationException("Copy AtmosphericBackdrop.shader into Assets/Study/Shaders before building the visual pass.");
        Material m=AssetDatabase.LoadAssetAtPath<Material>(path);
        if(m==null){m=new Material(shader);AssetDatabase.CreateAsset(m,path);}else m.shader=shader;
        const int size=128;Color[] pixels=new Color[size*size];
        for(int y=0;y<size;y++)for(int x=0;x<size;x++)
        {
            float u=x/(float)(size-1),v=y/(float)(size-1);
            float horizon=Mathf.Exp(-Mathf.Pow((v-.23f)/.24f,2));
            Color low=new Color(.46f,.53f,.525f),high=new Color(.25f,.355f,.39f);
            Color color=Color.Lerp(low,high,Edge(.22f,.95f,v));
            color+=new Color(.09f,.08f,.055f)*horizon;
            color*=.90f+.10f*Mathf.PerlinNoise(u*6,v*9);
            pixels[y*size+x]=color;
        }
        m.SetTexture("_BaseMap",SaveTexture("ExitGradient",pixels,size,false,true));
        m.SetColor("_BaseColor",Color.white);EditorUtility.SetDirty(m);return m;
    }

    private static Material MakeSilhouetteMaterial(string name,Color color)
    {
        Shader shader=Shader.Find("BorrowedTime/AtmosphericBackdrop");
        if(shader==null)throw new InvalidOperationException("AtmosphericBackdrop.shader is required for the exit layers.");
        string path=AssetRoot+"/Materials/"+Safe(name)+".mat";
        Material material=AssetDatabase.LoadAssetAtPath<Material>(path);
        if(material==null){material=new Material(shader);AssetDatabase.CreateAsset(material,path);}else material.shader=shader;
        material.SetTexture("_BaseMap",Texture2D.whiteTexture);
        material.SetColor("_BaseColor",color);EditorUtility.SetDirty(material);return material;
    }

    private static Material MakeStain()
    {
        Material m = MakeMaterial("Damp staining",new Color(.055f,.08f,.065f,.53f),0f,.2f,null,-1);
        const int size=128;
        Color[] pixels = new Color[size*size];
        for(int y=0;y<size;y++)for(int x=0;x<size;x++)
        {
            float u=x/(float)(size-1),v=y/(float)(size-1);
            float side=Mathf.Pow(Mathf.Sin(u*Mathf.PI),.65f);
            float edge=Mathf.SmoothStep(0f,1f,Mathf.Min(v,1f-v)*9f);
            float streak=.35f+.65f*Mathf.PerlinNoise(u*17f+3f,v*2.5f);
            pixels[y*size+x]=new Color(1,1,1,side*edge*streak);
        }
        m.SetTexture("_BaseMap",SaveTexture("DampAlpha",pixels,size,false,false));
        m.SetFloat("_Surface",1f);m.SetFloat("_Blend",0f);m.SetFloat("_ZWrite",0f);
        m.SetInt("_SrcBlend",(int)BlendMode.SrcAlpha);m.SetInt("_DstBlend",(int)BlendMode.OneMinusSrcAlpha);
        m.EnableKeyword("_SURFACE_TYPE_TRANSPARENT");m.SetOverrideTag("RenderType","Transparent");m.renderQueue=3000;
        return m;
    }

    private static void MakeSurfaceMaps(string name,int kind,float metal,float smooth,out Texture2D albedo,out Texture2D normal,out Texture2D mask)
    {
        const int size=512;
        float[] h = new float[size*size];
        Color[] a=new Color[h.Length],n=new Color[h.Length],m=new Color[h.Length];
        for(int y=0;y<size;y++)for(int x=0;x<size;x++)
        {
            float u=x/(float)size,v=y/(float)size;
            float broad=TileNoise(u,v,5f),grain=TileNoise(u,v,81f),fine=TileNoise(u,v,175f);
            float height=grain*.020f+fine*.006f;
            float brightness=.76f+broad*.19f+grain*.08f;
            float polish=smooth*(.68f+.50f*broad);
            if(kind==0)
            {
                float rows=v*8f;int row=Mathf.FloorToInt(rows);
                float bx=Mathf.Repeat(u*3f+(row%2)*.5f,1f),by=Mathf.Repeat(rows,1f);
                float boundary=Mathf.Min(Mathf.Min(bx,1-bx)*.67f,Mathf.Min(by,1-by)*.25f);
                float mortar=1-Edge(0,.016f,boundary);
                float brickVariation=Mathf.PerlinNoise(Mathf.Floor(u*3f+(row%2)*.5f)*3.81f,row*2.18f);
                height+=.055f*(1-mortar);brightness=(.70f+.25f*brickVariation+grain*.08f)*(1-.23f*mortar);
                polish=.09f*(1-.5f*mortar);
            }
            else if(kind==1)
            {
                float pits=Edge(.66f,.79f,grain);height-=.026f*pits;
                brightness-=pits*.08f;
            }
            else if(kind==2)
            {
                float aggregate=Edge(.62f,.76f,fine);height-=.012f*aggregate;
                brightness-=aggregate*.035f;polish+=.07f*Edge(.58f,.76f,broad);
            }
            else if(kind==4)
            {
                float rust=Edge(.50f,.70f,broad);height+=.020f*rust*grain;
                brightness=.63f+grain*.11f+rust*.19f;polish*=1-.65f*rust;
            }
            h[y*size+x]=height;
            a[y*size+x]=new Color(brightness,brightness,brightness,1);
            m[y*size+x]=new Color(metal,0,0,Mathf.Clamp01(polish));
        }
        for(int y=0;y<size;y++)for(int x=0;x<size;x++)
        {
            float dx=h[y*size+(x+1)%size]-h[y*size+(x+size-1)%size];
            float dy=h[((y+1)%size)*size+x]-h[((y+size-1)%size)*size+x];
            Vector3 v=new Vector3(-dx*size*.24f,-dy*size*.24f,1).normalized;
            n[y*size+x]=new Color(v.x*.5f+.5f,v.y*.5f+.5f,v.z*.5f+.5f,1);
        }
        albedo=SaveTexture(Safe(name)+"_Color",a,size,false,true);
        normal=SaveTexture(Safe(name)+"_Normal",n,size,true,false);
        mask=SaveTexture(Safe(name)+"_MetalSmooth",m,size,false,false);
    }

    private static float TileNoise(float u,float v,float scale)
    {
        float a=Mathf.PerlinNoise(u*scale+17,v*scale+9),b=Mathf.PerlinNoise((u-1)*scale+17,v*scale+9);
        float c=Mathf.PerlinNoise(u*scale+17,(v-1)*scale+9),d=Mathf.PerlinNoise((u-1)*scale+17,(v-1)*scale+9);
        return Mathf.Lerp(Mathf.Lerp(a,b,u),Mathf.Lerp(c,d,u),v);
    }

    private static Texture2D SaveTexture(string name,Color[] pixels,int size,bool isNormal,bool srgb)
    {
        string path=AssetRoot+"/Textures/"+name+".png";
        Texture2D texture=new Texture2D(size,size,TextureFormat.RGBA32,false,true);
        texture.SetPixels(pixels);texture.Apply();File.WriteAllBytes(path,texture.EncodeToPNG());UnityEngine.Object.DestroyImmediate(texture);
        AssetDatabase.ImportAsset(path,ImportAssetOptions.ForceSynchronousImport);
        TextureImporter importer=(TextureImporter)AssetImporter.GetAtPath(path);
        importer.textureType=isNormal?TextureImporterType.NormalMap:TextureImporterType.Default;
        importer.sRGBTexture=srgb;importer.alphaSource=TextureImporterAlphaSource.FromInput;
        importer.wrapMode=TextureWrapMode.Repeat;importer.mipmapEnabled=true;importer.maxTextureSize=1024;
        importer.SaveAndReimport();
        return AssetDatabase.LoadAssetAtPath<Texture2D>(path);
    }

    private static void BuildShell()
    {
        // Continuous ground: no tiled checkerboard and no mechanically repeated
        // bevels. Height changes stay small enough for planted feet to read.
        for(float z=-8;z<51;z+=2f)for(int xi=0;xi<8;xi++)
        {
            float x0=-3.2f+xi*.8f,x1=x0+.8f,z1=Mathf.Min(51,z+2);
            Quad("Worn concrete floor",Floor(x0,z),Floor(x1,z),Floor(x1,z1),Floor(x0,z1),Vector3.up,
                new Vector2(x0/2.4f,z/2.4f),new Vector2(x1/2.4f,z1/2.4f),true);
        }
        for(float z=-8;z<50;z+=2f)
        {
            for(int side=-1;side<=1;side+=2)
            {
                float x=side*3.2f;
                // A real recess interrupts the left-hand wall. Its returns and
                // back wall are built below, so there is no view into a void.
                if(side==-1 && z>=8f && z<12f)continue;
                Quad("Vault brick",new Vector3(x,0,z),new Vector3(x,2.5f,z),new Vector3(x,2.5f,z+2),new Vector3(x,0,z+2),Vector3.left*side,new Vector2(z/2,0),new Vector2((z+2)/2,1.25f));
                // Localized plaster loss follows the impact zones instead of
                // repeating the same neat band through the whole passage.
                float face=x-side*.014f;
                for(int section=0;section<2;section++)
                {
                    float za=z+section,zb=za+1f;
                    float topA=PlasterHeight(side,za),topB=PlasterHeight(side,zb);
                    float bottomA=.08f+.06f*Mathf.PerlinNoise(za*1.8f,side+4),bottomB=.08f+.06f*Mathf.PerlinNoise(zb*1.8f,side+4);
                    Quad("Lower wall plaster",new Vector3(face,bottomA,za),new Vector3(face,topA,za),new Vector3(face,topB,zb),new Vector3(face,bottomB,zb),Vector3.left*side,new Vector2(za/2.5f,0),new Vector2(zb/2.5f,.65f));
                    Quad("Fracture faces",new Vector3(face,topA,za),new Vector3(x,topA+.025f,za),new Vector3(x,topB+.025f,zb),new Vector3(face,topB,zb),Vector3.up,new Vector2(za,0),new Vector2(zb,.025f));
                }
            }
            for(int j=0;j<32;j++)
            {
                // Missing vault above the second obstacle. Steel/rebar and
                // the jagged break silhouette make actual structural damage.
                if((z>=20 && z<22 && j>=9 && j<=13) || (z>=22 && z<24 && j>=8 && j<=12))continue;
                float a=j*Mathf.PI/32,b=(j+1)*Mathf.PI/32;
                Vector3 p0=Arch(a,z),p1=Arch(b,z),p2=Arch(b,z+2),p3=Arch(a,z+2);
                Vector3 inward=new Vector3(-Mathf.Cos((a+b)*.5f),-Mathf.Sin((a+b)*.5f)*1.28f,0).normalized;
                Quad("Vault brick",p0,p1,p2,p3,inward,new Vector2(z/2f,a*3.2f/2f),new Vector2((z+2)/2f,b*3.2f/2f));
            }
        }
        // Recessed drainage channels visually ground the wall/floor junction.
        for(int side=-1;side<=1;side+=2)
        {
            Box("Dark joints",new Vector3(side*2.88f,-.025f,21.5f),new Vector3(.22f,.06f,59));
            Box("Blackened steel",new Vector3(side*2.74f,.015f,21.5f),new Vector3(.025f,.035f,59));
            // A few broad inspection covers punctuate the channel. The former
            // hundreds of repeated bars competed with the large arch masses.
            for(float z=-6.0f;z<50;z+=7.7f)
            {
                if((side==1 && z>21.5f && z<25.2f)||(side==-1 && z>35.0f&&z<37.0f))continue;
                Box("Blackened steel",new Vector3(side*2.88f,.006f,z),new Vector3(.21f,.018f,.58f));
                Box("Dark joints",new Vector3(side*2.88f,.017f,z),new Vector3(.12f,.004f,.025f));
            }
            for(int i=0;i<13;i++)
            {
                float z=-5+i*4.1f;
                float length=R(.6f,1.9f),height=R(.035f,.095f);
                Quad("Vault brick",new Vector3(side*3.19f,height,z),new Vector3(side*2.99f,-.012f,z+.08f),new Vector3(side*2.99f,-.012f,z+length),new Vector3(side*3.19f,height*.65f,z+length+.04f),new Vector3(-side,.7f,0),Vector2.zero,new Vector2(.2f,length));
            }
        }
    }

    private static float PlasterHeight(int side,float z)
    {
        float intact=(side<0?2.04f:1.87f)+.035f*Mathf.PerlinNoise(z*.24f,side+8);
        float damage=side>0?Mathf.Exp(-Mathf.Pow((z-23f)/3.2f,4)):Mathf.Exp(-Mathf.Pow((z-36f)/2.3f,4))*.72f;
        return Mathf.Lerp(intact,.27f+.34f*Mathf.PerlinNoise(z*2.6f,side+3),damage);
    }

    private static Vector3 Floor(float x,float z)
    {
        float edge=Edge(1.5f,3.2f,Mathf.Abs(x));
        return new Vector3(x,-.026f+edge*(Mathf.PerlinNoise(x*1.3f+9,z*.8f)*.018f-.009f),z);
    }
    private static Vector3 Arch(float angle,float z,float inset=0)
    { return new Vector3(Mathf.Cos(angle)*(3.2f-inset),2.5f+Mathf.Sin(angle)*(2.5f-inset),z); }

    private static void BuildStructuralRibs()
    {
        // Five major structural masses replace the cadence of eight thin ribs.
        // The width, depth, and broad planar faces deliberately dwarf the runner.
        float[] stations={-4.5f,7.2f,20.8f,35.7f,48.3f};
        for(int index=0;index<stations.Length;index++)
        {
            float z=stations[index],depth=index==2?1.12f:index==4?1.04f:.88f;
            for(int s=-1;s<=1;s+=2)
            {
                Box("Cut stone ribs",new Vector3(s*2.94f,.22f,z),new Vector3(.70f,.44f,depth+.20f));
                if(s==1 && index==2)
                {
                    Box("Cut stone ribs",new Vector3(s*2.96f,.52f,z),new Vector3(.54f,.17f,depth));
                    Box("Cut stone ribs",new Vector3(s*2.98f,2.32f,z+.09f),new Vector3(.52f,.36f,depth));
                    continue;
                }
                float slant=index==3&&s<0?.24f:0f;
                PierMass(s,z,.44f,2.48f,depth,slant);
                Box("Cut stone ribs",new Vector3(s*2.93f,2.44f,z+slant),new Vector3(.72f,.24f,depth+.16f));
            }
            const int segments=9;
            for(int j=0;j<segments;j++)
            {
                float a=j*Mathf.PI/segments+.006f,b=(j+1)*Mathf.PI/segments-.006f;
                if(index==2&&(j==2||j==3))continue;
                float inset=j==4?.48f:.39f+(j%3==0?.035f:0);
                float leanA=index==3?.20f*Mathf.Sin(a):0,leanB=index==3?.20f*Mathf.Sin(b):0;
                Vector3 p0=Arch(a,z-depth*.5f+leanA,inset),p1=Arch(b,z-depth*.5f+leanB,inset),p2=Arch(b,z+depth*.5f+leanB,inset),p3=Arch(a,z+depth*.5f+leanA,inset);
                Vector3 normal=new Vector3(-Mathf.Cos((a+b)*.5f),-Mathf.Sin((a+b)*.5f),0);
                Quad("Cut stone ribs",p0,p1,p2,p3,normal,Vector2.zero,new Vector2(1f,depth));
                Quad("Cut stone ribs",p0,Arch(a,z-depth*.5f+leanA),Arch(b,z-depth*.5f+leanB),p1,Vector3.back,Vector2.zero,Vector2.one);
                Quad("Cut stone ribs",p3,p2,Arch(b,z+depth*.5f+leanB),Arch(a,z+depth*.5f+leanA),Vector3.forward,Vector2.zero,Vector2.one);
                Quad("Dark joints",p0,p3,Arch(a,z+depth*.5f+leanA),Arch(a,z-depth*.5f+leanA),new Vector3(Mathf.Sin(a),-Mathf.Cos(a),0),Vector2.zero,Vector2.one);
                Quad("Dark joints",p1,Arch(b,z-depth*.5f+leanB),Arch(b,z+depth*.5f+leanB),p2,new Vector3(-Mathf.Sin(b),Mathf.Cos(b),0),Vector2.zero,Vector2.one);
            }
        }
    }

    private static void PierMass(int side,float z,float bottom,float top,float depth,float slant)
    {
        Vector3 a=new Vector3(side*2.69f,bottom,z-depth*.5f),b=new Vector3(side*3.22f,bottom,z-depth*.5f);
        Vector3 c=new Vector3(side*3.22f,top,z-depth*.5f+slant),d=new Vector3(side*2.78f,top,z-depth*.5f+slant);
        Vector3 shift=Vector3.forward*depth;
        Quad("Cut stone ribs",a,b,c,d,Vector3.back,Vector2.zero,new Vector2(.53f,top-bottom));
        Quad("Cut stone ribs",a+shift,d+shift,c+shift,b+shift,Vector3.forward,Vector2.zero,new Vector2(.53f,top-bottom));
        Quad("Cut stone ribs",a,d,d+shift,a+shift,Vector3.left*side,Vector2.zero,new Vector2(depth,top-bottom));
        Quad("Cut stone ribs",d,c,c+shift,d+shift,Vector3.up,Vector2.zero,Vector2.one);
    }

    private static void BuildMaintenanceBay()
    {
        // A sheltered service recess supplies a different silhouette and a
        // quiet interval before the roof collapse. All geometry retreats away
        // from the three lanes and the comparison camera paths.
        Quad("Vault brick",new Vector3(-4.05f,0,8),new Vector3(-4.05f,2.5f,8),new Vector3(-4.05f,2.5f,12),new Vector3(-4.05f,0,12),Vector3.right,Vector2.zero,new Vector2(2,1.25f));
        Quad("Cut stone ribs",new Vector3(-3.2f,0,8),new Vector3(-3.2f,2.5f,8),new Vector3(-4.05f,2.5f,8),new Vector3(-4.05f,0,8),Vector3.forward,Vector2.zero,new Vector2(.85f,2.5f));
        Quad("Cut stone ribs",new Vector3(-4.05f,0,12),new Vector3(-4.05f,2.5f,12),new Vector3(-3.2f,2.5f,12),new Vector3(-3.2f,0,12),Vector3.back,Vector2.zero,new Vector2(.85f,2.5f));
        Quad("Dark joints",new Vector3(-4.05f,2.5f,8),new Vector3(-3.2f,2.5f,8),new Vector3(-3.2f,2.5f,12),new Vector3(-4.05f,2.5f,12),Vector3.down,Vector2.zero,new Vector2(.85f,4));
        Quad("Worn concrete floor",new Vector3(-4.05f,-.025f,8),new Vector3(-3.2f,-.025f,8),new Vector3(-3.2f,-.025f,12),new Vector3(-4.05f,-.025f,12),Vector3.up,Vector2.zero,new Vector2(.85f,4),true);
        Box("Blackened steel",new Vector3(-4.015f,1.09f,9.55f),new Vector3(.04f,2.18f,1.28f));
        for(int s=-1;s<=1;s+=2)
            Box("Oxide steel",new Vector3(-3.97f,1.1f,9.55f+s*.66f),new Vector3(.09f,2.20f,.045f));
        Box("Oxide steel",new Vector3(-3.97f,2.21f,9.55f),new Vector3(.09f,.06f,1.37f));
        for(int i=0;i<5;i++)Box("Dark joints",new Vector3(-3.981f,1.78f+i*.055f,9.55f),new Vector3(.012f,.025f,.66f));
        Cylinder("Blackened steel",new Vector3(-3.90f,.93f,9.08f),new Vector3(-3.90f,1.20f,9.08f),.018f,8);
        Box("Distant structure",new Vector3(-3.83f,.44f,11.25f),new Vector3(.30f,.88f,.48f));
        Box("Oxide steel",new Vector3(-3.65f,.43f,11.25f),new Vector3(.035f,.78f,.40f));
    }

    private static void BuildServices()
    {
        for(int side=-1;side<=1;side+=2)
        {
            float x=side*2.97f;
            for(int p=0;p<1;p++)
            {
                float y=1.95f+p*.23f;
                for(float z=-8;z<50;z+=4f)
                {
                    if(side==1 && z>=20 && z<28)continue;
                    if(side==-1 && z>=8 && z<12)continue;
                    Cylinder("Blackened steel",new Vector3(x,y,z),new Vector3(x,y,Mathf.Min(50,z+3.98f)),p==0?.047f:.034f,12);
                    if(Mathf.Repeat(z+8,8f)<.01f)
                        Cylinder("Oxide steel",new Vector3(x,y,z-.027f),new Vector3(x,y,z+.027f),p==0?.061f:.047f,12);
                }
                if(side==-1)
                {
                    float overhead=2.63f+p*.18f;
                    Cylinder("Blackened steel",new Vector3(x,y,8),new Vector3(x,overhead,8.28f),p==0?.047f:.034f,12);
                    Cylinder("Blackened steel",new Vector3(x,overhead,8.28f),new Vector3(x,overhead,11.72f),p==0?.047f:.034f,12);
                    Cylinder("Blackened steel",new Vector3(x,overhead,11.72f),new Vector3(x,y,12),p==0?.047f:.034f,12);
                }
            }
            for(float z=-6;z<50;z+=8.2f)
            {
                if((side==1 && z>20&&z<28)||(side==-1&&z>8&&z<12))continue;
                Box("Blackened steel",new Vector3(side*3.08f,2.05f,z),new Vector3(.23f,.035f,.045f));
                Box("Oxide steel",new Vector3(side*3.16f,2.05f,z),new Vector3(.025f,.39f,.11f));
            }
            // One asymmetrical cable run remains; duplicated fine lines on
            // both walls made the original corridor look diagrammatic.
            if(side<0)continue;
            Vector3 prev=new Vector3(side*2.95f,3.02f,-8);
            for(float z=-7f;z<=50;z+=1f)
            {
                float collapseSag=side>0?.72f*Mathf.Exp(-Mathf.Pow((z-23f)/2.0f,2)):0;
                Vector3 next=new Vector3(side*2.95f,3.02f-.13f*Mathf.Sin(Mathf.Repeat(z+8,7f)/7f*Mathf.PI)-collapseSag,z);
                Cylinder("Dark joints",prev,next,.019f,6);prev=next;
            }
        }
        for(int i=0;i<LampZ.Length;i++)
        {
            int s=i%2==0?-1:1;float z=LampZ[i];
            Box("Blackened steel",new Vector3(s*2.94f,2.67f,z),new Vector3(.23f,.15f,.85f));
            Box("Lamp glass",new Vector3(s*2.80f,2.64f,z),new Vector3(.04f,.065f,.64f));
            for(int bar=0;bar<2;bar++)Box("Blackened steel",new Vector3(s*2.77f,2.64f,z-.22f+bar*.44f),new Vector3(.035f,.12f,.025f));
        }
        Box("Blackened steel",new Vector3(-3.10f,1.17f,14.5f),new Vector3(.14f,.65f,.52f));
        Box("Oxide steel",new Vector3(-3.015f,1.18f,14.5f),new Vector3(.025f,.53f,.43f));
        Box("Emergency red",new Vector3(-2.99f,1.37f,14.38f),new Vector3(.015f,.035f,.045f));
        // The repaired section has a different construction vocabulary: narrow
        // steel straps and a cable tray, rather than another stone arch copy.
        for(int i=0;i<3;i++)
        {
            float z=33.4f+i*.55f;
            Cylinder("Blackened steel",new Vector3(-2.83f,3.35f,z),new Vector3(-2.12f,4.27f,z),.025f,8);
        }
        Cylinder("Blackened steel",new Vector3(-2.20f,4.20f,32.6f),new Vector3(-2.20f,4.20f,37.2f),.035f,8);
        Cylinder("Dark joints",new Vector3(-2.26f,4.20f,32.6f),new Vector3(-2.26f,4.20f,37.2f),.022f,8);
    }

    private static void BuildDamage()
    {
        // These are pieces of the tunnel's construction: thin dark masonry
        // plates with narrow fresh break faces, not pale beveled obstacle cubes.
        if(!raceBake)
        {
        FallenWallFragment(new Vector3(0,.030f,5.87f),1.06f,.64f,.12f,18f,12f);
        FallenWallFragment(new Vector3(-.03f,.060f,11.72f),1.12f,.62f,.12f,72f,2f);
        FallenWallFragment(new Vector3(.02f,.040f,19.88f),.97f,.57f,.13f,24f,-17f);
        FracturedSlab(new Vector3(.22f,.002f,6.12f),new Vector3(.36f,.13f,.32f),-10,false,"Vault brick","Vault brick");
        FracturedSlab(new Vector3(-.18f,.001f,20.12f),new Vector3(.32f,.11f,.30f),15,false,"Vault brick","Vault brick");
        FracturedSlab(new Vector3(-1.92f,.01f,31),new Vector3(.76f,.34f,.90f),27,true);
        FracturedSlab(new Vector3(2.05f,.01f,39),new Vector3(.80f,.42f,.63f),-16,true);
        }
        // Rubble belongs to specific failures. Broad quiet ground between the
        // clusters makes the debris scale and the runner's route readable.
        RubbleCluster(-1,10.8f,1.2f,2);
        RubbleCluster(1,22.7f,3.1f,5);
        RubbleCluster(-1,36.2f,1.8f,3);
        RubbleCluster(1,46.3f,1.1f,2);
        for(int i=0;i<22;i++)
        {
            float side=i%2==0?-1:1,z=R(-4,49),x=side*R(2.75f,3.02f),scale=R(.025f,.09f);
            Rock(new Vector3(x,0,z),new Vector3(scale,R(.018f,.05f),scale*R(.7f,1.6f)),R(0,360),"Vault brick");
        }
        // Actual broken vault edges; gaps and exposed metal remain behind them.
        for(int i=0;i<20;i++)
        {
            float angle=R(.78f,1.47f),z=i<10?20f:24f;
            Vector3 p=Arch(angle,z,.03f);
            Rock(p,new Vector3(R(.16f,.41f),R(.12f,.28f),R(.20f,.5f)),R(-30,30),"Fracture faces");
        }
        for(int i=0;i<6;i++)
        {
            float z=20.2f+i*.58f+R(-.10f,.10f);
            Vector3 a=Arch(R(.78f,.87f),z,-.10f),b=Arch(R(1.40f,1.50f),z+R(-.20f,.20f),-.10f);
            Vector3 middle=Vector3.Lerp(a,b,.53f)+new Vector3(R(-.06f,.08f),R(-.24f,-.08f),R(-.12f,.12f));
            if(i%3==1)
            {
                Vector3 end=Vector3.Lerp(a,middle,.75f)+Vector3.down*.15f;
                Cylinder("Oxide steel",a,end,.012f,6);
                Cylinder("Oxide steel",b,Vector3.Lerp(b,middle,.35f),.012f,6);
            }
            else
            {
                Cylinder("Oxide steel",a,middle,.012f,6);
                Cylinder("Oxide steel",middle,b,.012f,6);
            }
        }
        // One bent pipe and a hanging electrical run make the collapse legible.
        Cylinder("Blackened steel",new Vector3(2.97f,1.95f,20),new Vector3(2.65f,1.42f,21.1f),.047f,12);
        Cylinder("Blackened steel",new Vector3(2.97f,1.95f,28),new Vector3(2.65f,.50f,26.3f),.047f,12);
        Cylinder("Oxide steel",new Vector3(2.65f,.50f,26.3f),new Vector3(2.42f,.16f,25.9f),.047f,12);
        Vector3 last=new Vector3(1.70f,4.6f,23f);
        for(int i=1;i<=12;i++)
        {
            float t=i/12f;
            Vector3 next=new Vector3(1.70f+.17f*Mathf.Sin(t*4),4.6f-t*1.5f,23+t*.35f);
            Cylinder("Dark joints",last,next,.014f,6);last=next;
        }
        // A surviving piece of the right-hand rib leans against the wall;
        // its former attachment and rubble lie together in the impact zone.
        LeaningMasonry(1,23.5f,1.12f,.52f);
        LeaningMasonry(-1,36.6f,.76f,.39f);
    }

    private static void RubbleCluster(int side,float z,float spread,int largeCount)
    {
        RubbleBed(new Vector3(side*2.68f,-.015f,z),.48f,spread,.11f);
        for(int i=0;i<largeCount;i++)
        {
            float pz=z+R(-spread*.74f,spread*.74f),width=R(.42f,.72f),depth=R(.45f,.90f);
            FracturedSlab(new Vector3(side*R(2.52f,2.76f),.012f,pz),new Vector3(width,R(.17f,.41f),depth),R(-45,45),false,"Vault brick","Cut stone ribs");
        }
        for(int i=0;i<largeCount*7;i++)
        {
            float nearCenter=(R(-1,1)+R(-1,1))*.5f;
            float pz=z+nearCenter*spread,x=side*R(2.30f,3.02f),size=R(.09f,.23f);
            FracturedSlab(new Vector3(x,.001f,pz),new Vector3(size,R(.035f,.10f),size*R(.7f,1.9f)),R(0,360),false,i%4==0?"Fracture faces":"Vault brick","Vault brick");
        }
        for(int i=0;i<largeCount*14;i++)
        {
            float pz=z+R(-spread,spread),x=side*R(2.25f,3.05f),size=R(.018f,.065f);
            Rock(new Vector3(x,.001f,pz),new Vector3(size,R(.012f,.032f),size*R(.7f,1.8f)),R(0,360),"Vault brick");
        }
    }

    private static void RubbleBed(Vector3 center,float radiusX,float radiusZ,float height)
    {
        const int count=15;Vector3 peak=center+new Vector3(0,height,0);
        for(int i=0;i<count;i++)
        {
            float a=i*Mathf.PI*2/count,b=(i+1)*Mathf.PI*2/count;
            float ra=.86f+.12f*Mathf.Sin(i*3.5f),rb=.86f+.12f*Mathf.Sin((i+1)*3.5f);
            Vector3 p=center+new Vector3(Mathf.Cos(a)*radiusX*ra,0,Mathf.Sin(a)*radiusZ*ra);
            Vector3 q=center+new Vector3(Mathf.Cos(b)*radiusX*rb,0,Mathf.Sin(b)*radiusZ*rb);
            Facet("Vault brick",p,q,peak,center-Vector3.up*.2f);
        }
    }

    private static void LeaningMasonry(int side,float z,float height,float width)
    {
        // The broad broken face is dark/aged; only the narrow fracture reveals
        // fresh mineral color. The nearest point stays outside |x|=2.35m.
        Vector3 a=new Vector3(side*2.42f,.02f,z-width*.55f),b=new Vector3(side*2.42f,.02f,z+width*.40f);
        Vector3 c=new Vector3(side*3.10f,height,z+width*.35f),d=new Vector3(side*3.08f,height*.84f,z-width*.42f);
        Vector3 n=new Vector3(-side,height*.6f,0).normalized,back=Vector3.right*side*.10f;
        Quad("Vault brick",a,b,c,d,n,Vector2.zero,new Vector2(width,height));
        Quad("Fracture faces",b,b+back,c+back,c,Vector3.forward,Vector2.zero,new Vector2(.10f,height));
        Quad("Fracture faces",d,c,c+back,d+back,Vector3.up,Vector2.zero,new Vector2(width,.10f));
    }

    private static void BuildSurfaceHistory()
    {
        float[] stainStations={9.1f,10.9f,21.4f,22.1f,23.5f,24.7f,35.5f,36.1f,36.8f,45.9f};
        int[] stainSides={-1,-1,1,1,1,1,-1,-1,-1,1};
        for(int i=0;i<stainStations.Length;i++)
        {
            int side=stainSides[i];float z=stainStations[i],y=R(1.0f,1.7f),height=R(1.1f,2.1f),width=R(.45f,.92f);
            float x=side*3.168f;if(side<0&&z>8&&z<12)x=-4.025f;
            Quad("Damp staining",new Vector3(x,y-height/2,z-width/2),new Vector3(x,y+height/2,z-width*.38f),new Vector3(x,y+height/2,z+width*.42f),new Vector3(x,y-height/2,z+width/2),Vector3.left*side,Vector2.zero,Vector2.one);
        }
        for(int i=0;i<stainStations.Length;i++)
        {
            float x=stainSides[i]*R(2.03f,2.55f),z=stainStations[i]+R(-.3f,.3f);
            Patch("Wet concrete",new Vector3(x,-.012f,z),R(.23f,.44f),R(.65f,1.20f),24);
        }
        // Individual cracks, without a repeating floor grid.
        for(int i=0;i<10;i++)
        {
            Vector3 p=new Vector3(stainSides[i]*R(1.35f,2.5f),-.010f,stainStations[i]+R(-.4f,.4f));
            Vector3 direction=new Vector3(R(-.6f,.6f),0,1).normalized;
            for(int step=0;step<5;step++)
            {
                Vector3 q=p+direction*R(.12f,.32f)+Vector3.right*R(-.09f,.09f);
                FlatLine("Dark joints",p,q,R(.004f,.009f));
                if(step==2)FlatLine("Dark joints",q,q+new Vector3(.13f,0,.19f),.004f);
                p=q;
            }
        }
    }

    private static void BuildExit()
    {
        // A thick, damaged brick throat reveals the exit in depth. Asymmetric
        // retaining walls and a landing replace a bright rectangular cutout.
        for(int i=0;i<10;i++)
            Box("Cut stone ribs",new Vector3(0,i*.15f-.05f,51.1f+i*.50f),new Vector3(6.35f,.18f,.51f));
        Quad("Worn concrete floor",new Vector3(-4.8f,1.39f,55.6f),new Vector3(4.8f,1.39f,55.6f),new Vector3(4.8f,1.39f,68),new Vector3(-4.8f,1.39f,68),Vector3.up,new Vector2(-2,23),new Vector2(2,28),true);
        for(float z=50;z<54;z+=1)
        {
            for(int j=0;j<32;j++)
            {
                if(z>51&&j<7)continue;
                if(z>52&&(j==7||j==8||j==9))continue;
                float a=j*Mathf.PI/32,b=(j+1)*Mathf.PI/32;
                Vector3 normal=new Vector3(-Mathf.Cos((a+b)*.5f),-Mathf.Sin((a+b)*.5f),0);
                Quad("Vault brick",Arch(a,z,.04f),Arch(b,z,.04f),Arch(b,z+1,.04f),Arch(a,z+1,.04f),normal,new Vector2(z/2,a*1.6f),new Vector2((z+1)/2,b*1.6f));
            }
        }
        for(int j=7;j<32;j++)
        {
            float a=j*Mathf.PI/32,b=(j+1)*Mathf.PI/32;
            Vector3 p0=Arch(a,54,.04f),p1=Arch(b,54,.04f),p2=Arch(b,54,-.28f),p3=Arch(a,54,-.28f);
            Quad("Cut stone ribs",p0,p1,p2,p3,Vector3.forward,Vector2.zero,new Vector2(.32f,.4f));
        }
        Box("Distant structure",new Vector3(-3.55f,3.25f,54.8f),new Vector3(.95f,6.5f,9.6f));
        // Right wall has failed above shoulder height. Its uneven silhouette
        // lets daylight spill around the remaining masonry.
        for(int i=0;i<7;i++)
        {
            float z=50+i*1.3f,top=3.8f-i*.24f+.20f*Mathf.Sin(i*1.9f);
            Quad("Vault brick",new Vector3(3.17f,0,z),new Vector3(3.17f,top,z),new Vector3(3.17f,top-.12f,z+1.3f),new Vector3(3.17f,0,z+1.3f),Vector3.left,new Vector2(z/2,0),new Vector2((z+1.3f)/2,top/2));
            Quad("Fracture faces",new Vector3(3.17f,top,z),new Vector3(3.17f,top-.12f,z+1.3f),new Vector3(3.85f,top-.08f,z+1.3f),new Vector3(3.85f,top+.04f,z),Vector3.up,Vector2.zero,new Vector2(.68f,1.3f));
        }
        for(int side=-1;side<=1;side+=2)
        {
            Cylinder("Blackened steel",new Vector3(side*2.65f,.95f,50.5f),new Vector3(side*2.65f,2.45f,55.5f),.037f,10);
            for(int i=0;i<5;i++)Cylinder("Blackened steel",new Vector3(side*2.65f,.15f+i*.30f,51+i),new Vector3(side*2.65f,1.10f+i*.30f,51+i),.026f,8);
        }
        // Foreground station-yard fragments are outside the walkable center.
        // They overlap later silhouettes without forming a gate across escape.
        Box("Exit silhouette near",new Vector3(-2.76f,2.12f,58.5f),new Vector3(.20f,1.46f,.22f));
        Box("Exit silhouette near",new Vector3(2.79f,2.35f,60.0f),new Vector3(.22f,1.92f,.24f));
        Cylinder("Exit silhouette near",new Vector3(-2.76f,2.66f,58.5f),new Vector3(-3.55f,2.66f,61.2f),.035f,8);
        Cylinder("Exit silhouette near",new Vector3(2.79f,2.95f,60),new Vector3(3.45f,2.95f,64),.035f,8);

        // Midground buildings now sit inside the aperture. The previous tall
        // buildings lay almost entirely beyond its sides and upper crop.
        YardBuilding(new Vector3(-3.05f,1.39f,64.5f),new Vector3(2.6f,3.30f,3.8f),.58f,"Exit silhouette middle","Exit silhouette near");
        YardBuilding(new Vector3(3.48f,1.39f,70.0f),new Vector3(2.65f,2.68f,4.4f),.42f,"Exit silhouette middle","Exit silhouette far");
        Box("Exit silhouette middle",new Vector3(-2.32f,5.28f,65.0f),new Vector3(.27f,1.18f,.34f));
        Box("Exit silhouette near",new Vector3(-2.32f,5.90f,65.0f),new Vector3(.34f,.12f,.41f));
        // Long muted glass openings establish warehouse scale without adding
        // a field of tiny windows or bright emissive rectangles.
        Box("Exit silhouette far",new Vector3(-3.06f,3.60f,62.585f),new Vector3(1.86f,.36f,.022f));
        Box("Exit silhouette middle",new Vector3(-3.06f,3.60f,62.566f),new Vector3(.09f,.42f,.024f));
        Box("Exit silhouette far",new Vector3(3.43f,3.16f,67.785f),new Vector3(1.80f,.29f,.022f));

        // Farther rooflines have a lighter atmospheric value. A slim clock
        // tower occupies one side of the opening, leaving a clear bright route
        // down the middle rather than a solid central pillar.
        YardBuilding(new Vector3(-2.60f,1.39f,85.0f),new Vector3(2.75f,2.56f,4.0f),.43f,"Exit silhouette far","Exit silhouette far");
        const float towerX=1.65f;
        // A masonry plinth, shaft, and broader clock chamber read as a small
        // station tower. Its lower, wider cap avoids a spindly pole silhouette.
        ShadedMass(new Vector3(towerX,1.52f,83),new Vector3(1.86f,.26f,1.86f),"Exit silhouette middle","Exit silhouette near","Exit silhouette far","Exit silhouette middle");
        ShadedMass(new Vector3(towerX,3.05f,83),new Vector3(1.34f,2.80f,1.38f),"Exit silhouette far","Exit silhouette middle","Exit silhouette far","Exit silhouette middle");
        ShadedMass(new Vector3(towerX,4.49f,83),new Vector3(1.74f,.14f,1.76f),"Exit silhouette middle","Exit silhouette near","Exit silhouette far","Exit silhouette middle");
        ShadedMass(new Vector3(towerX,5.33f,83),new Vector3(1.60f,1.60f,1.60f),"Exit silhouette far","Exit silhouette middle","Exit silhouette far","Exit silhouette middle");
        ShadedMass(new Vector3(towerX,6.17f,83),new Vector3(1.82f,.16f,1.84f),"Exit silhouette middle","Exit silhouette near","Exit silhouette far","Exit silhouette middle");
        Vector3 roofA=new Vector3(towerX-.95f,6.25f,82.04f),roofB=new Vector3(towerX+.95f,6.25f,82.04f),roofC=new Vector3(towerX,6.80f,82.04f);
        Triangle("Exit silhouette middle",roofA,roofB,roofC,Vector3.back);
        Quad("Exit silhouette middle",roofA,roofC,roofC+Vector3.forward*1.92f,roofA+Vector3.forward*1.92f,new Vector3(-.55f,.95f,0),Vector2.zero,Vector2.one);
        Quad("Exit silhouette far",roofC,roofB,roofB+Vector3.forward*1.92f,roofC+Vector3.forward*1.92f,new Vector3(.55f,.95f,0),Vector2.zero,Vector2.one);
        Vector3 clock=new Vector3(towerX,5.27f,82.185f);
        for(int i=0;i<32;i++)
        {
            float a=i*Mathf.PI*2/32,b=(i+1)*Mathf.PI*2/32;
            Triangle("Exit atmosphere",clock,clock+new Vector3(Mathf.Cos(a)*.42f,Mathf.Sin(a)*.42f,0),clock+new Vector3(Mathf.Cos(b)*.42f,Mathf.Sin(b)*.42f,0),Vector3.back);
        }
        Cylinder("Exit silhouette near",clock+Vector3.back*.012f,clock+new Vector3(.06f,.29f,-.012f),.023f,6);
        Cylinder("Exit silhouette near",clock+Vector3.back*.014f,clock+new Vector3(-.21f,.075f,-.014f),.027f,6);
        // Exposed cross braces high over the mouth leave the runner's route open.
        Box("Blackened steel",new Vector3(0,5.05f,50.5f),new Vector3(6.9f,.18f,.22f));
        Cylinder("Blackened steel",new Vector3(-3.3f,5.0f,50.5f),new Vector3(-1.6f,6.3f,52.1f),.055f,8);
        Cylinder("Blackened steel",new Vector3(3.3f,5.0f,50.5f),new Vector3(1.8f,6.2f,52.1f),.055f,8);
        // Atmosphere sits behind the distant buildings, never across the tunnel
        // mouth. Layered real silhouettes retain parallax as the runner nears it.
        Quad("Exit atmosphere",new Vector3(-60,-20,94),new Vector3(-60,60,94),new Vector3(60,60,94),new Vector3(60,-20,94),Vector3.back,Vector2.zero,Vector2.one);
    }

    private static void YardBuilding(Vector3 baseCenter,Vector3 size,float roofRise,string walls,string roof)
    {
        string shaded=walls=="Exit silhouette far"?"Exit silhouette middle":"Exit silhouette near";
        ShadedMass(baseCenter+Vector3.up*size.y*.5f,size,walls,shaded,"Exit silhouette far",roof);
        Vector3 a=baseCenter+new Vector3(-size.x*.5f,size.y,-size.z*.5f),b=baseCenter+new Vector3(size.x*.5f,size.y,-size.z*.5f);
        Vector3 ridge=baseCenter+new Vector3(0,size.y+roofRise,-size.z*.5f),depth=Vector3.forward*size.z;
        Triangle(walls,a,b,ridge,Vector3.back);
        Quad(roof,a,ridge,ridge+depth,a+depth,new Vector3(-roofRise,size.x*.5f,0),Vector2.zero,Vector2.one);
        Quad("Exit silhouette far",ridge,b,b+depth,ridge+depth,new Vector3(roofRise,size.x*.5f,0),Vector2.zero,Vector2.one);
        Triangle(walls,a+depth,ridge+depth,b+depth,Vector3.forward);
    }

    private static void ShadedMass(Vector3 center,Vector3 size,string front,string left,string right,string top)
    {
        Vector3 h=size*.5f;
        Vector3 a=center+new Vector3(-h.x,-h.y,-h.z),b=center+new Vector3(h.x,-h.y,-h.z),c=center+new Vector3(h.x,h.y,-h.z),d=center+new Vector3(-h.x,h.y,-h.z);
        Vector3 e=center+new Vector3(-h.x,-h.y,h.z),f=center+new Vector3(h.x,-h.y,h.z),g=center+new Vector3(h.x,h.y,h.z),j=center+new Vector3(-h.x,h.y,h.z);
        Quad(front,a,b,c,d,Vector3.back,Vector2.zero,Vector2.one);
        Quad(front,e,j,g,f,Vector3.forward,Vector2.zero,Vector2.one);
        Quad(left,a,d,j,e,Vector3.left,Vector2.zero,Vector2.one);
        Quad(right,b,f,g,c,Vector3.right,Vector2.zero,Vector2.one);
        Quad(top,d,c,g,j,Vector3.up,Vector2.zero,Vector2.one);
        Quad(left,a,e,f,b,Vector3.down,Vector2.zero,Vector2.one);
    }

    private static void Patch(string material,Vector3 center,float rx,float rz,int count)
    {
        for(int i=0;i<count;i++)
        {
            float a=i*Mathf.PI*2/count,b=(i+1)*Mathf.PI*2/count;
            float ra=.8f+.2f*Mathf.Sin(i*2.46f+center.z),rb=.8f+.2f*Mathf.Sin((i+1)*2.46f+center.z);
            int start=surfaces[material].vertices.Count;
            Triangle(material,center,center+new Vector3(Mathf.Cos(a)*rx*ra,0,Mathf.Sin(a)*rz*ra),center+new Vector3(Mathf.Cos(b)*rx*rb,0,Mathf.Sin(b)*rz*rb),Vector3.up);
            surfaces[material].uv[start]=Vector2.one*.5f;
            surfaces[material].uv[start+1]=Vector2.one*.5f+new Vector2(Mathf.Cos(a),Mathf.Sin(a))*.5f;
            surfaces[material].uv[start+2]=Vector2.one*.5f+new Vector2(Mathf.Cos(b),Mathf.Sin(b))*.5f;
        }
    }
    private static void FlatLine(string material,Vector3 a,Vector3 b,float width)
    {
        Vector3 side=Vector3.Cross((b-a).normalized,Vector3.up)*width*.5f;
        Quad(material,a-side,a+side,b+side,b-side,Vector3.up,Vector2.zero,Vector2.one);
    }

    private static void FallenWallFragment(Vector3 origin,float width,float height,float thickness,float lean,float yaw)
    {
        // A deliberately concave contour has missing corners and several
        // different break heights. Ear clipping preserves those missing pieces.
        Vector2[] outline={new Vector2(-.50f,0),new Vector2(.43f,0),new Vector2(.50f,.26f),new Vector2(.32f,.38f),new Vector2(.40f,.68f),new Vector2(.18f,.65f),new Vector2(.02f,1f),new Vector2(-.15f,.87f),new Vector2(-.33f,.94f),new Vector2(-.29f,.60f),new Vector2(-.49f,.53f)};
        Quaternion rotation=Quaternion.Euler(0,yaw,0)*Quaternion.Euler(lean,0,0);
        Vector3[] front=new Vector3[outline.Length],back=new Vector3[outline.Length];
        for(int i=0;i<outline.Length;i++)
        {
            Vector3 p=new Vector3(outline[i].x*width,outline[i].y*height,0);
            front[i]=origin+rotation*(p-Vector3.forward*thickness*.5f);
            back[i]=origin+rotation*(p+Vector3.forward*thickness*.5f);
        }
        List<int> triangles=TriangulateContour(outline);
        for(int t=0;t<triangles.Count;t+=3)
        {
            int a=triangles[t],b=triangles[t+1],c=triangles[t+2];
            MasonryFace(front[a],front[b],front[c],outline[a],outline[b],outline[c],rotation*Vector3.back,width,height);
            MasonryFace(back[a],back[b],back[c],outline[a],outline[b],outline[c],rotation*Vector3.forward,width,height);
        }
        for(int i=0;i<outline.Length;i++)
        {
            int j=(i+1)%outline.Length;
            Vector2 edge=outline[j]-outline[i];
            Vector3 normal=rotation*new Vector3(edge.y,-edge.x,0).normalized;
            Quad("Fracture faces",front[i],back[i],back[j],front[j],normal,Vector2.zero,new Vector2(thickness,Vector3.Distance(front[i],front[j])));
        }
    }

    private static void MasonryFace(Vector3 a,Vector3 b,Vector3 c,Vector2 ua,Vector2 ub,Vector2 uc,Vector3 normal,float width,float height)
    {
        Surface s=surfaces["Vault brick"];int start=s.vertices.Count;
        Triangle("Vault brick",a,b,c,normal);
        s.uv[start]=new Vector2(ua.x*width*.5f,ua.y*height*.5f);
        s.uv[start+1]=new Vector2(ub.x*width*.5f,ub.y*height*.5f);
        s.uv[start+2]=new Vector2(uc.x*width*.5f,uc.y*height*.5f);
    }

    private static List<int> TriangulateContour(Vector2[] contour)
    {
        var remaining=new List<int>();var result=new List<int>();
        for(int i=0;i<contour.Length;i++)remaining.Add(i);
        int guard=contour.Length*contour.Length;
        while(remaining.Count>3&&guard-->0)
        {
            bool clipped=false;
            for(int i=0;i<remaining.Count;i++)
            {
                int a=remaining[(i+remaining.Count-1)%remaining.Count],b=remaining[i],c=remaining[(i+1)%remaining.Count];
                if(Cross2(contour[b]-contour[a],contour[c]-contour[b])<=.000001f)continue;
                bool occupied=false;
                foreach(int p in remaining)
                {
                    if(p==a||p==b||p==c)continue;
                    Vector2 v=contour[p];
                    if(Cross2(contour[b]-contour[a],v-contour[a])>=0&&Cross2(contour[c]-contour[b],v-contour[b])>=0&&Cross2(contour[a]-contour[c],v-contour[c])>=0){occupied=true;break;}
                }
                if(occupied)continue;
                result.Add(a);result.Add(b);result.Add(c);remaining.RemoveAt(i);clipped=true;break;
            }
            if(!clipped)throw new InvalidOperationException("The fallen masonry outline could not be triangulated.");
        }
        if(remaining.Count==3){result.AddRange(remaining);}
        return result;
    }
    private static float Cross2(Vector2 a,Vector2 b) { return a.x*b.y-a.y*b.x; }

    private static void FracturedSlab(Vector3 origin,Vector3 size,float yaw,bool fragments,string faceMaterial="Fracture faces",string topMaterial="Cut stone ribs")
    {
        // Unequal clipped edges form a broken piece of construction, rather
        // than a distorted rectangular block. The shoulder and chipped rim
        // each carry their own flat fracture normals.
        Vector2[] outline={new Vector2(-.46f,-.29f),new Vector2(-.13f,-.47f),new Vector2(.26f,-.41f),new Vector2(.51f,-.16f),new Vector2(.38f,.30f),new Vector2(.09f,.46f),new Vector2(-.32f,.35f),new Vector2(-.53f,.05f)};
        int count=outline.Length;Vector3[] bottom=new Vector3[count],shoulder=new Vector3[count],top=new Vector3[count];
        Quaternion q=Quaternion.Euler(0,yaw,0);
        for(int i=0;i<count;i++)
        {
            Vector2 p=outline[i];float shift=R(.92f,1.06f),rim=R(.76f,.94f);
            bottom[i]=origin+q*new Vector3(p.x*size.x,0,p.y*size.z);
            shoulder[i]=origin+q*new Vector3(p.x*size.x*shift,size.y*R(.60f,.78f),p.y*size.z*shift);
            top[i]=origin+q*new Vector3(p.x*size.x*rim,size.y*R(.82f,.98f),p.y*size.z*rim);
        }
        Vector3 center=origin+q*new Vector3(-size.x*.055f,size.y*.96f,size.z*.015f);
        for(int i=0;i<count;i++)
        {
            int next=(i+1)%count;
            Facet(faceMaterial,bottom[i],bottom[next],shoulder[next],origin);
            Facet(faceMaterial,bottom[i],shoulder[next],shoulder[i],origin);
            Facet(faceMaterial,shoulder[i],shoulder[next],top[next],origin);
            Facet(faceMaterial,shoulder[i],top[next],top[i],origin);
            Facet(topMaterial,top[i],top[next],center,origin);
        }
        if(!fragments)return;
        for(int i=0;i<4;i++)
        {
            float angle=(i*.95f+.30f)*Mathf.PI;
            Vector3 offset=q*new Vector3(Mathf.Cos(angle)*size.x*.52f,0,Mathf.Sin(angle)*size.z*.57f);
            Vector3 p=origin+offset;p.y=.001f;
            FracturedSlab(p,new Vector3(size.x*R(.16f,.29f),Mathf.Min(.10f,size.y*.32f),size.z*R(.16f,.32f)),yaw+R(-55,55),false,faceMaterial,topMaterial);
        }
    }
    private static void Facet(string material,Vector3 a,Vector3 b,Vector3 c,Vector3 solidCenter)
    {
        Vector3 normal=Vector3.Cross(b-a,c-a).normalized;
        if(Vector3.Dot(normal,(a+b+c)/3f-(solidCenter+Vector3.up*.04f))<0)normal=-normal;
        int start=surfaces[material].vertices.Count;
        Triangle(material,a,b,c,normal);
        Vector3[] p={a,b,c};
        for(int i=0;i<3;i++)
        {
            Vector3 v=p[i];
            surfaces[material].uv[start+i]=Mathf.Abs(normal.y)>.65f?new Vector2(v.x,v.z):Mathf.Abs(normal.x)>Mathf.Abs(normal.z)?new Vector2(v.z,v.y):new Vector2(v.x,v.y);
        }
    }
    private static void Rock(Vector3 basePoint,Vector3 size,float yaw,string material)
    {
        Vector3[] v=new Vector3[8];
        Quaternion rotation=Quaternion.Euler(R(-8,8),yaw,R(-7,7));
        for(int i=0;i<8;i++)
        {
            float x=((i&1)==0?-.5f:.5f)*size.x*R(.82f,1.12f);
            float z=((i&2)==0?-.5f:.5f)*size.z*R(.85f,1.14f);
            float y=(i<4?0:1)*size.y*(i<4?1:R(.68f,1.03f));
            v[i]=basePoint+rotation*new Vector3(x,y,z);
        }
        Quad(material,v[4],v[5],v[7],v[6],Vector3.up,Vector2.zero,new Vector2(size.x,size.z));
        Quad(material,v[0],v[1],v[5],v[4],rotation*Vector3.back,Vector2.zero,new Vector2(size.x,size.y));
        Quad(material,v[2],v[6],v[7],v[3],rotation*Vector3.forward,Vector2.zero,new Vector2(size.x,size.y));
        Quad(material,v[0],v[4],v[6],v[2],rotation*Vector3.left,Vector2.zero,new Vector2(size.z,size.y));
        Quad(material,v[1],v[3],v[7],v[5],rotation*Vector3.right,Vector2.zero,new Vector2(size.z,size.y));
    }
    private static void Box(string material,Vector3 center,Vector3 size)
    {
        Vector3 h=size*.5f;Vector3 a=center+new Vector3(-h.x,-h.y,-h.z),b=center+new Vector3(h.x,-h.y,-h.z),c=center+new Vector3(h.x,h.y,-h.z),d=center+new Vector3(-h.x,h.y,-h.z);
        Vector3 e=center+new Vector3(-h.x,-h.y,h.z),f=center+new Vector3(h.x,-h.y,h.z),g=center+new Vector3(h.x,h.y,h.z),j=center+new Vector3(-h.x,h.y,h.z);
        Quad(material,a,b,c,d,Vector3.back,Vector2.zero,new Vector2(size.x,size.y));
        Quad(material,e,j,g,f,Vector3.forward,Vector2.zero,new Vector2(size.x,size.y));
        Quad(material,a,d,j,e,Vector3.left,Vector2.zero,new Vector2(size.z,size.y));
        Quad(material,b,f,g,c,Vector3.right,Vector2.zero,new Vector2(size.z,size.y));
        Quad(material,d,c,g,j,Vector3.up,Vector2.zero,new Vector2(size.x,size.z));
        Quad(material,a,e,f,b,Vector3.down,Vector2.zero,new Vector2(size.x,size.z));
    }
    private static void Cylinder(string material,Vector3 a,Vector3 b,float radius,int segments)
    {
        Vector3 axis=(b-a).normalized;
        Vector3 u=Vector3.Cross(axis,Mathf.Abs(axis.y)>.9f?Vector3.right:Vector3.up).normalized,v=Vector3.Cross(axis,u);
        for(int i=0;i<segments;i++)
        {
            float t0=i*Mathf.PI*2/segments,t1=(i+1)*Mathf.PI*2/segments;
            Vector3 n0=u*Mathf.Cos(t0)+v*Mathf.Sin(t0),n1=u*Mathf.Cos(t1)+v*Mathf.Sin(t1);
            Quad(material,a+n0*radius,b+n0*radius,b+n1*radius,a+n1*radius,(n0+n1).normalized,Vector2.zero,new Vector2(Vector3.Distance(a,b),radius));
        }
    }
    private static void Triangle(string name,Vector3 a,Vector3 b,Vector3 c,Vector3 normal)
    {
        Surface s=surfaces[name];int start=s.vertices.Count;
        s.vertices.Add(a);s.vertices.Add(b);s.vertices.Add(c);
        s.normals.Add(normal);s.normals.Add(normal);s.normals.Add(normal);
        s.uv.Add(new Vector2(a.x,a.z));s.uv.Add(new Vector2(b.x,b.z));s.uv.Add(new Vector2(c.x,c.z));
        bool flip=Vector3.Dot(Vector3.Cross(b-a,c-a),normal)<0;
        s.triangles.Add(start);s.triangles.Add(start+(flip?2:1));s.triangles.Add(start+(flip?1:2));
    }
    private static void Quad(string name,Vector3 a,Vector3 b,Vector3 c,Vector3 d,Vector3 normal,Vector2 uv0,Vector2 uv1,bool alongFirst=false)
    {
        Surface s=surfaces[name];int start=s.vertices.Count;
        s.vertices.Add(a);s.vertices.Add(b);s.vertices.Add(c);s.vertices.Add(d);
        normal.Normalize();for(int i=0;i<4;i++)s.normals.Add(normal);
        s.uv.Add(uv0);s.uv.Add(alongFirst?new Vector2(uv1.x,uv0.y):new Vector2(uv0.x,uv1.y));s.uv.Add(uv1);s.uv.Add(alongFirst?new Vector2(uv0.x,uv1.y):new Vector2(uv1.x,uv0.y));
        bool flip=Vector3.Dot(Vector3.Cross(b-a,c-a),normal)<0;
        int[] triangles=flip?new[]{0,2,1,0,3,2}:new[]{0,1,2,0,2,3};
        foreach(int i in triangles)s.triangles.Add(start+i);
    }
    private struct ClipVertex
    {
        public Vector3 p,n;public Vector2 uv;
        public ClipVertex(Vector3 position,Vector3 normal,Vector2 tex){p=position;n=normal;uv=tex;}
    }

    // Cut only race copies at exact module seams, retaining interpolated UVs
    // and face normals. The study's -8m rear apron and final scene stay intact.
    private static void CropRaceSurfaces(float minimum,float maximum)
    {
        foreach(Surface surface in surfaces.Values)
        {
            var output=new Surface();
            for(int i=0;i<surface.triangles.Count;i+=3)
            {
                var polygon=new List<ClipVertex>(5);
                for(int j=0;j<3;j++)
                {
                    int k=surface.triangles[i+j];
                    polygon.Add(new ClipVertex(surface.vertices[k],surface.normals[k],surface.uv[k]));
                }
                polygon=ClipPlane(polygon,minimum,true);
                if(!float.IsPositiveInfinity(maximum))polygon=ClipPlane(polygon,maximum,false);
                if(polygon.Count<3)continue;
                int first=output.vertices.Count;
                foreach(ClipVertex v in polygon){output.vertices.Add(v.p);output.normals.Add(v.n.normalized);output.uv.Add(v.uv);}
                for(int j=1;j<polygon.Count-1;j++){output.triangles.Add(first);output.triangles.Add(first+j);output.triangles.Add(first+j+1);}
            }
            surface.vertices.Clear();surface.vertices.AddRange(output.vertices);
            surface.normals.Clear();surface.normals.AddRange(output.normals);
            surface.uv.Clear();surface.uv.AddRange(output.uv);
            surface.triangles.Clear();surface.triangles.AddRange(output.triangles);
        }
    }
    private static List<ClipVertex> ClipPlane(List<ClipVertex> polygon,float z,bool keepAbove)
    {
        var output=new List<ClipVertex>(5);
        if(polygon.Count==0)return output;
        ClipVertex previous=polygon[polygon.Count-1];
        bool previousInside=keepAbove?previous.p.z>=z:previous.p.z<=z;
        foreach(ClipVertex current in polygon)
        {
            bool inside=keepAbove?current.p.z>=z:current.p.z<=z;
            if(inside!=previousInside)
            {
                float t=(z-previous.p.z)/(current.p.z-previous.p.z);
                output.Add(new ClipVertex(Vector3.Lerp(previous.p,current.p,t),Vector3.Lerp(previous.n,current.n,t),Vector2.Lerp(previous.uv,current.uv,t)));
            }
            if(inside)output.Add(current);
            previous=current;previousInside=inside;
        }
        return output;
    }

    private static void SaveSurfaces()
    {
        foreach(var pair in surfaces)
        {
            Surface s=pair.Value;if(s.vertices.Count==0)continue;
            Mesh mesh=new Mesh { name=pair.Key,indexFormat=IndexFormat.UInt32 };
            mesh.SetVertices(s.vertices);mesh.SetNormals(s.normals);mesh.SetUVs(0,s.uv);mesh.SetTriangles(s.triangles,0);mesh.RecalculateBounds();mesh.RecalculateTangents();
            string path=meshFolder+"/"+Safe(pair.Key)+".asset";
            Mesh existing=AssetDatabase.LoadAssetAtPath<Mesh>(path);
            if(existing==null)AssetDatabase.CreateAsset(mesh,path);
            else
            {
                // Refill the native mesh explicitly so a rebuild also refreshes
                // the Editor's existing GPU buffers, not only serialized data.
                existing.Clear();existing.indexFormat=IndexFormat.UInt32;
                existing.SetVertices(s.vertices);existing.SetNormals(s.normals);existing.SetUVs(0,s.uv);existing.SetTriangles(s.triangles,0);
                existing.RecalculateBounds();existing.RecalculateTangents();
                UnityEngine.Object.DestroyImmediate(mesh);mesh=existing;EditorUtility.SetDirty(mesh);
            }
            GameObject go=new GameObject(pair.Key);go.transform.SetParent(root,false);
            go.AddComponent<MeshFilter>().sharedMesh=mesh;
            MeshRenderer renderer=go.AddComponent<MeshRenderer>();renderer.sharedMaterial=s.material;
            renderer.shadowCastingMode=pair.Key=="Damp staining"||pair.Key=="Wet concrete"||pair.Key=="Exit atmosphere"||pair.Key.StartsWith("Exit silhouette",StringComparison.Ordinal)?ShadowCastingMode.Off:ShadowCastingMode.On;
            renderer.receiveShadows=true;
        }
    }
    private static string Safe(string value) { return value.Replace(' ','_').Replace('/','_'); }
    private static float Edge(float a,float b,float value) { return Mathf.SmoothStep(0f,1f,Mathf.InverseLerp(a,b,value)); }
    private static float R(float min,float max) { return min+(max-min)*(float)random.NextDouble(); }
}
