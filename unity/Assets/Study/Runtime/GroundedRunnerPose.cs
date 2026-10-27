using System;
using System.Collections.Generic;
using System.Linq;
using UnityEngine;

/// <summary>
/// Fresh pose authoring in Unity. The imported asset supplies a mesh and bind
/// skeleton only; no animation clip or recorded Blender pose is sampled.
/// The independent study uses world-space support contacts. The game uses a
/// continuous stylized stride that can travel between lanes without banking.
/// Two-bone IK bends the knees/elbows to reach the authored movement targets.
/// </summary>
public sealed class GroundedRunnerPose : MonoBehaviour
{
    public Transform modelRoot;
    public bool IsReady { get; private set; }
    public float LastGroundContactError { get; private set; }
    public float LastFootTargetFrameDisplacement { get; private set; }
    public float LastPlantedFootHorizontalDrift { get; private set; }
    public int PlantedFootCount { get; private set; }
    public bool LeadFootGrounded { get { return legs[jumpLeadSide < 0f ? 0 : 1].planted; } }
    public bool TrailingFootGrounded { get { return legs[jumpLeadSide < 0f ? 1 : 0].planted; } }
    public int LandingContactCount { get { return (LeadFootGrounded ? 1 : 0) + (TrailingFootGrounded ? 1 : 0); } }
    public bool LanePushFootGrounded { get { return laneActive && (legs[0].laneRole == 1 ? legs[0].planted : legs[1].planted); } }
    public bool LaneCatchFootGrounded { get { return laneActive && (legs[0].laneRole == 2 ? legs[0].planted : legs[1].planted); } }
    public float LastTouchdownGap { get; private set; } = -1f;
    public string TouchdownStage { get { return wasAirborne ? "Airborne" : touchdownTime > 0.3f ? "Run" : TrailingFootGrounded && LeadFootGrounded ? "Both feet" : LeadFootGrounded ? "Lead support" : "Recovery"; } }
    // Opt-in for the game renderer, whose externally supplied boost speed can
    // exceed the independent study's authored pace. The study leaves this off.
    public bool ExternalMotion { get; set; }
    private Dictionary<string, Transform> bones;
    private Transform[] rig;
    private Vector3[] restPositions;
    private Quaternion[] restRotations;
    private Vector3[] restScales;
    private Vector3 modelPosition;
    private Quaternion modelRotation;
    private float heading;
    private float previousLateralVelocity;
    private float turnLoad;
    private float turnLean;
    private float bodyShift;
    private float chestRecovery;
    private float headRecovery;
    private float jumpLeadSide = -1f;
    private bool wasAirborne;
    private float touchdownTime = 1f;
    private Vector3 previousRootPosition;
    private float previousGaitPhase;
    private float cycleSeconds = 0.5f;
    private float simulationClock;
    private float leadTouchdownAt = -1f;
    private bool jumpPrepared;
    private bool jumpSupportReleased;
    private float jumpPushSide = 1f;
    private Vector3 jumpPushContact;
    private bool laneActive, laneGrounded;
    private float lanePhase = 1f;
    private int laneDirection;
    private float laneForwardSpeed;
    private float actionEffort;
    private const float TrailingLandingDelay = 0.065f;
    private readonly Leg[] legs = { new Leg(), new Leg() };
    private readonly Arm[] arms = { new Arm(), new Arm() };
    private class Leg
    {
        public Transform thigh, knee, foot, toes;
        public float upperLength, lowerLength;
        public Vector3 neutralAnkle, contact, release, swingEnd, previousTarget, previousFoot, airStartLocal;
        public Quaternion neutralFoot;
        public bool planted, swinging, specialSupport, hasTarget, wasInAir;
        public float swingElapsed, swingDuration, supportTime, releasePitch, previousPitch;
        public float contactYaw, previousYaw;
        public int laneRole;
        public bool laneFinished, pendingTouchdown;
        public Vector3 laneStart, laneContact, jumpStartLocal, landingRelease, landingTarget;
        public Vector3 runRejoinLocal;
        public float runRejoin = 1f, runRejoinPitch;
    }
    private class Arm
    {
        public Transform upper, elbow, wrist;
        public float a, b, forward, down;
        public bool hasTarget;
    }

    private void Awake() { InitializeRig(); }

    public void InitializeRig()
    {
        if (IsReady) return;
        if (modelRoot == null) modelRoot = transform.GetChild(0);
        try
        {
            GroundedRigSetup.Prepare(modelRoot, out bones);
            RunnerWardrobe.Apply(modelRoot, bones);
            modelPosition = modelRoot.localPosition;
            modelRotation = modelRoot.localRotation;
            rig = bones.Values.Distinct().ToArray();
            restPositions = rig.Select(t => t.localPosition).ToArray();
            restRotations = rig.Select(t => t.localRotation).ToArray();
            restScales = rig.Select(t => t.localScale).ToArray();
            for (int i = 0; i < 2; i++)
            {
                string side = i == 0 ? ".L" : ".R";
                Leg l = legs[i];
                l.thigh = bones["DEF-Thigh_1" + side];
                l.knee = bones["DEF-Knee_1" + side];
                l.foot = bones["DEF-Foot" + side];
                l.toes = bones["DEF-Toes" + side];
                l.upperLength = Vector3.Distance(l.thigh.position, l.knee.position);
                l.lowerLength = Vector3.Distance(l.knee.position, l.foot.position);
                l.neutralAnkle = transform.InverseTransformPoint(l.foot.position);
                l.neutralFoot = Quaternion.Inverse(transform.rotation) * l.foot.rotation;
                l.contact = l.release = l.foot.position;
                Arm a = arms[i];
                a.upper = bones["DEF-UpperArm_1" + side];
                a.elbow = bones["DEF-Forearm_1" + side];
                a.wrist = bones["DEF-Wrist" + side];
                a.a = Vector3.Distance(a.upper.position, a.elbow.position);
                a.b = Vector3.Distance(a.elbow.position, a.wrist.position);
            }
            previousRootPosition = transform.position;
            IsReady = true;
        }
        catch (Exception e) { Debug.LogError("Fresh motion rig setup failed: " + e, this); enabled = false; }
    }

