import { Divider, Empty, List, Skeleton } from "antd";
import CenteredTitle from "./CenteredTitle";
import DebouncingInput from "./DebouncingInput";
import { useState } from "react";
import { Song } from "../types/Music";
import SongListItem from "./SongListItem";
import { FAKE_QUEUE } from "../placeholder_data/fake_music";
import { SearchOutlined } from "@ant-design/icons";

export type SongAdderProps = {
  addSong: (song: Song) => void;
};

const SongAdder = (props: SongAdderProps) => {

  const [results, setResults] = useState<Song[]>([]);

  const [currentSearch, setCurrentSearch] = useState<string>("");

  const [isLoading, setIsLoading] = useState<boolean>(false);

  const [hasBeenTouched, setHasBeenTouched] = useState<boolean>(false);

  // TODO: connect with access token
  function searchForSongs(query: string) {
    fetch(`https://api.spotify.com/v1/search?q=${query}&type=track`, {
      headers: {
        Authorization: `Bearer ${process.env.REACT_APP_SPOTIFY_API_KEY}`,
        },
    })
    .then((response) => response.json())
    .then((data) => {
      const songs = data.tracks.items.map((item: any) => {
        return {
          name: item.name,
          artists: item.artists.map((artist: any) => {
            return { name: artist.name };
          }),
          album: {
            name: item.album.name,
            imageUrl: item.album.images[0].url,
          },
          duration: item.duration_ms,
        };
      });
      setResults(songs);
    });
  }

  function onInputChange(query: string) {
    if (!hasBeenTouched) {
      setHasBeenTouched(true);
    }
    setIsLoading(true);
    setCurrentSearch(query); 
  }

  function onDebouncedInputChange(query: string) {
    setIsLoading(false);
    searchForSongs(query);
  }

  const customLocale = {
    emptyText: "No songs"
  }

  const HasntBeenTouchedYet =
    <Empty
      image={Empty.PRESENTED_IMAGE_SIMPLE}
      description={"Search results will appear here."}
    />
  
  const IsLoading =
    <Skeleton active />

  const ResultsList = 
    <List
      locale={customLocale}
      itemLayout="horizontal"
      dataSource={results}
      renderItem={(song) => (
          <List.Item
            actions={[
              <a key="Enqueue" onClick={() => props.addSong(song)}>Add</a>
            ]}>
            <SongListItem song={song} />
          </List.Item>
      )}
    />

  const Results =
    !hasBeenTouched
    ? HasntBeenTouchedYet
    : isLoading
      ? IsLoading
      : ResultsList
  
  return (
    <>
      <CenteredTitle>Add songs</CenteredTitle>
      <DebouncingInput
        addonBefore={<SearchOutlined />}
        placeholder="Never gonna give you up"
        onChange={onInputChange}
        onDebouncedChange={onDebouncedInputChange}
      />
      <Divider />
      {Results}
    </>
  )
}
export default SongAdder;