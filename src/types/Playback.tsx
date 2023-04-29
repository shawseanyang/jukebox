// Types for the Playback page

import { Milliseconds, Song } from "./Music";

export type addSong = (song: Song, callback?: (song: Song) => void) => void;

export type deleteSong = (index: number, callback?: (index: number) => void) => void;

export type skipSong = (callback?: () => void) => void;

export type playSong = (song: Song, callback?: (song: Song) => void) => void;

export type scrubTo = (location: Milliseconds, callback?: (location: Milliseconds) => void) => void;

export type togglePlayback = (callback?: () => void) => void;