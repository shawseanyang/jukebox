import { useState } from "react";
import JoinGroupModal from "../components/JoinGroupModal";
import { Col, Row } from "antd";

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
    </>
  );
};

export default Playback;