// This file contains types that are used to represent musical data across the application for objects like songs, albums, and artists.

export interface Song {
  name: string;
  artists: Artist[];
  album: Album;
  duration: number;
}

export interface Album {
  name: string;
  imageUrl: string;
}

export interface Artist {
  name: string;
}

export type Queue = Song[];