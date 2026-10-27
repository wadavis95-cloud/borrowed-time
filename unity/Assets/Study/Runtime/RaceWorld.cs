using System;
using System.Collections.Generic;
using UnityEngine;

/// <summary>
/// Presentation only. Course geometry and falling masonry follow the JavaScript
/// course and shared clock; this component has no collisions or race simulation.
/// </summary>
public sealed class RaceWorld : MonoBehaviour
{
    public const float SectionLength = 50f;
    public GameObject interiorTemplate, terminalTemplate;
    public GameObject rubbleTemplate, barrierTemplate, gapTemplate, debrisTemplate, checkpointTemplate;
    public float CurrentSectionStart { get; private set; }
    public float FinishWorldZ { get; private set; }
    public float TerminalStart { get; private set; }
    public float CurrentDistance { get; private set; }
    public bool HasCourse { get; private set; }

    private const int MaximumObstacles = 64, MaximumDebris = 32, MaximumCheckpoints = 16;
    private const float BackMetres = 18f, AheadMetres = 255f;
    private readonly GameObject[] sections = new GameObject[3];
    private GameObject terminal;
    private Transform courseRoot;
    private float gridOrigin;
    private bool hasFrame;
    private readonly List<ObstacleVisual> obstacles = new List<ObstacleVisual>();
    private readonly List<DebrisVisual> debris = new List<DebrisVisual>();
    private readonly List<CheckpointVisual> checkpoints = new List<CheckpointVisual>();
    private readonly MaterialPropertyBlock properties = new MaterialPropertyBlock();
    private sealed class ObstacleVisual { public GameObject root; public float z; }
    private sealed class CheckpointVisual { public GameObject root; public float z; }
    private sealed class DebrisVisual
    {
        public GameObject root, warning, chunk, rubble, dust;
        public Renderer warningRenderer;
        public Renderer[] dustRenderers;
        public float z, warnAt, fallAt, impactAt;
    }

    public void LoadCourse(RaceCourse course)
    {
        ResetPresentation();
        if(course==null || !Finite(course.courseLength) || course.courseLength<=0f)return;
        if(interiorTemplate==null || terminalTemplate==null)
            throw new InvalidOperationException("RaceWorld requires the baked interior and terminal templates.");
        FinishWorldZ=RaceScale.WorldZ(course.courseLength);
        TerminalStart=FinishWorldZ-SectionLength;
        gridOrigin=Mathf.Repeat(TerminalStart,SectionLength);
        courseRoot=new GameObject("Race course / state-driven visuals").transform;
        courseRoot.SetParent(transform,false);
        for(int i=0;i<sections.Length;i++)
        {
            sections[i]=Clone(interiorTemplate,"Interior pool "+i);
            sections[i].SetActive(false);
        }
        terminal=Clone(terminalTemplate,"Final exit / once per course");
        terminal.transform.localPosition=new Vector3(0,0,TerminalStart);
        terminal.SetActive(false);
        if(course.obstacles!=null)
        {
            for(int i=0;i<Mathf.Min(course.obstacles.Length,MaximumObstacles);i++)
            {
                var obstacle=course.obstacles[i];
                if(obstacle==null || !ValidPosition(obstacle.z,obstacle.lane))continue;
                GameObject template=obstacle.type=="gap"?gapTemplate:obstacle.type=="barrier"?barrierTemplate:rubbleTemplate;
                if(template==null)continue;
                GameObject visual=Clone(template,"Course "+obstacle.id+" / "+obstacle.type);
                visual.transform.localPosition=new Vector3(RaceScale.WorldX(obstacle.lane),0,RaceScale.WorldZ(obstacle.z));
                if(obstacle.type=="gap")visual.transform.localScale=new Vector3(1,1,Mathf.Max(.21f,RaceScale.WorldZ(obstacle.length>0?obstacle.length:8f)));
                visual.SetActive(false);obstacles.Add(new ObstacleVisual{root=visual,z=obstacle.z});
            }
        }
        if(course.debris!=null && debrisTemplate!=null)
        {
            for(int i=0;i<Mathf.Min(course.debris.Length,MaximumDebris);i++)
            {
                var item=course.debris[i];
                if(item==null || !ValidPosition(item.z,item.lane) || !Finite(item.warnAt) || !Finite(item.fallAt) || !Finite(item.impactAt))continue;
                GameObject visual=Clone(debrisTemplate,"Falling masonry "+item.id);
                visual.transform.localPosition=new Vector3(RaceScale.WorldX(item.lane),0,RaceScale.WorldZ(item.z));
                var entry=new DebrisVisual{root=visual,z=item.z,warnAt=item.warnAt,fallAt=item.fallAt,impactAt=item.impactAt,
                    warning=visual.transform.Find("Warning").gameObject,chunk=visual.transform.Find("Chunk").gameObject,
                    rubble=visual.transform.Find("Rubble").gameObject,dust=visual.transform.Find("Dust").gameObject};
                entry.warningRenderer=entry.warning.GetComponentInChildren<Renderer>();
                entry.dustRenderers=entry.dust.GetComponentsInChildren<Renderer>();
                visual.SetActive(false);debris.Add(entry);
            }
        }
        if(course.checkpoints!=null && checkpointTemplate!=null)
        {
            for(int i=0;i<Mathf.Min(course.checkpoints.Length,MaximumCheckpoints);i++)
            {
                var checkpoint=course.checkpoints[i];if(checkpoint==null || !Finite(checkpoint.z))continue;
                GameObject visual=Clone(checkpointTemplate,"Time pickup "+i);
                visual.transform.localPosition=new Vector3(0,0,RaceScale.WorldZ(checkpoint.z));
                visual.SetActive(false);checkpoints.Add(new CheckpointVisual{root=visual,z=checkpoint.z});
            }
        }
        HasCourse=true;
    }

