using System;
using System.Collections.Generic;
using System.Linq;
using UnityEngine;
using UnityEngine.Rendering;

/// <summary>
/// The movement-study character's original workwear treatment. Run once after
/// GroundedRigSetup.Prepare, while the skeleton is neutral, before saving its
/// pose. Snow supplies the underlying person and skeleton; this pass supplies
/// an authored jacket silhouette, long sleeves, short hair and quiet materials.
/// It neither samples animation nor changes the multiplayer game.
/// </summary>
public static class RunnerWardrobe
{
    private const string WardrobeName = "Workwear / original character art pass";

    public static void Apply(Transform modelRoot, Dictionary<string, Transform> bones)
    {
        if (modelRoot == null || bones == null) throw new ArgumentNullException("Workwear needs the prepared character rig.");
        if (modelRoot.Find(WardrobeName) != null) return;
        // This closed-mouth runner never exposes the mouth interior. Snow's
        // teeth/gums are rigid MeshRenderers, so they bypass the skinned-face
        // proportion map and can show through the neck during landing.
        foreach (Renderer renderer in modelRoot.GetComponentsInChildren<Renderer>(true))
            if (IsMouthInterior(renderer.name)) renderer.enabled = false;
        SkinnedMeshRenderer[] original = modelRoot.GetComponentsInChildren<SkinnedMeshRenderer>(true)
            .Where(r => !IsMouthInterior(r.name)).ToArray();
        SkinnedMeshRenderer shirt = original.FirstOrDefault(r => r.name == "GEO-snow-shirt");
        SkinnedMeshRenderer head = original.FirstOrDefault(r => r.name == "GEO-snow-head");
        if (shirt == null || head == null) throw new InvalidOperationException("The fitted Snow shirt and head meshes are required for the workwear study.");

        // A small proportion adjustment retains the facial rig, neck blend and
        // eyes, unlike shrinking only the visible head mesh around its centre.
        bones["Head"].localScale = Vector3.Scale(bones["Head"].localScale, new Vector3(0.91f, 0.94f, 0.91f));
        Transform root = new GameObject(WardrobeName).transform;
        root.SetParent(modelRoot, false);
        Material cloth = Cloth("Work jacket / weathered brick twill", new Color(0.27f, 0.066f, 0.044f), 0.035f);
        Material reinforcement = Cloth("Work jacket / charcoal folded cuffs", new Color(0.092f, 0.099f, 0.091f), 0.06f);
        Material seam = Cloth("Work jacket / faded stitched edges", new Color(0.22f, 0.091f, 0.055f), 0.025f);
        Material lining = Cloth("Work jacket / dark inner collar", new Color(0.08f, 0.085f, 0.08f), 0.07f);
        Material hair = Cloth("Short hair / restrained umber", new Color(0.065f, 0.052f, 0.038f), 0.23f, true);

        // This silhouette is authored as a garment, rather than inflating the
        // fitted shirt. Deliberate cross-sections set the body and shoulder proportions.
        Garment coat = DesignedJacket(bones);
        CreateSkin(root, "Short work jacket / authored silhouette and cloth planes", coat, new[] { cloth });
        BuildTurnedHem(root, coat, cloth, lining);
        shirt.enabled = false;

        // The original body contains exposed arms and hands. Remove covered
        // triangles rather than relying on perfectly coincident sleeve surfaces.
        SkinnedMeshRenderer body = original.FirstOrDefault(r => r.name == "GEO-snow-body");
        if (body != null) KeepExposedHands(body, modelRoot);

        foreach (string side in new[] { ".L", ".R" })
            BuildSleeve(root, modelRoot, bones, side, cloth, reinforcement, seam);
        BuildCollar(root, modelRoot, bones, cloth, lining, seam);
        // The prior yoke rectangle, tiny repair patch and stitching competed
        // with the larger silhouette. The cut and folded edges now carry it.

        SkinnedMeshRenderer designedHead = null;
        foreach (SkinnedMeshRenderer r in original)
        {
            if (r.name == "GEO-snow-hair_base") r.enabled = false;
            if (r.name.Contains("pants")) RefineTrousers(root, r, modelRoot);
            if (r.name.Contains("shoes")) RefineBoot(root, r, modelRoot);
            SubdueSkinResponse(r);
            if (IsHeadPart(r))
            {
                SkinnedMeshRenderer reshaped = RefineHeadPart(root, r, modelRoot);
                if (r == head) designedHead = reshaped;
            }
        }
        BuildShortHair(root, designedHead ?? head, modelRoot, bones["Head"], hair);
    }

    private sealed class Garment
    {
        public readonly List<Vector3> vertices = new List<Vector3>();
        public readonly List<Vector2> uv = new List<Vector2>();
        public readonly List<BoneWeight> weights = new List<BoneWeight>();
        public readonly List<int> triangles = new List<int>();
        public Transform[] bones;
    }

