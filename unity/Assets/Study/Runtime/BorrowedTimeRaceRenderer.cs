using System;
using System.Collections.Generic;
using UnityEngine;
using UnityEngine.Scripting;
using System.Runtime.InteropServices;

/// <summary>
/// Browser-to-Unity presentation receiver. It accepts already simulated and
/// interpolated race frames. Unity never owns the race clock, inputs or hits.
/// </summary>
[Preserve]
public sealed class BorrowedTimeRaceRenderer : MonoBehaviour
{
#if UNITY_WEBGL && !UNITY_EDITOR
    [DllImport("__Internal")] private static extern void BT_PresentationError(string message);
#endif
    public GroundedRunnerPose runnerTemplate;
    public Camera followCamera;
    public RaceWorld world;
    public Material ghostMaterial;

    public bool HasCourse { get; private set; }
    public int AcceptedEpoch { get; private set; } = -1;
    public int AcceptedSequence { get; private set; } = -1;
    public int VisibleOpponentCount { get; private set; }
    public RaceActor LocalActor { get { return local; } }
    public RaceFrame LastFrame { get; private set; }
    public string LastError { get; private set; }

    private static readonly Vector3 ViewOffset = new Vector3(0f, 2.2f, -7.4f);
    private static readonly Vector3 LookAhead = new Vector3(0f, 1.1f, 4.5f);
    private static readonly Vector3 LightCameraOffset = new Vector3(0f, 1.95f, -4.7f);
    private RaceActor local;
    private readonly List<RaceActor> ghostPool = new List<RaceActor>();
    private readonly Dictionary<string, RaceActor> ghosts = new Dictionary<string, RaceActor>();
    private readonly List<LightAnchor> lights = new List<LightAnchor>();
    private sealed class LightAnchor { public Transform light; public Vector3 offset; public Quaternion rotation; }
    private int minimumEpoch;
    private bool initialized, cameraInitialized;
    private Vector3 cameraPosition;
    private float lastAspect = -1f;

    private void Awake()
    {
        Application.runInBackground = true;
        Application.targetFrameRate = 60;
#if UNITY_WEBGL && !UNITY_EDITOR
        // The surrounding HTML page owns room inputs, abilities and gestures.
        WebGLInput.captureAllKeyboardInput = false;
#endif
    }

    private void EnsureInitialized()
    {
        if (initialized) return;
        if (runnerTemplate == null || followCamera == null || world == null)
            throw new InvalidOperationException("Assign the inactive runner template, camera and RaceWorld.");
        // Capture the authored baseline light rig before moving the view back.
        // Camera changes must not change the approved character lighting.
        foreach (Light light in followCamera.GetComponentsInChildren<Light>(true))
            lights.Add(new LightAnchor { light = light.transform,
                offset = followCamera.transform.InverseTransformPoint(light.transform.position),
                rotation = Quaternion.Inverse(followCamera.transform.rotation) * light.transform.rotation });
        runnerTemplate.gameObject.SetActive(false);
        local = RaceActor.Create(runnerTemplate, transform, false, ghostMaterial);
        local.gameObject.SetActive(false);
        for (int i = 0; i < 3; i++)
        {
            RaceActor actor = RaceActor.Create(runnerTemplate, transform, true, ghostMaterial);
            actor.gameObject.SetActive(false);
            ghostPool.Add(actor);
        }
        initialized = true;
    }

    [Preserve]
    public void LoadCourse(string json)
    {
        try
        {
            RaceCourse course = JsonUtility.FromJson<RaceCourse>(json);
            ValidateCourse(course);
            if (course.epoch < minimumEpoch || course.epoch < AcceptedEpoch) return;
            if (HasCourse && course.epoch == AcceptedEpoch) return;
            EnsureInitialized();
            ClearActorHistory();
            world.ResetPresentation();
            world.LoadCourse(course);
            AcceptedEpoch = course.epoch;
            AcceptedSequence = -1;
            minimumEpoch = course.epoch;
            LastFrame = null;
            LastError = null;
            HasCourse = true;
        }
        catch (Exception error) { Fail("LoadCourse", error); }
    }

