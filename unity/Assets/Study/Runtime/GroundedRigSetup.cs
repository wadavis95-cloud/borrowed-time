using System;
using System.Collections.Generic;
using System.Linq;
using UnityEngine;

/// <summary>
/// Converts the transferred mesh's neutral skin bind pose into a small, connected
/// anatomical hierarchy. No imported AnimationClip is sampled or read here.
/// Run once on a fresh model instance, before taking the pose driver's snapshots.
/// </summary>
public static class GroundedRigSetup
{
    public const string RigName = "RIG-Snow";
    public const string PelvisName = "Hip_Center";
    public const string SpineName = "DEF-Spine";
    public const string RibCageName = "DEF-RibCage";
    public const string ChestName = "DEF-Chest";
    public const string NeckName = "Neck";
    public const string HeadName = "Head";

    /// <summary>
    /// The returned dictionary contains controls as well as deform bones, keyed
    /// by exact imported names. Throws a diagnostic on incompatible model data.
    /// </summary>
    public static bool Prepare(Transform modelRoot, out Dictionary<string, Transform> bones)
    {
        if (modelRoot == null) throw new ArgumentNullException(nameof(modelRoot));

        bones = new Dictionary<string, Transform>(StringComparer.Ordinal);
        foreach (Transform transform in modelRoot.GetComponentsInChildren<Transform>(true))
        {
            // Mesh object names need not be unique; every required rig name is.
            if (!bones.ContainsKey(transform.name)) bones.Add(transform.name, transform);
        }

        string[] required = {
            RigName, "root", PelvisName, "Hips", "DEF-Hip_Center", SpineName,
            RibCageName, ChestName, "ROOT-Neck", NeckName, HeadName,
            "Shoulder.L", "Shoulder.R", "Wrist.L", "Wrist.R",
            "DEF-UpperArm_1.L", "DEF-UpperArm_2.L", "DEF-Forearm_1.L", "DEF-Forearm_2.L", "DEF-Wrist.L",
            "DEF-UpperArm_1.R", "DEF-UpperArm_2.R", "DEF-Forearm_1.R", "DEF-Forearm_2.R", "DEF-Wrist.R",
            "DEF-Thigh_1.L", "DEF-Thigh_2.L", "DEF-Knee_1.L", "DEF-Knee_2.L", "DEF-Foot.L", "DEF-Toes.L",
            "DEF-Thigh_1.R", "DEF-Thigh_2.R", "DEF-Knee_1.R", "DEF-Knee_2.R", "DEF-Foot.R", "DEF-Toes.R"
        };
        foreach (string name in required)
            if (!bones.ContainsKey(name))
                throw new InvalidOperationException("Independent runner rig is missing '" + name + "'.");

        // The prefab's default transform values are a posed export snapshot. Its
        // skin bind matrices, however, retain the actual neutral T-pose. Capture
        // all desired world matrices before changing any hierarchy transform.
        SkinnedMeshRenderer reference = modelRoot.GetComponentsInChildren<SkinnedMeshRenderer>(true)
            .Where(r => r.sharedMesh != null && r.bones.Length > 0)
            .OrderByDescending(r => r.bones.Length).FirstOrDefault();
        if (reference == null)
            throw new InvalidOperationException("The runner requires a skinned mesh with bind poses.");

        Transform[] skinBones = reference.bones;
        Matrix4x4[] bindPoses = reference.sharedMesh.bindposes;
        if (skinBones.Length != bindPoses.Length)
            throw new InvalidOperationException("Runner bone and bind-pose counts do not match.");

        var targets = new Dictionary<Transform, Matrix4x4>();
        Matrix4x4 meshToWorld = reference.transform.localToWorldMatrix;
        for (int i = 0; i < skinBones.Length; i++)
        {
            if (skinBones[i] == null)
                throw new InvalidOperationException("Runner bind pose " + i + " has no bone transform.");
            targets[skinBones[i]] = meshToWorld * bindPoses[i].inverse;
        }
        foreach (string name in required)
        {
            if (name == RigName || name == "root") continue;
            if (!targets.ContainsKey(bones[name]))
                throw new InvalidOperationException("The skin bind data does not include required bone '" + name + "'.");
        }

        // Nothing can overwrite the new pose with the old imported sequence.
        foreach (Animator animator in modelRoot.GetComponentsInChildren<Animator>(true))
        {
            animator.enabled = false;
            animator.runtimeAnimatorController = null;
            animator.applyRootMotion = false;
        }

        foreach (KeyValuePair<Transform, Matrix4x4> entry in targets.OrderBy(x => Depth(x.Key)))
        {
            Transform bone = entry.Key;
            Matrix4x4 local = bone.parent == null
                ? entry.Value
                : bone.parent.worldToLocalMatrix * entry.Value;
            bone.localPosition = local.GetColumn(3);
            bone.localRotation = local.rotation;
            bone.localScale = local.lossyScale;
        }

        // Blender constraints connected these separate exported branches. Those
        // constraints do not exist at runtime; explicit parent links replace them.
        Parent(bones, SpineName, PelvisName);
        Parent(bones, "Hips", PelvisName);
        Parent(bones, "Shoulder.L", ChestName);
        Parent(bones, "Shoulder.R", ChestName);
        Parent(bones, "ROOT-Neck", ChestName);

        // Wrist controls own all finger branches, while DEF-Wrist is a leaf in
        // the source hierarchy. Attach the hand branches to the moving forearm.
        Parent(bones, "Wrist.L", "DEF-Wrist.L");
        Parent(bones, "Wrist.R", "DEF-Wrist.R");

        Transform rig = bones[RigName];
        Transform head = bones[HeadName];
        var skinBoneSet = new HashSet<Transform>(skinBones);
        var detachedFaceRoots = rig.Cast<Transform>()
            .Where(t => skinBoneSet.Contains(t) && t.name != "root" && t.name != PelvisName)
            .ToArray();
        foreach (Transform faceRoot in detachedFaceRoots)
        {
            if (head.IsChildOf(faceRoot))
                throw new InvalidOperationException("Unexpected head ancestor among detached face roots: " + faceRoot.name);
            faceRoot.SetParent(head, true);
        }

        // A parent change must not alter the neutral mesh. Check all original
        // bind positions, not merely the visibly large limb joints.
        float largestDrift = 0f;
        foreach (KeyValuePair<Transform, Matrix4x4> entry in targets)
            largestDrift = Mathf.Max(largestDrift,
                Vector3.Distance(entry.Key.position, entry.Value.GetColumn(3)));
        if (largestDrift > 0.001f)
            throw new InvalidOperationException("Neutral rig setup moved a bind position by " + largestDrift + " metres.");

        return true;
    }

    private static void Parent(Dictionary<string, Transform> bones, string child, string parent)
    {
        Transform childTransform = bones[child], parentTransform = bones[parent];
        if (parentTransform.IsChildOf(childTransform))
            throw new InvalidOperationException("Rig reparent would create a cycle: " + child + " -> " + parent);
        childTransform.SetParent(parentTransform, true);
    }

    private static int Depth(Transform transform)
    {
        int depth = 0;
        for (Transform parent = transform.parent; parent != null; parent = parent.parent) depth++;
        return depth;
    }
}
