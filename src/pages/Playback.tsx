import { useEffect, useRef, useState } from "react";
import JoinGroupModal from "../components/JoinGroupModal";
import { Col, Row, Space, message } from "antd";
import SongAdder from "../components/SongAdder";
import AlbumCover from "../components/AlbumCover";
import PlaybackController from "../components/PlaybackController";
import QueueViewer from "../components/QueueViewer";
import { Milliseconds, Queue, Song } from "../types/Music";
import WebPlayer from "../components/WebPlayer";
import { spotify_client_id, spotify_client_secret, spotify_redirect_uri } from "..";
import { Buffer } from "buffer";
import SpotifyUtil from "../util/spotifyUtil";
import Consensus from "../consensus_manager/Consensus";
import { addSong, deleteSong, playSong, scrubTo, skipSong, togglePlayback } from "../types/Playback";
import ConnectToServiceModal from "../components/ConnectToServiceModal";
import { initiateMessage, TOGGLE, PLAY, ADD, SCRUB, REMOVE, SKIP, JOINING} from "../establishingConnections";

enum ModalStates {
  // The user has not connected to a service yet, for example, Spotify
  CONNECT_TO_SERVICE,
  // The user has connected to a service, but has not joined a group yet
  JOIN_GROUP,
  // The user has joined a group
  IN_GROUP
}

// The steps to show in the progress bar of the modals
export const PROGRESS_STEPS = [
  {
    title: 'Transfer Playback',
  },
  {
    title: 'Join Group',
  },
]

const SKIP_SONG_INTERVAL = 1000;

