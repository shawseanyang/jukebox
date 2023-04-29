import { Button, Divider, Empty, List, Skeleton } from "antd";
import CenteredTitle from "./CenteredTitle";
import DebouncingInput from "./DebouncingInput";
import { useState } from "react";
import { Song } from "../types/Music";
import SongListItem from "./SongListItem";
import { SearchOutlined } from "@ant-design/icons";
import SpotifyUtil from "../util/spotifyUtil";
import { addSong } from "../types/Playback";
import LoadableButton from "./LoadableButton";

export type SongAdderProps = {
  addSong: addSong;
  token: string;
};

const AddButton = (props: {song: Song, addSong: addSong}) => {
  return (
    <LoadableButton
      args={[props.song]}
      callback={props.addSong}
      buttonProps={{type: "link"}}
    >
      Add
    </LoadableButton>
  )
}

const SongAdder = (props: SongAdderProps) => {

  const [results, setResults] = useState<Song[]>([]);

  const [currentSearch, setCurrentSearch] = useState<string>("");

  const [isLoading, setIsLoading] = useState<boolean>(false);

  const [hasBeenTouched, setHasBeenTouched] = useState<boolean>(false);

  function onInputChange(query: string) {
    if (!hasBeenTouched) {
      setHasBeenTouched(true);
    }
    setIsLoading(true);
    setCurrentSearch(query); 
  }

  function onDebouncedInputChange(query: string) {
    setIsLoading(false);
    SpotifyUtil.searchForSongs(query, props.token, setResults);
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
              <AddButton song={song} addSong={props.addSong} />
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