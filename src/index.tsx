import React from 'react';
import ReactDOM from 'react-dom/client';
import './index.css';
import App from './App';
import reportWebVitals from './reportWebVitals';

const root = ReactDOM.createRoot(
  document.getElementById('root') as HTMLElement
);
root.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);

// If you want to start measuring performance in your app, pass a function
// to log results (for example: reportWebVitals(console.log))
// or send to an analytics endpoint. Learn more: https://bit.ly/CRA-vitals
reportWebVitals();

// const dotenv = require('dotenv');

// dotenv.config()

// TODO: move to dotenv and have two env files, one for dev one for prod.

export var spotify_client_id = process.env.SPOTIFY_CLIENT_ID || '80ee5f3ad1cc458b941f82d730eed3e8' // ''
export var spotify_client_secret = process.env.SPOTIFY_CLIENT_SECRET || 'f720b5485ccf400bb6c50c733dd8b420' // ''

export var spotify_redirect_uri = 'http://localhost:3000/playback' // 'http://localhost:3000/auth/callback'