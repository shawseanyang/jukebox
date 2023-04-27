import { useState } from "react";
import JoinGroupModal from "../components/JoinGroupModal";
import { Col, Row } from "antd";
import SongAdder from "../components/SongAdder";
import AlbumCover from "../components/AlbumCover";
import PlaybackController from "../components/PlaybackController";
import QueueViewer from "../components/QueueViewer";
import { Queue, Song } from "../types/Music";
import { FAKE_QUEUE } from "../placeholder_data/fake_music";

const Playback = () => {
  const [group, setGroup] = useState<string | null>(null);
  const [queue, setQueue] = useState<Queue>([]);

  function hasJoinedGroup() {
    return group !== null;
  }
  
  function deleteSong(index: number) {
    // TODO: implement
  }

  function addSong(song: Song) {
    // TODO: implement
  }

  return (
    <>
      <JoinGroupModal
        isOpen={!hasJoinedGroup()}
        joinGroup={setGroup}
      />
      <Row>
        <Col span={10}>
          <AlbumCover imageUrl={null}/>
        </Col>
        <Col span={4} />
        <Col span={10}>
          <PlaybackController />
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
    </>
  );
};

export default Playback;