    private static Garment FromSkin(SkinnedMeshRenderer source, Transform model, bool preserveUv = false)
    {
        Mesh baked = new Mesh();
        source.BakeMesh(baked);
        Vector3[] v = baked.vertices;
        Vector2[] sourceUv = preserveUv ? source.sharedMesh.uv : null;
        var g = new Garment { bones = source.bones };
        Matrix4x4 toModel = model.worldToLocalMatrix * source.transform.localToWorldMatrix;
        for (int i = 0; i < v.Length; i++)
        {
            Vector3 p = toModel.MultiplyPoint3x4(v[i]);
            g.vertices.Add(p);
            g.uv.Add(sourceUv != null && sourceUv.Length == v.Length ? sourceUv[i] : new Vector2(p.x * 4f, p.y * 4f));
        }
        g.weights.AddRange(source.sharedMesh.boneWeights);
        g.triangles.AddRange(source.sharedMesh.triangles);
        UnityEngine.Object.Destroy(baked);
        return g;
    }

    private static Garment DesignedJacket(Dictionary<string, Transform> bones)
    {
        var g = new Garment { bones = new[] { bones["DEF-Hip_Center"], bones["DEF-Spine"], bones["DEF-RibCage"], bones["DEF-Chest"] } };
        // Height / half width / front depth / rear depth, in neutral model metres.
        // The cropped hem reveals the leg-to-torso relationship; a soft waist
        // sits between the fuller chest and folded hem, avoiding a tunic shape.
        float[,] cut = {
            {0.905f,0.146f,0.104f,0.092f}, {0.924f,0.151f,0.111f,0.100f},
            {1.015f,0.137f,0.116f,0.101f}, {1.065f,0.139f,0.120f,0.104f},
            {1.110f,0.148f,0.123f,0.107f}, {1.160f,0.158f,0.127f,0.111f},
            {1.205f,0.169f,0.129f,0.113f}, {1.295f,0.181f,0.128f,0.115f},
            {1.350f,0.198f,0.124f,0.109f}, {1.395f,0.164f,0.103f,0.090f},
            {1.425f,0.121f,0.080f,0.072f}, {1.443f,0.072f,0.068f,0.061f}
        };
        const int around = 32;
        int rows = cut.GetLength(0);
        for (int row = 0; row < rows; row++)
            for (int i = 0; i <= around; i++)
            {
                float a = i / (float)around * Mathf.PI * 2f;
                float sin = Mathf.Sin(a), cos = Mathf.Cos(a);
                float y = cut[row, 0];
                // The upper rings form an actual sloping shoulder bridge from
                // neck to arm, not a cone that leaves a gap beside each sleeve.
                if (y >= 1.35f && y < 1.44f) y -= Mathf.Pow(Mathf.Abs(sin), 1.6f) * (y < 1.41f ? 0.032f : 0.017f);
                // Broad, gently angular front/back panels with softened sides.
                // Fold shapes are centimetres wide and carried by geometry.
                float x = sin * cut[row, 1];
                float z = 0.018f + Mathf.Sign(cos) * Mathf.Pow(Mathf.Abs(cos), 0.55f) * cut[row, cos >= 0f ? 2 : 3];
                float rear = Mathf.Clamp01((-cos - 0.12f) / 0.88f);
                float hang = Mathf.Sin(Mathf.InverseLerp(0.905f, 1.35f, y) * Mathf.PI);
                // Two unequal fold ridges create broad planes instead of a
                // uniformly rounded red slab. Their shape carries at distance;
                // no surface noise or extra trim is involved.
                float foldLine = Mathf.Lerp(-0.027f, -0.080f, Mathf.InverseLerp(0.94f, 1.30f, y));
                float leftPlane = Mathf.Clamp01(1f - Mathf.Abs(x - foldLine) / 0.054f);
                float rightPlane = Mathf.Clamp01(1f - Mathf.Abs(x - 0.079f) / 0.066f);
                z -= rear * hang * (0.019f * leftPlane + 0.011f * rightPlane);
                z += rear * 0.007f * Gaussian(y - (1.055f + 0.30f * x), 0.040f);
                if (row < 2) y += 0.010f * Mathf.Pow(Mathf.Abs(sin), 2f) + 0.005f * Mathf.Sin(a + 0.5f);
                g.vertices.Add(new Vector3(x, y, z));
                g.uv.Add(new Vector2(i / (float)around, row / (float)(rows - 1)));
                if (y < 1.02f)
                {
                    float w = Mathf.InverseLerp(0.905f, 1.02f, y) * 0.65f;
                    g.weights.Add(new BoneWeight { boneIndex0 = 0, weight0 = 1f - w, boneIndex1 = 1, weight1 = w });
                }
                else if (y < 1.19f)
                {
                    float w = Mathf.InverseLerp(1.02f, 1.19f, y);
                    g.weights.Add(new BoneWeight { boneIndex0 = 1, weight0 = 1f - w, boneIndex1 = 2, weight1 = w });
                }
                else
                {
                    float w = Mathf.InverseLerp(1.19f, 1.32f, y);
                    g.weights.Add(new BoneWeight { boneIndex0 = 2, weight0 = 1f - w, boneIndex1 = 3, weight1 = w });
                }
            }
        for (int row = 0; row < rows - 1; row++)
            for (int i = 0; i < around; i++)
            {
                int a = row * (around + 1) + i;
                Quad(g, a, a + 1, a + around + 2, a + around + 1);
            }
        return g;
    }

