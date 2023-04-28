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

// TODO: move to dotenv and have two env files, one for dev one for prod.

export var spotify_client_id = process.env.REACT_APP_SPOTIFY_CLIENT_ID || ''
export var spotify_client_secret = process.env.REACT_APP_SPOTIFY_CLIENT_SECRET || ''
export var spotify_redirect_uri = process.env.REACT_APP_REDIRECT_URI || ''