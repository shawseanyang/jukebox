import { useState, useEffect } from 'react';
import { Song } from '../types/Music';
import { toSong } from '../util/translators';

export type WebPlayerProps = {
    token: string;
    isPaused: boolean;
    currentSong: Song | null;
    player: Spotify.Player | null;
    isActive: boolean;
    setPaused: (paused: boolean) => void;
    setCurrentSong: (song: Song) => void;
    setPlayer: (player: Spotify.Player) => void;
    setActive: (active: boolean) => void;
}

function WebPlayer(props: WebPlayerProps) {
    const [isReady, setReady] = useState(false);
    const [trigger, setTrigger] = useState(false);
    const [isTriggering, setIsTriggering] = useState(true);

    function setUp() {
        const script = document.createElement("script");
        script.src = "https://sdk.scdn.co/spotify-player.js";
        script.async = true;

        document.body.appendChild(script);

        window.onSpotifyWebPlaybackSDKReady = () => {

            const player = new window.Spotify.Player({
                name: 'Web Playback SDK',
                getOAuthToken: cb => { cb(props.token); },
                volume: 0.5
            });

            props.setPlayer(player);

            player.addListener('ready', ({ device_id }) => {
                setReady(true);
                console.log('Ready with Device ID', device_id);
            });

            player.addListener('not_ready', ({ device_id }) => {
                console.log('Device ID has gone offline', device_id);
            });

            player.addListener('player_state_changed', ( state => {

                if (!state) {
                    return;
                }

                props.setCurrentSong(toSong(state.track_window.current_track));
                props.setPaused(state.paused);

                player.getCurrentState().then( state => { 
                    (!state)? props.setActive(false) : props.setActive(true) 
                });

            }));

            player.connect();
        };
    }

    useEffect(() => {
        if (isTriggering) {
            const interval = setInterval(() => {
            setTrigger(!trigger);
            }, 1000);
            return () => clearInterval(interval);
        }
      }, [trigger]);

    useEffect(() => {
        if (!isReady) {
            setUp();
        } else {
            setIsTriggering(false)
        }
    }, [props.token, trigger]);

    return <></>;
}

export default WebPlayer
