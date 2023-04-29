import { group } from 'console';
import firebase from 'firebase/compat/app';
import 'firebase/compat/firestore';
import { off } from 'process';
// import '@firebase/firestore-types'

mdc.ripple.MDCRipple.attachTo(document.querySelector(".mdc-button"));

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
      ICECollection (user userIDs as keys): LocalIceCollection, RemoteIceCollection
    }
    
    * The LocalIceCollection will contain the new ICE candidates we add
    * We use collection.doc(userID) to create entries with custom keys
    
    Message schema:
    {
        round_type: int
        message_type: int
        timestamp: optional timestamp
        song: optional string
        must_accept: optional bool
        index: optional int
    }
    
*/

const answererCandidateString = "answererCandidates";
const offererCandidateString = "offererCandidates";

// Global state
var username = "";
var myUserID = 0;
var sessionId = "";
var groupMembers = 0;         // Number of acceptors is floor((groupMembers - 1)/2) + 1
var queue = [];               // Array of songs

// Role strings
const DISTINGUISHED_PROPOSER = "distingushed-proposer";
const ACCEPTOR = "acceptor";
const LEARNER = "learner";
const NO_ROLE = "none";

// Message types
const PAUSE = 1;
const PLAY = 2;
const ADD = 3;
const REMOVE = 4;
const SCRUB = 5;
const SKIP = 6;
const PREPARE = 7
const ACCEPT = 8

// Consensus globals
var highestChosenVal = 0;
var myRole = NO_ROLE;

// Default configuration - Change these if you have a different STUN or TURN server.
const configuration = {
  iceServers: [
    {
      urls: ["stun:stun1.l.google.com:19302", 
            "stun:stun2.l.google.com:19302"],
    },
  ],
  iceCandidatePoolSize: 10,
};

// Will be used to bind html elements to our functions I assume lol
function init() {
  document.querySelector("#cameraBtn").addEventListener("click", addUser);
  document.querySelector("#createBtn").addEventListener("click", createSession);
  document.querySelector("#joinBtn").addEventListener("click", joinRoom);
  document.querySelector("#messageBtn").addEventListener("click", sendMessage);
  roomDialog = new mdc.dialog.MDCDialog(document.querySelector("#room-dialog"));
}


var dataChannels = [];

// dictionary from peerConnection.peerIdentity -> (userConnectedToId, dataChannel)
var connectionToUserMap = {};

// dictionary from userID -> peerConnection
var userToConnection = {};


async function addUser() {
  console.log("adding user");
  const db = firebase.firestore();
  const entry = {
    offers: {},
    answers: {},
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

  // Set role as distinguished proposer if creating session
  myRole = DISTINGUISHED_PROPOSER;

  const db = firebase.firestore();

  console.log("Starting session with configuration: ", configuration);

  const sessionEntry = {
    users: [myUserID],
    personDropped: {
      role: NO_ROLE,
      ID: ''
    } 
    
  };
  const sessionRef = await db.collection("sessions").add(sessionEntry);
  sessionRef.onSnapshot(handleMembershipChange);

  document.querySelector(
    "#currentRoom"
  ).innerText = `Current room is ${sessionRef.id} - You are the caller!`;
}

function joinRoom() {
  document.querySelector("#createBtn").disabled = true;
  document.querySelector("#joinBtn").disabled = true;

  document.querySelector("#confirmJoinBtn").addEventListener(
    "click",
    async () => {
      sessionId = document.querySelector("#room-id").value;
      console.log("Join room: ", sessionId);
      document.querySelector(
        "#currentRoom"
      ).innerText = `Current room is ${sessionId}!`;
      await joinSession();
    },
    { once: true }
  );
  roomDialog.open();
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
      console.log(`Found user "${ID}" in session!`);
      const peerConnection = new RTCPeerConnection(configuration);

      userToConnection[ID] = peerConnection;


      registerPeerConnectionListeners(ID);
      await addICECollection(myUserID, ID, userToConnection[ID], offererCandidateString, answererCandidateString);

      const offer = await userToConnection[ID].createOffer();
      await userToConnection[ID].setLocalDescription(offer);
      console.log("Created offer:", offer);

      // userToConnection[ID] = peerConnection;

      const userRef = db.collection("userOffers").doc(`${ID}`);
      const userSnapshot = await userRef.get();
      console.log(`Got snapshot of document for "${ID}": `, userSnapshot.exists);

      if (userSnapshot.exists) {
        const offers = userSnapshot.data().offers;
        const offerObj = {
          type: offer.type,
          sdp: offer.sdp
        };
        offers[myUserID] = offerObj;
        console.log("Their offers are: ", offers);
        userRef.update({
          "offers": offers
        }).then(() => {console.log("Document updated successfully!")});
      }

      userToConnection[ID].addEventListener("datachannel", async (event) => {
        console.log("New data channel: ", event.channel.label);
        const dataChannel = event.channel;
        dataChannel.addEventListener("message", handleNewMessage);
        const identity = await userToConnection[ID].peerIdentity;
        connectionToUserMap[identity] = [ID, dataChannel];
        dataChannels.push(dataChannel);
      });
    }
  }
  const userList = sessionSnapshot.data().users;
  userList.push(myUserID);
  sessionRef.update({
    "users": userList
  }).then(() => {console.log("Membership updated!")});
  sessionRef.onSnapshot(handleMembershipChange);
}

