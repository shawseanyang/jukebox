import { Button, Row, Divider } from 'antd';
import { ReactComponent as Jukebox } from '../assets/jukebox.svg';
import { spotify_client_id, spotify_redirect_uri } from '../index';
import { generateRandomString } from '../util/spotifyUtil';

const Landing = () => {

  function LogInWithSpotify() {
    var scope = "streaming user-read-email user-read-private"
    var state = generateRandomString(16);

    var auth_query_parameters = new URLSearchParams({
      response_type: "code",
      client_id: spotify_client_id,
      scope: scope,
      redirect_uri: spotify_redirect_uri,
      state: state
    })

    window.location.replace('https://accounts.spotify.com/authorize/?' + auth_query_parameters.toString());
  }

  return <>
    <Jukebox />
    <Divider />
    <Row justify="center">
        <Button type="default" size="large" onClick={LogInWithSpotify}>Log in with Spotify</Button>
    </Row>
  </>;
};

export default Landing;