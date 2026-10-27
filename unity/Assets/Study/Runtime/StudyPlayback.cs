using System;
using System.Collections.Generic;
using UnityEngine;

/// <summary>
/// Plays the isolated, baked Snow animation and keeps a rear camera on its path.
/// This scene is a visual comparison; it does not use the live game's rules or network.
/// </summary>
[DisallowMultipleComponent]
public sealed class StudyPlayback : MonoBehaviour
{
    [Header("Scene references")]
    public Animator runnerAnimator;
    public Transform animatedRoot;
    public Camera followCamera;

    [Header("Baked clip")]
    [Tooltip("The Animator controller state containing the full study clip.")]
    public string stateName = "Study";
    [Min(0.01f)] public float duration = 9.6f;

    [Header("Rear camera — world-space offsets")]
    public Vector3 cameraOffset = new Vector3(0f, 2.35f, 5.5f);
    public Vector3 lookAhead = new Vector3(0f, 1.1f, -4.5f);
    [Range(0f, 1f)] public float lateralFollow = 0.065f;
    public bool showOverlay = true;

    public float CurrentTime { get { return playhead; } }
    public float PlaybackSpeed { get { return playbackSpeed; } }
    public bool IsPaused { get { return paused; } }
    public bool IsReady { get { return ready; } }

    private float playhead;
    private float playbackSpeed = 1f;
    private bool paused;
    private bool ready;
    private int stateHash;
    private Vector3 groundOrigin;
    private string setupMessage;

    private GUIStyle titleStyle;
    private GUIStyle subtitleStyle;
    private GUIStyle buttonStyle;
    private GUIStyle creditStyle;
    private Texture2D panelTexture;
    private Texture2D progressTexture;
    private readonly List<Texture2D> uiTextures = new List<Texture2D>();

    private void Start()
    {
        Application.runInBackground = true;
        Application.targetFrameRate = 60;

        if (runnerAnimator == null)
            runnerAnimator = GetComponentInChildren<Animator>(true);
        if (followCamera == null)
            followCamera = Camera.main;

        if (runnerAnimator == null || runnerAnimator.runtimeAnimatorController == null)
        {
            setupMessage = "Assign the runner Animator and its study controller.";
            Debug.LogWarning(setupMessage, this);
            return;
        }

        if (animatedRoot == null)
            animatedRoot = FindAnimatedRoot(runnerAnimator);

        duration = Mathf.Max(0.01f, duration);
        stateHash = Animator.StringToHash(stateName);
        runnerAnimator.cullingMode = AnimatorCullingMode.AlwaysAnimate;
        runnerAnimator.enabled = true;
        // Time is sampled explicitly so seeking, pausing and looping remain exact.
        // The builder owns the model's root-motion import settings.
        runnerAnimator.speed = 0f;
        runnerAnimator.Update(0f);

        if (!runnerAnimator.HasState(0, stateHash))
        {
            setupMessage = "The Animator state '" + stateName + "' was not found.";
            Debug.LogWarning(setupMessage, this);
            return;
        }

        ready = true;
        SampleFrame();
        groundOrigin = animatedRoot.position;
        UpdateCamera();
    }

    private void Update()
    {
        if (!ready || paused)
            return;

        playhead = Mathf.Repeat(playhead + Time.unscaledDeltaTime * playbackSpeed, duration);
        SampleFrame();
    }

    private void LateUpdate()
    {
        if (ready)
            UpdateCamera();
    }

    private void SampleFrame()
    {
        runnerAnimator.Play(stateHash, 0, playhead / duration);
        runnerAnimator.Update(0f);
    }

    private void UpdateCamera()
    {
        if (followCamera == null || animatedRoot == null)
            return;

        Vector3 runnerPosition = animatedRoot.position;
        // The camera advances with the runner but barely follows lane changes.
        // Its height remains tied to the ground, allowing the jump to read on screen.
        Vector3 anchor = new Vector3(
            Mathf.Lerp(groundOrigin.x, runnerPosition.x, lateralFollow),
            groundOrigin.y,
            runnerPosition.z);
        Transform cameraTransform = followCamera.transform;
        cameraTransform.position = anchor + cameraOffset;
        Vector3 direction = anchor + lookAhead - cameraTransform.position;
        if (direction.sqrMagnitude > 0.0001f)
            cameraTransform.rotation = Quaternion.LookRotation(direction, Vector3.up);
    }

    /// <summary>Seek to a particular part of the clip and optionally resume playback.</summary>
    public void SeekSeconds(float seconds, bool resume = true)
    {
        if (!ready)
            return;

        playhead = Mathf.Clamp(seconds, 0f, duration - 0.0001f);
        if (resume)
            paused = false;
        SampleFrame();
        UpdateCamera();
    }

    public void Restart()
    {
        SeekSeconds(0f);
    }

    public void TogglePause()
    {
        paused = !paused;
    }

    public void ToggleSlowMotion()
    {
        playbackSpeed = playbackSpeed < 1f ? 1f : 0.5f;
    }

    /// <summary>
    /// Prefer the FBX's animated armature object. The builder can assign the exact
    /// transform instead when a different exporter changes the hierarchy names.
    /// </summary>
    public static Transform FindAnimatedRoot(Animator animator)
    {
        if (animator == null)
            return null;

        Transform[] hierarchy = animator.GetComponentsInChildren<Transform>(true);
        string[] preferredNames = { "RIG-Snow", "RIG_Snow", "Armature" };
        foreach (string preferred in preferredNames)
        {
            foreach (Transform candidate in hierarchy)
            {
                if (string.Equals(candidate.name, preferred, StringComparison.Ordinal))
                    return candidate;
            }
        }
        return animator.transform;
    }

