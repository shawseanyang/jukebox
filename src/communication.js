import { group } from 'console';
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
    sessions collection/table has per entry:
    {
        members: [user1_ID, user2_ID, ...]
    }

    userOffers collection/table has per entry:
    {
      offers: [(userID, offer1), (userID, offer2), ...],
      answers: [answer1, answer2, ...],
      otherUserID: LocalIceCollection, RemoteIceCollection
    }
    
    * The LocalIceCollection will contain the new ICE candidates we add
    * the RemoteIceCollection will contain
*/


// Initialize firebase?

// Global state
var username = '';
var myUserID = 0;
var sessionId = '';
var groupMembers = 0;

// Consensus globals
var highestChosenVal = 0;


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
var userToConnection = {};

async function addUser() {
  const db = firebase.firestore();
  const entry = {
    offers: [],
    answers: []
  };
  const userRef = await db.collection("userOffers").add(entry);
  userRef.onSnapshot(handleConnectionUpdate);
  myUserID = userRef.id;
}


// Creates a session by adding an entry to the sessions table whose ID will be used
//    to join the session. Also adds an entry to the userOffers table which will be
//    used as a way to send and receive offers
async function createSession() {
  // TODO: probs disable some buttons or some shit idk

  const db = firebase.firestore();

  console.log("Starting session with configuration: ", configuration);

  const sessionEntry = {
    users: [myUserID]
  };
  const sessionRef = await db.collection("sessions").add(sessionEntry);
  sessionRef.onSnapshot(async (snapshot) => {
    console.log("Update to group membership");
    const memberList = snapshot.data().users;
    if (memberList.length < groupMembers) {
      // TODO: handle losing members
    }
    groupMembers = memberList.length;
    // TODO: add logic to handle changes to group membership
  });
}


// Join session by inputting the session ID. This in turn gives the user
//    access to the session's entry in the Sessions table which has the
//    ID of all the users in it. Can then iterate over user IDs and send
//    them all offers to create peer connections and data channels
async function joinSession() {
  // TODO: need to get roomID from user
  // Need to get SessionID from user

  const db = firebase.firestore();
  const sessionRef = db.collection("sessions").doc(`${sessionId}`);
  const sessionSnapshot = await sessionRef.get();
  console.log("Got session:", sessionSnapshot.exists);

  if (sessionSnapshot.exists) {
    // iterate over all users in the session
    for (let ID of sessionSnapshot.data().users) {
      const peerConnection = new RTCPeerConnection(configuration);
      
      // TODO: we need to add the new ICE field in the userOffers collection and create a reference to it
      //  Then, we pass a reference to that collection into the collectIceCandidates function

      const offer = await peerConnection.createOffer();
      await peerConnection.setLocalDescription(offer);

      userToConnection[ID] = peerConnection;
      
      const userRef = db.collection("userOffers").doc(`${ID}`);
      const userSnapshot = await userRef.get();

      if (userSnapshot.exists) {
        const offers = userSnapshot.data().offers;
        offers.push((myUserID, offer));
        const newEntry = {
          offers: offers,
          answers: userSnapshot.data().answers
        };
        await otherUserRef.update(newEntry);
      }

      peerConnection.addEventListener('datachannel', event => {
        const dataChannel = event.channel;
      });
    }
  }
}


// Pass in peer connection so it doesn't have to be global :)
function registerPeerConnectionListeners(peerConnection) {
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

  peerConnection.addEventListener('datachannel', (event) => {
    console.log(
      `Data channel made for user ${username}`
    );


    
  });
}


async function handleConnectionUpdate(snapshot) {
  console.log("Got new connection offer");
  if (snapshot.exists) {
    var offerList = snapshot.data().offers;

    // iterate over list of offers
    for (let [otherUserID, offer] of offerList) {
      const peerConnection = new RTCPeerConnection(configuration);
      registerPeerConnectionListeners(peerConnection);
      await peerConnection.setRemoteDescription(offer);
      const answer = await peerConnection.createAnswer();
      await peerConnection.setLocalDescription(answer);
      
      // Notify other user of our answer
      const otherUserRef = db.collection("userOffers").doc(`${otherUserID}`);
      const otherUserSnapshot = await otherUserRef.get();
      if (otherUserSnapshot.exists) {
        const theirAnswers = otherUserSnapshot.data().answers;
        theirAnswers.push(answer);
        const newEntry = {
          offers: otherUserSnapshot.data().offers,
          answers: theirAnswers
        };
        await otherUserRef.update(newEntry);
      }

      // create data channel
      const dataChannel = peerConnection.createDataChannel();
      
      const peerIdentity = await peerConnection.peerIdentity;
      connectionToUserMap[peerIdentity] = (otherUserID, dataChannel)
    }

    // iterate over life of answers
    var answerList = snapshot.data().answers;
    for (let [ID, answer] of answerList) {
      const RTCAnswer = new RTCSessionDescription(answer);
      await userToConnection[ID].setRemoteDescription(RTCAnswer);
    }

    // after iterating over all offers set list to empty list?
    const emptyEntry = {
      offers: [],
      answers: []
    };
    await userRef.update(emptyEntry);
  }
  else {
    console.log(`username "${username}" got an offer update but snapshot did not exist.`);
  }
}