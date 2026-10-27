using System.Collections.Generic;
using UnityEngine;
#if ENABLE_INPUT_SYSTEM
using UnityEngine.InputSystem;
#endif

/// <summary>
/// A local movement experiment: input drives distance, lanes, and jump state;
/// GroundedRunnerPose draws a fresh pose from those values. No imported clip is
/// sampled here, and nothing connects this scene to the multiplayer game.
/// </summary>
[DisallowMultipleComponent]
public sealed class GroundedMotionStudy : MonoBehaviour
{
    [Header("Scene")]
    public Transform runnerRoot;
    public GroundedRunnerPose pose;
    public Camera followCamera;

    [Header("Movement")]
    [Min(0.1f)] public float runSpeed = 4.6f;
    [Min(0.1f)] public float laneWidth = 1.15f;
    [Min(0.05f)] public float laneChangeSeconds = 0.40f;
    [Tooltip("Metres travelled in one full left/right gait cycle. 2.3m at 4.6m/s is a 0.5s cycle.")]
    [Min(0.1f)] public float strideLength = 2.3f;
    [Min(5f)] public float tunnelLength = 48f;

    [Header("Jump")]
    [Min(0.01f)] public float anticipationSeconds = 0.06f;
    [Min(0.1f)] public float flightSeconds = 0.6f;
    [Min(0.05f)] public float jumpApex = 0.5f;
    [Min(0.01f)] public float landingSeconds = 0.18f;
    public float jumpAtDistance = 10.4f;

    [Header("Preview")]
    public bool autoDemo = true;
    public bool showOverlay = true;
    public bool showDiagnostics;
    [Tooltip("The pulled-back view is the preferred composition; the other views remain available for comparison.")]
    [Range(0, 3)] public int initialCameraPreset = 1;
    public Vector3 cameraOffset = new Vector3(0f, 1.9f, -4.3f);
    public Vector3 cameraLookAhead = new Vector3(0f, 1.1f, 3f);
    [Range(0f, 1f)] public float lateralCameraFollow = 0.16f;

    public string CurrentPhase { get { return motionState.ToString(); } }
    public float CurrentDistance { get { return distance; } }
    public float CurrentJumpHeight { get { return jumpHeight; } }
    public bool IsPaused { get { return paused; } }
    public float PlaybackSpeed { get { return playbackSpeed; } }
    public bool IsReady { get { return ready && pose != null && pose.IsReady; } }
    public float GaitPhase { get { return gaitPhase; } }
    public float LateralVelocity { get { return lateralVelocity; } }
    public int CurrentLane { get { return targetLane; } }
    public float LaneStepPhase { get { return Mathf.Clamp01(laneElapsed / Mathf.Max(0.01f, laneDuration)); } }
    public string LaneStepStage
    {
        get
        {
            float t = LaneStepPhase;
            if (t >= 1f) return "Run";
            if (motionState == MotionState.Airborne) return "Air control";
            return t < 0.10f ? "Plant" : t < 0.38f ? "Push" : t < 0.78f ? "Catch" : "Settle";
        }
    }
    public int CurrentCameraPreset { get { return cameraPreset; } }
    public string CurrentCameraPresetName { get { return CameraPresetNames[cameraPreset]; } }
    public float ComparisonFieldOfView { get { return baselineFieldOfView; } }
    public Vector3 CurrentCameraOffset { get { return PresetOffset(cameraPreset); } }

    private enum MotionState { Running, Takeoff, Airborne, Landing }
    private MotionState motionState;
    private bool ready;
    private bool paused;
    private float playbackSpeed = 1f;
    private float distance;
    private float gaitPhase;
    private float stateTime;
    private float jumpHeight;
    private float jumpProgress = -1f;
    private float anticipation;
    private float landingAmount;
    private int targetLane;
    private float lateralPosition;
    private float lateralVelocity;
    private float laneStart;
    private float laneStartVelocity;
    private float laneElapsed = 1f;
    private float laneDuration;
    private bool laneStartedAirborne;
    private float fadeInTime = 1f;
    private float fadeAlpha;
    private bool demoLeft;
    private bool demoCenter;
    private bool demoJump;
    private bool demoRight;
    private bool demoFinish;
    private Vector3 origin;
    private Vector3 cameraVelocity;
    private Vector3 baselineCameraOffset;
    private Vector3 baselineCameraLookAhead;
    private Vector3 baselineCameraPosition;
    private Quaternion baselineCameraRotation;
    private float baselineLateralFollow;
    private float baselineFieldOfView;
    private int cameraPreset;
    private readonly List<CameraLightAnchor> cameraLightAnchors = new List<CameraLightAnchor>();
    private sealed class CameraLightAnchor
    {
        public Transform light;
        public Vector3 offset;
        public Quaternion rotation;
    }
    private float lastStep;
    private string setupMessage;

