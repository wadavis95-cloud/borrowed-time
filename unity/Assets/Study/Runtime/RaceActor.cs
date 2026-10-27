using System;
using System.Collections.Generic;
using UnityEngine;
using UnityEngine.Rendering;

/// <summary>
/// An externally positioned runner. JavaScript supplies accepted movement and
/// exact jump height; this component adds only body/foot presentation. There
/// is deliberately no Update, input handling, collision or ability logic.
/// </summary>
public sealed class RaceActor : MonoBehaviour
{
    public GroundedRunnerPose Pose { get; private set; }
    public bool IsGhost { get; private set; }
    public string ActorId { get; private set; }
    public float PresentedJumpHeight { get; private set; }
    public float PresentedLane { get { return transform.position.x / RaceScale.Lane + 1f; } }
    public float LandingAmount { get; private set; }
    public bool HasFrame { get { return initialized; } }
    public bool BoostVisible { get; private set; }

    private const float LocalLaneResponse = 25f; // about 95% settled in .12 s
    private const float LanePoseDuration = 0.12f;
    private readonly List<Material> ownedMaterials = new List<Material>();
    private readonly List<Mesh> ownedMeshes = new List<Mesh>();
    private readonly List<Surface> surfaces = new List<Surface>();
    private readonly List<LineRenderer> boostTrails = new List<LineRenderer>();
    private readonly List<Vector3> boostPath = new List<Vector3>();
    private readonly List<float> boostPathTimes = new List<float>();
    private float effectClock;
    private sealed class Surface { public Material material; public Color baseColor; public bool jacket, seam; }
    private bool initialized;
    private string avatarId, actorColor;
    private float gaitPhase, runCadence, lastJumpProgress = -1f, lastJumpDuration, previousDistance;
    private float landingTime = 1f, laneTime = 1f, laneStartX, laneEndX;
    private int laneDirection;

    public static RaceActor Create(GroundedRunnerPose template, Transform parent, bool ghost, Material ghostMaterial)
    {
        if (template == null) throw new ArgumentNullException("template");
        // Capture asset references before initialization so cleanup only owns
        // runtime-generated wardrobe meshes/materials, never imported assets.
        var sourceMaterials = new HashSet<Material>();
        var sourceMeshes = new HashSet<Mesh>();
        foreach (Renderer r in template.GetComponentsInChildren<Renderer>(true))
            foreach (Material m in r.sharedMaterials) if (m != null) sourceMaterials.Add(m);
        foreach (SkinnedMeshRenderer r in template.GetComponentsInChildren<SkinnedMeshRenderer>(true))
            if (r.sharedMesh != null) sourceMeshes.Add(r.sharedMesh);

        GameObject instance = Instantiate(template.gameObject, parent);
        instance.name = ghost ? "Opponent / transparent workwear runner" : "You / workwear runner";
        instance.transform.localScale = Vector3.one;
        instance.transform.SetPositionAndRotation(Vector3.zero, Quaternion.identity);
        RaceActor actor = instance.AddComponent<RaceActor>();
        actor.IsGhost = ghost;
        actor.Pose = instance.GetComponent<GroundedRunnerPose>();
        if (actor.Pose == null) throw new InvalidOperationException("Runner template must have its pose on the root.");
        instance.SetActive(true);
        actor.Pose.InitializeRig();
        if (!actor.Pose.IsReady) throw new InvalidOperationException("The game runner's neutral rig could not initialize.");
        actor.Pose.ExternalMotion = true;
        foreach (Renderer r in instance.GetComponentsInChildren<Renderer>(true))
            foreach (Material m in r.sharedMaterials)
                if (m != null && !sourceMaterials.Contains(m) && !actor.ownedMaterials.Contains(m)) actor.ownedMaterials.Add(m);
        foreach (SkinnedMeshRenderer r in instance.GetComponentsInChildren<SkinnedMeshRenderer>(true))
            if (r.sharedMesh != null && !sourceMeshes.Contains(r.sharedMesh) && !actor.ownedMeshes.Contains(r.sharedMesh)) actor.ownedMeshes.Add(r.sharedMesh);
        actor.PrepareSurfaces(ghostMaterial);
        if (!ghost) actor.CreateBoostTrails(ghostMaterial);
        return actor;
    }