// Pass in peer connection so it doesn't have to be global :)
function registerPeerConnectionListeners(ID) {
  userToConnection[ID].addEventListener("icegatheringstatechange", () => {
    console.log(
      `ICE gathering state changed: ${peerConnection.iceGatheringState}`
    );
  });

  userToConnection[ID].addEventListener("connectionstatechange", () => {
    console.log(`Connection state change: ${peerConnection.connectionState}`);
    // if (peerConnection.connectionState == "connected") {
    //   console.log("Getting peerConnection.peerIdentity.");
    //   const peerIdentity = peerConnection.peerIdentity;
    //   console.log("Adding to connectionToUserMap.");
    //   connectionToUserMap[peerIdentity] = (otherUserID, dataChannel);
    //   console.log("Connection to user map:", connectionToUserMap);
    // }

    
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

  peerConnection.addEventListener("datachannel", (event) => {
    console.log(`Data channel made for user ${username}`);
  });
}

async function sendMessage() {
  let message = document.querySelector("#message-test-id").value;
  console.log("about to send message ", message)


  for (let dataChannel of dataChannels) {
    console.log("Sending message over ", dataChannel.label);
    dataChannel.send(message);
  }
  // for (let [peerIdentity, [otherUserId, dataChannel]] of Object.entries(connectionToUserMap)) {
  //   console.log("Sending message to ", otherUserId);
  //   dataChannel.send(message);
  // }

}

async function handleConnectionUpdate(snapshot) {
  console.log("Update to connections (answers/offers)");
  if (snapshot.exists) {
    const db = firebase.firestore();
    const offerDict = snapshot.data().offers;
    console.log("Offers list is now: ", offerDict);

    // iterate over list of offers
    for (let otherUserID in offerDict) {
      const offer = offerDict[otherUserID];
      const peerConnection = new RTCPeerConnection(configuration);

      userToConnection[otherUserID] = peerConnection;

      registerPeerConnectionListeners(otherUserID);
      await addICECollection(otherUserID, myUserID, peerConnection, answererCandidateString, offererCandidateString);
      console.log("Offer:", offer);
      await userToConnection[otherUserID].setRemoteDescription(offer);
      const answer = await userToConnection[otherUserID].createAnswer();
      await userToConnection[otherUserID].setLocalDescription(answer);
      console.log("Set remote and local descriptions.");


      // Notify other user of our answer
      const otherUserRef = db.collection("userOffers").doc(`${otherUserID}`);
      const otherUserSnapshot = await otherUserRef.get();
      if (otherUserSnapshot.exists) {
        const theirAnswers = otherUserSnapshot.data().answers;
        const answerObj = {
          type: answer.type,
          sdp: answer.sdp
        }
        theirAnswers[myUserID] = answerObj;
        console.log("Their answers: ", theirAnswers);
        await otherUserRef.update({
          "answers": theirAnswers
        });
        console.log("Document updated successfully!");
      }

      // create data channel
      console.log(`userToConnection["${otherUserID}"]`, userToConnection[otherUserID]);
      console.log(`Creating data channel with "${otherUserID}".`);
      const dataChannel = userToConnection[otherUserID].createDataChannel(`"${myUserID}"-"${otherUserID}" data channel`);
      dataChannel.addEventListener("message", handleNewMessage);

      console.log("Getting peerConnection.peerIdentity.");
      
      // peerConnection.peerIdentity.then((id) => {
      //   console.log("data from peerIdentity.then", id)
      //   console.log("Adding to connectionToUserMap.");
      //   connectionToUserMap[id] = [otherUserID, dataChannel];
      //   console.log("Connection to user map:", connectionToUserMap);
      // });
      dataChannels.push(dataChannel);
      // try {
      //   const identity = await peerConnection.peerIdentity;
      //   console.log("Adding to connectionToUserMap");
      //   connectionToUserMap[identity] = [otherUserID, dataChannel];
      // } catch (err) {
      //   console.log("Error identifying remote peer: ", err);
      // }

    }
    console.log("Finished with all offers.");

    // iterate over answers
    var answerDict = snapshot.data().answers;
    for (let ID in answerDict) {
      console.log(`New answer from "${ID}": `, answerDict[ID]);
      console.log(`userToConnection["${ID}"]: `, userToConnection[ID]);
      await userToConnection[ID].setRemoteDescription(answerDict[ID]);
    }
    console.log("Finished with all answers.");

    // after iterating over all offers set list to empty list?
    await db.collection("userOffers").doc(`${myUserID}`).update({
      "offers": {},
      "answers": {}
    });
  } else {
    console.log(
      `User with ID "${myUserID}" got an offer update but snapshot did not exist.`
    );
  }
}

// Every ICE transport used by the connection is either in use (state connected or completed) or is closed (state closed); in addition, at least one transport is either connected or completed.


async function addICECollection(offererUserID, answererUserID, peerConnection, localName, remoteName) {
  const db = firebase.firestore();
  const entryRef = db.collection("ICECollections").doc(`${offererUserID}${answererUserID}`);

  const candidatesCollection = entryRef.collection(localName);
  peerConnection.addEventListener('icecandidate', event => {
    if (!event.candidate) {
      console.log('Got final candidate!');
      return;
    }
    console.log('Got candidate: ', event.candidate);
    candidatesCollection.add(event.candidate.toJSON());
  });

  entryRef.collection(remoteName).onSnapshot(snapshot => {
    snapshot.docChanges().forEach(async change => {
        if (change.type === "added") {
          let data = change.doc.data();
          console.log('Got new remote ICE candidate: ${JSON.stringify(data)}');
          await peerConnection.addIceCandidate(new RTCIceCandidate(data));
        }
    });
})
}

// async function addICECollection(peerConnection, otherUserID) {
//   console.log("Adding ICE collections.");
//   // get referenced to my own table
//   const db = firebase.firestore();
//   const userRef = db.collection("userOffers").doc(`${myUserID}`);

//   // create entry in ICEServers collection with other user
//   const candidatesCollection = userRef.collection("ICEServers").doc(`${otherUserID}`).collection("localICECollection");
//   peerConnection.addEventListener("icecandidate", (event) => {
//     console.log("Adding ICE candidate");
//     if (event.candidate) {
//       const json = event.candidate.toJSON();
//       candidatesCollection.add(json);
//     }
//   });

//   userRef.collection("ICEServers").doc(`${otherUserID}`).collection("remoteICECollection").onSnapshot((snapshot) => {
//       snapshot.docChanges().forEach((change) => {
//         if (change.type === "added") {
//           const candidate = new RTCIceCandidate(change.doc.data());
//           peerConnection.addIceCandidate(candidate);
//         }
//       });
//   });
//   console.log("Finished adding ICE stuff.");
// }

async function handleMembershipChange(snapshot) {
  console.log("Update to group membership");
  const memberList = snapshot.data().users;
  if (memberList.length < groupMembers) {
    // TODO: handle losing members
    // Check if my role needs to be changed based on my index

    for (let i in memberList) {
      let member = memberList[i];
      if (member == myUserID) {
        if (i == 0) {
          myRole = DISTINGUISHED_PROPOSER;
        } else if (i < Math.floor(memberList.length) + 2) {
          myRole = ACCEPTOR;
        } else {
          myRole = LEARNER;
        }

        break;
      }
    }
    
    // If new role is proposer, do things based on membership changes

    // If proposer left and you are not a proposer, send new proposer queued changes
    
    // Remove person from data structures
    
  }
  groupMembers = memberList.length;
  // TODO: add logic to handle changes to group membership
}

async function handleNewMessage(event) {
  console.log(`new message of "${event.data}`);
  // TODO: implement!!

  var message = JSON.parse(event.data);
  
  if (message.round == PREPARE) {
    if (true) {
      
    }

  } else if (message.round == ACCEPT) {
      switch (message.type) {
        case PAUSE:
          // TODO: implement
          break;
        case PLAY:
          // TODO: implement
          break;
        case PAUSE:
          
          break;
        case ADD:
    
          break;
        case REMOVE:
          
          break;
        case SCRUB:
    
          break;
        case SKIP:
          
          break;
        default:
          console.log("Unknown message type:", message.type);
    }

  }
  
  
}



init();
