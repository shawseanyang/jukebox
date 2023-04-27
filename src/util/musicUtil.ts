import { Artist } from "../types/Music";

export function formatArtistsNames(artists: Artist[]) {
  return artists.map((artist) => artist.name).join(", ");
}