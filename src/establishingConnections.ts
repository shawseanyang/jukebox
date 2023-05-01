import firebase from "firebase/compat/app";
import { UrlWithStringQuery } from "url";
import { Song } from "./types/Music";
import "firebase/compat/firestore";

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
      ICECollection (user userIDs as keys): LocalIceCollection, RemoteIceCollection
    }
    
    * The LocalIceCollection will contain the new ICE candidates we add
    * We use collection.doc(userID) to create entries with custom keys
    
    Message schema:
    {
        round_type: int
        ranking_val: int
        message_type: int
        timestamp: optional timestamp
        song: optional string
        must_accept: optional bool
        index: optional int
    }

*/

// Import the functions you need from the SDKs you need
// import { initializeApp } from "firebase/app";
// import { getAnalytics } from "firebase/analytics";
// TODO: Add SDKs for Firebase products that you want to use
// https://firebase.google.com/docs/web/setup#available-libraries

// Your web app's Firebase configuration
// For Firebase JS SDK v7.20.0 and later, measurementId is optional
const firebaseConfig = {
  apiKey: process.env.FIREBASE_API_KEY || '',
  authDomain: "jukebox-eecb0.firebaseapp.com",
  databaseURL: "https://jukebox-eecb0-default-rtdb.firebaseio.com",
  projectId: "jukebox-eecb0",
  storageBucket: "jukebox-eecb0.appspot.com",
  messagingSenderId: "975391862639",
  appId: process.env.FIREBASE_APP_ID || '',
  measurementId: "G-QRXSJFRWHJ"
};

// Initialize Firebase
firebase.initializeApp(firebaseConfig);

const answererCandidateString = "answererCandidates";
const offererCandidateString = "offererCandidates";

// Global state
var myUserID: string = "";
var sessionId: string = "";
var consensusMajority: number = 0; // Number of acceptors is floor((consensusMajority - 1)/2) + 1

// Role strings
const DISTINGUISHED_PROPOSER = "distingushed-proposer";
const ACCEPTOR = "acceptor";
const LEARNER = "learner";
const NO_ROLE = "none";

// Message types
const TOGGLE = 1;
const PLAY = 2;
const ADD = 3;
const REMOVE = 4;
const SCRUB = 5;
const SKIP = 6;

// Round types
const PREPARE = 7;
const ACCEPT = 8;
const PROMISE = 9;
const CANT_PROMISE = 10;
const ACCEPTED = 11;
const REQUEST = 12;
const LEARN = 13;
const JOINING = 14;

// TODO: Mutexes

// Consensus globals
var lastPrepareRankingVal = 0;
var lastAcceptedRankingVal = 0;
var myRole = NO_ROLE;

// For proposer
var ranking_val = 1;
var roundInProgress = false;

interface message {
  message_type: number;
  round_type: number;
  ranking_val?: number;
  timestamp?: number;
  song?: Song | null;
  must_accept?: boolean;
  index?: number;
  joiningMember?: string;
  queue?: Song[];
  isPlaying?: boolean;
  player?: Spotify.Player | null;
}

var messageQueue: message[] = [];
var promises = 0;
var acceptances = 0;

// For learner
var lastLearned = 0;

// Default configuration - Change these if you have a different STUN or TURN server.
const configuration = {
  iceServers: [
    {
      urls: ["stun:stun1.l.google.com:19302", "stun:stun2.l.google.com:19302"],
    },
  ],
  iceCandidatePoolSize: 10,
};

// dictionary from userID -> peerConnection
// interface connectionInfo {
//   peerConnection: RTCPeerConnection;
//   dataChannel: RTCDataChannel;
// };

var userToConnection: {[id: string]: RTCPeerConnection} = {};
var userToDataChannel: {[id: string]: RTCDataChannel} = {};
var currMembers: Set<string> = new Set();

