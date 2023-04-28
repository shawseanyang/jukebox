// Types for the Playback page

import { Song } from "./Music";

export type addSong = (song: Song, callback: (song: Song) => void) => void;