    private GUIStyle titleStyle;
    private GUIStyle detailStyle;
    private GUIStyle buttonStyle;
    private GUIStyle selectedButtonStyle;
    private GUIStyle creditStyle;
    private Texture2D panelTexture;
    private Texture2D blackTexture;
    private readonly List<Texture2D> uiTextures = new List<Texture2D>();
    private static readonly float[] ButtonWidths = { 70f, 82f, 70f, 96f, 72f, 112f, 76f };
    private static readonly float[] CameraButtonWidths = { 132f, 132f, 116f, 124f };
    private static readonly string[] CameraPresetNames = { "Rear baseline", "Pulled-back rear", "Elevated rear", "Offset rear" };
    private static readonly string[] CameraButtonNames = { "1  Rear baseline", "2  Pulled back", "3  Elevated", "4  Offset rear" };

    private void Start()
    {
        Application.runInBackground = true;
        Application.targetFrameRate = 60;
        if (runnerRoot == null && pose != null) runnerRoot = pose.transform;
        if (pose == null && runnerRoot != null) pose = runnerRoot.GetComponentInChildren<GroundedRunnerPose>(true);
        if (followCamera == null) followCamera = Camera.main;
        if (runnerRoot == null || pose == null || followCamera == null)
        {
            setupMessage = "Assign the runner, its pose component, and the rear camera.";
            Debug.LogError(setupMessage, this);
            return;
        }
        origin = runnerRoot.position;
        CaptureCameraBaseline();
        ready = true;
        ResetPass(false);
        UpdateCamera(true);
    }

    private void Update()
    {
        if (!ready) return;
        ReadKeyboard();
        if (!pose.IsReady || paused) { lastStep = 0f; return; }

        // Clamp a foreground/tab-resume hitch rather than teleporting through the
        // entire passage. Playback speed changes the simulation, not Time.timeScale.
        AdvanceStudy(Mathf.Min(Time.unscaledDeltaTime, 0.05f) * playbackSpeed);
    }

    /// <summary>
    /// Advances the same movement and pose path used by live Update. The caller
    /// supplies simulation seconds (already multiplied by any playback speed).
    /// Explicit stepping works while paused; each call accepts at most 0.05s.
    /// Camera presentation remains separate, as it is in normal LateUpdate.
    /// </summary>
    public void AdvanceStudy(float dt)
    {
        if (!IsReady || float.IsNaN(dt) || float.IsInfinity(dt) || dt <= 0f) return;
        dt = Mathf.Min(dt, 0.05f);
        lastStep = dt;
        float frameSpeed = runSpeed * (1f - 0.25f * landingAmount);
        distance += frameSpeed * dt;
        gaitPhase = Mathf.Repeat(gaitPhase + frameSpeed * dt / Mathf.Max(0.1f, strideLength), 1f);
        if (autoDemo) UpdateDemo();
        UpdateLane(dt);
        UpdateJump(dt);

        if (distance >= tunnelLength)
            ResetPass(true);

        runnerRoot.position = origin + new Vector3(lateralPosition, 0f, distance);
        pose.UpdateLaneStep(LaneStepPhase, motionState == MotionState.Running);
        pose.ApplyPose(gaitPhase, frameSpeed, lateralVelocity, jumpHeight, jumpProgress, landingAmount, anticipation, dt);

        fadeInTime += dt;
        float fadeOut = Mathf.InverseLerp(tunnelLength - 0.7f, tunnelLength, distance);
        float fadeIn = 1f - Mathf.Clamp01(fadeInTime / 0.18f);
        fadeAlpha = Mathf.Max(Smooth01(fadeOut), Smooth01(fadeIn));
    }

    private void LateUpdate()
    {
        if (!paused) RefreshPreviewCamera();
    }