// Creates user entry in database
async function addUser() {
  console.log("adding user");
  const db = firebase.firestore();
  const userRef = await db.collection("userOffers").add({ nothing: 0 });
  // const userRef = await db.collection("userOffers").doc();
  userRef.collection("offers").onSnapshot((snapshot) => {
    snapshot.docChanges().forEach(handleNewOffer);
  });
  userRef.collection("answers").onSnapshot((snapshot) => {
    snapshot.docChanges().forEach(handleNewAnswer);
  });
  myUserID = userRef.id;
  console.log("I am user", myUserID);
}

// Creates a session by adding an entry to the sessions table. This ID will be used
//    to join the session.
// Also adds an entry to the userOffers table which will be
//    used as a way to send and receive offers
async function createOrJoin(roomAlias: string) {
  // Create user before opening room
  await addUser();

  const db = firebase.firestore();

  db.collection("sessions")
    .where("alias", "==", roomAlias)
    .get().then((querySnapshot) => {
      querySnapshot.forEach((doc) => {
        sessionId = doc.id;
      });
      if (sessionId != '') {
        joinSession();
      } else {
        createSession(roomAlias)
      }
  
      
    })
}

// Creates a new session with the roomAlias
async function createSession(roomAlias: string) {
  // Set role as distinguished proposer if creating session
  myRole = DISTINGUISHED_PROPOSER;

  const db = firebase.firestore();

  const sessionEntry = {
    alias: roomAlias,
    users: [myUserID],
    personDropped: {
      role: NO_ROLE,
      ID: "",
    },
  };

  currMembers.add(myUserID);
  consensusMajority = 0;
  const sessionRef = await db.collection("sessions").add(sessionEntry);
  sessionRef.onSnapshot(handleMembershipChange);
  sessionId = sessionRef.id;
}

// Join session that corresponds with the room alias. This in turn gives
//    the user access to the session's entry in the Sessions table which
//    has the ID of all the users in it. Can then iterate over user IDs
//    and send them all offers to create peer connections and data channels
async function joinSession() {
  const db = firebase.firestore();
  const sessionRef = db.collection("sessions").doc(`${sessionId}`);
  const sessionSnapshot = await sessionRef.get();
  console.log("Got session:", sessionSnapshot.exists);

  if (sessionSnapshot.exists) {
    // iterate over all users in the session
    for (let ID of sessionSnapshot?.data()?.users) {
      console.log(`Found user ${ID} in session!`);
      sendPeerConnectionOffer(ID);
    }

  }
  const userList = sessionSnapshot?.data()?.users;
  userList.push(myUserID);
  sessionRef
    .update({
      users: userList,
    })
    .then(() => {
      console.log("Membership updated!");
    });
  currMembers = new Set(userList);
  currMembers.add(myUserID);
  consensusMajority = Math.floor((currMembers.size - 1) / 2) + 1;
  sessionRef.onSnapshot(handleMembershipChange);
}

async function sendPeerConnectionOffer(ID : string) {
  const db = firebase.firestore();
  const peerConnection = new RTCPeerConnection(configuration);
  userToConnection[ID] = peerConnection;

  console.log(`Creating data channel with ${ID}.`);
  const dataChannel = userToConnection[ID].createDataChannel(
    `${myUserID}-${ID} data channel`
  );
  userToDataChannel[ID] = dataChannel;

  // Add event handler for error, open, close and message
  userToDataChannel[ID].onerror = () => {
    console.log(`Data channel to ${ID} had error.`);
    userToDataChannel[ID].close();
  };
  userToDataChannel[ID].onopen = () => {
    console.log(`Data channel to ${ID} is open`);
  };
  userToDataChannel[ID].onclose = () => {
    console.log(`Data channel to ${ID} is closed`);
  };
  userToDataChannel[ID].onmessage = handleNewMessage;

  console.log("Added listener: ", dataChannel);

  registerPeerConnectionListeners(ID);

  const offer = await userToConnection[ID].createOffer();
  await userToConnection[ID].setLocalDescription(offer);
  console.log("Created offer:", offer);

  const userRef = db.collection("userOffers").doc(`${ID}`);
  const userSnapshot = await userRef.get();
  console.log(`Got snapshot of document for ${ID}: `, userSnapshot.exists);

  if (userSnapshot.exists) {
    const offerObj = {
      id: myUserID,
      type: offer.type,
      sdp: offer.sdp,
    };
    console.log(`Adding offer ${offerObj} to offers collection of ${ID}`);
    userRef.collection("offers").doc(myUserID).set(offerObj);
  }
}