    public void ResetStepIntents()
    {
        laneActive = laneGrounded = jumpPrepared = jumpSupportReleased = false;
        lanePhase = 1f;
        actionEffort = 0f;
        simulationClock = 0f;
        leadTouchdownAt = -1f;
        LastTouchdownGap = -1f;
        foreach (Leg leg in legs) { leg.laneFinished = true; leg.pendingTouchdown = false; }
    }

    /// <summary>Clear contacts and secondary motion after a course/actor reset.
    /// This does not advance a controller or sample an imported animation.</summary>
    public void ResetPresentationPose(float gaitPhase, float speed, float jumpHeight, float jumpProgress)
    {
        if (!IsReady) InitializeRig();
        if (!IsReady) return;
        ResetStepIntents();
        wasAirborne = false;
        previousGaitPhase = gaitPhase;
        previousRootPosition = transform.position;
        cycleSeconds = 0.5f;
        ApplyPose(gaitPhase, speed, 0f, jumpHeight, jumpProgress, 0f, 0f, 0f);
    }

    private int BestSupportFoot()
    {
        float best = float.PositiveInfinity;
        int selected = 0;
        for (int i = 0; i < legs.Length; i++)
        {
            Leg leg = legs[i];
            Vector3 desired = transform.TransformPoint(new Vector3(leg.neutralAnkle.x, leg.neutralAnkle.y, 0.12f));
            float score = (leg.previousTarget - desired).sqrMagnitude;
            if (leg.planted) score *= 0.70f;
            if (score < best) { best = score; selected = i; }
        }
        return selected;
    }

    public void BeginLaneStep(int direction, float targetWorldX, float duration, float forwardSpeed, bool grounded)
    {
        if (!IsReady) return;
        // Lane input translates the game runner; it does not interrupt the
        // stride with a separate lunge, turn the shoulders, or restart the arms.
        if (ExternalMotion) return;
        laneDirection = direction;
        lanePhase = 0f;
        laneActive = laneGrounded = grounded;
        laneForwardSpeed = forwardSpeed;
        actionEffort = Mathf.Max(actionEffort, 0.65f);
        int support = BestSupportFoot();
        for (int i = 0; i < legs.Length; i++)
        {
            Leg leg = legs[i];
            leg.laneRole = i == support ? 1 : 2;
            leg.laneFinished = !grounded;
            leg.laneStart = leg.previousTarget;
            if (!grounded) continue;
            if (i == support)
            {
                leg.laneContact = leg.planted ? leg.contact : leg.previousTarget;
                leg.laneContact.y = transform.TransformPoint(leg.neutralAnkle).y;
                if (!leg.planted)
                    leg.laneContact.z = Mathf.Clamp(leg.laneContact.z, transform.position.z - 0.10f, transform.position.z + 0.26f);
            }
            else
            {
                leg.laneContact = new Vector3(targetWorldX - direction * 0.18f + leg.neutralAnkle.x,
                    transform.TransformPoint(leg.neutralAnkle).y, transform.position.z + forwardSpeed * duration * 0.65f + 0.20f);
                leg.planted = false;
            }
            leg.specialSupport = leg.swinging = false;
        }
    }

    public void UpdateLaneStep(float phase, bool grounded)
    {
        if (ExternalMotion) return;
        lanePhase = Mathf.Clamp01(phase);
        laneGrounded = grounded;
        if (lanePhase < 1f) return;
        laneActive = false;
        foreach (Leg leg in legs)
        {
            if (!leg.laneFinished && !leg.planted && !leg.swinging && leg.hasTarget)
                BeginSwing(leg, cycleSeconds * 0.65f, laneForwardSpeed, 0f);
            leg.laneFinished = true;
        }
    }

    public void PrepareJump()
    {
        if (!IsReady) return;
        int support = BestSupportFoot();
        jumpPushSide = support == 0 ? -1f : 1f;
        jumpLeadSide = -jumpPushSide;
        jumpPrepared = true;
        jumpSupportReleased = false;
        laneActive = false;
        actionEffort = 1f;
        leadTouchdownAt = -1f;
        LastTouchdownGap = -1f;
        Leg push = legs[support];
        jumpPushContact = push.planted ? push.contact : push.previousTarget;
        jumpPushContact.y = transform.TransformPoint(push.neutralAnkle).y;
        if (!push.planted)
            jumpPushContact.z = Mathf.Clamp(jumpPushContact.z, transform.position.z - 0.08f, transform.position.z + 0.24f);
        foreach (Leg leg in legs)
        {
            leg.jumpStartLocal = transform.InverseTransformPoint(leg.previousTarget);
            leg.laneFinished = true;
        }
    }