    /// <summary>Call after explicit stepping to compose a paused Editor capture.</summary>
    public void RefreshPreviewCamera(bool snap = false)
    {
        if (IsReady) UpdateCamera(snap);
    }

    private void ReadKeyboard()
    {
#if ENABLE_INPUT_SYSTEM
        Keyboard keys = Keyboard.current;
        if (keys == null) return;
        if (keys.leftArrowKey.wasPressedThisFrame || keys.aKey.wasPressedThisFrame) MoveLane(-1);
        if (keys.rightArrowKey.wasPressedThisFrame || keys.dKey.wasPressedThisFrame) MoveLane(1);
        if (keys.spaceKey.wasPressedThisFrame) Jump();
        if (keys.pKey.wasPressedThisFrame) TogglePause();
        if (keys.iKey.wasPressedThisFrame) ToggleDiagnostics();
        if (keys.nKey.wasPressedThisFrame && paused) StepFrame();
        if (keys.hKey.wasPressedThisFrame) showOverlay = !showOverlay;
        if (keys.cKey.wasPressedThisFrame) CycleCameraPreset();
        if (keys.digit1Key.wasPressedThisFrame) SetCameraPreset(0);
        if (keys.digit2Key.wasPressedThisFrame) SetCameraPreset(1);
        if (keys.digit3Key.wasPressedThisFrame) SetCameraPreset(2);
        if (keys.digit4Key.wasPressedThisFrame) SetCameraPreset(3);
#elif ENABLE_LEGACY_INPUT_MANAGER
        if (Input.GetKeyDown(KeyCode.LeftArrow) || Input.GetKeyDown(KeyCode.A)) MoveLane(-1);
        if (Input.GetKeyDown(KeyCode.RightArrow) || Input.GetKeyDown(KeyCode.D)) MoveLane(1);
        if (Input.GetKeyDown(KeyCode.Space)) Jump();
        if (Input.GetKeyDown(KeyCode.P)) TogglePause();
        if (Input.GetKeyDown(KeyCode.I)) ToggleDiagnostics();
        if (Input.GetKeyDown(KeyCode.N) && paused) StepFrame();
        if (Input.GetKeyDown(KeyCode.H)) showOverlay = !showOverlay;
        if (Input.GetKeyDown(KeyCode.C)) CycleCameraPreset();
        if (Input.GetKeyDown(KeyCode.Alpha1)) SetCameraPreset(0);
        if (Input.GetKeyDown(KeyCode.Alpha2)) SetCameraPreset(1);
        if (Input.GetKeyDown(KeyCode.Alpha3)) SetCameraPreset(2);
        if (Input.GetKeyDown(KeyCode.Alpha4)) SetCameraPreset(3);
#endif
    }

    private void UpdateDemo()
    {
        if (!demoLeft && distance >= 3.5f) { demoLeft = true; SetLane(-1); }
        if (!demoCenter && distance >= 8f) { demoCenter = true; SetLane(0); }
        if (!demoJump && distance >= jumpAtDistance) { demoJump = true; RequestJump(); }
        if (!demoRight && distance >= 18f) { demoRight = true; SetLane(1); }
        if (!demoFinish && distance >= 25f) { demoFinish = true; SetLane(0); }
    }

    private void SetLane(int lane)
    {
        lane = Mathf.Clamp(lane, -1, 1);
        if (lane == targetLane && Mathf.Abs(lateralPosition - lane * laneWidth) < 0.001f) return;
        targetLane = lane;
        laneStart = lateralPosition;
        laneStartVelocity = lateralVelocity;
        laneElapsed = 0f;
        // Crossing two lanes takes longer, while each individual press responds now.
        laneDuration = laneChangeSeconds * Mathf.Sqrt(Mathf.Max(0.5f, Mathf.Abs(lane * laneWidth - laneStart) / laneWidth));
        laneStartedAirborne = motionState != MotionState.Running;
        if (pose.IsReady)
            pose.BeginLaneStep(lane * laneWidth > laneStart ? 1 : -1,
                origin.x + lane * laneWidth, laneDuration, runSpeed, !laneStartedAirborne);
    }