// Pass in the ID of a peer connection
function registerPeerConnectionListeners(ID: string) {
  userToConnection[ID].addEventListener(
    "icegatheringstatechange",
    () => {
      console.log(
        `ICE gathering state changed: ${userToConnection[ID].iceGatheringState}`
      );
    }
  );

  userToConnection[ID].addEventListener(
    "connectionstatechange",
    async () => {
      const db = firebase.firestore();
      switch (userToConnection[ID].connectionState) {
        case "connecting":
          console.log(`Connecting to ${ID}`);
          break;
        case "connected":
          console.log(`Connected to ${ID}`);
          break;
        case "failed":
          console.log(
            `Connection to ${ID} failed. One or more of ICE transports has failed`
          );
          console.log(`Attempting to reconnect with ${ID}`);
          userToConnection[ID].close();
          delete userToConnection[ID];
          sendPeerConnectionOffer(ID);
          currMembers.delete(ID);
          break;
        case "disconnected":
          console.log(`Disconnected from ${ID}`);
          const sessionRef = db.collection("sessions").doc(`${sessionId}`);
          const sessionSnapshot = await sessionRef.get();
          const sessionMembers = sessionSnapshot?.data()?.users;

          const idxToRemove = sessionMembers.indexOf(ID);
          if (idxToRemove > -1) {
            sessionMembers.splice(idxToRemove, 1);
          }

          var roleRemoved;
          if (idxToRemove === 0) {
            roleRemoved = DISTINGUISHED_PROPOSER;
          } else if (idxToRemove < Math.floor((currMembers.size - 1) / 2) + 2) {
            roleRemoved = ACCEPTOR;
          } else {
            roleRemoved = LEARNER;
          }

          await sessionRef.update({
            users: sessionMembers,
            personDropped: {
              ID: ID,
              role: roleRemoved,
            },
          });
          console.log(`Removed user ${ID}`);

          if (ID in userToConnection) {
            if (userToDataChannel[ID].readyState === "open") {
              userToDataChannel[ID].close();
            }
            userToConnection[ID].close();
            delete userToConnection[ID];
          }
          currMembers.delete(ID);
          break;
        case "closed":
          console.log(`Closed peer connection to ${ID}`);
          break;
        default:
          break;
      }
    }
  );

  userToConnection[ID].addEventListener(
    "signalingstatechange",
    () => {
      console.log(
        `Signaling state change: ${userToConnection[ID].signalingState}`
      );
    }
  );

  userToConnection[ID].addEventListener(
    "iceconnectionstatechange ",
    () => {
      console.log(
        `ICE connection state change: ${userToConnection[ID].iceConnectionState}`
      );
    }
  );
}

