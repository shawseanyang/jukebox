import Title from "antd/es/typography/Title";
import Text from "antd/es/typography/Text";
import { Milliseconds, Song } from "../types/Music";
import { durationLeft, formatArtistsNames, msToString } from "../util/musicUtil";
import { Scrubber } from "react-scrubber";
import styled from 'styled-components'
import 'react-scrubber/lib/scrubber.css'
import { Button, Card, Col, Row, Space, Spin } from "antd";
import { PauseOutlined, CaretRightOutlined, DoubleRightOutlined } from "@ant-design/icons";
import LoadableButton from "./LoadableButton";
import { useState } from "react";
import { playSong, scrubTo, skipSong, togglePlayback } from "../types/Playback";
import Ellipsis from "./Ellipsis";

export type PlaybackControllerProps = {
  song: Song | null;
  hasNextSong: boolean;
  isPlaying: boolean;
  songProgress: Milliseconds;
  playSong: playSong;
  togglePlayback: togglePlayback;
  skipSong: skipSong;
  scrubTo: scrubTo;
};

const PlaybackController = (props: PlaybackControllerProps) => {

  const [isLoading, setIsLoading] = useState<boolean>(false);

  function hasSong() {
    return props.song !== null;
  }

  const SongInfo =
    <>
      <Ellipsis.Title text={hasSong() ? props.song!.name : "No song playing"}/>
      <Ellipsis.Text text={hasSong() ? formatArtistsNames(props.song!.artists) : "No artist"} />
    </>

  // Only scrub if there is a song to scrub
  function scrubTo (location: Milliseconds) {
    if (hasSong()) {
      setIsLoading(true);
      props.scrubTo(location, () => setIsLoading(false));
    }
  }
  
  const SongScrubber =
    <div className="scrubber-container" style={{height: "20px"}}>
      <Scrubber
          min={0}
          max={hasSong() ? props.song!.duration : 100}
          value={props.songProgress}
          onScrubStart={scrubTo}
          onScrubEnd={scrubTo}
          onScrubChange={scrubTo}
        />
    </div>

  const SpaceBetween = styled.div`
    display: flex;
    justify-content: space-between;
  `

  const ScrubberMarkers =
    <SpaceBetween>
        <Text>{msToString(hasSong() ? props.songProgress : 0)}</Text>
        <Text type="secondary">{msToString(hasSong() ? durationLeft(props.songProgress, props.song!.duration) : 0)}</Text>
    </SpaceBetween>

  const PausePlayButton =
  <LoadableButton buttonProps={{shape: "round"}} callback={props.togglePlayback} args={[]}>
      {props.isPlaying ? <PauseOutlined /> : <CaretRightOutlined />}
    </LoadableButton>

  const SkipButton =
    <LoadableButton buttonProps={{shape: "round", disabled: !props.hasNextSong}} callback={props.skipSong} args={[]}>
      <DoubleRightOutlined />
    </LoadableButton>

  return (
    <Space size={"small"} direction="vertical" style={{width:"100%"}}>
      <div>
        {SongInfo}
        {SongScrubber}
        {ScrubberMarkers}
      </div>
      <Space size={"small"}>
        {PausePlayButton}
        {SkipButton}
        {isLoading ? <Spin /> : null}
      </Space>
    </Space>
  )
}

export default PlaybackController;