const Playback = () => {
  const [group, setGroup] = useState<string | null>(null);
  const [queue, setQueue] = useState<Queue>([]);
  const [currentSong, setCurrentSong] = useState<Song | null>(null);
  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const [songProgress, setSongProgress] = useState<Milliseconds>(0);
  const [token, setToken] = useState("");
  const [player, setPlayer] = useState<Spotify.Player | null>(null);
  const [isPlayerActive, setPlayerActive] = useState(false);
  const [songProgressUpdateTrigger, setSongProgressUpdateTrigger] = useState(false);
  const [modalState, setModalState] = useState<ModalStates>(ModalStates.CONNECT_TO_SERVICE);
  const [messageApi, contextHolder] = message.useMessage();

  // Adds event listener for storage updates
  useEffect(() => {
    window.addEventListener("updateDataStructures", ( update as EventListener), true);
    return () => {
      window.removeEventListener("updateDataStructures", (update as EventListener), true);
    };
  }, [player, queue, isPlaying, songProgress, currentSong])

  // Add event listener for sending state
  useEffect(() => {
    window.addEventListener("sendState", ( sendState as EventListener), true);
    return () => {
      window.removeEventListener("sendState", (sendState as EventListener), true);
    };
    
  }, [queue, isPlaying, songProgress, currentSong])

  // Add event listener for matching state
  useEffect(() => {
    window.addEventListener("matchState", ( matchState as EventListener), true);
    return () => {
      window.removeEventListener("matchState", (matchState as EventListener), true);
    };
    
  }, [queue, isPlaying, songProgress, currentSong])

  // Updates the song progress every 500ms
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

  // Plays next song in queue when the current song ends
  useEffect(() => {
    if (queue.length > 0 && currentSong && currentSong.duration - songProgress < SKIP_SONG_INTERVAL) {
      setCurrentSong(queue[0]);
      SpotifyUtil.playSong(queue[0].uri, token);
      setQueue(queue => queue.slice(1));
      setSongProgress(0);
    }
  }, [songProgress]);

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

  // When the player is active (ie. connected to Spotify), show them a success notification and advance to the next modal state
  useEffect(() => {
    if (isPlayerActive) {
      messageApi.success("Successfully connected to music service!")
      setModalState(ModalStates.JOIN_GROUP);
    }
  }, [isPlayerActive]);

  // When the user has joined a group, show them a success notification and advance to the next modal state
  useEffect(() => {
    if (group !== null) {
      messageApi.success(`Successfully joined group '${group}'!`)
      setModalState(ModalStates.IN_GROUP);
    }
  }, [group]);

  function getAlbumCover(song: Song | null) {
    return song !== null ? song.album.imageUrl : null;
  }

  function update(event : CustomEvent) {
    const message = event.detail;

    switch (message.message_type) {
      case TOGGLE:
        console.log("We're toggling music play.");
        console.log("Queue:", queue);
        console.log("Current song:", currentSong);
        setIsPlaying(!isPlaying);
        console.log("Player:", player);
        player?.togglePlay();
        break;
      case PLAY:
        break;
      case ADD:
        console.log("adding song:", [...queue, message.song]);
        setQueue(queue => [...queue, message.song]);
        break;
      case REMOVE:
        setQueue(queue => queue.filter((_, i) => i !== message.index));
        break;
      case SCRUB:
        setSongProgress(message.timestamp);
        player?.seek(message.timestamp);
        break;
      case SKIP:
        console.log("skip!! queue:", queue);
        if (queue.length > 0) {
          // tryPlaySong(queue[0]);
          setCurrentSong(queue[0]);
          SpotifyUtil.playSong(queue[0].uri, token);
          setQueue(queue.slice(1));
        }
        break;
      default:
        console.log("Unrecognized case in updateDataStructures event listener")
    }
  }

  function sendState(event: CustomEvent) {
    const stateMessage = {
      message_type: JOINING,
      round_type: JOINING,
      timestamp: songProgress,
      song: currentSong,
      joiningMember: event.detail,
      queue: queue,
      isPlaying: isPlaying,
      player: player
    };

    console.log("Sending the following state:", JSON.stringify(stateMessage));

    initiateMessage(stateMessage);
  }

  function matchState(event: CustomEvent) {
    console.log("match state event!!", JSON.stringify(event.detail));
    console.log("match state event player before:", JSON.stringify(player));
    setCurrentSong(event.detail.song);
    SpotifyUtil.playSong(event.detail.song.uri, token, event.detail.timestamp);

    player?.seek(event.detail.timestamp);
    if (isPlaying !== event.detail.isPlaying) {
      player?.togglePlay();
    }

    // player?.seek(event.detail.timestamp);
    // if (!event.detail.isPlaying) {
    //   player?.pause();
    // } else {

    // }

    setQueue(event.detail.queue);
    setIsPlaying(event.detail.isPlaying);
    setSongProgress(event.detail.timestamp);
    setPlayer(player);
    // if (!event.detail.isPlaying) {
    //   player?.togglePlay();
    // }

    console.log("match state event player after:", JSON.stringify(player));
  }

  
  // Attempts to reach consensus on adding a song to the queue. If successful, adds song to queue and calls the callback.
  const tryAddSong: addSong = (song, callback) => {
    Consensus.addSong(song, (song: Song) => {
      // If consensus is reached, add song to queue
      // Add song to the end of the queue
      const addSongRequest = {
        message_type: ADD,
        round_type: 12,
        song: song,
      };
      initiateMessage(addSongRequest);
      // setQueue(queue => [...queue, song]);
      if (callback) {
        callback(song);
      }
    });
  }

  // Attempts to reach consensus on deleting a song from the queue. If successful, deletes song from queue and calls the callback.
  const tryDeleteSong: deleteSong = (index, callback) => {
    Consensus.deleteSong(index, (index: number) => {
      // If consensus is reached, delete song from queue
      const deleteSongRequest = {
        message_type: REMOVE,
        round_type: 12,
        index: index,
      };
      initiateMessage(deleteSongRequest);
      // setQueue(queue => queue.filter((_, i) => i !== index));
      if (callback) {
        callback(index);
      }
    });
  }

  // Attempts to reach consensus on skipping the current song. If successful, skips the current song and calls the callback.
  const trySkipSong: skipSong = (callback) => {
    Consensus.skipSong(() => {
      // If consensus is reached, skip song
      const skipSongRequest = {
        message_type: SKIP,
        round_type: 12,
      };
      initiateMessage(skipSongRequest);
      if (queue.length > 0) {
        // tryPlaySong(queue[0]);
        // setQueue(queue.slice(1));
        if (callback) {
          callback();
        }
      }
    });
  }

  // Attempts to reach consensus on playing a song. If successful, plays the song and calls the callback.
  const tryPlaySong: playSong = (song, callback) => {
    Consensus.playSong(song, (song: Song) => {
      // If consensus is reached, play song
      const playSongRequest = {
        message_type: PLAY,
        round_type: 12,
      };
      initiateMessage(playSongRequest);
      // setCurrentSong(song);
      // SpotifyUtil.playSong(song.uri, token);
      if (callback) {
        callback(song);
      }
    });
  }

  // Attempts to reach consensus on scrubbing to a location in the song. Immediately scrubs to preserve UI fluidity. If successful, calls the callback.
  const tryScrubTo: scrubTo = (location, callback) => {
    setSongProgress(location);
    player?.seek(location);
    Consensus.scrubTo(location, (location: Milliseconds) => {
      // If consensus is reached, scrub to location
      const scrubRequest = {
        message_type: SCRUB,
        round_type: 12,
        timestamp: location,
      };
      initiateMessage(scrubRequest);
      if (callback) {
        callback(location);
      }
    });
  }

  // Attempts to reach consensus on toggling playback. If successful, toggles playback and calls the callback.
  const tryTogglePlayback: togglePlayback = (callback) => {
    Consensus.togglePlayback(() => {
      // If consensus is reached, toggle playback
      const togglePlaybackRequest = {
        message_type: TOGGLE,
        round_type: 12,
      };
      initiateMessage(togglePlaybackRequest);
      // setIsPlaying(!isPlaying);
      // player?.togglePlay();
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
      <ConnectToServiceModal
        isOpen={modalState === ModalStates.CONNECT_TO_SERVICE}
        progressSteps={PROGRESS_STEPS}
      />
      <JoinGroupModal
        isOpen={modalState === ModalStates.JOIN_GROUP}
        joinGroup={setGroup}
        progressSteps={PROGRESS_STEPS}
      />
      <Space direction="vertical" size="large" style={{width: "100%"}}>
        <Row>
          <Col span={10}>
            <AlbumCover imageUrl={getAlbumCover(currentSong)}/>
          </Col>
          <Col span={4} />
          <Col span={10} style={{alignSelf: "end"}}>
            <PlaybackController
              song={currentSong}
              hasNextSong={queue.length > 0}
              isPlaying={isPlaying}
              songProgress={songProgress}
              playSong={tryPlaySong}
              togglePlayback={tryTogglePlayback}
              skipSong={trySkipSong}
              scrubTo={tryScrubTo}
              // skipSongInterval={SKIP_SONG_INTERVAL}
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