    public void Assign(RaceActorState state)
    {
        ActorId = state.id ?? "";
        if (avatarId == state.avatarId && actorColor == state.color) return;
        avatarId = state.avatarId;
        actorColor = state.color;
        ApplySurfaceColors(0f);
    }

    public void ResetPresentation()
    {
        initialized = false;
        gaitPhase = 0f;
        runCadence = 0f;
        lastJumpProgress = -1f;
        lastJumpDuration = 0f;
        landingTime = laneTime = 1f;
        laneDirection = 0;
        LandingAmount = PresentedJumpHeight = 0f;
        BoostVisible = false;
        foreach (LineRenderer trail in boostTrails) { trail.enabled = false; trail.positionCount = 0; }
        boostPath.Clear(); boostPathTimes.Clear(); effectClock = 0f;
        if (Pose != null && Pose.IsReady) Pose.ResetStepIntents();
    }

    public void Present(RaceActorState state, float dt, bool reducedMotion, bool freeze)
    {
        if (!RaceScale.ValidActor(state)) return;
        Assign(state);
        float jumpHeight = state.jumpHeight * RaceScale.Height;
        float targetX = RaceScale.WorldX(state.lane), targetZ = RaceScale.WorldZ(state.distance);
        bool air = state.jumpProgress >= 0f;
        if (!initialized)
        {
            transform.position = new Vector3(targetX, 0f, targetZ);
            // A spatial seed gives racers distinct starting footfalls. After
            // this, a continuous performance clock drives arms and legs.
            gaitPhase = Mathf.Repeat(targetZ / 2.3f, 1f);
            runCadence = CadenceForSpeed(state.speed * RaceScale.Forward);
            Pose.ResetPresentationPose(gaitPhase, state.speed * RaceScale.Forward, jumpHeight, state.jumpProgress);
            lastJumpProgress = state.jumpProgress;
            lastJumpDuration = state.jumpDuration;
            previousDistance = state.distance;
            PresentedJumpHeight = jumpHeight;
            initialized = true;
            UpdateLocalEffects(state, reducedMotion, freeze, 0f);
            return;
        }
        if (freeze) return;
        dt = Mathf.Clamp(dt, 0f, 0.1f);
        Vector3 before = transform.position;
        float distanceDelta = state.distance - previousDistance;
        // A reconnect, seek or discontinuity starts clean contacts at the new
        // accepted position. We never walk an actor through missing snapshots.
        if (Mathf.Abs(targetZ - before.z) > 1.8f || distanceDelta < -0.01f)
        {
            ResetPresentation();
            Present(state, 0f, reducedMotion, false);
            return;
        }
        bool moved = Mathf.Abs(distanceDelta) > 0.00001f || Mathf.Abs(targetX - before.x) > 0.0001f;
        bool jumpChanged = Mathf.Abs(state.jumpProgress - lastJumpProgress) > 0.0001f
            || Mathf.Abs(jumpHeight - PresentedJumpHeight) > 0.0001f;
        if (dt <= 0f || (!moved && !jumpChanged))
        {
            UpdateLocalEffects(state, reducedMotion, false, dt);
            return;
        }
        float nextX = IsGhost ? targetX : Mathf.Lerp(before.x, targetX, 1f - Mathf.Exp(-LocalLaneResponse * dt));
        if (Mathf.Abs(nextX - targetX) < 0.0001f) nextX = targetX;
        Vector3 after = new Vector3(nextX, 0f, targetZ);
        float forwardSpeed = Mathf.Max(0f, (after.z - before.z) / dt);
        float lateralSpeed = (after.x - before.x) / dt;
        bool newArc = air && (lastJumpProgress < 0f || state.jumpDuration != lastJumpDuration
            || state.jumpProgress + 0.025f < lastJumpProgress);
        if (newArc)
        {
            // A paid long jump may replace an ordinary jump while already in
            // flight. The exact supplied height wins; only foot history resets.
            if (lastJumpProgress >= 0f)
                Pose.ResetPresentationPose(gaitPhase, forwardSpeed, jumpHeight, state.jumpProgress);
            else Pose.PrepareJump();
            laneTime = 1f;
        }
        if (!air && lastJumpProgress >= 0f) landingTime = 0f;

        int direction = Mathf.Abs(targetX - before.x) > 0.003f ? (targetX > before.x ? 1 : -1) : 0;
        float intendedX = RaceScale.WorldX(direction > 0 ? Mathf.Ceil(state.lane - 0.001f)
            : direction < 0 ? Mathf.Floor(state.lane + 0.001f) : state.lane);
        if (direction != 0 && (laneDirection != direction || Mathf.Abs(intendedX - laneEndX) > 0.1f))
        {
            laneDirection = direction;
            laneStartX = before.x;
            laneEndX = intendedX;
            laneTime = 0f;
            Pose.BeginLaneStep(direction, laneEndX, LanePoseDuration, forwardSpeed, !air);
        }

        // Substeps transport contact anchors across the already accepted frame.
        // This is not network interpolation: the final root/height is the exact
        // supplied frame (with only the explicitly permitted local lane easing).
        int steps = Mathf.Max(1, Mathf.CeilToInt(dt * 120f));
        float stepDt = dt / steps;
        float priorHeight = newArc && lastJumpProgress >= 0f ? jumpHeight : PresentedJumpHeight;
        float priorProgress = lastJumpProgress;
        for (int i = 1; i <= steps; i++)
        {
            float t = (float)i / steps;
            Vector3 position = Vector3.Lerp(before, after, t);
            transform.position = position;
            // Animation pace responds smoothly to running/boosting instead of
            // doubling the limb cycle for every doubling of game distance.
            // Lane changes never restart or rephase the running performance.
            runCadence = Mathf.Lerp(runCadence, CadenceForSpeed(forwardSpeed), 1f - Mathf.Exp(-8f * stepDt));
            gaitPhase = Mathf.Repeat(gaitPhase + runCadence * stepDt, 1f);
            laneTime += stepDt;
            float travelledLane = Mathf.Abs(laneEndX - laneStartX) > 0.001f
                ? 1f - Mathf.Abs(laneEndX - position.x) / Mathf.Abs(laneEndX - laneStartX) : 1f;
            Pose.UpdateLaneStep(Mathf.Max(Mathf.Clamp01(laneTime / LanePoseDuration), Mathf.Clamp01(travelledLane)), !air);
            float height = Mathf.Lerp(priorHeight, jumpHeight, t);
            float progress = air ? (!newArc && priorProgress >= 0f ? Mathf.Lerp(priorProgress, state.jumpProgress, t) : state.jumpProgress) : -1f;
            landingTime += stepDt;
            float landing = Mathf.Clamp01(landingTime / 0.18f);
            LandingAmount = landing < 1f ? Mathf.Sin(Mathf.PI * Mathf.Pow(landing, 0.65f)) : 0f;
            Pose.ApplyPose(gaitPhase, forwardSpeed, lateralSpeed, height, progress, LandingAmount, 0f, stepDt);
        }
        // All jump translation comes from the game, including its last frame.
        PresentedJumpHeight = jumpHeight;
        previousDistance = state.distance;
        lastJumpProgress = state.jumpProgress;
        lastJumpDuration = state.jumpDuration;
        UpdateLocalEffects(state, reducedMotion, false, dt);
    }

