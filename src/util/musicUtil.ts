import { Artist, Milliseconds } from "../types/Music";

export function formatArtistsNames(artists: Artist[]) {
  return artists.map((artist) => artist.name).join(", ");
}

// Returns a string in the form of "mm:ss" if the duration is less than an hour. If the duration is more than an hour, the string is in the form of "hh:mm:ss".
export function msToString(ms: Milliseconds) {
  const hours = Math.floor(ms / 3600000);
  const minutes = Math.floor((ms % 3600000) / 60000);
  const seconds = Math.floor(((ms % 3600000) % 60000) / 1000);

  const hoursString = hours > 0 ? `${hours}:` : "";
  const minutesString = minutes > 0 ? `${minutes}:` : "0:";
  const secondsString = seconds < 10 ? `0${seconds}` : `${seconds}`;

  return `${hoursString}${minutesString}${secondsString}`;
}

export function durationLeft(currentTime: Milliseconds, duration: Milliseconds) {
  return duration - currentTime;
}