    public void RenderFrame(RaceFrame frame)
    {
        if(!HasCourse || frame==null || frame.player==null || !Finite(frame.player.distance))return;
        if(frame.phase=="paused" && hasFrame)return;
        float distance=frame.player.distance,elapsed=Finite(frame.elapsed)?frame.elapsed:0f;
        CurrentDistance=RaceScale.WorldZ(distance);
        CurrentSectionStart=gridOrigin+Mathf.Floor((CurrentDistance-gridOrigin)/SectionLength)*SectionLength;
        // The oldest section is retired only after its end is safely behind
        // the pulled-back camera. Three slots cover the 53.55-unit draw range.
        int first=Mathf.FloorToInt((CurrentDistance-9f-gridOrigin)/SectionLength);
        for(int i=0;i<sections.Length;i++)
        {
            float start=gridOrigin+(first+i)*SectionLength;
            bool enabled=start<TerminalStart-.001f;
            sections[i].SetActive(enabled);
            if(enabled)sections[i].transform.localPosition=new Vector3(0,0,start);
        }
        terminal.SetActive(TerminalStart-CurrentDistance<SectionLength*2f);
        foreach(ObstacleVisual obstacle in obstacles)
            obstacle.root.SetActive(Visible(obstacle.z-distance));
        foreach(CheckpointVisual checkpoint in checkpoints)
            checkpoint.root.SetActive(Visible(checkpoint.z-distance));
        foreach(DebrisVisual item in debris)
        {
            bool shown=Visible(item.z-distance)&&elapsed>=item.warnAt;
            item.root.SetActive(shown);if(!shown)continue;
            bool warning=elapsed<item.fallAt,falling=!warning&&elapsed<item.impactAt,landed=elapsed>=item.impactAt;
            item.warning.SetActive(!landed);
            item.chunk.SetActive(!landed);
            item.rubble.SetActive(landed);
            float t=falling?Mathf.Clamp01((elapsed-item.fallAt)/Mathf.Max(.001f,item.impactAt-item.fallAt)):0f;
            item.chunk.transform.localPosition=new Vector3(0,3.95f-t*t*3.72f,0);
            item.chunk.transform.localRotation=Quaternion.Euler(t*74f,t*53f,t*31f);
            if(item.warningRenderer!=null)
            {
                float pulse=frame.reducedMotion?1f:.72f+.28f*Mathf.Sin((elapsed-item.warnAt)*9f);
                properties.Clear();properties.SetColor("_BaseColor",new Color(.73f,.39f,.17f,pulse*.85f));
                item.warningRenderer.SetPropertyBlock(properties);
            }
            float age=elapsed-item.impactAt;
            bool dustVisible=!frame.reducedMotion&&landed&&age>=0&&age<.7f;
            item.dust.SetActive(dustVisible);
            if(dustVisible)
            {
                float life=age/.7f;item.dust.transform.localScale=Vector3.one*(.4f+life*1.8f);
                item.dust.transform.localPosition=new Vector3(0,.05f+life*.22f,0);
                properties.Clear();properties.SetColor("_BaseColor",new Color(.33f,.36f,.34f,(1-life)*.30f));
                foreach(Renderer puff in item.dustRenderers)puff.SetPropertyBlock(properties);
            }
        }
        hasFrame=true;
    }

    public void ResetPresentation()
    {
        HasCourse=hasFrame=false;
        if(courseRoot!=null){courseRoot.gameObject.SetActive(false);Destroy(courseRoot.gameObject);courseRoot=null;}
        for(int i=0;i<sections.Length;i++)sections[i]=null;
        terminal=null;obstacles.Clear();debris.Clear();checkpoints.Clear();
        CurrentDistance=CurrentSectionStart=FinishWorldZ=TerminalStart=0;
    }

    private GameObject Clone(GameObject template,string label)
    {
        GameObject clone=Instantiate(template,courseRoot,false);clone.name=label;clone.SetActive(true);return clone;
    }
    private static bool Visible(float relative){return relative>=-BackMetres&&relative<=AheadMetres;}
    private static bool Finite(float value){return !float.IsNaN(value)&&!float.IsInfinity(value);}
    private static bool ValidPosition(float z,float lane){return Finite(z)&&Finite(lane)&&lane>=0&&lane<=2;}
}