    private static float Gaussian(float value, float width)
    {
        return Mathf.Exp(-(value * value) / (width * width));
    }

    private sealed class BoundaryEdge { public int a, b, count; }

    private static void BuildTurnedHem(Transform root, Garment coat, Material cloth, Material lining)
    {
        // Weld by position only for edge discovery: UV seams must not become
        // false garment openings. The actual source vertices remain untouched.
        var edges = new Dictionary<string, BoundaryEdge>();
        for (int i = 0; i < coat.triangles.Count; i += 3)
            for (int e = 0; e < 3; e++)
            {
                int a = coat.triangles[i + e], b = coat.triangles[i + (e + 1) % 3];
                string ka = PositionKey(coat.vertices[a]), kb = PositionKey(coat.vertices[b]);
                string key = string.CompareOrdinal(ka, kb) < 0 ? ka + "/" + kb : kb + "/" + ka;
                BoundaryEdge edge;
                if (edges.TryGetValue(key, out edge)) edge.count++;
                else edges.Add(key, new BoundaryEdge { a = a, b = b, count = 1 });
            }
        var hem = new Garment { bones = coat.bones };
        var sections = new[] { new List<int>(), new List<int>() };
        foreach (BoundaryEdge edge in edges.Values)
        {
            if (edge.count != 1 || coat.vertices[edge.a].y > 0.94f || coat.vertices[edge.b].y > 0.94f) continue;
            int start = hem.vertices.Count;
            for (int row = 0; row < 4; row++)
                foreach (int index in new[] { edge.a, edge.b })
                {
                    Vector3 p = coat.vertices[index];
                    Vector3 radial = new Vector3(p.x, 0f, p.z - 0.018f).normalized;
                    if (row == 1) p += radial * 0.0023f - Vector3.up * 0.0014f;
                    if (row == 2) p -= radial * 0.0045f + Vector3.up * 0.0014f;
                    if (row == 3) p += -radial * 0.0045f + Vector3.up * 0.017f;
                    hem.vertices.Add(p); hem.weights.Add(coat.weights[index]);
                    hem.uv.Add(new Vector2(index * 0.03f, row * 0.08f));
                }
            for (int row = 0; row < 3; row++)
            {
                int a = start + row * 2;
                Quad(hem, a, a + 1, a + 3, a + 2);
                sections[row == 2 ? 1 : 0].AddRange(hem.triangles.GetRange(hem.triangles.Count - 6, 6));
            }
        }
        if (hem.triangles.Count > 0) CreateSkin(root, "Turned hem / cloth edge and dark inner return", hem, new[] { cloth, lining }, sections);
    }

    private static string PositionKey(Vector3 p)
    {
        return Mathf.RoundToInt(p.x * 10000f) + "," + Mathf.RoundToInt(p.y * 10000f) + "," + Mathf.RoundToInt(p.z * 10000f);
    }

    private static void KeepExposedHands(SkinnedMeshRenderer body, Transform model)
    {
        var data = FromSkin(body, model);
        Mesh copy = UnityEngine.Object.Instantiate(body.sharedMesh);
        copy.name = "Snow body / covered arms masked for jacket";
        for (int sub = 0; sub < copy.subMeshCount; sub++)
        {
            int[] indices = copy.GetTriangles(sub);
            var keep = new List<int>();
            for (int i = 0; i < indices.Length; i += 3)
            {
                Vector3 c = (data.vertices[indices[i]] + data.vertices[indices[i + 1]] + data.vertices[indices[i + 2]]) / 3f;
                if (Mathf.Abs(c.x) < 0.651f && c.y < 1.405f) continue;
                keep.Add(indices[i]); keep.Add(indices[i + 1]); keep.Add(indices[i + 2]);
            }
            copy.SetTriangles(keep, sub);
        }
        body.sharedMesh = copy;
    }

