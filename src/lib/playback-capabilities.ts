/** Ask the actual browser decoder rather than assuming every browser is H.264-only. */
export function browserPlaybackParameters(canPlay: (mime: string) => string): URLSearchParams {
  const video = [
    ['h264', 'video/mp4; codecs="avc1.640028"'],
    ['hevc', 'video/mp4; codecs="hvc1.1.6.L93.B0"'],
    ['vp8', 'video/webm; codecs="vp8"'],
    ['vp9', 'video/webm; codecs="vp9"'],
    ['av1', 'video/mp4; codecs="av01.0.05M.08"'],
  ].filter(([, mime]) => canPlay(mime)).map(([codec]) => codec);
  const audio = [
    ['aac', 'audio/mp4; codecs="mp4a.40.2"'], ['mp3', 'audio/mpeg'],
    ['opus', 'audio/webm; codecs="opus"'], ['vorbis', 'audio/webm; codecs="vorbis"'], ['flac', 'audio/flac'],
  ].filter(([, mime]) => canPlay(mime)).map(([codec]) => codec);
  return new URLSearchParams({ receiver: 'browser', videoCodecs: video.join(','), audioCodecs: audio.join(',') });
}