    private void OnGUI()
    {
        if (!showOverlay)
            return;

        EnsureStyles();
        Matrix4x4 previousMatrix = GUI.matrix;
        Color previousColor = GUI.color;
        bool previousEnabled = GUI.enabled;
        float scale = Mathf.Clamp(Screen.width / 1100f, 0.65f, 1.35f);
        float width = Screen.width / scale;
        float height = Screen.height / scale;
        GUI.matrix = Matrix4x4.Scale(new Vector3(scale, scale, 1f));
        GUI.color = Color.white;

        float panelHeight = 66f + ControlRows(width) * 40f;
        GUI.DrawTexture(new Rect(0f, 0f, width, panelHeight), panelTexture);
        GUI.Label(new Rect(22f, 12f, width - 44f, 30f), "Borrowed Time / Unity study", titleStyle);
        string detail = ready
            ? "REAL-TIME UNITY  /  REAR CAMERA  /  " + (paused ? "PAUSED" : playbackSpeed < 1f ? "SLOW MOTION" : "PLAYING")
            : (setupMessage ?? "Preparing the runner…");
        GUI.Label(new Rect(23f, 42f, width - 46f, 20f), detail, subtitleStyle);

        GUI.enabled = ready;
        float x = 22f;
        float y = 66f;
        if (DrawButton(ref x, ref y, width, 60f, "Run")) SeekSeconds(0f);
        if (DrawButton(ref x, ref y, width, 108f, "Lane change")) SeekSeconds(1f);
        if (DrawButton(ref x, ref y, width, 128f, "Jump + landing")) SeekSeconds(3.25f);
        if (DrawButton(ref x, ref y, width, 72f, "Dodge")) SeekSeconds(5.65f);
        if (DrawButton(ref x, ref y, width, 72f, paused ? "Play" : "Pause")) TogglePause();
        if (DrawButton(ref x, ref y, width, 112f, playbackSpeed < 1f ? "Normal speed" : "Slow motion")) ToggleSlowMotion();
        if (DrawButton(ref x, ref y, width, 84f, "Restart")) Restart();
        GUI.enabled = previousEnabled;

        if (ready)
            GUI.DrawTexture(new Rect(0f, panelHeight - 2f, width * playhead / duration, 2f), progressTexture);

        GUI.DrawTexture(new Rect(0f, height - 28f, width, 28f), panelTexture);
        GUI.Label(new Rect(22f, height - 24f, width - 44f, 22f),
            "Snow Rig © Blender Foundation / studio.blender.org · CC BY 4.0 · Separate visual study", creditStyle);

        GUI.enabled = previousEnabled;
        GUI.color = previousColor;
        GUI.matrix = previousMatrix;
    }

    private bool DrawButton(ref float x, ref float y, float screenWidth, float width, string label)
    {
        if (x + width > screenWidth - 22f)
        {
            x = 22f;
            y += 40f;
        }
        bool clicked = GUI.Button(new Rect(x, y, width, 30f), label, buttonStyle);
        x += width + 8f;
        return clicked;
    }

    private static int ControlRows(float screenWidth)
    {
        int rows = 1;
        float x = 22f;
        float[] widths = { 60f, 108f, 128f, 72f, 72f, 112f, 84f };
        foreach (float width in widths)
        {
            if (x + width > screenWidth - 22f)
            {
                rows++;
                x = 22f;
            }
            x += width + 8f;
        }
        return rows;
    }

    private void EnsureStyles()
    {
        if (titleStyle != null)
            return;

        panelTexture = SolidTexture(new Color(0.045f, 0.065f, 0.055f, 0.88f));
        progressTexture = SolidTexture(new Color(0.57f, 0.69f, 0.55f, 0.85f));
        titleStyle = new GUIStyle(GUI.skin.label) { fontSize = 22, fontStyle = FontStyle.Normal };
        titleStyle.normal.textColor = new Color(0.89f, 0.91f, 0.86f);
        subtitleStyle = new GUIStyle(GUI.skin.label) { fontSize = 10 };
        subtitleStyle.normal.textColor = new Color(0.66f, 0.73f, 0.65f);
        creditStyle = new GUIStyle(GUI.skin.label) { fontSize = 10, clipping = TextClipping.Clip };
        creditStyle.normal.textColor = new Color(0.67f, 0.72f, 0.66f);
        buttonStyle = new GUIStyle(GUI.skin.button)
        {
            fontSize = 12,
            alignment = TextAnchor.MiddleCenter,
            border = new RectOffset(0, 0, 0, 0),
            padding = new RectOffset(8, 8, 3, 3)
        };
        buttonStyle.normal.background = SolidTexture(new Color(0.12f, 0.17f, 0.13f, 0.95f));
        buttonStyle.hover.background = SolidTexture(new Color(0.22f, 0.30f, 0.23f, 1f));
        buttonStyle.active.background = SolidTexture(new Color(0.31f, 0.40f, 0.30f, 1f));
        buttonStyle.focused.background = buttonStyle.hover.background;
        buttonStyle.normal.textColor = new Color(0.84f, 0.90f, 0.82f);
        buttonStyle.hover.textColor = Color.white;
        buttonStyle.active.textColor = Color.white;
        buttonStyle.focused.textColor = Color.white;
    }

    private Texture2D SolidTexture(Color color)
    {
        Texture2D texture = new Texture2D(1, 1, TextureFormat.RGBA32, false);
        texture.hideFlags = HideFlags.HideAndDontSave;
        texture.SetPixel(0, 0, color);
        texture.Apply();
        uiTextures.Add(texture);
        return texture;
    }

    private void OnDestroy()
    {
        foreach (Texture2D texture in uiTextures)
            if (texture != null) Destroy(texture);
        uiTextures.Clear();
    }
}
