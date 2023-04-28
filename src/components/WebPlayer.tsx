import React, { useState, useEffect } from 'react';

const track = {
    name: "",
    album: {
        images: [
            { url: "" }
        ]
    },
    artists: [
        { name: "" }
    ]
}

export type WebPlayerProps = {
    token: string;
}

function WebPlayer(props: WebPlayerProps) {

    const [isPaused, setPaused] = useState(false);
    const [isReady, setReady] = useState(false);
    const [isActive, setActive] = useState(false);
    const [player, setPlayer] = useState<Spotify.Player | undefined>(undefined);
    const [currentTrack, setTrack] = useState(track);
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

            setPlayer(player);

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

                setTrack(state.track_window.current_track);
                setPaused(state.paused);

                player.getCurrentState().then( state => { 
                    (!state)? setActive(false) : setActive(true) 
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

    if (!isActive) { 
        return (
            <>
                <div className="container">
                    <div className="main-wrapper">
                        <b> Instance not active. Transfer your playback using your Spotify app </b>
                    </div>
                </div>
            </>)
    } else {
        return (
            <>
                <div className="container">
                    <div className="main-wrapper">

                        <img src={currentTrack.album.images[0].url} className="now-playing__cover" alt="" />

                        <div className="now-playing__side">
                            <div className="now-playing__name">{currentTrack.name}</div>
                            <div className="now-playing__artist">{currentTrack.artists[0].name}</div>

                            <button className="btn-spotify" onClick={() => { player?.previousTrack() }} >
                                &lt;&lt;
                            </button>

                            <button className="btn-spotify" onClick={() => { player?.togglePlay() }} >
                                { isPaused ? "PLAY" : "PAUSE" }
                            </button>

                            <button className="btn-spotify" onClick={() => { player?.nextTrack() }} >
                                &gt;&gt;
                            </button>
                        </div>
                    </div>
                </div>
            </>
        );
    }
}

export default WebPlayer