    public void ApplyPose(float gaitPhase, float speed, float lateralVelocity,
        float jumpHeight, float jumpProgress, float landingAmount, float anticipation, float dt)
    {
        if (!IsReady) { InitializeRig(); if (!IsReady) return; }
        for (int i = 0; i < rig.Length; i++)
        {
            rig[i].localPosition = restPositions[i];
            rig[i].localRotation = restRotations[i];
            rig[i].localScale = restScales[i];
        }
        simulationClock += Mathf.Max(0f, dt);
        actionEffort = Mathf.MoveTowards(actionEffort, 0f, Mathf.Max(0f, dt) * 0.85f);
        bool air = jumpProgress >= 0f;
        if (air && !wasAirborne)
        {
            if (!jumpPrepared) jumpLeadSide = legs[0].previousTarget.z >= legs[1].previousTarget.z ? -1f : 1f;
            jumpPrepared = false;
        }
        if (wasAirborne && !air) touchdownTime = 0f;
        else touchdownTime += dt;
        wasAirborne = air;
        bool reset = Vector3.Distance(transform.position, previousRootPosition) > 2f;
        previousRootPosition = transform.position;
        if (reset || dt <= 0f)
        {
            foreach (Leg l in legs) { l.planted = l.swinging = l.specialSupport = l.hasTarget = l.wasInAir = l.pendingTouchdown = false; l.runRejoin = 1f; }
            foreach (Arm a in arms) a.hasTarget = false;
            heading = turnLoad = turnLean = bodyShift = chestRecovery = headRecovery = 0f;
            previousLateralVelocity = lateralVelocity;
            touchdownTime = 1f;
        }
        float phaseStep = Mathf.Repeat(gaitPhase - previousGaitPhase, 1f);
        previousGaitPhase = gaitPhase;
        if (dt > 0f && phaseStep > 0.0001f && phaseStep < 0.25f)
            cycleSeconds = Mathf.Clamp(dt / phaseStep, 0.32f, 0.85f);
        float runAmount = air ? 0f : 1f - Mathf.Max(landingAmount, anticipation);
        float leftLoad = Pulse(gaitPhase, 0f, 0.055f, 0.25f);
        float rightLoad = Pulse(Mathf.Repeat(gaitPhase + 0.5f, 1f), 0f, 0.065f, 0.26f);
        float contactLoad = Mathf.Max(leftLoad, rightLoad * 0.94f);
        float supportBalance = leftLoad - rightLoad;
        float takeoffCompression = air ? 1f - Smooth01(jumpProgress / 0.16f) : anticipation;
        float flightOpen = air ? Pulse(jumpProgress, 0.04f, 0.24f, 0.55f) : 0f;
        float flightGather = air ? Pulse(jumpProgress, 0.16f, 0.43f, 0.78f) : 0f;
        float landingReach = air ? Smooth01((jumpProgress - 0.67f) / 0.33f) : 0f;
        float lanePush = laneActive && laneGrounded ? Pulse(lanePhase, 0.04f, 0.22f, 0.43f) : 0f;
        float laneCatch = laneActive && laneGrounded ? Pulse(lanePhase, 0.50f, 0.73f, 1f) : 0f;

        // The hips load a supporting foot before the upper body follows the
        // lane change. Acceleration adds intent; it never adds random sway.
        float acceleration = dt > 0f ? (lateralVelocity - previousLateralVelocity) / dt : 0f;
        previousLateralVelocity = lateralVelocity;
        turnLoad = Damp(turnLoad, Mathf.Clamp(acceleration / 32f, -1f, 1f), 16f, dt);
        float travelDirection = Mathf.Clamp(lateralVelocity / Mathf.Max(1f, speed), -1f, 1f);
        turnLean = Damp(turnLean, Mathf.Clamp(travelDirection * 6.4f + turnLoad * 2.2f, -8.5f, 8.5f), 17f, dt);
        float plantedX = 0f;
        int supportCount = 0;
        foreach (Leg leg in legs)
        {
            if (!leg.planted && !leg.specialSupport) continue;
            plantedX += transform.InverseTransformPoint(leg.contact).x;
            supportCount++;
        }
        if (supportCount > 0) plantedX /= supportCount;
        float shiftTarget = Mathf.Clamp(plantedX * 0.20f, -0.026f, 0.026f) * runAmount
            - travelDirection * 0.025f + turnLoad * 0.010f
            + laneDirection * (-0.020f * lanePush + 0.015f * laneCatch);
        bodyShift = Damp(bodyShift, shiftTarget, 22f, dt);
        // A slight forward lean is part of the run, but lane changes must not
        // bank, twist toward a lane, or shift the torso sideways over its hips.
        if (ExternalMotion) heading = turnLoad = turnLean = bodyShift = 0f;

        // Weight reaches the pelvis first, then the chest, then the head. The
        // slower upper-body recovery continues past the controller's landing.
        chestRecovery = Damp(chestRecovery, landingAmount, 15f, dt);
        headRecovery = Damp(headRecovery, chestRecovery, 17f, dt);
        float bodyY = jumpHeight - 0.055f - 0.018f * contactLoad * runAmount
            - 0.105f * landingAmount - 0.065f * takeoffCompression - 0.015f * landingReach - 0.018f * laneCatch;
        if (ExternalMotion)
        {
            // A continuous, shallow rise replaces the sharp contact pulses.
            float rise = 0.5f - 0.5f * Mathf.Cos(gaitPhase * Mathf.PI * 4f);
            bodyY = jumpHeight - 0.055f + 0.018f * rise * runAmount
                - 0.105f * landingAmount - 0.065f * takeoffCompression - 0.015f * landingReach;
        }
        // Keep the pelvis travelling just ahead of the support, rather than
        // leaving the person upright over a moving pair of feet.
        float bodyForward = 0.025f + 0.010f * takeoffCompression - 0.018f * landingAmount;
        modelRoot.localPosition = modelPosition + new Vector3(bodyShift, bodyY, bodyForward);
        float targetHeading = Mathf.Clamp(travelDirection * 12f + turnLoad * 1.3f, -14f, 14f);
        heading = ExternalMotion ? 0f : Damp(heading, targetHeading, 14f, dt);
        modelRoot.localRotation = Quaternion.AngleAxis(heading, Vector3.up) * modelRotation;

        float strideTwist = (ExternalMotion ? Mathf.Sin(gaitPhase * Mathf.PI * 2f) : StrideSweep(gaitPhase)) * runAmount;
        Tilt("Hip_Center", transform.right, (ExternalMotion ? 3f : 4f) - 1.5f * flightOpen + 2f * landingAmount);
        Tilt("Hip_Center", transform.up, (ExternalMotion ? 1.8f : 2.6f + actionEffort * 0.4f) * strideTwist);
        if (!ExternalMotion) Tilt("Hip_Center", transform.forward, -turnLean * 0.22f + supportBalance * 0.6f * runAmount);
        Tilt("DEF-Spine", transform.right, (ExternalMotion ? 7f : 12f) + 10f * takeoffCompression + 10f * landingAmount
            - 2f * flightOpen + 3f * flightGather + 2f * landingReach);
        if (!ExternalMotion) Tilt("DEF-Spine", transform.forward, -turnLean * 0.78f - supportBalance * 0.8f * runAmount);
        Tilt("DEF-RibCage", transform.up, -(ExternalMotion ? 3f : 4.7f + actionEffort * 0.7f) * strideTwist - heading * 0.08f);
        Tilt("DEF-Chest", transform.right, 2f + 6f * chestRecovery + 1.5f * takeoffCompression);
        // A small forward shoulder set reads as effort at the rear camera,
        // without adding broad elbows or changing the neutral bone positions.
        float shoulderSet = 5f + 3f * Mathf.Max(takeoffCompression, flightGather);
        Tilt("Shoulder.L", transform.up, shoulderSet);
        Tilt("Shoulder.R", transform.up, -shoulderSet);
        Tilt("Head", transform.right, (ExternalMotion ? -7f : -10f) - 5.5f * chestRecovery - 2f * headRecovery);
        if (!ExternalMotion) Tilt("Head", transform.forward, turnLean * 0.30f);
        Tilt("Head", transform.up, heading * 0.22f);

        LastGroundContactError = 0f;
        LastFootTargetFrameDisplacement = 0f;
        LastPlantedFootHorizontalDrift = 0f;
        PlantedFootCount = 0;
        for (int i = 0; i < 2; i++)
        {
            float phase = Mathf.Repeat(gaitPhase + i * 0.5f, 1f);
            PoseLeg(legs[i], phase, i == 0 ? -1f : 1f, speed, lateralVelocity,
                jumpHeight, jumpProgress, anticipation, reset, dt);
            // One continuous phase keeps the hand moving through the full arc
            // even when a lane command or a foot's support state changes.
            float armPhase = ExternalMotion ? phase : ContactPhase(legs[i], phase, air);
            PoseArm(arms[i], armPhase, i == 0 ? -1f : 1f, jumpProgress, landingAmount, anticipation, dt);
        }
        RelaxHands();
    }

