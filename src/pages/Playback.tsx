import { useState } from "react";
import JoinGroupModal from "../components/JoinGroupModal";
import { Col, Row } from "antd";
import SongAdder from "../components/SongAdder";
import AlbumCover from "../components/AlbumCover";
import PlaybackController from "../components/PlaybackController";
import QueueViewer from "../components/QueueViewer";
import { Queue } from "../types/Music";

const FAKE_SONG = {
  name: "Fake Song",
  artists: [{ name: "Fake Artist 1" }, { name: "Fake Artist 2" }],
  album: { name: "Fake Album", imageUrl: "https://content-images.p-cdn.com/images/b8/64/67/6b/82be444a8cfadb653356d6a0/_1080W_1080H.jpg" },
  duration: 300,
};

const FAKE_QUEUE = [FAKE_SONG, FAKE_SONG, FAKE_SONG];

const Playback = () => {
  const [group, setGroup] = useState<string | null>(null);
  const [queue, setQueue] = useState<Queue>([]);

  function hasJoinedGroup() {
    return group !== null;
  }
  
  function deleteSong(index: number) {
    // TODO: implement
  }

  return (
    <>
      <JoinGroupModal
        isOpen={!hasJoinedGroup()}
        joinGroup={setGroup}
      />
      <Row>
        <Col span={12}>
          <AlbumCover imageUrl={null}/>
        </Col>
        <Col span={12}>
          <PlaybackController />
        </Col>
      </Row>
      <Row>
        <Col span={12}>
          <QueueViewer queue={FAKE_QUEUE} deleteSong={deleteSong}/>
        </Col>
        <Col span={12}>
          <SongAdder />
        </Col>
      </Row>
    </>
  );
};

export default Playback;