async function handleNewOffer(change: firebase.firestore.DocumentChange) {
  const db = firebase.firestore();
  const offer = {
    type: change.doc.data().type,
    sdp: change.doc.data().sdp,
  };
  const otherUserID = change.doc.data().id;
  console.log(`New offer from ${otherUserID}: `, offer);
  const peerConnection = new RTCPeerConnection(configuration);
  userToConnection[otherUserID] = peerConnection;
  registerPeerConnectionListeners(otherUserID);

  // Creating a data channel
  userToConnection[otherUserID].addEventListener(
    "datachannel",
    async (event) => {
      console.log("New data channel: ", event);
      const dataChannel = event.channel;
      userToDataChannel[otherUserID] = dataChannel;

      // Add event handler for error, close, open and message
      userToDataChannel[otherUserID].onerror = () => {
        console.log(`Data channel to ${otherUserID} had error.`);
        userToDataChannel[otherUserID].close();
      };
      userToDataChannel[otherUserID].onopen = () => {
        console.log(`Data channel to ${otherUserID} is open`);
        if (myRole === DISTINGUISHED_PROPOSER) {
          triggerSendState(otherUserID);
        }
      };
      userToDataChannel[otherUserID].onclose = () => {
        console.log(`Data channel to ${otherUserID} is closed`);
      };
      userToDataChannel[otherUserID].onmessage = handleNewMessage;

      console.log("Added listener: ", dataChannel);
    }
  );

  await userToConnection[otherUserID].setRemoteDescription(
    offer
  );
  const answer = await userToConnection[
    otherUserID
  ].createAnswer();
  await userToConnection[otherUserID].setLocalDescription(
    answer
  );
  console.log("Set remote and local descriptions.");

  await addICECollection(
    otherUserID,
    myUserID,
    otherUserID,
    answererCandidateString,
    offererCandidateString
  );

  const otherUserRef = db.collection("userOffers").doc(`${otherUserID}`);
  const otherUserSnapshot = await otherUserRef.get();
  if (otherUserSnapshot.exists) {
    const answerObj = {
      id: myUserID,
      type: answer.type,
      sdp: answer.sdp,
    };
    console.log(`Adding answer ${answerObj} to ${otherUserID}`);
    otherUserRef.collection("answers").doc(myUserID).set(answerObj);
  }
  currMembers.add(otherUserID);
  consensusMajority = Math.floor((currMembers.size - 1) / 2) + 1;
}

async function handleNewAnswer(change: firebase.firestore.DocumentChange) {
  // const db = firebase.firestore();
  const answerObj = {
    type: change.doc.data().type,
    sdp: change.doc.data().sdp,
  };
  const otherUserID = change.doc.data().id;

  console.log(`New answer from ${otherUserID}: `, answerObj);
  await userToConnection[otherUserID].setRemoteDescription(
    answerObj
  );
  await addICECollection(
    myUserID,
    otherUserID,
    otherUserID,
    offererCandidateString,
    answererCandidateString
  );
  // currMembers.add(otherUserID);
  // consensusMajority = Math.floor((currMembers.size - 1) / 2) + 1;
}

async function addICECollection(
  offererUserID : string,
  answererUserID : string,
  peerConnectionID: string,
  localName : string,
  remoteName : string
) {
  const db = firebase.firestore();
  const entryRef = await db
    .collection("sessions")
    .doc(`${sessionId}`)
    .collection("ICECollections")
    .doc(`${offererUserID}${answererUserID}`);

  const candidatesCollection = entryRef.collection(localName);
  userToConnection[peerConnectionID].addEventListener(
    "icecandidate",
    (event) => {
      if (!event.candidate) {
        console.log("Got final candidate!");
        return;
      }
      console.log("Got candidate: ", event.candidate);
      candidatesCollection.add(event.candidate.toJSON());
    }
  );

  entryRef.collection(remoteName).onSnapshot((snapshot) => {
    snapshot.docChanges().forEach(async (change) => {
      if (change.type === "added") {
        let data = change.doc.data();
        console.log(`Got new remote ICE candidate: ${JSON.stringify(data)}`);
        await userToConnection[peerConnectionID].addIceCandidate(
          data
        );
      }
    });
  });
}