    [Preserve]
    public void RenderFrame(string json)
    {
        try
        {
            RaceFrame frame = JsonUtility.FromJson<RaceFrame>(json);
            if (frame == null || frame.version != 1) throw new ArgumentException("Unsupported race frame version.");
            // Ignore delayed messages from a previous round and duplicate frames.
            if (!HasCourse || frame.epoch != AcceptedEpoch || frame.sequence <= AcceptedSequence) return;
            if (!RaceScale.ValidActor(frame.player) || !RaceScale.IsFinite(frame.elapsed) || frame.elapsed < 0f
                || !RaceScale.IsFinite(frame.dt) || frame.dt < 0f)
                throw new ArgumentException("Race frame contains invalid movement or time.");
            if (LastFrame != null && frame.elapsed + 0.0001f < LastFrame.elapsed) return;

            bool first = LastFrame == null;
            float clockStep = first ? 0f : Mathf.Max(0f, frame.elapsed - LastFrame.elapsed);
            bool paused = frame.phase == "paused" || frame.player.phase == "paused";
            bool clockAdvanced = clockStep > 0.000001f;
            bool actorChanged = first || Changed(frame.player, LastFrame.player);
            // An accepted lane/jump command can arrive between server ticks.
            // Give that changed pose one presentation frame; repeated stale
            // snapshots cannot keep a character or hazard moving by themselves.
            float dt = paused || first ? 0f : Mathf.Clamp(clockAdvanced ? clockStep : actorChanged ? frame.dt : 0f, 0f, 0.1f);
            if (clockStep > 0.25f)
            {
                local.ResetPresentation();
                foreach (RaceActor actor in ghostPool) actor.ResetPresentation();
                cameraInitialized = false;
            }
            local.gameObject.SetActive(true);
            local.Present(frame.player, dt, frame.reducedMotion, paused || (!first && !clockAdvanced && !actorChanged));
            PresentOpponents(frame, dt, paused, clockAdvanced, first);
            world.RenderFrame(frame);
            UpdateCamera(frame, dt, first || !cameraInitialized);
            LastFrame = frame;
            AcceptedSequence = frame.sequence;
            LastError = null;
        }
        catch (Exception error) { Fail("RenderFrame", error); }
    }

    [Preserve]
    public void ResetPresentation()
    {
        // A reset requires a newer course epoch. Old queued frames cannot
        // resurrect the previous room while the next room is being prepared.
        minimumEpoch = Mathf.Max(minimumEpoch, AcceptedEpoch + 1);
        HasCourse = false;
        AcceptedSequence = -1;
        LastFrame = null;
        LastError = null;
        ClearActorHistory();
        if (world != null) world.ResetPresentation();
    }

    private void ClearActorHistory()
    {
        if (local != null) { local.ResetPresentation(); local.gameObject.SetActive(false); }
        foreach (RaceActor actor in ghostPool) { actor.ResetPresentation(); actor.gameObject.SetActive(false); }
        ghosts.Clear();
        VisibleOpponentCount = 0;
        cameraInitialized = false;
    }

    private void PresentOpponents(RaceFrame frame, float dt, bool paused, bool clockAdvanced, bool first)
    {
        var visible = new HashSet<string>();
        RaceActorState[] opponents = frame.opponents ?? Array.Empty<RaceActorState>();
        foreach (RaceActorState state in opponents)
        {
            if (visible.Count >= 3 || !RaceScale.ValidActor(state) || string.IsNullOrEmpty(state.id)
                || state.id == frame.player.id || visible.Contains(state.id)
                || state.phase == "disconnected" || state.phase == "won" || state.phase == "lost") continue;
            float relative = state.distance - frame.player.distance;
            if (relative < -RaceScale.VisibleBehind || relative > RaceScale.VisibleAhead) continue;
            visible.Add(state.id);
        }
        // Reclaim absent IDs before assigning newcomers, including all-three
        // replacements during a room change. Pool count stays bounded at three.
        var remove = new List<string>();
        foreach (var pair in ghosts)
            if (!visible.Contains(pair.Key)) { pair.Value.ResetPresentation(); pair.Value.gameObject.SetActive(false); remove.Add(pair.Key); }
        foreach (string id in remove) ghosts.Remove(id);
        foreach (RaceActorState state in opponents)
        {
            if (state == null || string.IsNullOrEmpty(state.id) || !visible.Remove(state.id)) continue;
            if (!ghosts.TryGetValue(state.id, out RaceActor actor))
            {
                actor = ghostPool.Find(candidate => !candidate.gameObject.activeSelf);
                if (actor == null) continue;
                ghosts[state.id] = actor;
                actor.ResetPresentation();
                actor.gameObject.SetActive(true);
            }
            RaceActorState prior = FindActor(LastFrame, state.id);
            bool changed = prior == null || Changed(state, prior);
            float actorDt = dt > 0f ? dt : changed && !paused ? Mathf.Clamp(frame.dt, 0f, 0.1f) : 0f;
            actor.Present(state, actorDt, frame.reducedMotion, paused || (!first && !clockAdvanced && !changed));
        }
        VisibleOpponentCount = ghosts.Count;
    }

    private static RaceActorState FindActor(RaceFrame frame, string id)
    {
        if (frame == null || frame.opponents == null) return null;
        foreach (RaceActorState actor in frame.opponents) if (actor != null && actor.id == id) return actor;
        return null;
    }

    private static bool Changed(RaceActorState a, RaceActorState b)
    {
        return a == null || b == null || a.phase != b.phase || a.avatarId != b.avatarId || a.color != b.color
            || Mathf.Abs(a.distance - b.distance) > 0.000001f || Mathf.Abs(a.lane - b.lane) > 0.000001f
            || Mathf.Abs(a.jumpHeight - b.jumpHeight) > 0.000001f || Mathf.Abs(a.jumpProgress - b.jumpProgress) > 0.000001f
            || a.jumpDuration != b.jumpDuration || a.boosting != b.boosting || a.hitFlash != b.hitFlash;
    }