    private static float CadenceForSpeed(float speed)
    {
        // Full left/right cycles per second, not individual footfalls. Fast
        // game travel is deliberately stylized; race speed remains untouched.
        speed = Mathf.Max(0f, speed);
        return Mathf.Min(2.6f, 1.05f + speed * 0.17f) * Mathf.Clamp01(speed / 2f);
    }

    private void PrepareSurfaces(Material ghostMaterial)
    {
        var copies = new Dictionary<Material, Material>();
        foreach (Renderer renderer in GetComponentsInChildren<Renderer>(true))
        {
            // A transparent outer head cannot occlude its opaque inner face.
            // Keep only its silhouette on opponents; the local runner retains
            // all original facial surfaces and their approved appearance.
            if (IsGhost && IsInternalFaceRenderer(renderer.name))
            {
                renderer.enabled = false;
                continue;
            }
            Material[] materials = renderer.sharedMaterials;
            for (int i = 0; i < materials.Length; i++)
            {
                Material source = materials[i];
                if (source == null) continue;
                if (!copies.TryGetValue(source, out Material copy))
                {
                    copy = new Material(IsGhost && ghostMaterial != null ? ghostMaterial : source);
                    copy.name = source.name + (IsGhost ? " / public opponent" : " / local palette");
                    Color color = source.HasProperty("_BaseColor") ? source.GetColor("_BaseColor") : Color.white;
                    if (IsGhost)
                    {
                        ConfigureTransparent(copy);
                        if (copy.HasProperty("_BaseMap") && source.HasProperty("_BaseMap"))
                            copy.SetTexture("_BaseMap", source.GetTexture("_BaseMap"));
                    }
                    string name = source.name.ToLowerInvariant();
                    surfaces.Add(new Surface { material = copy, baseColor = color,
                        jacket = name.Contains("weathered brick") || name.Contains("faded stitched"), seam = name.Contains("faded stitched") });
                    copies[source] = copy;
                    ownedMaterials.Add(copy);
                }
                materials[i] = copy;
            }
            renderer.sharedMaterials = materials;
            if (IsGhost) { renderer.shadowCastingMode = ShadowCastingMode.Off; renderer.receiveShadows = false; }
            if (renderer is SkinnedMeshRenderer skin) skin.updateWhenOffscreen = true;
        }
    }