    private void UpdateLane(float dt)
    {
        float oldX = lateralPosition;
        laneElapsed += dt;
        float t = Mathf.Clamp01(laneElapsed / Mathf.Max(0.01f, laneDuration));
        // A short load, decisive push, receiving step and settle share one
        // trajectory with the feet. Retain momentum for interrupted/reversed input.
        float travel = laneStartedAirborne ? Smooth01(t) : LaneTravel(t);
        lateralPosition = Mathf.Lerp(laneStart, targetLane * laneWidth, travel)
            + t * (1f - t) * (1f - t) * laneStartVelocity * laneDuration;
        lateralPosition = Mathf.Clamp(lateralPosition, -laneWidth, laneWidth);
        lateralVelocity = dt > 0f ? (lateralPosition - oldX) / dt : 0f;
    }

    private static float LaneTravel(float t)
    {
        if (t < 0.10f) return LaneSegment(t, 0f, 0.10f, 0f, 0.015f, 0f, 0.35f);
        if (t < 0.40f) return LaneSegment(t, 0.10f, 0.40f, 0.015f, 0.40f, 0.35f, 1.8f);
        if (t < 0.75f) return LaneSegment(t, 0.40f, 0.75f, 0.40f, 0.90f, 1.8f, 0.8f);
        return LaneSegment(t, 0.75f, 1f, 0.90f, 1f, 0.8f, 0f);
    }

    private static float LaneSegment(float t, float start, float end, float a, float b, float va, float vb)
    {
        float span = end - start;
        float u = Mathf.Clamp01((t - start) / span), u2 = u * u, u3 = u2 * u;
        return (2f * u3 - 3f * u2 + 1f) * a + (u3 - 2f * u2 + u) * va * span
            + (-2f * u3 + 3f * u2) * b + (u3 - u2) * vb * span;
    }

    private void RequestJump()
    {
        if (motionState != MotionState.Running) return;
        if (pose.IsReady) pose.PrepareJump();
        motionState = MotionState.Takeoff;
        stateTime = 0f;
    }

    private void UpdateJump(float dt)
    {
        stateTime += dt;
        // Carry surplus time across state boundaries so a slower frame does not
        // change the duration or leave a one-frame gap at contact.
        if (motionState == MotionState.Takeoff && stateTime >= anticipationSeconds)
        {
            stateTime -= anticipationSeconds;
            motionState = MotionState.Airborne;
        }
        if (motionState == MotionState.Airborne && stateTime >= flightSeconds)
        {
            stateTime -= flightSeconds;
            motionState = MotionState.Landing;
        }
        if (motionState == MotionState.Landing && stateTime >= landingSeconds)
        {
            stateTime = 0f;
            motionState = MotionState.Running;
        }

        jumpHeight = 0f;
        jumpProgress = -1f;
        anticipation = 0f;
        landingAmount = 0f;
        if (motionState == MotionState.Takeoff)
            anticipation = Smooth01(Mathf.Clamp01(stateTime / anticipationSeconds));
        else if (motionState == MotionState.Airborne)
        {
            jumpProgress = Mathf.Clamp01(stateTime / flightSeconds);
            jumpHeight = 4f * jumpApex * jumpProgress * (1f - jumpProgress);
        }
        else if (motionState == MotionState.Landing)
        {
            float t = Mathf.Clamp01(stateTime / landingSeconds);
            // Rapid weight absorption followed by a softer return to the stride.
            landingAmount = Mathf.Sin(Mathf.PI * Mathf.Pow(t, 0.65f));
        }
    }

    public void MoveLane(int direction)
    {
        if (!ready) return;
        autoDemo = false;
        paused = false;
        SetLane(targetLane + (direction < 0 ? -1 : direction > 0 ? 1 : 0));
    }

    public void Jump()
    {
        if (!ready) return;
        autoDemo = false;
        paused = false;
        RequestJump();
    }

    public void TogglePause() { paused = !paused; }

    public void StepFrame()
    {
        if (!IsReady) return;
        paused = true;
        AdvanceStudy(1f / 60f);
        RefreshPreviewCamera();
    }
    public void ToggleDiagnostics() { showDiagnostics = !showDiagnostics; }
    public void ToggleSlowMotion() { playbackSpeed = playbackSpeed < 1f ? 1f : 0.5f; }

    public void Restart()
    {
        if (!ready) return;
        paused = false;
        ResetPass(false);
        UpdateCamera(true);
    }

