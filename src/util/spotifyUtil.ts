// Utility functions for Spotify API calls

import { Song } from "../types/Music";
import { toSong } from "./translators";

const SPOTIFY_WEB_API_HEADERS = (token: string) => ({
  headers: {
    Authorization: `Bearer ${token}`,
    },
});

module SpotifyUtil {
  export function searchForSongs(query: string, token: string, callback: (songs: Song[]) => void) {
    fetch(`https://api.spotify.com/v1/search?q=${query}&type=track`, SPOTIFY_WEB_API_HEADERS(token))
    .then((response) => response.json())
    .then((data) => {
      callback(data.tracks.items.map(toSong));
    });
  }
}

export default SpotifyUtil;