async function handleMembershipChange(snapshot: firebase.firestore.DocumentSnapshot) {
  const memberList = snapshot?.data()?.users;
  const droppedRole = snapshot?.data()?.personDropped.role;
  const id = snapshot?.data()?.personDropped.ID;
  console.log("Update to group membership.");
  console.log(`Person dropped: ${id}`);

  let myNewRole = "";

  for (let i = 0; i<memberList.length; i++) {
    let member = memberList[i];
    if (member === myUserID) {
      if (i === 0) {
        myNewRole = DISTINGUISHED_PROPOSER;
      } else if (i < Math.floor((memberList.length - 1) / 2) + 2) {
        myNewRole = ACCEPTOR;
      } else {
        myNewRole = LEARNER;
      }
      break;
    }
  }

  if (memberList.length < currMembers.size) {
    // Check if my role needs to be changed based on my index

    // Drop member from everything
    if (id in userToConnection) {
      if (userToDataChannel[id].readyState === "open") {
        userToDataChannel[id].close();
      }
      userToConnection[id].close();
      currMembers.delete(id);
      delete userToConnection[id];
    }

    switch (myNewRole) {
      // If I'm now a proposer, I could've been either an acceptor or a proposer already
      case DISTINGUISHED_PROPOSER:
        switch (myRole) {
          case DISTINGUISHED_PROPOSER:
            if (droppedRole == ACCEPTOR && roundInProgress) {
              if (promises >= consensusMajority) {
                // Person dropped while an accept round was in progress
                messageQueue[0].round_type = ACCEPT;
                messageQueue[0].must_accept = true;
                sendMessage(messageQueue[0], ACCEPTOR);
              } else if (promises < consensusMajority) {
                // Person dropped while a prepare round was in progress
                //  Restart last round with a higher ranking_val
                ranking_val++;
                startRound();
              }
            }

            break;
          case ACCEPTOR:
            resetProposerGlobals(lastPrepareRankingVal);
            break;
          default:
            console.log("Had no valid former role:", myRole);
        }

        break;
      // If I'm now an acceptor, I could've been a learner or an acceptor already
      // TODO Everyone under here needs to send their unfinshed operations to the new proposer if there is one
      case ACCEPTOR:
        switch (myRole) {
          case ACCEPTOR:
            // Todo: send operation to

            break;
          case LEARNER:
            break;
          default:
            console.log("Had no valid former role");
        }
        break;
      case LEARNER:
        break;
      default:
        console.log(
          "Invalid role assignment, you're calculating roles incorrectly"
        );
    }

    // TODO: handle losing members
    // TODO: handle gaining members
    // TODO: if there's a role change, reset new role things

    // If new role is proposer, do things based on membership changes

    // If proposer left and you are not a proposer, send new proposer queued changes

    // Remove person from data structures
    currMembers = new Set(memberList);
  } else if (memberList.length > currMembers.size) {
  }

  myRole = myNewRole;
  consensusMajority = Math.floor((memberList.size - 1) / 2) + 1;
}

function resetProposerGlobals(lastRankingVal : number) {
  ranking_val = lastRankingVal + 1;
  roundInProgress = false;
  messageQueue = [];
  promises = 0;
  acceptances = 0;
}

// Sends a message to the specified recipient class (DISTINGUISHED_PROPOSER|ACCEPTOR|LEARNER)
async function sendMessage(message: message, recipient : string) {
  // let message = document.querySelector("#message-test-id").value;
  console.log(`about to send message ${JSON.stringify(message)} to recipient ${recipient} with ranking val ${message.ranking_val} and message type ${message.message_type}`);

  const sessionMembersArray : string[] = Array.from(currMembers);
  console.log("Current members: ", sessionMembersArray);

  for (let i = 0; i < sessionMembersArray.length; i++) {
    let ID : string = sessionMembersArray[i];

    if (i === 0 && recipient === DISTINGUISHED_PROPOSER) {
      console.log("Sending message to proposer");
      userToDataChannel[ID].send(JSON.stringify(message));
    } else if (
      i > 0 &&
      i < Math.floor((sessionMembersArray.length - 1) / 2) + 2 &&
      recipient === ACCEPTOR
    ) {
      console.log("Sending message to acceptor");
      userToDataChannel[ID].send(JSON.stringify(message));
    } else if (
      i > Math.floor((sessionMembersArray.length - 1) / 2) + 1 &&
      i < sessionMembersArray.length &&
      recipient === LEARNER
    ) {
      console.log("Sending message to learner");
      userToDataChannel[ID].send(JSON.stringify(message));
    }
  }
}

