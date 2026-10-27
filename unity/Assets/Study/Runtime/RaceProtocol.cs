using System;
using UnityEngine;

// This is a presentation protocol, not a second copy of the race rules.
// Fields intentionally match the host's JSON names for JsonUtility.
[Serializable]
public sealed class RaceCourse
{
    public int version;
    public int epoch;
    public float courseLength;
    public RaceObstacle[] obstacles;
    public RaceDebris[] debris;
    public RaceCheckpoint[] checkpoints;
}

[Serializable]
public sealed class RaceFrame
{
    public int version;
    public int epoch;
    public int sequence;
    public string phase;
    public float elapsed;
    public float dt;
    public bool reducedMotion;
    public RaceActorState player;
    public RaceActorState[] opponents;
}

[Serializable]
public sealed class RaceActorState
{
    public string id;
    public string avatarId;
    public string color;
    public string phase;
    public float distance;
    public float lane;
    public float speed;
    public float jumpHeight;
    public float jumpProgress = -1f;
    public float jumpDuration;
    // Only the local actor may consume these fields. The public opponent
    // protocol supplies movement, never another player's ability or clock.
    public bool boosting;
    public float hitFlash;
    public bool stunned;
}

[Serializable]
public sealed class RaceObstacle
{
    public string id;
    public string type;
    public float lane;
    public float z;
    public float length;
}

[Serializable]
public sealed class RaceDebris
{
    public string id;
    public float lane;
    public float z;
    public float warnAt;
    public float fallAt;
    public float impactAt;
}

[Serializable]
public sealed class RaceCheckpoint { public float z; }

public static class RaceScale
{
    public const float Forward = 0.21f;
    public const float Height = 0.43f;
    public const float Lane = 1.15f;
    public const float VisibleBehind = 18f;
    public const float VisibleAhead = 255f;
    public static float WorldZ(float metres) { return metres * Forward; }
    public static float WorldX(float lane) { return (lane - 1f) * Lane; }
    public static bool IsFinite(float value) { return !float.IsNaN(value) && !float.IsInfinity(value); }
    public static bool ValidActor(RaceActorState actor)
    {
        return actor != null && IsFinite(actor.distance) && actor.distance >= 0f
            && IsFinite(actor.lane) && actor.lane >= 0f && actor.lane <= 2f
            && IsFinite(actor.speed) && actor.speed >= 0f
            && IsFinite(actor.jumpHeight) && actor.jumpHeight >= 0f
            && IsFinite(actor.jumpProgress) && actor.jumpProgress >= -1f && actor.jumpProgress <= 1f
            && IsFinite(actor.jumpDuration) && actor.jumpDuration >= 0f
            && IsFinite(actor.hitFlash);
    }
}
