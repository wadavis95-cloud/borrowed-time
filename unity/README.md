# Borrowed Time Unity source

Open this folder in Unity Hub using **6000.6.7f1** with Web build support. The imported model, source materials, scene dependencies, settings, C# scripts and WebGL bridge are included. Unity recreates Library/ on first import.

- Game scene: `Assets/Study/Scenes/Race.unity`
- Reference study: `Assets/Study/Scenes/VisualPass.unity`
- Game menu: **Borrowed Time → Game → Assemble Unity Race Scene**, then **Export Unity Race for Web**.
- Copy the four exported `Builds/Race/Build/Race.*` runtime files to `../assets/unity/v5/`, preserving their gzip extensions.
- Run the game through the repository Node server. The standalone Unity scene waits for browser JSON and does not run an autonomous race.

See [the beginner integration guide](../docs/UNITY_GUIDE.md) and [credits](../assets/unity/CREDITS.md). The older Blender import/conversion menu commands belong to the historical study and require its external source files; use the two **Game** commands for this repository.

`RACE_VERIFICATION.cs.txt` records the Editor-side integration probe used during development. It is not a runtime component. Its local fixture paths must be changed if replaying it on another computer.
