import firebase from 'firebase/compat/app';
import 'firebase/compat/firestore';
import { off } from 'process';
// import '@firebase/firestore-types'

/*

    Proposed database schema:

    {
        name: {
            offer: RTCSessionDescriptionInit,
        }
    }

    New schema:
    sessions collection/table has:
    {
        members: [user1_ID, user2_ID, ...]
    }

    userOffers collection/table has:
    {
      offers: [offer1, offer2, ...]
    }

*/


// Initialize firebase?

// Global state
var username: string = '';
var sessionId: string = '';

// DEfault configuration - Change these if you have a different STUN or TURN server.
const configuration = {
    iceServers: [
      {
        urls: ["stun:stun1.l.google.com:19302", "stun:stun2.l.google.com:19302"],
      },
    ],
    iceCandidatePoolSize: 10,
};

// Will be used to bind html elements to our functions I assume lol
// function init() {

// }

// dictionary from userID -> (peerConnection, dataChannel)
// var connectionInfo = {};

// dictionary from peerConnection -> (userConnectedToId, dataChannel)
var connectionToUserMap = {};

// Creates a session by adding an entry to the sessions table whose ID will be used
//    to join the session. Also adds an entry to the userOffers table which will be
//    used as a way to send and receive offers
async function createSession() {
  // TODO: probs disable some buttons or some shit idk

  const db = firebase.firestore();

  console.log("Starting session with configuration: ", configuration);

  // TODO: we need to get users username so that we can add it to the dict
  username = "Placeholder";

  const entry = {
    offers: []
  }
  const userRef = await db.collection("userOffers").add(entry);
  userRef.onSnapshot(async (snapshot) => {
    console.log("Got new connection offer");
    if (snapshot.exists) {
      var offerList = snapshot.data().offers;
  
      // iterate over list of offers
      for (let offer of offerList) {
        const peerConnection = new RTCPeerConnection(configuration);
        registerPeerConnectionListeners(peerConnection);
        await peerConnection.setRemoteDescription(offer);
        const answer = await peerConnection.createAnswer();
        await peerConnection.setLocalDescription(answer);

        // TODO: create data channel

        
        // TODO: 
        const peerIdentity:string = await peerConnection.peerIdentity;
        connectionToUserMap[] = 
      }

      // after iterating over all offers set list to empty list? Nvm what if we
      //    receive offers in between :/
      const emptyEntry = {
        offers: []
      }
      await userRef.update(emptyEntry);
    }
    else {
      console.log(`username "${username}" got an offer update but snapshot did not exist.`);
    }
  });

  const userID = userRef.id;
  const sessionRef = await db.collection("sessions").add([userID]);
  sessionRef.onSnapshot(async (snapshot) => {
    console.log("Update to group membership");

    // TOOD: add logic to handle changes to group membership
  });
}


// Join session by inputting the session ID. This in turn gives the user
//    access to the session's entry in the Sessions table which has the
//    ID of all the users in it. Can then iterate over user IDs and send
//    them all offers to create peer connections and data channels
async function joinSession() {

  // TODO: need to get roomID from user

  const db = firebase.firestore();
  const sessionRef = db.collection("sessions").doc(`${sessionId}`);
  const sessionSnapshot = await sessionRef.get();
  console.log("Got session:", sessionSnapshot.exists);

  if (sessionSnapshot.exists) {

  }
}



// Pass in peer connection so it doesn't have to be global :)
function registerPeerConnectionListeners( peerConnection : RTCPeerConnection) {
  peerConnection.addEventListener("icegatheringstatechange", () => {
    console.log(
      `ICE gathering state changed: ${peerConnection.iceGatheringState}`
    );
  });

  peerConnection.addEventListener("connectionstatechange", () => {
    console.log(`Connection state change: ${peerConnection.connectionState}`);

    // TODO, consensus round to see if connection is down for everyone
  });

  peerConnection.addEventListener("signalingstatechange", () => {
    console.log(`Signaling state change: ${peerConnection.signalingState}`);
  });

  peerConnection.addEventListener("iceconnectionstatechange ", () => {
    console.log(
      `ICE connection state change: ${peerConnection.iceConnectionState}`
    );
  });
}