import { useEffect, useRef, useState } from "react";
import JoinGroupModal from "../components/JoinGroupModal";
import { Col, Row, Space } from "antd";
import SongAdder from "../components/SongAdder";
import AlbumCover from "../components/AlbumCover";
import PlaybackController from "../components/PlaybackController";
import QueueViewer from "../components/QueueViewer";
import { Milliseconds, Queue, Song } from "../types/Music";
import { FAKE_QUEUE, FAKE_SONG } from "../placeholders/fake_music";
import WebPlayer from "../components/WebPlayer";
import { spotify_client_id, spotify_client_secret, spotify_redirect_uri } from "..";
import { Buffer } from "buffer";
import SpotifyUtil from "../util/spotifyUtil";
import Consensus from "../placeholders/fake_consensus_algo";
import { addSong, deleteSong, playSong, scrubTo, skipSong, togglePlayback } from "../types/Playback";

const Playback = () => {
  const [group, setGroup] = useState<string | null>(null);
  const [queue, setQueue] = useState<Queue>([]);
  const [currentSong, setCurrentSong] = useState<Song | null>(FAKE_SONG);
  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const [songProgress, setSongProgress] = useState<Milliseconds>(0);
  const [token, setToken] = useState("");
  const [player, setPlayer] = useState<Spotify.Player | null>(null);
  const [isPlayerActive, setPlayerActive] = useState(false);
  const [songProgressUpdateTrigger, setSongProgressUpdateTrigger] = useState(false);

  useEffect(() => {
    const interval = setInterval(() => {
      setSongProgressUpdateTrigger(!songProgressUpdateTrigger);
      player?.getCurrentState()?.then(state => {
            if (state) {
              setSongProgress(state.position);
            }
          }
        );
    }, 500);
    return () => clearInterval(interval);
  }, [songProgressUpdateTrigger]);

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

  // Attempts to reach consensus on adding a song to the queue. If successful, adds song to queue and calls the callback.
  const tryAddSong: addSong = (song, callback) => {
    // TODO: implement consensus algorithm
    Consensus.addSong(song, (song: Song) => {
      // If consensus is reached, add song to queue
      setQueue([song, ...queue])
      if (callback) {
        callback(song);
      }
    });
  }

  // Attempts to reach consensus on deleting a song from the queue. If successful, deletes song from queue and calls the callback.
  const tryDeleteSong: deleteSong = (index, callback) => {
    // TODO: implement consensus algorithm
    Consensus.deleteSong(index, (index: number) => {
      // If consensus is reached, delete song from queue
      setQueue(queue.filter((_, i) => i !== index));
      if (callback) {
        callback(index);
      }
    });
  }

  // Attempts to reach consensus on skipping the current song. If successful, skips the current song and calls the callback.
  const trySkipSong: skipSong = (callback) => {
    // TODO: implement consensus algorithm
    Consensus.skipSong(() => {
      // If consensus is reached, skip song
      if (queue.length > 0) {
        tryPlaySong(queue[0]);
        setQueue(queue.slice(1));
        if (callback) {
          callback();
        }
      }
    });
  }

  // Attempts to reach consensus on playing a song. If successful, plays the song and calls the callback.
  const tryPlaySong: playSong = (song, callback) => {
    // TODO: implement consensus algorithm
    Consensus.playSong(song, (song: Song) => {
      // If consensus is reached, play song
      setCurrentSong(song);
      SpotifyUtil.playSong(song.uri, token);
      if (callback) {
        callback(song);
      }
    });
  }

  // Attempts to reach consensus on scrubbing to a location in the song. If successful, scrubs to the location and calls the callback.
  const tryScrubTo: scrubTo = (location, callback) => {
    // TODO: implement consensus algorithm
    Consensus.scrubTo(location, (location: Milliseconds) => {
      // If consensus is reached, scrub to location
      setSongProgress(location)
      player?.seek(location);
      if (callback) {
        callback(location);
      }
    });
  }

  // Attempts to reach consensus on toggling playback. If successful, toggles playback and calls the callback.
  const tryTogglePlayback: togglePlayback = (callback) => {
    // TODO: implement consensus algorithm
    Consensus.togglePlayback(() => {
      // If consensus is reached, toggle playback
      setIsPlaying(!isPlaying);
      player?.togglePlay();
      if (callback) {
        callback();
      }
    });
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
      <Space direction="vertical" size="large" style={{width: "100%"}}>
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
              playSong={tryPlaySong}
              togglePlayback={tryTogglePlayback}
              skipSong={trySkipSong}
              scrubTo={tryScrubTo}
            />
          </Col>
        </Row>
        <Row>
          <Col span={10}>
            <QueueViewer queue={queue} deleteSong={tryDeleteSong}/>
          </Col>
          <Col span={4} />
          <Col span={10}>
            <SongAdder addSong={tryAddSong} token={token}/>
          </Col>
        </Row>
      </Space>
    </>
  );
};

export default Playback;