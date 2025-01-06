let roomListDiv = document.getElementById('room-list');
let messagesDiv = document.getElementById('messages');
let newMessageForm = document.getElementById('new-message');
let newRoomForm = document.getElementById('new-room');
let statusDiv = document.getElementById('status');

let roomTemplate = document.getElementById('room');
let messageTemplate = document.getElementById('message');

let messageField = newMessageForm.querySelector("#message");
let roomNameField = newRoomForm.querySelector("#name");


// USERNAME SCREEN
let submitButton = document.getElementById('submit-user')
let usernameField = document.querySelector("#username");

let savedUsername = localStorage.getItem('username');
if (savedUsername) {
  usernameField.value = savedUsername;
  document.getElementById('username-input').style.display = "none";
} else {
  submitButton.disabled = true;
}

usernameField.addEventListener('input', function () {
  if(usernameField.value.trim() !== '') {
    submitButton.disabled = false;
  } else {
    submitButton.disabled = true;
  }
})

submitButton.addEventListener("click", function () {
  let username = usernameField.value.trim();
  if (username) {
    localStorage.setItem('username', username);
    document.getElementById('username-input').style.display = "none";
  }
})
//USERNAME SCREEN END

var STATE = {
  room: "Lobby",
  rooms: {},
  connected: false,
}

// Generate a color from a "hash" of a string. Thanks, internet.
function hashColor(str) {
  let hash = 0;
  for (var i = 0; i < str.length; i++) {
    hash = str.charCodeAt(i) + ((hash << 5) - hash);
    hash = hash & hash;
  }

  return `hsl(${hash % 360}, 100%, 70%)`;
}

// Add a new room `name` and change to it. Returns `true` if the room didn't
// already exist and false otherwise.
function addRoom(name) {
  if (STATE[name]) {
    changeRoom(name);
    return false;
  }

  var node = roomTemplate.content.cloneNode(true);
  var room = node.querySelector(".room");
  room.addEventListener("click", () => changeRoom(name));
  room.textContent = name;
  room.dataset.name = name;
  roomListDiv.appendChild(node);

  STATE[name] = [];
  changeRoom(name);
  return true;
}

// Change the current room to `name`, restoring its messages.
function changeRoom(name) {
  if (STATE.room == name) return;

  var newRoom = roomListDiv.querySelector(`.room[data-name='${name}']`);
  var oldRoom = roomListDiv.querySelector(`.room[data-name='${STATE.room}']`);
  if (!newRoom || !oldRoom) return;

  STATE.room = name;
  oldRoom.classList.remove("active");
  newRoom.classList.add("active");

  messagesDiv.querySelectorAll(".message").forEach((msg) => {
    messagesDiv.removeChild(msg)
  });

  STATE[name].forEach((data) => addMessage(name, data.username, data.message))
}

// Add `message` from `username` to `room`. If `push`, then actually store the
// message. If the current room is `room`, render the message.
function addMessage(room, username, message, push = false) {
  if (push) {
    STATE[room].push({ username, message })
  }

  if (STATE.room == room) {
    var node = messageTemplate.content.cloneNode(true);
    node.querySelector(".message .username").textContent = username;
    node.querySelector(".message .username").style.color = hashColor(username);
    node.querySelector(".message .text").textContent = message;
    messagesDiv.appendChild(node);
  }
}

// Subscribe to the event source at `uri` with exponential backoff reconnect.
function subscribe(uri) {
  var retryTime = 1;

  function connect(uri) {
    const events = new EventSource(uri);

    events.addEventListener("message", (ev) => {
      console.log("raw data", JSON.stringify(ev.data));
      console.log("decoded data", JSON.stringify(JSON.parse(ev.data)));
      const msg = JSON.parse(ev.data);
      if (!("message" in msg) || !("room" in msg) || !("username" in msg)) return;
      addMessage(msg.room, msg.username, msg.message, true);
    });

    events.addEventListener("open", () => {
      setConnectedStatus(true);
      console.log(`connected to event stream at ${uri}`);
      retryTime = 1;
    });

    events.addEventListener("error", () => {
      setConnectedStatus(false);
      events.close();

      let timeout = retryTime;
      retryTime = Math.min(64, retryTime * 2);
      console.log(`connection lost. attempting to reconnect in ${timeout}s`);
      setTimeout(() => connect(uri), (() => timeout * 1000)());
    });
  }

  connect(uri);
}

// Set the connection status: `true` for connected, `false` for disconnected.
function setConnectedStatus(status) {
  STATE.connected = status;
  statusDiv.className = (status) ? "connected" : "reconnecting";
}

// Let's go! Initialize the world.
function init() {
  // Initialize some rooms.
  addRoom("Lobby");
  changeRoom("Lobby");
  addMessage("Lobby", "Server Information", "This is the public chat room, where messages get saved for other users too see. If you need some privacy please make your own room in the bottom left corner, with a secure name!", true);

  fetch("/lobby").then((res) => {
    res.json().then((json) => {
      json.forEach((msg) => {
        addMessage(msg.room, msg.username, msg.message, true);
      })
    })
  })

  // Set up the form handler.
  newMessageForm.addEventListener("submit", (e) => {
    e.preventDefault();

    const room = STATE.room;
    const message = messageField.value;
    const username = usernameField.value || "Anonymous";
    if (!message || !username) return;

    if (STATE.connected) {
      fetch("/message", {
        method: "POST",
        body: new URLSearchParams({ room, username, message }),
      }).then((response) => {
        if (response.ok) messageField.value = "";
      });
    }
  })

  // Set up the new room handler.
  newRoomForm.addEventListener("submit", (e) => {
    e.preventDefault();

    const room = roomNameField.value;
    if (!room) return;

    roomNameField.value = "";
    if (!addRoom(room)) return;

    addMessage(room, "Server Information", `This is your own room, "${room}" here, no logs is kept and once you refresh the page both the room and the chats will disappear. 
      You can give your friends the name of the room, and then have a private chat conversation!`, true);
    addMessage(room, "Privacy Information", `Please make sure your room name is secure so there is no way for anyone to randomly join your room.`, true);
  })

  // Subscribe to server-sent events.
  subscribe("/events");
}

init();