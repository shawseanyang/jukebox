import { useState } from "react";
import JoinGroupModal from "../components/JoinGroupModal";
import { Col, Row, Space } from "antd";
import SongAdder from "../components/SongAdder";
import AlbumCover from "../components/AlbumCover";
import PlaybackController from "../components/PlaybackController";
import QueueViewer from "../components/QueueViewer";
import { Milliseconds, Queue, Song } from "../types/Music";
import { FAKE_QUEUE, FAKE_SONG } from "../placeholder_data/fake_music";

const Playback = () => {
  const [group, setGroup] = useState<string | null>(null);
  const [queue, setQueue] = useState<Queue>([]);
  const [currentSong, setCurrentSong] = useState<Song | null>(FAKE_SONG);
  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const [songProgress, setSongProgress] = useState<Milliseconds>(0);

  function hasJoinedGroup() {
    return group !== null;
  }
  
  function deleteSong(index: number) {
    // TODO: implement
  }

  function addSong(song: Song) {
    // TODO: implement
  }

  function skipSong() {
    // TODO: implement
  }

  function playSong(song: Song) {
    setCurrentSong(song);
    // TODO: implement
  }

  function scrubTo(location: Milliseconds) {
    setSongProgress(location)
    // TODO: implement
  }

  function togglePlayback() {
    setIsPlaying(!isPlaying);
    // TODO: implement
  }

  return (
    <>
      <JoinGroupModal
        isOpen={!hasJoinedGroup()}
        joinGroup={setGroup}
      />
      <Space direction="vertical" size="large">
        <Row>
          <Col span={10}>
            <AlbumCover imageUrl={currentSong!.album.imageUrl}/>
          </Col>
          <Col span={4} />
          <Col span={10} style={{alignSelf: "end"}}>
            <PlaybackController
              song={currentSong}
              isPlaying={isPlaying}
              songProgress={songProgress}
              playSong={playSong}
              togglePlayback={togglePlayback}
              skipSong={skipSong}
              scrubTo={scrubTo}
            />
          </Col>
        </Row>
        <Row>
          <Col span={10}>
            <QueueViewer queue={FAKE_QUEUE} deleteSong={deleteSong}/>
          </Col>
          <Col span={4} />
          <Col span={10}>
            <SongAdder addSong={addSong}/>
          </Col>
        </Row>
      </Space>
    </>
  );
};

export default Playback;