    private static void BuildSleeve(Transform root, Transform model, Dictionary<string, Transform> b,
        string suffix, Material cloth, Material cuff, Material seam)
    {
        Transform upper = b["DEF-UpperArm_1" + suffix];
        Transform elbow = b["DEF-Forearm_1" + suffix];
        Transform wrist = b["DEF-Wrist" + suffix];
        Vector3 shoulderP = model.InverseTransformPoint(upper.position);
        Vector3 elbowP = model.InverseTransformPoint(elbow.position);
        Vector3 wristP = model.InverseTransformPoint(wrist.position);
        var g = new Garment { bones = new[] { upper, elbow, wrist, b["DEF-Chest"] } };
        const int rings = 33, around = 24;
        for (int j = 0; j < rings; j++)
        {
            float t = j / (float)(rings - 1);
            Vector3 c = t < 0.53f ? Vector3.Lerp(shoulderP, elbowP, t / 0.53f) : Vector3.Lerp(elbowP, wristP, (t - 0.53f) / 0.47f);
            float shoulderJoin = 1f - Mathf.SmoothStep(0f, 1f, Mathf.InverseLerp(0f, 0.24f, t));
            float side = Mathf.Sign(shoulderP.x);
            c.x -= side * 0.060f * shoulderJoin;
            c.y -= 0.035f * shoulderJoin;
            Vector3 tangent = (t < 0.53f ? elbowP - shoulderP : wristP - elbowP).normalized;
            Vector3 cross = Vector3.Cross(tangent, Vector3.up).normalized;
            Vector3 radialUp = Vector3.Cross(cross, tangent).normalized;
            float radius = t < 0.48f ? Mathf.Lerp(0.051f, 0.046f, t / 0.48f) : Mathf.Lerp(0.046f, 0.034f, (t - 0.48f) / 0.52f);
            radius += 0.004f * Gaussian(t - 0.20f, 0.13f) + 0.003f * Gaussian(t - 0.65f, 0.10f);
            for (int k = 0; k <= around; k++)
            {
                float a = k / (float)around * Mathf.PI * 2f;
                // Two broad compression folds, each travelling diagonally
                // around the elbow, make bent fabric readable at race distance.
                float fold = 0.0045f * Gaussian(t - 0.465f - 0.026f * Mathf.Cos(a), 0.030f)
                    - 0.0038f * Gaussian(t - 0.505f - 0.026f * Mathf.Cos(a), 0.022f)
                    + 0.0042f * Gaussian(t - 0.555f + 0.020f * Mathf.Cos(a), 0.032f)
                    + 0.003f * Gaussian(t - 0.84f - 0.018f * Mathf.Cos(a), 0.035f);
                float rr = (radius + fold) * Mathf.Lerp(0.60f, 1f, 1f - shoulderJoin);
                // Preserve the repaired shoulder join and wrist fit; slim only
                // the middle sleeve so the elbow can separate from the waist.
                float clearWaist = Mathf.SmoothStep(0f, 1f, Mathf.InverseLerp(0.25f, 0.38f, t))
                    * (1f - Mathf.SmoothStep(0f, 1f, Mathf.InverseLerp(0.86f, 0.98f, t)));
                rr *= 1f - 0.08f * clearWaist;
                float sidePlane = Mathf.Sign(Mathf.Sin(a)) * Mathf.Pow(Mathf.Abs(Mathf.Sin(a)), 0.74f);
                Vector3 p = c + radialUp * Mathf.Cos(a) * rr * 0.96f + cross * sidePlane * rr * 0.82f;
                // Diagonal raglan opening reaches inward at the top and sits
                // inside the torso below. This removes the round shoulder cap.
                p.x -= side * 0.034f * Mathf.Max(0f, Mathf.Cos(a)) * shoulderJoin;
                g.vertices.Add(p);
                g.uv.Add(new Vector2(k / (float)around, t * 2.6f));
                float bend = Mathf.SmoothStep(0f, 1f, Mathf.InverseLerp(0.43f, 0.61f, t));
                float hand = Mathf.SmoothStep(0f, 0.25f, Mathf.InverseLerp(0.94f, 1f, t));
                // Proximal vertices are completely chest-owned while inside
                // the torso. Even 15% arm weight pulled the inward top ring up
                // when the arm rotated down, producing the detached cap shape.
                float chest = 1f - Mathf.SmoothStep(0f, 1f, Mathf.InverseLerp(0.09f, 0.25f, t));
                g.weights.Add(new BoneWeight { boneIndex0 = 0, weight0 = (1f - bend) * (1f - chest),
                    boneIndex1 = 1, weight1 = bend * (1f - hand), boneIndex2 = 2, weight2 = bend * hand,
                    boneIndex3 = 3, weight3 = (1f - bend) * chest });
            }
        }
        var sections = new[] { new List<int>(), new List<int>() };
        for (int j = 0; j < rings - 1; j++)
            for (int k = 0; k < around; k++)
            {
                int a = j * (around + 1) + k;
                // +normal points out on either arm: reversing the path tangent
                // also reverses the radial frame, preserving this winding.
                Quad(g, a, a + 1, a + around + 2, a + around + 1);
                List<int> group = j >= rings - 4 ? sections[1] : sections[0];
                group.AddRange(g.triangles.GetRange(g.triangles.Count - 6, 6));
            }
        CreateSkin(root, "Set-in long sleeve" + suffix, g, new[] { cloth, cuff }, sections);
    }

