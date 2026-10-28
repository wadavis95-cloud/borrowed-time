# V8.9 — Local recorded-music playtest

The six first listening picks replace the generated background motifs. Gameplay, prices, maps, camera and demo strategy are unchanged. Nothing pushed, deployed or submitted.

| Map | Recording | Artist |
| --- | --- | --- |
| Tunnel Escape | Outrunners | OOG37 / Two Litre Falls Music |
| The Last Voyage | Pirate Indenture (authored loop) | Eldritch Grim |
| Volcanic Jungle | Bamboo Blitz | Tsorthan Grove |
| Frozen Summit | Black Diamond | Joth |
| Orbital Escape | Singularity (action version) | vitalezzz |
| Sandstorm Canyon | Desert Loop | iamoneabe |

Each original source page identifies its recording as CC0. Source/download URLs, artists, edited-file hashes and credits are preserved in `assets/music/manifest.json` and `assets/music/CREDITS.txt`. How to play links to the credits. Originals and source-page snapshots are retained locally in the ignored `artifacts/music-source/` folder.

## Playback

Clips are MP3 at 128 kbps, stereo 44.1 kHz, normalized toward −19 LUFS / −2 dB true peak and limited to the first 90 seconds where longer. Shorter recordings remain complete; the ship uses the creator’s loop file. Combined game clips are approximately 6.5 MiB.

Only the active map downloads when its race starts. One decoded track is retained, replacing the previous map’s buffer to bound memory. Audio starts within the user-unlocked Web Audio context and loops; no runtime request goes to OpenGameArt or a third-party music service. The selected track title appears in the speaker button’s tooltip once playback starts.

Music sits beneath local clock/ability sounds, softens during Boost/jumps and low remaining time, and stops on pause, mute, hidden tabs, race end, replay/reset and disposal. Resume starts at the race’s current elapsed position. Generation checks and cancelled requests prevent a late download from playing after a map change/reset/mute. Failed music never blocks gameplay. No footsteps or opponent action sounds were added.

## Verification

- 173 unit tests passed; 11 real-network tests skipped by the default suite.
- 40 real-network tests passed separately.
- Browser confirmed all six selected titles after their real audio buffers loaded and started; tunnel pause/resume and mute/unmute were verified. No browser errors.
- Unit tests cover looping, selective loading, volume reduction, source cleanup, stale requests and optional load failure; local clips match their source manifest hashes.
- Syntax and whitespace checks passed. Local release check includes six MP3s, music module and credits.

## Backup

`backups/pre-recorded-music-20261028.bundle` preserves the complete pre-change history at `289d6a3`. No Git history was rewritten. Restore from that checkpoint to return to the prior generated motifs.
