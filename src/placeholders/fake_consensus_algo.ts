// Fake functions to represent the consensus algorithm

import { Milliseconds, Song } from "../types/Music";

const success = true;

// The wait function takes a function and arguments, and calls the function with the arguments after a 0.5 second delay to simulate network latency
function wait(func: (...args: any[]) => void, ...args: any[]) {
  setTimeout(() => {
    func(...args);
  }, 1000);
}

module Consensus {
  // Tries to delete the song at the given index from the queue. If successful, calls the callback with the index of the deleted song.
  export function deleteSong(index: number, callback: (index: number) => void) {
    if (success) {
      wait(callback, index);
    }
  }
  // Tries to add the given song. If successful, calls the callback with the added song.
  export function addSong(song: Song, callback: (song: Song) => void) {
    if (success) {
      wait(callback, song);
    }
  }
  // Tries to skip the current song. If successful, calls the callback.
  export function skipSong(callback: () => void) {
    if (success) {
      wait(callback);
    }
  }
  // Tries to play the given song. If successful, calls the callback with the song.
  export function playSong(song: Song, callback: (song: Song) => void) {
    if (success) {
      wait(callback, song);
    }
  }
  // Tries to scrub to the given location. If successful, calls the callback with the new location.
  export function scrubTo(location: Milliseconds, callback: (location: Milliseconds) => void) {
    if (success) {
      wait(callback, location);
    }
  }
  // Tries to toggle the playback. If successful, calls the callback.
  export function togglePlayback(callback: () => void) {
    if (success) {
      wait(callback);
    }
  }
}

export default Consensus;