    private static void BuildCollar(Transform root, Transform model, Dictionary<string, Transform> bones,
        Material outer, Material inner, Material seam)
    {
        var g = new Garment { bones = new[] { bones["DEF-Chest"], bones["Neck"] } };
        const int segments = 64;
        // A turned-down collar has a narrow standing neck band and a broader
        // outer fold that rests on the shoulder, rather than a rigid neck ring.
        for (int layer = 0; layer < 5; layer++)
            for (int i = 0; i <= segments; i++)
            {
                float a = Mathf.Lerp(0.30f, Mathf.PI * 2f - 0.30f, i / (float)segments);
                float back = (1f - Mathf.Cos(a)) * 0.5f;
                float rx = layer == 0 ? 0.084f : layer == 1 ? 0.076f : layer == 2 ? 0.082f : layer == 3 ? 0.106f : 0.101f;
                float rz = layer == 0 ? 0.077f : layer == 1 ? 0.072f : layer == 2 ? 0.079f : layer == 3 ? 0.099f : 0.094f;
                float y = layer == 0 ? 1.377f : layer == 1 ? 1.450f : layer == 2 ? 1.456f : layer == 3 ? 1.382f : 1.385f;
                y += 0.010f * back - 0.015f * Mathf.Pow(1f - back, 3f) * (layer >= 3 ? 1f : 0f);
                // A slightly raised rear stand covers the lower nape, reducing
                // the pale horizontal hotspot without changing neck anatomy.
                if (layer == 1 || layer == 2) y += 0.022f * back * back;
                g.vertices.Add(new Vector3(Mathf.Sin(a) * rx, y, Mathf.Cos(a) * rz + 0.012f));
                g.uv.Add(new Vector2(i / (float)segments * 2f, layer * 0.13f));
                g.weights.Add(new BoneWeight { boneIndex0 = 0, weight0 = 1f });
            }
        var sections = new[] { new List<int>(), new List<int>() };
        for (int layer = 0; layer < 4; layer++)
            for (int i = 0; i < segments; i++)
            {
                int a = layer * (segments + 1) + i;
                Quad(g, a, a + 1, a + segments + 2, a + segments + 1);
                sections[layer == 0 ? 1 : 0].AddRange(g.triangles.GetRange(g.triangles.Count - 6, 6));
            }
        CreateSkin(root, "Folded collar / outer lip and inner lining", g, new[] { outer, inner }, sections);
    }

    private static bool IsMouthInterior(string name)
    {
        return name.Contains("teeth") || name.Contains("gums") || name.Contains("tongue");
    }

    private static bool IsHeadPart(SkinnedMeshRenderer renderer)
    {
        string name = renderer.name;
        return name == "GEO-snow-head" || name.Contains("eye");
    }

    private static Vector3 HeadShape(Vector3 p)
    {
        float amount = Mathf.SmoothStep(0f, 1f, Mathf.InverseLerp(1.43f, 1.54f, p.y));
        p.x *= Mathf.Lerp(1f, 0.94f, amount);
        p.z = 0.036f + (p.z - 0.036f) * Mathf.Lerp(1f, 0.94f, amount);
        p.y -= 0.025f * amount;
        return p;
    }

    private static SkinnedMeshRenderer RefineHeadPart(Transform root, SkinnedMeshRenderer source, Transform model)
    {
        Garment shape = FromSkin(source, model, true);
        for (int i = 0; i < shape.vertices.Count; i++) shape.vertices[i] = HeadShape(shape.vertices[i]);
        // Every facial component uses the identical vertex mapping. Eye/teeth
        // alignment is preserved; no bone is moved, rescaled, or repivoted here.
        var sections = new List<int>[source.sharedMesh.subMeshCount];
        for (int sub = 0; sub < sections.Length; sub++)
        {
            int[] indices = source.sharedMesh.GetTriangles(sub);
            sections[sub] = new List<int>();
            for (int i = 0; i < indices.Length; i += 3)
            {
                Vector3 centre = (shape.vertices[indices[i]] + shape.vertices[indices[i + 1]] + shape.vertices[indices[i + 2]]) / 3f;
                // Snow's head includes a small shoulder/neck skirt designed
                // for the original shirt. It must not protrude as skin wings
                // through this jacket's own continuous shoulder bridge.
                if (source.name == "GEO-snow-head")
                {
                    // Remove the covered neck skirt across its full width;
                    // retaining its central strip left two pointed skin prongs.
                    // The higher back collar overlaps this boundary by 1–2 cm.
                    float nape = Mathf.Clamp01((0.035f - centre.z) / 0.07f);
                    float coveredBoundary = Mathf.Lerp(1.445f, 1.466f, nape);
                    if (centre.y < coveredBoundary) continue;
                }
                sections[sub].Add(indices[i]); sections[sub].Add(indices[i + 1]); sections[sub].Add(indices[i + 2]);
            }
        }
        SkinnedMeshRenderer reshaped = CreateSkin(root, source.name + " / compact human proportions", shape, source.sharedMaterials, sections);
        source.enabled = false;
        return reshaped;
    }