    private static bool IsInternalFaceRenderer(string name)
    {
        // RunnerWardrobe creates reshaped copies of eye renderers under this
        // exact suffix. Match those and their originals, without broadly
        // matching "eye" (which would remove the outer eyebrows as well).
        const string reshapedSuffix = " / compact human proportions";
        if (name.EndsWith(reshapedSuffix, StringComparison.Ordinal))
            name = name.Substring(0, name.Length - reshapedSuffix.Length);
        switch (name)
        {
            case "GEO-snow-eye_dots":
            case "GEO-snow_eye_corneas":
            case "GEO-snow-teeth_upper":
            case "GEO-snow-teeth_lower":
            case "GEO-snow-gums_upper":
            case "GEO-snow-gums_lower":
            case "GEO-snow-tongue":
                return true;
            default:
                return false;
        }
    }

    private static Color Palette(string id)
    {
        switch (id)
        {
            case "engineer": return new Color(0.30f, 0.20f, 0.09f);
            case "guard": return new Color(0.055f, 0.13f, 0.22f);
            case "runner": return new Color(0.08f, 0.23f, 0.17f);
            default: return new Color(0.27f, 0.066f, 0.044f);
        }
    }

    private void ApplySurfaceColors(float hit)
    {
        Color team = new Color(0.50f, 0.68f, 0.72f);
        if (!string.IsNullOrEmpty(actorColor) && ColorUtility.TryParseHtmlString(actorColor, out Color parsed)) team = parsed;
        foreach (Surface surface in surfaces)
        {
            Color color = surface.jacket ? Palette(avatarId) * (surface.seam ? 0.82f : 1f) : surface.baseColor;
            if (IsGhost)
            {
                color = Color.Lerp(color, team, 0.28f);
                color.a = 0.36f;
            }
            else { color = Color.Lerp(color, new Color(0.46f, 0.36f, 0.32f), hit * 0.40f); color.a = 1f; }
            if (surface.material.HasProperty("_BaseColor")) surface.material.SetColor("_BaseColor", color);
            else if (surface.material.HasProperty("_Color")) surface.material.SetColor("_Color", color);
        }
    }

