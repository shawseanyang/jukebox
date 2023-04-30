// This file contains types that are used to represent musical data across the application for objects like songs, albums, and artists.

// The duration of a song in milliseconds.
export type Milliseconds = number;

export interface Song {
  uri: string;
  name: string;
  artists: Artist[];
  album: Album;
  duration: Milliseconds;
}

export interface Album {
  name: string;
  imageUrl: string;
}

export interface Artist {
  name: string;
}

export type Queue = Song[];