    private static void BuildShortHair(Transform root, SkinnedMeshRenderer head, Transform model, Transform headBone, Material material)
    {
        Garment scalp = FromSkin(head, model);
        var hair = new Garment { bones = new[] { headBone } };
        Vector3 centre = HeadShape(new Vector3(0f, 1.622f, 0.036f));
        const int around = 80, rows = 22;
        // Generate an orderly hairline and project every vertex onto the actual
        // head surface. No whole-face masking: that left pale, ragged triangles
        // around the nape. The cap has a continuous temple/forehead/nape border.
        for (int row = 0; row < rows; row++)
        {
            float t = row / (float)(rows - 1);
            for (int i = 0; i <= around; i++)
            {
                float a = i / (float)around * Mathf.PI * 2f;
                float front = Mathf.Cos(a);
                float borderY = front >= 0f ? Mathf.Lerp(1.600f, 1.680f, front) : Mathf.Lerp(1.600f, 1.505f, -front);
                borderY = HeadShape(new Vector3(0f, borderY, 0.036f)).y;
                // Submillimetre irregularity softens the cut without a spiky rim.
                borderY += 0.0006f * Mathf.Sin(a * 17f) + 0.00035f * Mathf.Sin(a * 29f);
                float borderPolar = Mathf.Acos(Mathf.Clamp((borderY - centre.y) / 0.125f, -0.95f, 0.95f));
                float polar = Mathf.Lerp(borderPolar, 0.008f, t);
                Vector3 direction = new Vector3(Mathf.Sin(a) * Mathf.Sin(polar), Mathf.Cos(polar), Mathf.Cos(a) * Mathf.Sin(polar)).normalized;
                float hit = ScalpDistance(scalp, centre, direction);
                // Radial projection preserves the artist-authored skull shape.
                // A short, matte crop has millimetres of thickness, no shell rim.
                float crownBlend = Mathf.SmoothStep(0f, 1f, Mathf.InverseLerp(0.35f, 0.94f, t));
                float thickness = Mathf.Lerp(0.0011f, 0.005f, Mathf.SmoothStep(0f, 1f, t));
                // A modest side-swept crown breaks the perfect helmet outline.
                // These are broad authored locks, not noisy spikes or hair balls.
                thickness += crownBlend * (0.002f + 0.004f * (0.5f + 0.5f * Mathf.Sin(a - 0.6f)));
                float strand = 0.0011f * Mathf.Sin(a * 6f + t * 4.1f) * Mathf.Sin(t * Mathf.PI) * crownBlend;
                Vector3 swept = Vector3.left * (0.003f * crownBlend) + Vector3.forward * (0.002f * crownBlend);
                hair.vertices.Add(centre + direction * (hit + thickness + strand) + swept);
                hair.uv.Add(new Vector2(i / (float)around * 2f, t));
                hair.weights.Add(new BoneWeight { boneIndex0 = 0, weight0 = 1f });
            }
        }
        for (int row = 0; row < rows - 1; row++)
            for (int i = 0; i < around; i++)
            {
                int a = row * (around + 1) + i;
                Quad(hair, a, a + 1, a + around + 2, a + around + 1);
            }
        // Close the crown without duplicated degenerate pole quads.
        int crown = hair.vertices.Count;
        hair.vertices.Add(centre + Vector3.up * (ScalpDistance(scalp, centre, Vector3.up) + 0.009f)
            + Vector3.left * 0.003f + Vector3.forward * 0.002f);
        hair.uv.Add(new Vector2(1f, 1f));
        hair.weights.Add(new BoneWeight { boneIndex0 = 0, weight0 = 1f });
        int lastRow = (rows - 1) * (around + 1);
        for (int i = 0; i < around; i++)
        {
            hair.triangles.Add(lastRow + i); hair.triangles.Add(lastRow + i + 1); hair.triangles.Add(crown);
        }
        CreateSkin(root, "Short cropped hair / fitted continuous hairline", hair, new[] { material });
    }

    private static float ScalpDistance(Garment scalp, Vector3 origin, Vector3 direction)
    {
        float nearest = float.PositiveInfinity;
        for (int i = 0; i < scalp.triangles.Count; i += 3)
        {
            Vector3 a = scalp.vertices[scalp.triangles[i]];
            Vector3 ab = scalp.vertices[scalp.triangles[i + 1]] - a;
            Vector3 ac = scalp.vertices[scalp.triangles[i + 2]] - a;
            Vector3 p = Vector3.Cross(direction, ac);
            float determinant = Vector3.Dot(ab, p);
            if (Mathf.Abs(determinant) < 0.00000001f) continue;
            float inverse = 1f / determinant;
            Vector3 relative = origin - a;
            float u = Vector3.Dot(relative, p) * inverse;
            if (u < 0f || u > 1f) continue;
            Vector3 q = Vector3.Cross(relative, ab);
            float v = Vector3.Dot(direction, q) * inverse;
            if (v < 0f || u + v > 1f) continue;
            float distance = Vector3.Dot(ac, q) * inverse;
            if (distance > 0f && distance < nearest) nearest = distance;
        }
        if (!float.IsInfinity(nearest)) return nearest;
        // Only an unexpected hole in the source scalp reaches this fallback.
        return 1f / Mathf.Sqrt(direction.x * direction.x / 0.0104f
            + direction.y * direction.y / 0.0156f + direction.z * direction.z / 0.0121f);
    }

    private static void Quad(Garment g, int a, int b, int c, int d)
    {
        g.triangles.Add(a); g.triangles.Add(b); g.triangles.Add(c);
        g.triangles.Add(a); g.triangles.Add(c); g.triangles.Add(d);
    }