    private void Tilt(string name, Vector3 axis, float degrees)
    {
        if (bones.TryGetValue(name, out Transform t)) t.rotation = Quaternion.AngleAxis(degrees, axis) * t.rotation;
    }

    private void PoseLeg(Leg l, float phase, float side, float speed, float lateral,
        float jump, float progress, float anticipation, bool reset, float dt)
    {
        // A turning step leaves the ground sooner. Holding a foot for the full
        // forward stride while its hip moves a lane sideways overextends the leg.
        float stance = Mathf.Lerp(0.25f, 0.17f, Mathf.Clamp01(Mathf.Abs(lateral) / 3.5f));
        bool air = progress >= 0f;
        bool wasPlanted = l.planted || l.specialSupport;
        bool hadTarget = l.hasTarget;
        Vector3 ankle;
        float footPitch = 0f;
        if (!l.hasTarget)
        {
            l.previousTarget = transform.TransformPoint(new Vector3(l.neutralAnkle.x,
                l.neutralAnkle.y, phase < stance ? 0.26f : -0.22f));
            l.previousFoot = l.previousTarget;
            l.previousPitch = 0f;
            l.previousYaw = l.contactYaw = heading * 0.5f;
            l.hasTarget = true;
        }

        if (!air && l.wasInAir) BeginTouchdown(l, side, speed);
        if (air)
        {
            l.pendingTouchdown = false;
            if (!l.wasInAir) l.airStartLocal = transform.InverseTransformPoint(l.previousTarget);
            l.planted = l.swinging = l.specialSupport = false;
            bool leading = side == jumpLeadSide;
            // Three readable leap poses: a knee drives while the other foot
            // trails; the rear leg folds later; both then reach for support.
            float gather = leading ? Pulse(progress, 0.015f, 0.31f, 0.92f)
                : Pulse(progress, 0.14f, 0.52f, 0.97f);
            float reach = Smooth01((progress - (leading ? 0.56f : 0.62f)) / (leading ? 0.44f : 0.38f));
            float footForward = leading ? Mathf.Lerp(0.075f, 0.28f, reach)
                : Mathf.Lerp(-0.25f, 0.17f, reach);
            Vector3 compact = new Vector3(l.neutralAnkle.x + side * 0.016f * gather,
                l.neutralAnkle.y + (leading ? 0.33f : 0.21f) * gather, footForward);
            // Carry the actual departing foot into the jump, rather than
            // switching to a fixed airborne pose on the takeoff frame.
            Vector3 local = Vector3.Lerp(l.airStartLocal, compact, Smooth01(progress / 0.18f));
            local.y += jump;
            if (!leading) local.y += 0.060f * Smooth01((progress - 0.68f) / 0.32f);
            ankle = transform.TransformPoint(local);
            float leapPitch = leading ? 6f * gather - 3f * reach : 22f * gather - 3f * reach;
            footPitch = Mathf.Lerp(l.previousPitch, leapPitch, Mathf.Clamp01(dt * 22f));
        }
        else if (l.pendingTouchdown)
        {
            float t = Mathf.Clamp01(touchdownTime / TrailingLandingDelay);
            ankle = Vector3.Lerp(l.landingRelease, l.landingTarget, Smooth01(t));
            ankle.y += Mathf.Sin(t * Mathf.PI) * 0.012f;
            footPitch = Mathf.Lerp(l.previousPitch, -3f, Mathf.Clamp01(dt * 24f));
            if (t >= 1f)
            {
                PlantFoot(l, ankle, true);
                l.pendingTouchdown = false;
                LastTouchdownGap = leadTouchdownAt >= 0f ? simulationClock - leadTouchdownAt : -1f;
            }
        }
        else if (jumpPrepared && anticipation > 0f)
        {
            l.swinging = l.specialSupport = false;
            if (side == jumpPushSide)
            {
                Vector3 predictedHip = l.thigh.position
                    + (transform.forward * speed + transform.right * lateral) * Mathf.Max(dt, 0.025f);
                float reach = l.upperLength + l.lowerLength - 0.012f;
                if (Vector3.Distance(predictedHip, jumpPushContact) > reach) jumpSupportReleased = true;
                // A reversal can carry the hip away during preparation. End
                // support when the leg must lift; never claim an unreachable
                // cached contact is still planted, or replant it mid-takeoff.
                Vector3 target = jumpSupportReleased
                    ? transform.TransformPoint(new Vector3(l.neutralAnkle.x, l.neutralAnkle.y + 0.025f * anticipation, 0.08f))
                    : jumpPushContact;
                ankle = Vector3.MoveTowards(l.previousTarget, target, 12f * dt);
                l.planted = !jumpSupportReleased && Vector3.Distance(ankle, jumpPushContact) < 0.004f;
                if (l.planted) { l.contact = jumpPushContact; l.contactYaw = l.previousYaw; }
                footPitch = 20f * anticipation;
                if (l.planted) ankle.y += 0.012f * anticipation;
            }
            else
            {
                l.planted = false;
                Vector3 gather = new Vector3(l.neutralAnkle.x, l.neutralAnkle.y + 0.11f, 0.075f);
                Vector3 target = transform.TransformPoint(Vector3.Lerp(l.jumpStartLocal, gather, Smooth01(anticipation)));
                // A jump may interrupt a long sideways receiving step. Carry
                // that foot continuously into preparation; the airborne pose
                // will start from whichever position it actually reaches.
                ankle = Vector3.MoveTowards(l.previousTarget, target, 12f * dt);
                footPitch = 4f;
            }
        }
        else if (ExternalMotion)
        {
            PoseGameRunFoot(l, phase, side, speed, lateral, dt, out ankle, out footPitch);
        }
        else if (TryLaneFoot(l, phase, speed, lateral, dt, out ankle, out footPitch)) { }
        else
        {
            l.supportTime += dt;
            if (l.specialSupport)
            {
                bool leading = side == jumpLeadSide;
                float hold = leading ? 0.120f : 0.060f;
                Vector3 projectedHip = l.thigh.position
                    + (transform.forward * speed + transform.right * lateral) * Mathf.Max(dt, 0.025f);
                bool externalReachLimit = ExternalMotion && Vector3.Distance(projectedHip, l.contact)
                    > l.upperLength + l.lowerLength - 0.012f;
                if (l.supportTime >= hold || externalReachLimit)
                {
                    // At externally supplied boost speeds, end support before
                    // its anchor becomes unreachable. No race motion changes.
                    // Stagger the first two recovery steps, then rejoin cadence.
                    BeginSwing(l, leading ? 0.32f : 0.24f, speed, lateral);
                    l.specialSupport = false;
                }
            }
            else if (l.planted)
            {
                Vector3 predictedHip = l.thigh.position
                    + (transform.forward * speed + transform.right * lateral) * Mathf.Max(dt, 0.025f);
                float reach = l.upperLength + l.lowerLength - 0.012f;
                bool approachingReachLimit = Vector3.Distance(predictedHip, l.contact) > reach;
                bool phaseReleased = phase >= stance && l.supportTime >= 0.045f;
                if (approachingReachLimit || phaseReleased)
                    BeginSwing(l, Mathf.Max(0.14f, (1f - phase) * cycleSeconds), speed, lateral);
            }
            else if (!l.swinging)
            {
                if (phase < stance)
                {
                    l.contact = transform.TransformPoint(new Vector3(l.neutralAnkle.x, l.neutralAnkle.y, 0.26f));
                    l.planted = true;
                    l.contactYaw = heading * 0.5f;
                    l.supportTime = 0f;
                }
                else BeginSwing(l, Mathf.Max(0.14f, (1f - phase) * cycleSeconds), speed, lateral);
            }

            if (l.swinging)
            {
                l.swingElapsed += dt;
                float swing = Mathf.Clamp01(l.swingElapsed / l.swingDuration);
                float remaining = Mathf.Max(0f, l.swingDuration - l.swingElapsed);
                Vector3 target = transform.TransformPoint(new Vector3(l.neutralAnkle.x
                    + Mathf.Clamp(lateral * remaining * 0.35f, -0.20f, 0.20f),
                    l.neutralAnkle.y, 0.26f + speed * remaining));
                // Redirect the airborne foot as input changes, while its world
                // contact stays immutable whenever it is supporting the runner.
                float redirect = 1f - Mathf.Exp(-20f * Mathf.Max(0f, dt));
                l.swingEnd.x = Mathf.Lerp(l.swingEnd.x, target.x, redirect);
                l.swingEnd.y = target.y;
                l.swingEnd.z = target.z;
                float s = Smooth01(swing);
                float clearance = Mathf.Pow(Mathf.Max(0f, Mathf.Sin(Mathf.PI * swing)), 1.35f) * 0.22f;
                ankle = Vector3.Lerp(l.release, l.swingEnd, s) + transform.up * clearance;
                footPitch = Mathf.Lerp(l.releasePitch, -3f, s) + 16f * Mathf.Sin(Mathf.PI * swing);
                if (swing >= 1f)
                {
                    l.contact = ankle;
                    l.contactYaw = l.previousYaw;
                    l.planted = true;
                    l.swinging = false;
                    l.supportTime = 0f;
                }
            }
            else
            {
                ankle = l.contact;
                float push = l.specialSupport ? 0f : Smooth01((l.supportTime / Mathf.Max(0.04f, stance * cycleSeconds) - 0.65f) / 0.35f);
                footPitch = Mathf.Lerp(-3f, 0f, Mathf.Clamp01(l.supportTime / 0.035f))
                    + (18f + 2.5f * Mathf.Abs(turnLoad)) * push;
                ankle.y += 0.018f * push;
            }
        }
        float kneeSeparation = air ? 0.10f : 0.055f;
        SolveTwoBone(l.thigh, l.knee, l.foot, ankle,
            transform.forward + transform.right * side * kneeSeparation, l.upperLength, l.lowerLength);
        // Keep a supporting foot's yaw stable. The next swinging foot can turn
        // toward the new travel direction without twisting the planted sole.
        float footYaw = l.planted || l.specialSupport ? l.contactYaw
            : Damp(l.previousYaw, heading * 0.5f, 18f, dt);
        l.foot.rotation = transform.rotation * Quaternion.AngleAxis(footYaw, Vector3.up)
            * Quaternion.AngleAxis(footPitch, Vector3.right) * l.neutralFoot;
        if (l.planted || l.specialSupport)
        {
            PlantedFootCount++;
            LastGroundContactError = Mathf.Max(LastGroundContactError, Vector3.Distance(l.foot.position, ankle));
            if (wasPlanted && hadTarget && !reset && dt > 0f)
                LastPlantedFootHorizontalDrift = Mathf.Max(LastPlantedFootHorizontalDrift,
                    Vector3.ProjectOnPlane(l.foot.position - l.previousFoot, transform.up).magnitude);
        }
        if (hadTarget && !reset && dt > 0f)
            LastFootTargetFrameDisplacement = Mathf.Max(LastFootTargetFrameDisplacement,
                Vector3.Distance(ankle, l.previousTarget));
        l.previousTarget = ankle;
        l.previousFoot = l.foot.position;
        l.previousPitch = footPitch;
        l.previousYaw = footYaw;
        l.wasInAir = air;
    }