// Called when a data channel receives a new message
async function handleNewMessage(event: MessageEvent) {
  var message = JSON.parse(event.data);
  console.log(`new message of ${JSON.stringify(message)} with ranking val ${message.ranking_val} and message type ${message.message_type}`);

  // Handle according to role
  switch (myRole) {
    case DISTINGUISHED_PROPOSER:
      switch (message.round_type) {
        case REQUEST:
          // Add requests for operations to the queue
          messageQueue.push(message);

          // Starts consensus round if there isn't already anything in the queue
          if (messageQueue.length === 1) {
            startRound();
          }
          break;

        case PROMISE:
          if (message.ranking_val === ranking_val) {
            promises++;
            if (promises === consensusMajority) {
              message.round_type = ACCEPT;
              sendMessage(message, ACCEPTOR);

              updateDataStructures(message);
              promises = 0;
            }
          }
          break;

        case CANT_PROMISE:
          // Update ranking val and start round again with a higher ranking val
          ranking_val = message.ranking_val + 1;

          message.ranking_val = ranking_val;
          message.message_type = PREPARE;
          sendMessage(message, ACCEPTOR);
          break;

        case ACCEPTED:
          if (message.ranking_val === ranking_val) {
            acceptances++;
            if (acceptances === consensusMajority) {
              acceptances = 0;

              // Remove accepted message from queue
              messageQueue.shift();

              // Increase ranking val to prepare for the next round
              ranking_val++;

              roundInProgress = false;

              // Start consensus round with next message, if it exists
              if (messageQueue.length > 0) {
                startRound();
              }
            }
          }
          break;

        default:
          console.log(
            "Unrecognized round type for proposer:",
            message.round_type
          );
      }
      break;

    case ACCEPTOR:
      switch (message.round_type) {
        case PREPARE:
          if (lastPrepareRankingVal > message.ranking_val) {
            message.round_type = CANT_PROMISE;
            message.ranking_val = lastPrepareRankingVal;
            sendMessage(message, DISTINGUISHED_PROPOSER);
          } else if (lastPrepareRankingVal < message.ranking_val) {
            // This number is higher than the last last number I promised to vote on, so I'll promise to vote on this
            lastPrepareRankingVal = message.ranking_val;
            message.round_type = PROMISE;
            sendMessage(message, DISTINGUISHED_PROPOSER);
          }
          break;
        case ACCEPT:
          // Check if this is the round I agreed to vote on and that I haven't voted on it already
          if (
            lastPrepareRankingVal === message.ranking_val &&
            message.ranking_val != lastAcceptedRankingVal
          ) {
            message.round_type = ACCEPTED;

            sendMessage(message, DISTINGUISHED_PROPOSER);
            updateDataStructures(message);
            lastAcceptedRankingVal = message.ranking_val;

            // If message type was valid, notify learners
            if (
              message.message_type === TOGGLE ||
              message.message_type === PLAY ||
              message.message_type === ADD ||
              message.message_type === REMOVE ||
              message.message_type === SCRUB ||
              message.message_type === SKIP
            ) {
              message.round_type = LEARN;
              sendMessage(message, LEARNER);
            }
          } else if (message.must_accept) {
            message.round_type = ACCEPTED;

            sendMessage(message, DISTINGUISHED_PROPOSER);
            updateDataStructures(message);

            lastPrepareRankingVal = message.ranking_val;
            lastAcceptedRankingVal = message.ranking_val;
          }
          break;
        case JOINING:
          console.log("Triggering joiner match state event");
          triggerMatchState(message);

          break;
        default:
          console.log(
            "Unrecognized round type for acceptor:",
            message.round_type
          );
      }
      break;
    case LEARNER:
      switch (message.round_type) {
        case LEARN:
          // Learner updates data structures if they haven't already
          // TODO: Add mutex
          if (message.ranking_val !== lastLearned) {
            updateDataStructures(message);
            lastLearned = message.ranking_val;
          }
          break;
        case JOINING:
          console.log("Triggering joiner match state event");
          triggerMatchState(message);
  
          break;
        default:
          console.log(
            "Unrecognized round type for learner:",
            message.round_type
          );
      }
      break;
    default:
      console.log("Received a new message, but current client has no role");
      break;
  }
}