    private static SkinnedMeshRenderer CreateSkin(Transform parent, string name, Garment g,
        Material[] materials, List<int>[] sections = null)
    {
        var go = new GameObject(name);
        go.transform.SetParent(parent, false);
        var renderer = go.AddComponent<SkinnedMeshRenderer>();
        var mesh = new Mesh { name = name, indexFormat = g.vertices.Count > 65535 ? IndexFormat.UInt32 : IndexFormat.UInt16 };
        mesh.SetVertices(g.vertices); mesh.SetUVs(0, g.uv); mesh.boneWeights = g.weights.ToArray();
        mesh.bindposes = g.bones.Select(b => b.worldToLocalMatrix * go.transform.localToWorldMatrix).ToArray();
        if (sections == null) mesh.SetTriangles(g.triangles, 0);
        else
        {
            mesh.subMeshCount = sections.Length;
            for (int i = 0; i < sections.Length; i++) mesh.SetTriangles(sections[i], i);
        }
        mesh.RecalculateNormals(); mesh.RecalculateTangents(); mesh.RecalculateBounds();
        renderer.sharedMesh = mesh; renderer.bones = g.bones; renderer.rootBone = parent.parent;
        renderer.sharedMaterials = materials;
        renderer.quality = SkinQuality.Bone4; renderer.updateWhenOffscreen = true;
        renderer.shadowCastingMode = ShadowCastingMode.On; renderer.receiveShadows = true;
        // Meshes are generated once. This broad local bound covers all existing
        // jump and lane poses without hiding sleeves when a camera edge is near.
        renderer.localBounds = new Bounds(new Vector3(0f, 1f, 0f), new Vector3(2.5f, 3f, 2.5f));
        return renderer;
    }

    private static void TintExisting(SkinnedMeshRenderer renderer, Color tint, float smoothness)
    {
        Material[] copy = renderer.sharedMaterials.Select(m => new Material(m) { name = m.name + " / workwear grade" }).ToArray();
        foreach (Material m in copy)
        {
            m.SetColor("_BaseColor", tint);
            m.SetFloat("_Smoothness", smoothness);
            m.SetFloat("_Metallic", 0f);
        }
        renderer.sharedMaterials = copy;
    }

    private static void SubdueSkinResponse(SkinnedMeshRenderer renderer)
    {
        Material[] materials = renderer.sharedMaterials;
        bool changed = false;
        for (int i = 0; i < materials.Length; i++)
        {
            Material source = materials[i];
            bool skinMesh = renderer.name == "GEO-snow-head" || renderer.name == "GEO-snow-body";
            if (source == null || (!skinMesh && !source.name.StartsWith("snow.skin", StringComparison.OrdinalIgnoreCase))) continue;
            var skin = new Material(source) { name = source.name + " / restrained tunnel response" };
            // Preserve the supplied skin textures and relative colour. Reduce
            // reflectance and specular bloom that made the neck the focal point.
            // Material names vary after FBX/URP remapping; treat all exposed
            // head/body skin consistently, not just materials named "tile".
            skin.SetTexture("_BaseMap", null);
            skin.SetColor("_BaseColor", new Color(0.26f, 0.220f, 0.182f));
            skin.SetTexture("_BumpMap", null);
            skin.SetTexture("_MetallicGlossMap", null);
            skin.DisableKeyword("_NORMALMAP");
            skin.DisableKeyword("_METALLICSPECGLOSSMAP");
            skin.SetFloat("_Smoothness", 0.06f);
            skin.SetFloat("_SpecularHighlights", 0f);
            skin.SetFloat("_EnvironmentReflections", 0f);
            skin.EnableKeyword("_SPECULARHIGHLIGHTS_OFF");
            skin.EnableKeyword("_ENVIRONMENTREFLECTIONS_OFF");
            materials[i] = skin; changed = true;
        }
        if (changed) renderer.sharedMaterials = materials;
    }