    private void UpdateCamera(RaceFrame frame, float dt, bool snap)
    {
        if (followCamera == null || local == null || !local.HasFrame) return;
        Vector3 runner = local.transform.position;
        float anchorX = frame.reducedMotion ? 0f : runner.x * 0.18f;
        float landing = frame.reducedMotion ? 0f : -local.LandingAmount * 0.025f;
        Vector3 anchor = new Vector3(anchorX, landing, runner.z);
        Vector3 wanted = anchor + ViewOffset;
        if (snap) cameraPosition = wanted;
        else
        {
            cameraPosition = Vector3.Lerp(cameraPosition, wanted, 1f - Mathf.Exp(-10f * Mathf.Max(0f, dt)));
            cameraPosition.z = wanted.z;
        }
        followCamera.transform.SetPositionAndRotation(cameraPosition,
            Quaternion.LookRotation(anchor + LookAhead - cameraPosition, Vector3.up));
        float aspect = Mathf.Max(0.2f, followCamera.aspect);
        // At the runner's depth retain both outer lanes plus a shoulder margin.
        // Landscape keeps exactly the approved 41-degree lens and 7.4m offset.
        float requiredFov = 2f * Mathf.Atan(1.82f / (7.4f * aspect * 0.88f)) * Mathf.Rad2Deg;
        followCamera.fieldOfView = Mathf.Clamp(Mathf.Max(41f, requiredFov), 41f, 85f);
        lastAspect = aspect;
        Vector3 lightPosition = anchor + LightCameraOffset;
        Quaternion lightRotation = Quaternion.LookRotation(anchor + LookAhead - lightPosition, Vector3.up);
        foreach (LightAnchor light in lights)
            if (light.light != null) light.light.SetPositionAndRotation(lightPosition + lightRotation * light.offset, lightRotation * light.rotation);
        cameraInitialized = true;
    }

    private void Update()
    {
        // Layout changes may reframe a paused race, but never advance a pose,
        // the supplied race clock, or the world presentation.
        if (LastFrame != null && followCamera != null && Mathf.Abs(followCamera.aspect - lastAspect) > 0.001f)
            UpdateCamera(LastFrame, 0f, false);
    }

    private static void ValidateCourse(RaceCourse course)
    {
        if (course == null || course.version != 1 || course.epoch < 0
            || !RaceScale.IsFinite(course.courseLength) || course.courseLength <= 0f)
            throw new ArgumentException("Unsupported or invalid race course.");
        course.obstacles = course.obstacles ?? Array.Empty<RaceObstacle>();
        course.debris = course.debris ?? Array.Empty<RaceDebris>();
        course.checkpoints = course.checkpoints ?? Array.Empty<RaceCheckpoint>();
        if (course.obstacles.Length > 1000 || course.debris.Length > 1000 || course.checkpoints.Length > 100)
            throw new ArgumentException("Course presentation exceeds its object budget.");
        var ids = new HashSet<string>();
        foreach (RaceObstacle obstacle in course.obstacles)
        {
            if (obstacle == null || string.IsNullOrEmpty(obstacle.id) || !ids.Add(obstacle.id)
                || !ValidCoursePosition(obstacle.lane, obstacle.z, course.courseLength)
                || !RaceScale.IsFinite(obstacle.length) || obstacle.length <= 0f
                || (obstacle.type != "rubble" && obstacle.type != "barrier" && obstacle.type != "gap"))
                throw new ArgumentException("Invalid course obstacle.");
        }
        ids.Clear();
        foreach (RaceDebris debris in course.debris)
        {
            if (debris == null || string.IsNullOrEmpty(debris.id) || !ids.Add(debris.id)
                || !ValidCoursePosition(debris.lane, debris.z, course.courseLength)
                || !RaceScale.IsFinite(debris.warnAt) || !RaceScale.IsFinite(debris.fallAt) || !RaceScale.IsFinite(debris.impactAt)
                || debris.warnAt < 0f || debris.fallAt < debris.warnAt || debris.impactAt < debris.fallAt)
                throw new ArgumentException("Invalid falling-debris schedule.");
        }
        foreach (RaceCheckpoint checkpoint in course.checkpoints)
            if (checkpoint == null || !RaceScale.IsFinite(checkpoint.z) || checkpoint.z < 0f || checkpoint.z > course.courseLength)
                throw new ArgumentException("Invalid course checkpoint.");
    }

    private static bool ValidCoursePosition(float lane, float z, float length)
    {
        return RaceScale.IsFinite(lane) && lane >= 0f && lane <= 2f
            && RaceScale.IsFinite(z) && z >= 0f && z <= length;
    }

    private void Fail(string operation, Exception error)
    {
        LastError = operation + ": " + error.Message;
        Debug.LogError("Borrowed Time presentation failed: " + LastError, this);
#if UNITY_WEBGL && !UNITY_EDITOR
        BT_PresentationError(LastError);
#endif
    }
}
