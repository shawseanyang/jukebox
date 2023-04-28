import { useEffect, useState } from "react";
import { spotify_redirect_uri, spotify_client_id, spotify_client_secret } from "..";
import { Buffer } from 'buffer';
import WebPlayer from "../components/WebPlayer";

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

const Playback = () => {
  const [token, setToken] = useState("");

  useEffect(() => {

    var code = new URLSearchParams(window.location.href).get('http://localhost:3000/playback?code');

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

  return (
    <>
      <WebPlayer token={token} />
    </>
  );
};

export default Playback;