    private void PoseGameRunFoot(Leg leg, float phase, float side, float speed, float lateral, float dt,
        out Vector3 ankle, out float footPitch)
    {
        // Retain the leap's staggered touchdown before returning to the run.
        // Release a real landing contact if the fast game root outruns its reach.
        if (leg.specialSupport)
        {
            leg.supportTime += dt;
            Vector3 nextHip = leg.thigh.position
                + (transform.forward * speed + transform.right * lateral) * Mathf.Max(dt, 0.025f);
            float hold = side == jumpLeadSide ? 0.075f : 0.035f;
            if (leg.supportTime < hold
                && Vector3.Distance(nextHip, leg.contact) < leg.upperLength + leg.lowerLength - 0.012f)
            {
                ankle = leg.contact;
                footPitch = Mathf.Lerp(leg.previousPitch, 0f, 1f - Mathf.Exp(-20f * dt));
                return;
            }
            leg.runRejoinLocal = transform.InverseTransformPoint(leg.previousTarget);
            leg.runRejoinPitch = leg.previousPitch;
            leg.runRejoin = 0f;
        }

        // This is an authored, looping game stride, not a world-locked walk.
        // Its compact support, folded heel recovery and forward knee drive
        // stay continuous when the root crosses a lane or accelerates. Ground
        // speed can exceed anatomical stride length during a time boost, so
        // those visual contacts deliberately do not report a planted foot.
        const float supportEnd = 0.28f;
        float pace = Mathf.Clamp01((speed - 4f) / 8f);
        float theta = phase * Mathf.PI * 2f;
        float reach = 0.30f + 0.025f * pace;
        float forward = 0.015f + reach * Mathf.Cos(theta);
        float height = 0f;
        if (phase < supportEnd)
        {
            footPitch = Mathf.Lerp(-4f, 16f, Smooth01(phase / supportEnd));
        }
        else
        {
            float swing = (phase - supportEnd) / (1f - supportEnd);
            float fold = Mathf.Sin(swing * Mathf.PI);
            height = (0.30f + 0.025f * pace) * fold * fold;
            footPitch = Mathf.Lerp(16f, -4f, Smooth01(swing)) + 22f * fold * fold;
        }
        Vector3 local = new Vector3(leg.neutralAnkle.x, leg.neutralAnkle.y + height, forward);
        if (leg.runRejoin < 1f)
        {
            leg.runRejoin = Mathf.Min(1f, leg.runRejoin + dt / 0.18f);
            float blend = Smooth01(leg.runRejoin);
            local = Vector3.Lerp(leg.runRejoinLocal, local, blend);
            footPitch = Mathf.Lerp(leg.runRejoinPitch, footPitch, blend);
        }
        ankle = transform.TransformPoint(local);
        leg.planted = leg.specialSupport = false;
        leg.swinging = true;
    }

