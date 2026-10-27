using UnityEngine;

/// <summary>Reuses a small light pool along the tiled tunnel. No race simulation.</summary>
public sealed class RaceLighting : MonoBehaviour
{
    public RaceWorld world;
    public Light[] tiledLights;
    public Light exitLight;
    private Vector3[] authored;

    private void Start()
    {
        authored=new Vector3[tiledLights.Length];
        for(int i=0;i<authored.Length;i++) authored[i]=tiledLights[i].transform.position;
    }
    private void LateUpdate()
    {
        if(world==null||authored==null)return;
        float origin=world.TerminalStart-Mathf.Floor(world.TerminalStart/50f)*50f;
        for(int i=0;i<tiledLights.Length;i++)
        {
            Vector3 p=authored[i];
            float section=origin+50f*Mathf.Round((world.CurrentDistance-p.z-origin)/50f);
            section=Mathf.Min(section,world.TerminalStart);
            tiledLights[i].transform.position=p+Vector3.forward*section;
        }
        if(exitLight!=null)exitLight.transform.position=new Vector3(.4f,4.3f,world.TerminalStart+53f);
    }
}
