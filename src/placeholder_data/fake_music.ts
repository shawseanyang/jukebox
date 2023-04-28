// This file contains fake data corresponding to the types in `types/music.ts` for testing purposes.

export const FAKE_SONG = {
  name: "Fake Song",
  artists: [{ name: "Artist 1" }, { name: "Artist 2" }],
  album: { name: "Fake Album", imageUrl: "https://content-images.p-cdn.com/images/b8/64/67/6b/82be444a8cfadb653356d6a0/_1080W_1080H.jpg" },
  // 3 minutes, 35 seconds
  duration: 215000,
};

export const FAKE_QUEUE = [FAKE_SONG, FAKE_SONG, FAKE_SONG];