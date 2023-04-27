import { useState } from "react";
import JoinGroupModal from "../components/JoinGroupModal";
import { Col, Row } from "antd";
import SongAdder from "../components/SongAdder";
import AlbumCover from "../components/AlbumCover";
import PlaybackController from "../components/PlaybackController";
import QueueViewer from "../components/QueueViewer";

const Playback = () => {
  const [group, setGroup] = useState<string | null>(null);

  function hasJoinedGroup() {
    return group !== null;
  }

  return (
    <>
      <JoinGroupModal
        isOpen={!hasJoinedGroup()}
        joinGroup={setGroup}
      />
      <Row>
        <Col span={12}>
          <AlbumCover />
        </Col>
        <Col span={12}>
          <PlaybackController />
        </Col>
      </Row>
      <Row>
        <Col span={12}>
          <QueueViewer />
        </Col>
        <Col span={12}>
          <SongAdder />
        </Col>
      </Row>
    </>
  );
};

export default Playback;