import Title from "antd/es/typography/Title";
import Text from "antd/es/typography/Text";
import { Milliseconds, Song } from "../types/Music";
import { durationLeft, formatArtistsNames, msToString } from "../util/musicUtil";
import { Scrubber } from "react-scrubber";
import styled from 'styled-components'
import 'react-scrubber/lib/scrubber.css'
import { Button, Row, Space } from "antd";
import { PauseOutlined, CaretRightOutlined, DoubleRightOutlined } from "@ant-design/icons";

export type PlaybackControllerProps = {
  song: Song | null;
  isPlaying: boolean;
  songProgress: Milliseconds;
  playSong: (song: Song) => void;
  togglePlayback: () => void;
  skipSong: () => void;
  scrubTo: (milliseconds: Milliseconds) => void;
};

const PlaybackController = (props: PlaybackControllerProps) => {

  function hasSong() {
    return props.song !== null;
  }

  const SongInfo =
    <>
      <Title>{hasSong() ? props.song!.name : "No song playing"}</Title>
      <Text>{hasSong() ? formatArtistsNames(props.song!.artists) : "No artist"}</Text>
    </>

  // Only scrub if there is a song to scrub
  function scrubTo (location: Milliseconds) {
    if (hasSong()) {
      props.scrubTo(location)
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
    <Button shape="round" onClick={props.togglePlayback}>
      {props.isPlaying ? <PauseOutlined /> : <CaretRightOutlined />}
    </Button>

  const SkipButton =
    <Button shape="round" onClick={props.skipSong}>
      <DoubleRightOutlined />
    </Button>

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
      </Space>
    </Space>
  )
}

export default PlaybackController;