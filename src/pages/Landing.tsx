import { Button, Row, Divider } from 'antd';
import { ReactComponent as Jukebox } from '../assets/jukebox.svg';

const Landing = () => {
  return <>
    <Jukebox />
    <Divider />
    <Row justify="center">
        <Button type="default" size="large">Log in with Spotify</Button>
    </Row>
  </>;
};

export default Landing;