import { useState } from "react";
import JoinGroupModal from "../components/JoinGroupModal";
import { Col, Row } from "antd";
import SongAdder from "../components/SongAdder";
import AlbumCover from "../components/AlbumCover";
import PlaybackController from "../components/PlaybackController";
import QueueViewer from "../components/QueueViewer";
import { Queue, Song } from "../types/Music";

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