    public void ToggleDemo()
    {
        autoDemo = !autoDemo;
        if (autoDemo) Restart();
    }

    private void ResetPass(bool preserveGait)
    {
        distance = 0f;
        if (!preserveGait) gaitPhase = 0f;
        targetLane = 0;
        lateralPosition = 0f;
        lateralVelocity = 0f;
        laneStart = 0f;
        laneStartVelocity = 0f;
        laneElapsed = 1f;
        laneDuration = laneChangeSeconds;
        laneStartedAirborne = false;
        pose.ResetStepIntents();
        motionState = MotionState.Running;
        stateTime = 0f;
        jumpHeight = 0f;
        jumpProgress = -1f;
        anticipation = 0f;
        landingAmount = 0f;
        demoLeft = demoCenter = demoJump = demoRight = demoFinish = false;
        fadeInTime = preserveGait ? 0f : 1f;
        fadeAlpha = preserveGait ? 1f : 0f;
        runnerRoot.position = origin;
        cameraVelocity = Vector3.zero;
        if (pose.IsReady) pose.ApplyPose(gaitPhase, runSpeed, 0f, 0f, -1f, 0f, 0f, 0f);
        UpdateCamera(true);
    }

    private void CaptureCameraBaseline()
    {
        // Keep the authored scene values intact. A distance comparison should
        // not quietly change the lens, framing target, or light placement.
        baselineCameraOffset = cameraOffset;
        baselineCameraLookAhead = cameraLookAhead;
        baselineLateralFollow = lateralCameraFollow;
        baselineFieldOfView = followCamera.fieldOfView;
        baselineCameraPosition = followCamera.transform.position;
        baselineCameraRotation = followCamera.transform.rotation;
        cameraPreset = Mathf.Clamp(initialCameraPreset, 0, CameraPresetNames.Length - 1);
        cameraLightAnchors.Clear();
        Transform cameraTransform = followCamera.transform;
        foreach (Light light in followCamera.GetComponentsInChildren<Light>(true))
        {
            if (light.transform == cameraTransform) continue;
            cameraLightAnchors.Add(new CameraLightAnchor
            {
                light = light.transform,
                offset = cameraTransform.InverseTransformPoint(light.transform.position),
                rotation = Quaternion.Inverse(cameraTransform.rotation) * light.transform.rotation
            });
        }
    }

    private Vector3 CameraAnchor()
    {
        return origin + new Vector3(lateralPosition * baselineLateralFollow,
            -landingAmount * 0.025f, distance);
    }

    private Vector3 PresetOffset(int preset)
    {
        switch (preset)
        {
            case 1: return new Vector3(0f, 2.2f, -7.4f);
            case 2: return new Vector3(0f, 3.4f, -7.0f);
            case 3: return new Vector3(1.9f, 2.1f, -5.9f);
            default: return baselineCameraOffset;
        }
    }

    /// <summary>Changes only the view; works paused and does not restart movement.</summary>
    public void SetCameraPreset(int preset)
    {
        if (!ready || followCamera == null) return;
        cameraPreset = Mathf.Clamp(preset, 0, CameraPresetNames.Length - 1);
        ApplyCameraView();
    }

    public void CycleCameraPreset()
    {
        SetCameraPreset((cameraPreset + 1) % CameraPresetNames.Length);
    }

    private void UpdateCamera(bool snap)
    {
        if (runnerRoot == null || followCamera == null) return;
        Vector3 anchor = CameraAnchor();
        Vector3 wanted = anchor + baselineCameraOffset;
        // This baseline continues independently of the selected view. Both its
        // damping and its light anchors are identical across all four presets.
        if (snap) baselineCameraPosition = wanted;
        else
        {
            baselineCameraPosition = Vector3.SmoothDamp(baselineCameraPosition, wanted,
                ref cameraVelocity, 0.1f, Mathf.Infinity, Mathf.Max(0.001f, lastStep));
            baselineCameraPosition.z = wanted.z;
        }
        baselineCameraRotation = Quaternion.LookRotation(anchor + baselineCameraLookAhead
            - baselineCameraPosition, Vector3.up);
        ApplyCameraView();
    }

