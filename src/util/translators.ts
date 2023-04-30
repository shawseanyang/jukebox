// Contains translators between types

export function toSong(track: Spotify.Track) {
  return {
    uri: track.uri,
    name: track.name,
    artists: track.artists.map((artist) => ({ name: artist.name })),
    album: {
      name: track.album.name,
      imageUrl: track.album.images[0].url,
    },
    duration: track.duration_ms,
  };
}