    private void PlantFoot(Leg leg, Vector3 contact, bool landing)
    {
        leg.contact = contact;
        leg.contactYaw = leg.previousYaw;
        leg.planted = true;
        leg.swinging = false;
        leg.specialSupport = landing;
        leg.supportTime = 0f;
    }

    private void BeginTouchdown(Leg leg, float side, float speed)
    {
        if (side == jumpLeadSide)
        {
            Vector3 contact = leg.previousTarget;
            contact.y = transform.TransformPoint(leg.neutralAnkle).y;
            PlantFoot(leg, contact, true);
            leadTouchdownAt = simulationClock;
        }
        else
        {
            leg.pendingTouchdown = true;
            leg.planted = leg.swinging = leg.specialSupport = false;
            leg.landingRelease = leg.previousTarget;
            leg.landingTarget = transform.TransformPoint(new Vector3(leg.neutralAnkle.x,
                leg.neutralAnkle.y, 0.18f + speed * TrailingLandingDelay));
        }
    }

    private bool TryLaneFoot(Leg leg, float phase, float speed, float lateral, float dt,
        out Vector3 ankle, out float footPitch)
    {
        ankle = leg.previousTarget;
        footPitch = leg.previousPitch;
        if (!laneActive || !laneGrounded || leg.laneFinished || lanePhase >= 1f) return false;
        Vector3 predictedHip = leg.thigh.position + (transform.forward * speed + transform.right * lateral) * Mathf.Max(dt, 0.025f);
        bool contactReachable = Vector3.Distance(predictedHip, leg.laneContact) < leg.upperLength + leg.lowerLength - 0.012f;
        if (leg.laneRole == 1)
        {
            if (lanePhase >= 0.32f || (!contactReachable && lanePhase >= 0.10f))
            {
                leg.laneFinished = true;
                BeginSwing(leg, Mathf.Max(0.18f, (1f - phase) * cycleSeconds), speed, lateral);
                return false;
            }
            Vector3 desired = Vector3.Lerp(leg.laneStart, leg.laneContact, Smooth01(lanePhase / 0.10f));
            ankle = Vector3.MoveTowards(leg.previousTarget, desired, 12f * dt);
            leg.planted = contactReachable && Vector3.Distance(ankle, leg.laneContact) < 0.004f;
            if (leg.planted)
            {
                leg.contact = leg.laneContact;
                leg.contactYaw = leg.previousYaw;
                footPitch = 23f * Smooth01((lanePhase - 0.10f) / 0.22f);
                ankle.y += 0.018f * Smooth01((lanePhase - 0.10f) / 0.22f);
            }
        }
        else
        {
            if (lanePhase >= 0.86f || (leg.planted && !contactReachable))
            {
                leg.laneFinished = true;
                BeginSwing(leg, cycleSeconds * 0.65f, speed, lateral);
                return false;
            }
            if (leg.planted)
            {
                ankle = leg.contact;
                footPitch = -3f;
            }
            else
            {
                float t = Mathf.Clamp01(lanePhase / 0.65f);
                Vector3 desired = Vector3.Lerp(leg.laneStart, leg.laneContact, Smooth01(t))
                    + transform.up * (Mathf.Sin(Mathf.PI * t) * 0.19f);
                ankle = Vector3.MoveTowards(leg.previousTarget, desired, 12f * dt);
                footPitch = 13f * Mathf.Sin(Mathf.PI * t) - 3f * t;
                if (t >= 1f && contactReachable && Vector3.Distance(ankle, leg.laneContact) < 0.004f)
                    PlantFoot(leg, leg.laneContact, false);
            }
        }
        return true;
    }

