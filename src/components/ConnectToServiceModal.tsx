import { Modal, Space, Steps, Image } from "antd";
import spotifyDevicesMenu from "../assets/deviceMenu.png";

export interface ConnectToServiceModalProps {
  isOpen: boolean,
  progressSteps: {title: string}[]
}

const ConnectToServiceModal = (props: ConnectToServiceModalProps) => (
  <Modal
    title="Transfer playback from your music service to this application"
    open={props.isOpen}
    closable={false}
    footer={null}
  >
    <p>In Spotify, go to the Devices menu and select "Jukebox". Once transferred, come back here.</p>
    <Space direction="vertical" size="large" style={{width: "100%"}}>
      <Image src={spotifyDevicesMenu} />
      <Steps
        size="small"
        current={0}
        items={props.progressSteps}
      />
    </Space>
  </Modal>
)

export default ConnectToServiceModal;