import { Modal, Input, Steps, Space } from "antd";
import { UsergroupAddOutlined } from '@ant-design/icons';
import { useState } from "react";

const GroupInput = Input.Search

interface JoinGroupModalProps {
  isOpen: boolean;
  joinGroup: (group: string) => void;
  progressSteps: {title: string}[];
}

const JoinGroupModal = (props: JoinGroupModalProps) => {
  const [isLoading, setIsLoading] = useState(false);
  const [isInputValid, setIsInputValid] = useState(true);

  // Returns true if the group name is valid, false otherwise.
  function isValidGroupName(group: string) {
    return group !== "";
  }

  // Validate the group name and ask the server to join/create the group if it is valid. Calls args.joinGroup() if successful.
  function joinGroup(group: string) {
    if (isValidGroupName(group)) {
      setIsInputValid(true);
      setIsLoading(true);
      // dummy timeout
      // TODO: instead of a timeout, we should query the backend to join the group
      setTimeout(() => {
        // after successfully joining or creating a group with the server, do the following:
        setIsLoading(false);
        props.joinGroup(group);
      }, 1000);
    } else {
      setIsInputValid(false);
    }
  }

  return (
    <Modal
        title="Join or create a listening group"
        open={props.isOpen}
        closable={false}
        footer={null}
      >
        <p>Enter the name of an existing group to join it. Enter the name of a new group to create it.</p>
        <Space direction="vertical" size="large" style={{width: "100%"}}>
          <GroupInput
            prefix={<UsergroupAddOutlined />}
            placeholder="wheres_waldo"
            enterButton="Join/Create"
            size="large"
            loading={isLoading}
            onSearch={joinGroup}
            status={isInputValid ? "" : "error"}
          />
          <Steps
            size="small"
            current={1}
            items={props.progressSteps}
          />
        </Space>
      </Modal>
  )
}
export default JoinGroupModal;