    private void ApplyCameraView()
    {
        Vector3 position = baselineCameraPosition + PresetOffset(cameraPreset) - baselineCameraOffset;
        if (cameraPreset != 0)
        {
            // Keep the comparison cameras inside this study's walls and behind
            // its start, with clearance from the floor, vault, and back edge.
            position.x = Mathf.Clamp(position.x, origin.x - 2.55f, origin.x + 2.55f);
            position.y = Mathf.Clamp(position.y, origin.y + 0.25f, origin.y + 4.25f);
            position.z = Mathf.Max(position.z, origin.z - 7.7f);
        }
        Transform cameraTransform = followCamera.transform;
        cameraTransform.position = position;
        cameraTransform.rotation = Quaternion.LookRotation(CameraAnchor() + baselineCameraLookAhead
            - position, Vector3.up);
        followCamera.fieldOfView = baselineFieldOfView;
        foreach (CameraLightAnchor anchor in cameraLightAnchors)
        {
            if (anchor.light == null) continue;
            // These are still children in the scene hierarchy, but their world
            // pose follows the original camera, not the newly selected view.
            anchor.light.SetPositionAndRotation(baselineCameraPosition + baselineCameraRotation * anchor.offset,
                baselineCameraRotation * anchor.rotation);
        }
    }

    private static float Smooth01(float t) { t = Mathf.Clamp01(t); return t * t * (3f - 2f * t); }

    private void OnGUI()
    {
        EnsureStyles();
        Matrix4x4 oldMatrix = GUI.matrix;
        Color oldColor = GUI.color;
        bool oldEnabled = GUI.enabled;
        float scale = Mathf.Clamp(Screen.width / 1100f, 0.65f, 1.35f);
        float width = Screen.width / scale;
        float height = Screen.height / scale;
        GUI.matrix = Matrix4x4.Scale(new Vector3(scale, scale, 1f));
        GUI.color = Color.white;

        // Only the scene is obscured at the passage boundary; controls stay usable.
        if (fadeAlpha > 0f)
        {
            GUI.color = new Color(1f, 1f, 1f, fadeAlpha);
            GUI.DrawTexture(new Rect(0f, 0f, width, height), blackTexture);
            GUI.color = Color.white;
        }
        if (showOverlay)
        {
            float cameraLabelY = 63f + ControlRows(width, ButtonWidths) * 38f;
            float cameraButtonsY = cameraLabelY + 22f;
            float panelHeight = cameraButtonsY + ControlRows(width, CameraButtonWidths) * 38f;
            GUI.DrawTexture(new Rect(0f, 0f, width, panelHeight), panelTexture);
            GUI.Label(new Rect(20f, 10f, width - 40f, 28f), "Borrowed Time / visual study", titleStyle);
            string mode = paused ? "Paused" : playbackSpeed < 1f ? "Half speed" : autoDemo ? "Automatic preview" : "You’re in control";
            string detail = ready ? mode + "  ·  A/D or arrows to move  ·  Space jumps  ·  H hides controls  ·  N: paused frame" : setupMessage ?? "Preparing the runner…";
            if (showDiagnostics && ready) detail = mode + "  |  " + CurrentPhase + " / " + LaneStepStage
                + " · feet " + pose.LandingContactCount + " · landing gap " + pose.LastTouchdownGap.ToString("F3") + "s · N: frame";
            GUI.Label(new Rect(21f, 39f, width - 42f, 20f), detail, detailStyle);
            GUI.enabled = IsReady;
            float x = 20f;
            float y = 63f;
            if (DrawButton(ref x, ref y, width, ButtonWidths[0], "← Left")) MoveLane(-1);
            if (DrawButton(ref x, ref y, width, ButtonWidths[1], "Jump")) Jump();
            if (DrawButton(ref x, ref y, width, ButtonWidths[2], "Right →")) MoveLane(1);
            if (DrawButton(ref x, ref y, width, ButtonWidths[3], autoDemo ? "Demo: on" : "Play demo")) ToggleDemo();
            if (DrawButton(ref x, ref y, width, ButtonWidths[4], paused ? "Resume" : "Pause")) TogglePause();
            if (DrawButton(ref x, ref y, width, ButtonWidths[5], playbackSpeed < 1f ? "Normal speed" : "Slow motion")) ToggleSlowMotion();
            if (DrawButton(ref x, ref y, width, ButtonWidths[6], "Restart")) Restart();
            string cameraDetail = ready ? "Camera: " + CurrentCameraPresetName + "  ·  Same lens: "
                + baselineFieldOfView.ToString("0.#") + "°  ·  C cycles / 1–4 selects" : "Camera comparison";
            GUI.Label(new Rect(21f, cameraLabelY, width - 42f, 20f), cameraDetail, detailStyle);
            x = 20f;
            y = cameraButtonsY;
            for (int i = 0; i < CameraButtonNames.Length; i++)
                if (DrawButton(ref x, ref y, width, CameraButtonWidths[i], CameraButtonNames[i], i == cameraPreset))
                    SetCameraPreset(i);
            GUI.enabled = oldEnabled;
            GUI.DrawTexture(new Rect(0f, height - 24f, width, 24f), panelTexture);
            GUI.Label(new Rect(20f, height - 21f, width - 40f, 20f), "Snow base mesh © Blender Foundation / studio.blender.org · CC BY 4.0   |   New motion in Unity   |   I: diagnostics", creditStyle);
        }
        GUI.matrix = oldMatrix;
        GUI.color = oldColor;
        GUI.enabled = oldEnabled;
    }

