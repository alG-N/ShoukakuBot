# Some Bug that are need to be listed and will be fixed in the future.

1. Spotify API Problem
[2026-02-26T16:58:51.751Z] ℹ️ [AutoPlay] Queue ended, searching for similar tracks...
[2026-02-26T16:58:51.752Z] ℹ️ [AutoPlay] Finding similar to: "ひゅるりらぱっぱ - HYURURIRAPAPPA" by "tuki."
[2026-02-26T16:58:51.979Z] ℹ️ [Spotify] Token obtained, expires in 3600s
[2026-02-26T16:58:52.548Z] ❌ [Spotify] Genre seeds error: Spotify API error: 404 Not Found — 
[2026-02-26T16:58:52.664Z] ❌ [Spotify] Recommendations error: Spotify API error: 404 Not Found — 
[2026-02-26T16:58:52.665Z] ℹ️ [AutoPlay] Spotify: No recommendations returned
[2026-02-26T16:58:52.670Z] ℹ️ [AutoPlay] Using 6 strategies: artist_similar_songs, songs_like, artist_popular, title_context, lang_context, mood_context
[2026-02-26T16:58:52.681Z] ℹ️ [AutoPlay] Trying: artist_similar_songs (w=95) — "tuki."
[2026-02-26T16:58:52.682Z] ℹ️ [Lavalink] SearchMultiple: Searching "ytsearch:tuki." on node node-1
[2026-02-26T16:58:53.002Z] ℹ️ [Lavalink] SearchMultiple: loadType=search, tracks found
[2026-02-26T16:58:53.006Z] ℹ️ [AutoPlay] Selected: tuki.『HYURURIRAPAPPA』Official Music Video (strategy: artist_similar_songs)

I recalled, I do have an API Secret, hmm. Probably after I decarpitated fetching playlist through playlist, probably forgot to update
2 ways to solve:
- Update the API
Or
- After a spotify link song done playing, well. We immediately switch to youtube search, and we base on multiple artist name.
since i dont have the api the second option is prolly the best

1.1. Probably need to update the autoplay, I recalled adding multiple artist song as a search, what if a the bot kept playing the same song from that artist all over again?

2. Personally there should be an embed message saying The song is paused

3. 2026-02-27T07:57:23.505Z] ❌ [VideoDownloadService] Download error: FILE_TOO_LARGE:137.3MB

[2026-02-27T07:57:23.510Z] ❌ [Video] Message: Unhandled error. ({ message: 'FILE_TOO_LARGE:137.3MB' }), Code: ERR_UNHANDLED_ERROR, Name: Error, URL: https://youtu.be/cV6QBTv0dTI?si=XMgIaC9LAryMjY1F, Quality: 720

[2026-02-27T07:57:37.152Z] ℹ️ [VideoDownloadService] YouTube URL detected, using yt-dlp directly (skipping Cobalt)

[2026-02-27T07:57:38.861Z] ℹ️ [YtDlpService] File size 137.3MB exceeds 100MB limit

[2026-02-27T07:57:38.861Z] ❌ [VideoDownloadService] Download error: FILE_TOO_LARGE:137.3MB

[2026-02-27T07:57:38.861Z] ❌ [Video] Message: Unhandled error. ({ message: 'FILE_TOO_LARGE:137.3MB' }), Code: ERR_UNHANDLED_ERROR, Name: Error, URL: https://youtu.be/cV6QBTv0dTI?si=XMgIaC9LAryMjY1F, Quality: 480

720p and 480p got the same file size??