    private static void ConfigureTransparent(Material material)
    {
        if (material.HasProperty("_Surface")) material.SetFloat("_Surface", 1f);
        if (material.HasProperty("_Blend")) material.SetFloat("_Blend", 0f);
        if (material.HasProperty("_SrcBlend")) material.SetFloat("_SrcBlend", (float)BlendMode.SrcAlpha);
        if (material.HasProperty("_DstBlend")) material.SetFloat("_DstBlend", (float)BlendMode.OneMinusSrcAlpha);
        if (material.HasProperty("_ZWrite")) material.SetFloat("_ZWrite", 0f);
        material.EnableKeyword("_SURFACE_TYPE_TRANSPARENT");
        material.DisableKeyword("_ALPHAPREMULTIPLY_ON");
        material.DisableKeyword("_ALPHATEST_ON");
        material.SetOverrideTag("RenderType", "Transparent");
        material.renderQueue = (int)RenderQueue.Transparent;
    }

    private void CreateBoostTrails(Material template)
    {
        if (template == null) return;
        Material material = new Material(template) { name = "Local boost / restrained blue-grey streak" };
        ConfigureTransparent(material);
        if (material.HasProperty("_BaseColor")) material.SetColor("_BaseColor", new Color(0.46f, 0.65f, 0.70f, 0.25f));
        ownedMaterials.Add(material);
        for (int side = -1; side <= 1; side += 2)
        {
            var child = new GameObject("Local boost streak");
            child.transform.SetParent(transform, false);
            child.transform.localPosition = new Vector3(side * 0.22f, 0.68f, -0.12f);
            LineRenderer trail = child.AddComponent<LineRenderer>();
            trail.sharedMaterial = material;
            trail.useWorldSpace = true;
            trail.startWidth = 0.045f;
            trail.endWidth = 0f;
            trail.shadowCastingMode = ShadowCastingMode.Off;
            trail.receiveShadows = false;
            trail.positionCount = 0;
            trail.enabled = false;
            boostTrails.Add(trail);
        }
    }

    private void StopTrails()
    {
        BoostVisible = false;
        foreach (LineRenderer trail in boostTrails) { trail.enabled = false; trail.positionCount = 0; }
        boostPath.Clear(); boostPathTimes.Clear();
    }

    private void UpdateLocalEffects(RaceActorState state, bool reducedMotion, bool frozen, float dt)
    {
        // Store the short trail ourselves against supplied time. TrailRenderer's
        // independent Unity clock would fade/mutate it while a race was paused.
        // Repeated or stalled frames therefore preserve the same visible effect.
        if (frozen) return;
        bool boost = !IsGhost && !reducedMotion && state.phase == "running" && state.boosting;
        if (!boost) StopTrails();
        else
        {
            BoostVisible = true;
            effectClock += Mathf.Max(0f, dt);
            Vector3 point = transform.position + new Vector3(0f, 0.68f + PresentedJumpHeight, -0.12f);
            if (boostPath.Count == 0 || (point - boostPath[boostPath.Count - 1]).sqrMagnitude > 0.0004f)
            {
                boostPath.Add(point); boostPathTimes.Add(effectClock);
            }
            while (boostPath.Count > 2 && (effectClock - boostPathTimes[0] > 0.16f || boostPath.Count > 32))
            { boostPath.RemoveAt(0); boostPathTimes.RemoveAt(0); }
            for (int i = 0; i < boostTrails.Count; i++)
            {
                LineRenderer trail = boostTrails[i];
                trail.enabled = boostPath.Count >= 2;
                trail.positionCount = boostPath.Count;
                float offset = i == 0 ? -0.22f : 0.22f;
                // Newest point is widest; the oldest point tapers to nothing.
                for (int j = 0; j < boostPath.Count; j++)
                    trail.SetPosition(j, boostPath[boostPath.Count - 1 - j] + Vector3.right * offset);
            }
        }
        ApplySurfaceColors(IsGhost ? 0f : Mathf.Clamp01(state.hitFlash / 0.45f));
    }

    private void OnDestroy()
    {
        foreach (Material material in ownedMaterials) if (material != null) Destroy(material);
        foreach (Mesh mesh in ownedMeshes) if (mesh != null) Destroy(mesh);
    }
}