    private bool DrawButton(ref float x, ref float y, float screenWidth, float width, string label, bool selected = false)
    {
        if (x + width > screenWidth - 20f) { x = 20f; y += 38f; }
        bool clicked = GUI.Button(new Rect(x, y, width, 28f), label, selected ? selectedButtonStyle : buttonStyle);
        x += width + 8f;
        return clicked;
    }

    private static int ControlRows(float screenWidth, float[] widths)
    {
        int rows = 1;
        float x = 20f;
        foreach (float width in widths)
        {
            if (x + width > screenWidth - 20f) { x = 20f; rows++; }
            x += width + 8f;
        }
        return rows;
    }

    private void EnsureStyles()
    {
        if (titleStyle != null) return;
        panelTexture = SolidTexture(new Color(0.028f, 0.034f, 0.034f, 0.72f));
        blackTexture = SolidTexture(new Color(0.025f, 0.03f, 0.03f, 1f));
        titleStyle = new GUIStyle(GUI.skin.label) { fontSize = 18, fontStyle = FontStyle.Normal };
        titleStyle.normal.textColor = new Color(0.88f, 0.89f, 0.85f);
        detailStyle = new GUIStyle(GUI.skin.label) { fontSize = 10 };
        detailStyle.normal.textColor = new Color(0.61f, 0.67f, 0.66f);
        creditStyle = new GUIStyle(GUI.skin.label) { fontSize = 9, clipping = TextClipping.Clip };
        creditStyle.normal.textColor = new Color(0.60f, 0.64f, 0.63f);
        buttonStyle = new GUIStyle(GUI.skin.button)
        {
            fontSize = 12, alignment = TextAnchor.MiddleCenter,
            border = new RectOffset(0, 0, 0, 0), padding = new RectOffset(6, 6, 3, 3)
        };
        buttonStyle.normal.background = SolidTexture(new Color(0.12f, 0.15f, 0.15f, 0.95f));
        buttonStyle.hover.background = SolidTexture(new Color(0.23f, 0.28f, 0.27f, 1f));
        buttonStyle.active.background = SolidTexture(new Color(0.32f, 0.38f, 0.36f, 1f));
        buttonStyle.focused.background = buttonStyle.hover.background;
        buttonStyle.normal.textColor = new Color(0.84f, 0.88f, 0.85f);
        buttonStyle.hover.textColor = buttonStyle.active.textColor = buttonStyle.focused.textColor = Color.white;
        selectedButtonStyle = new GUIStyle(buttonStyle);
        selectedButtonStyle.normal.background = buttonStyle.active.background;
        selectedButtonStyle.normal.textColor = Color.white;
    }

    private Texture2D SolidTexture(Color color)
    {
        var texture = new Texture2D(1, 1, TextureFormat.RGBA32, false) { hideFlags = HideFlags.HideAndDontSave };
        texture.SetPixel(0, 0, color);
        texture.Apply();
        uiTextures.Add(texture);
        return texture;
    }

    private void OnDestroy()
    {
        foreach (Texture2D texture in uiTextures) if (texture != null) Destroy(texture);
        uiTextures.Clear();
    }
}