function updateDataStructures(message: message) {
  console.log(`Updating data structures with ranking val ${message.ranking_val} and message type ${message.message_type}`)

  // Custom event for broadcasting updates
  const event = new CustomEvent("updateDataStructures", {detail: message});

  window.dispatchEvent(event);

}

/*
  Message Schema: 
  // Message types
  const TOGGLE = 1;
  const PLAY = 2;
  const ADD = 3;
  const REMOVE = 4;
  const SCRUB = 5;
  const SKIP = 6;

  // Round types
  const PREPARE = 7;
  const ACCEPT = 8;
  const PROMISE = 9;
  const CANT_PROMISE = 10;
  const ACCEPTED = 11;
  const REQUEST = 12;
  const LEARN = 13;

    {
        message_type: int
        round_type: int
        ranking_val: optional int
        timestamp: optional timestamp
        song: optional string
        must_accept: optional bool
        index: optional int
    }

    * index: used for deleting a song from the queue
    * must_accept: used for when membership changes during a round
    * song: currently just song title, could be more if we wanted
*/

// This function is called by UI when a client wants to initiate an action.å
//  The client passes in the metadata for the action they want to initiate as per
//  the message schema above
async function initiateMessage(message: message) {
  console.log("Message initiated:", message)
  switch (myRole) {
    case DISTINGUISHED_PROPOSER:
      if (message.message_type === JOINING) {
        userToDataChannel[message.joiningMember || ''].send(JSON.stringify(message));
      } else if (currMembers.size === 1) {
        updateDataStructures(message);
      } else {
        messageQueue.push(message);
        if (messageQueue.length === 1) {
          startRound();
        }
      } 
      
      break;
    case ACCEPTOR:
      message.round_type = REQUEST;
      sendMessage(message, DISTINGUISHED_PROPOSER);
      break;
    case LEARNER:
      message.round_type = REQUEST;
      sendMessage(message, DISTINGUISHED_PROPOSER);
      break;
    default:
      console.log("Attempted to initiate message, but the client has no role");
      break;
  }
}

// For proposer to handle consensus
async function startRound() {
  console.log("Consensus round started")
  roundInProgress = true;
  messageQueue[0].ranking_val = ranking_val;
  messageQueue[0].round_type = PREPARE;
  sendMessage(messageQueue[0], ACCEPTOR);
}

// TODO: function for proposer getting state from Playback
async function triggerSendState(userID : string) {
  console.log(`Starting to send state to new member ${userID}`);

  // Custom event for broadcasting updates
  const event = new CustomEvent("sendState", {detail: userID});

  window.dispatchEvent(event);
}

async function triggerMatchState(message : message) {
  const event = new CustomEvent("matchState", {detail: message});
  window.dispatchEvent(event);
}

// TODO: function for joiner sending state to Playback (wait just use updateDataStructures)

// For proposer
// var ranking_val = 1;
// var roundInProgress = false;
// var messageQueue = [];
// var promises = 0
// var acceptances = 0

// init();

export { createOrJoin, initiateMessage, TOGGLE, PLAY, ADD, SCRUB, REMOVE, SKIP, JOINING};