    private static void RefineTrousers(Transform root, SkinnedMeshRenderer source, Transform model)
    {
        Garment trousers = FromSkin(source, model, true);
        for (int i = 0; i < trousers.vertices.Count; i++)
        {
            Vector3 p = trousers.vertices[i];
            if (p.y > 0.76f)
            {
                // The shorter jacket exposes the seat. Bridge the central
                // hollow and soften the rounded jeans fit into a relaxed plane.
                float seat = Gaussian(p.y - 0.845f, 0.11f);
                float rear = Mathf.Clamp01((0.015f - p.z) * 17f);
                p.z = Mathf.Lerp(p.z, -0.087f, seat * rear * 0.62f);
                p.x *= 1f - 0.055f * seat;
                trousers.vertices[i] = p;
                continue;
            }
            float side = p.x < 0f ? -1f : 1f;
            float centreX = side * 0.082f;
            float centreZ = Mathf.Lerp(-0.018f, 0.008f, Mathf.InverseLerp(0.10f, 0.51f, p.y));
            float belowHem = Mathf.SmoothStep(0f, 1f, Mathf.InverseLerp(0.76f, 0.67f, p.y));
            float straightCut = Gaussian(p.y - 0.35f, 0.24f) * belowHem;
            float lateral = p.x - centreX;
            float extraWidth = (0.009f * Gaussian(p.y - 0.59f, 0.19f) + 0.008f * Gaussian(p.y - 0.30f, 0.18f)) * belowHem;
            // Leave clearance at the inner thigh while giving the trousers
            // a coherent relaxed cut from thigh to calf, rather than thin rods.
            bool inward = side * lateral < 0f;
            if (inward) extraWidth = Mathf.Min(extraWidth * 0.28f, Mathf.Max(0f, Mathf.Abs(p.x) - 0.012f) * 0.65f);
            // Most relaxed-cut volume belongs on the outer seam. Preserve
            // the negative space between inner knees/calves in passing poses.
            p.x = centreX + lateral * (1f + (inward ? 0.035f : 0.08f) * straightCut)
                + Mathf.Sign(lateral) * extraWidth * Mathf.Clamp01(Mathf.Abs(lateral) / 0.035f);
            p.z = centreZ + (p.z - centreZ) * (1f + 0.11f * straightCut);
            float front = Mathf.Clamp01((p.z - centreZ) * 25f);
            float back = Mathf.Clamp01((centreZ - p.z) * 25f);
            // Deliberate fabric breaks at the knee and boot; larger than the
            // texture weave, subtle enough to keep the underlying runner lean.
            p.z += front * (0.006f * Gaussian(p.y - 0.475f, 0.030f) - 0.003f * Gaussian(p.y - 0.430f, 0.021f));
            p.z -= back * (0.004f * Gaussian(p.y - 0.515f, 0.024f) + 0.003f * Gaussian(p.y - 0.160f, 0.025f));
            trousers.vertices[i] = p;
        }
        TintExisting(source, new Color(0.085f, 0.098f, 0.090f), 0.045f);
        foreach (Material material in source.sharedMaterials)
        {
            QuietSurface(material);
            material.SetFloat("_SpecularHighlights", 0f);
            material.SetFloat("_EnvironmentReflections", 0f);
            material.EnableKeyword("_SPECULARHIGHLIGHTS_OFF");
            material.EnableKeyword("_ENVIRONMENTREFLECTIONS_OFF");
        }
        CreateSkin(root, "Straight work trousers / knee and ankle cloth breaks", trousers, source.sharedMaterials);
        source.enabled = false;
    }

    private static void RefineBoot(Transform root, SkinnedMeshRenderer source, Transform model)
    {
        Garment boot = FromSkin(source, model, true);
        bool sole = source.name.Contains("bottom");
        for (int i = 0; i < boot.vertices.Count; i++)
        {
            Vector3 p = boot.vertices[i];
            float centreX = (p.x < 0f ? -1f : 1f) * 0.083f;
            p.x = centreX + (p.x - centreX) * (sole ? 1.085f : 1.060f);
            float toe = Mathf.SmoothStep(0f, 1f, Mathf.InverseLerp(0.08f, 0.19f, p.z));
            p.z += toe * 0.014f;
            if (!sole) p.y += 0.004f * Gaussian(p.z + 0.005f, 0.055f) * Mathf.InverseLerp(0.025f, 0.095f, p.y);
            boot.vertices[i] = p;
        }
        TintExisting(source, sole ? new Color(0.026f, 0.030f, 0.028f) : new Color(0.061f, 0.056f, 0.047f), sole ? 0.025f : 0.08f);
        foreach (Material material in source.sharedMaterials) QuietSurface(material);
        CreateSkin(root, source.name + " / worn work-boot silhouette", boot, source.sharedMaterials);
        source.enabled = false;
    }

    private static void QuietSurface(Material material)
    {
        material.SetTexture("_BaseMap", null);
        material.SetTexture("_BumpMap", null);
        material.SetTexture("_MetallicGlossMap", null);
        material.DisableKeyword("_NORMALMAP");
        material.DisableKeyword("_METALLICSPECGLOSSMAP");
        material.SetFloat("_Metallic", 0f);
    }

    private static Material Cloth(string name, Color color, float smoothness, bool hair = false)
    {
        Shader shader = Shader.Find("Universal Render Pipeline/Lit");
        if (shader == null) throw new InvalidOperationException("The workwear pass requires the study's URP Lit shader.");
        var m = new Material(shader) { name = name };
        m.SetColor("_BaseColor", color);
        m.SetFloat("_Metallic", 0f); m.SetFloat("_Smoothness", smoothness);
        m.SetFloat("_Cull", (float)CullMode.Off);
        // All new wardrobe surfaces are matte textiles. Broad dielectric
        // highlights on the original test jacket made it read as exposed skin.
        m.SetFloat("_SpecularHighlights", 0f);
        m.SetFloat("_EnvironmentReflections", 0f);
        m.EnableKeyword("_SPECULARHIGHLIGHTS_OFF");
        m.EnableKeyword("_ENVIRONMENTREFLECTIONS_OFF");
        if (hair)
        {
            // A short matte crop must not pick up a broad white plastic sheen
            // under the tunnel's strong practical lights.
            m.SetFloat("_Smoothness", 0.08f);
            m.SetFloat("_SpecularHighlights", 0f);
            m.SetFloat("_EnvironmentReflections", 0f);
            m.EnableKeyword("_SPECULARHIGHLIGHTS_OFF");
            m.EnableKeyword("_ENVIRONMENTREFLECTIONS_OFF");
        }
        // Geometry and lighting carry the form. No microfibre or skin-like
        // bump noise is added to this deliberately quiet material treatment.
        QuietSurface(m);
        return m;
    }
}
