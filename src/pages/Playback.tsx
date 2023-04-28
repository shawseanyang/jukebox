import { useEffect, useRef, useState } from "react";
import JoinGroupModal from "../components/JoinGroupModal";
import { Col, Row, Space } from "antd";
import SongAdder from "../components/SongAdder";
import AlbumCover from "../components/AlbumCover";
import PlaybackController from "../components/PlaybackController";
import QueueViewer from "../components/QueueViewer";
import { Milliseconds, Queue, Song } from "../types/Music";
import { FAKE_QUEUE, FAKE_SONG } from "../placeholder_data/fake_music";
import WebPlayer from "../components/WebPlayer";
import { spotify_client_id, spotify_client_secret, spotify_redirect_uri } from "..";
import { Buffer } from "buffer";

const Playback = () => {
  const [group, setGroup] = useState<string | null>(null);
  const [queue, setQueue] = useState<Queue>([]);
  const [currentSong, setCurrentSong] = useState<Song | null>(FAKE_SONG);
  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const [songProgress, setSongProgress] = useState<Milliseconds>(0);
  const [token, setToken] = useState("");
  const [player, setPlayer] = useState<Spotify.Player | null>(null);
  const [isPlayerActive, setPlayerActive] = useState(false);
  const [trigger, setTrigger] = useState(false);

  useEffect(() => {
    const interval = setInterval(() => {
      setTrigger(!trigger);
      player?.getCurrentState()?.then(state => {
            if (state) {
              setSongProgress(state.position);
            }
          }
        );
    }, 500);
    return () => clearInterval(interval);
  }, [trigger]);

  useEffect(() => {
    var args = window.location.href;
    args = args.substring(args.indexOf('?') + 1);

    var code = new URLSearchParams(args).get('code');

    if (code === null) {
      throw new Error('No code provided');
    }
  
    fetch('https://accounts.spotify.com/api/token', {
      method: "POST",
      headers: {
        'Authorization': 'Basic ' + (Buffer.from(spotify_client_id + ':' + spotify_client_secret).toString('base64')),
        'Content-Type' : 'application/x-www-form-urlencoded'
      }, 
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        code: code,
        redirect_uri: spotify_redirect_uri
      })
    })
    //.then(response => response.ok ? response.json() : Promise.reject(response))
    .then(response => response.json())
    .then(data => {
      if(data.access_token !== undefined) {
        console.log(data.access_token)
        setToken(data.access_token);
      } else {
        console.log("No data")
      }
    });
  }, []);

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
    player?.togglePlay();
    // TODO: implement
  }

  return (
    <>
      <WebPlayer
        token={token}
        isPlaying={isPlaying}
        currentSong={currentSong}
        player={player}
        isActive={isPlayerActive}
        setIsPlaying={setIsPlaying}
        setCurrentSong={setCurrentSong}
        setPlayer={setPlayer}
        setActive={setPlayerActive}
      />
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
            <SongAdder addSong={addSong} token={token}/>
          </Col>
        </Row>
      </Space>
    </>
  );
};

export default Playback;