    private float ContactPhase(Leg leg, float fallback, bool air)
    {
        if (air || jumpPrepared || leg.pendingTouchdown) return fallback;
        if (laneActive && laneGrounded && !leg.laneFinished)
            return leg.laneRole == 1 ? Mathf.Clamp01(lanePhase / 0.32f) * 0.25f
                : 0.25f + 0.75f * Mathf.Clamp01(lanePhase / 0.65f);
        if (leg.planted) return Mathf.Clamp01(leg.supportTime / Mathf.Max(0.05f, cycleSeconds * 0.25f)) * 0.25f;
        if (leg.swinging) return 0.25f + 0.75f * Mathf.Clamp01(leg.swingElapsed / leg.swingDuration);
        return fallback;
    }

    private void BeginSwing(Leg l, float duration, float speed, float lateral)
    {
        l.release = l.previousTarget;
        l.releasePitch = l.previousPitch;
        l.swingElapsed = 0f;
        l.swingDuration = Mathf.Max(0.14f, duration);
        l.swingEnd = transform.TransformPoint(new Vector3(l.neutralAnkle.x
            + Mathf.Clamp(lateral * l.swingDuration * 0.35f, -0.20f, 0.20f),
            l.neutralAnkle.y, 0.26f + speed * l.swingDuration));
        l.swinging = true;
        l.planted = false;
        l.supportTime = 0f;
    }

    private static float Smooth01(float t)
    {
        t = Mathf.Clamp01(t);
        return t * t * (3f - 2f * t);
    }

    // Unequal loading/release intervals give the stride a clear push and
    // recovery, rather than using the same sinusoid for every body part.
    private static float Pulse(float t, float start, float peak, float end)
    {
        if (t <= start || t >= end) return 0f;
        return t < peak ? Smooth01((t - start) / (peak - start))
            : 1f - Smooth01((t - peak) / (end - peak));
    }

    private static float StrideSweep(float phase)
    {
        phase = Mathf.Repeat(phase, 1f);
        return phase < 0.43f ? Mathf.Lerp(-1f, 1f, Smooth01(phase / 0.43f))
            : Mathf.Lerp(1f, -1f, Smooth01((phase - 0.43f) / 0.57f));
    }

    private static float Damp(float value, float target, float response, float dt)
    {
        return Mathf.Lerp(value, target, 1f - Mathf.Exp(-response * Mathf.Max(0f, dt)));
    }

    private static float ArmDrive(float phase, float side)
    {
        // The left arm commits a little earlier; the right is more guarded.
        // A quick drive, short forward recovery and longer return replace the
        // mechanically mirrored arcs, while keeping both hands close to the body.
        phase = Mathf.Repeat(phase + (side < 0f ? 0.018f : -0.025f), 1f);
        float peak = side < 0f ? 0.36f : 0.43f;
        if (phase < peak) return Mathf.Lerp(-1f, 1f, Smooth01(phase / peak));
        if (phase < 0.58f) return Mathf.Lerp(1f, 0.68f, Smooth01((phase - peak) / (0.58f - peak)));
        return Mathf.Lerp(0.68f, -1f, Smooth01((phase - 0.58f) / 0.42f));
    }

    private void PoseArm(Arm a, float phase, float side, float progress, float landing, float anticipation, float dt)
    {
        float drive = ArmDrive(phase, side);
        float forward = 0.055f + (side < 0f ? 0.145f : 0.125f) * drive;
        float down = -0.26f - 0.018f * drive;
        if (ExternalMotion)
        {
            // The hand follows a rounded fore/aft arc opposite its same-side
            // foot. A small phase offset and the target damping below leave
            // the wrist trailing the shoulder instead of stopping at each pose.
            drive = -Mathf.Cos((phase - 0.025f) * Mathf.PI * 2f);
            forward = 0.035f + (side < 0f ? 0.245f : 0.235f) * drive;
            down = -0.235f + 0.060f * drive;
        }
        if (progress >= 0f)
        {
            float driveLeap = Pulse(progress, 0f, 0.25f, 0.76f);
            float brace = Smooth01((progress - 0.70f) / 0.30f);
            bool oppositeLeadingKnee = side != jumpLeadSide;
            forward = Mathf.Lerp(0.18f, oppositeLeadingKnee ? 0.25f : 0.055f, driveLeap);
            down = Mathf.Lerp(-0.25f, oppositeLeadingKnee ? -0.205f : -0.27f, driveLeap)
                - 0.02f * brace;
        }
        else
        {
            float recovery = 1f - Smooth01(touchdownTime / 0.23f);
            float gather = Mathf.Max(Mathf.Max(chestRecovery, anticipation), recovery);
            forward = Mathf.Lerp(forward, 0.20f, gather);
            down = Mathf.Lerp(down, -0.26f, gather) - 0.025f * landing;
        }
        float counterbalance = -turnLean * 0.0025f;
        forward += side * turnLean * 0.002f;
        if (ExternalMotion)
        {
            if (a.hasTarget && dt > 0f)
            {
                forward = Damp(a.forward, forward, 28f, dt);
                down = Damp(a.down, down, 28f, dt);
            }
            a.forward = forward;
            a.down = down;
            a.hasTarget = true;
        }
        Vector3 target = a.upper.position + transform.right * (side * (ExternalMotion ? 0.032f : 0.018f) + counterbalance)
            + transform.up * down + transform.forward * forward;
        // Give bent elbows a little breathing room beside the jacket without
        // widening the hand path into a sideways swing.
        Vector3 pole = transform.right * side * (ExternalMotion ? 0.16f : 0.045f)
            - transform.up * 0.50f - transform.forward * 0.9f;
        SolveTwoBone(a.upper, a.elbow, a.wrist, target, pole, a.a, a.b);
    }

    private void RelaxHands()
    {
        string[] names = { "Index", "Middle", "Ring", "Pinky", "Thumb" };
        float[,] curls = { {10f,16f,8f}, {14f,20f,10f}, {18f,22f,12f}, {20f,25f,12f}, {4f,9f,6f} };
        for (int hand = 0; hand < 2; hand++)
            for (int finger = 0; finger < names.Length; finger++)
                for (int joint = 0; joint < 3; joint++)
                    if (bones.TryGetValue("DEF-Finger_" + names[finger] + (joint + 1) + (hand == 0 ? ".L" : ".R"), out Transform bone))
                        bone.localRotation *= Quaternion.AngleAxis(curls[finger,joint], Vector3.right);
    }

    private static void SolveTwoBone(Transform upper, Transform middle, Transform end,
        Vector3 target, Vector3 pole, float a, float b)
    {
        Vector3 start = upper.position;
        Vector3 delta = target - start;
        float distance = Mathf.Clamp(delta.magnitude, Mathf.Abs(a - b) + 0.001f, a + b - 0.001f);
        Vector3 direction = delta.sqrMagnitude > 0.000001f ? delta.normalized : Vector3.down;
        Vector3 bend = Vector3.ProjectOnPlane(pole, direction).normalized;
        if (bend.sqrMagnitude < 0.01f) bend = Vector3.Cross(direction, Vector3.right).normalized;
        float along = (a * a - b * b + distance * distance) / (2f * distance);
        float height = Mathf.Sqrt(Mathf.Max(0f, a * a - along * along));
        Vector3 knee = start + direction * along + bend * height;
        upper.rotation = Quaternion.FromToRotation(middle.position - start, knee - start) * upper.rotation;
        middle.rotation = Quaternion.FromToRotation(end.position - middle.position,
            start + direction * distance - middle.position) * middle.rotation;
    }
}
