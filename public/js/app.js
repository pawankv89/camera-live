const socket = io();
const $ = id => document.getElementById(id);
let role = null, room = null, localStream = null, peers = new Map(), viewerIds = new Set();
let cameraFacing = "user", recorder = null, chunks = [], startedAt = 0, micMuted = false;

const rtcConfig = { iceServers: [{ urls: "stun:stun.l.google.com:19302" }] };

function show(id){$(id).classList.remove("hidden")}
function hide(id){$(id).classList.add("hidden")}
function status(id,msg){$(id).textContent=msg}

$("senderBtn").onclick = startSender;
$("viewerBtn").onclick = () => show("joinBox");
$("joinBtn").onclick = () => startViewer($("roomInput").value.trim().toUpperCase());
$("stopSender").onclick = stopSender;
$("stopViewer").onclick = stopViewer;
$("flipCamera").onclick = flipCamera;
$("muteMic").onclick = toggleMic;
$("recordBtn").onclick = toggleRecording;
$("qrBtn").onclick = showQR;
$("fullscreenBtn").onclick = () => $("remoteVideo").requestFullscreen?.();
$("remoteMute").onclick = () => $("remoteVideo").muted = !$("remoteVideo").muted;

async function startSender(){
  role="sender"; show("sender"); hide("home"); hide("history");
  room = crypto.randomUUID().slice(0,6).toUpperCase();
  $("roomLabel").textContent=room;
  startedAt=Date.now();
  try{
    localStream = await navigator.mediaDevices.getUserMedia({video:{facingMode:cameraFacing,width:{ideal:1280},height:{ideal:720}},audio:true});
    $("localVideo").srcObject=localStream;
    status("senderStatus","Ready • waiting for viewers");
    socket.emit("create-room",{room});
  }catch(e){
    status("senderStatus","Camera error: "+e.message);
    alert("Camera/microphone could not be opened. On iPhone, use HTTPS and allow Camera/Microphone.");
  }
}

async function createPeer(viewerId){
  const pc = new RTCPeerConnection(rtcConfig);
  peers.set(viewerId,pc);
  localStream.getTracks().forEach(t=>pc.addTrack(t,localStream));
  pc.onicecandidate=e=>{if(e.candidate)socket.emit("ice-candidate",{target:viewerId,candidate:e.candidate})};
  pc.onconnectionstatechange=()=>{ if(["failed","closed","disconnected"].includes(pc.connectionState)){pc.close();peers.delete(viewerId);viewerIds.delete(viewerId);updateCount()} };
  const offer=await pc.createOffer();
  await pc.setLocalDescription(offer);
  socket.emit("offer",{target:viewerId,offer});
}

socket.on("viewer-joined", async ({viewerId})=>{viewerIds.add(viewerId);updateCount(); await createPeer(viewerId)});
socket.on("answer", async ({from,answer})=>{const pc=peers.get(from); if(pc) await pc.setRemoteDescription(answer)});
socket.on("ice-candidate", async ({from,candidate})=>{const pc=peers.get(from); if(pc && candidate) try{await pc.addIceCandidate(candidate)}catch{}});
socket.on("viewer-left",({viewerId})=>{const pc=peers.get(viewerId);pc?.close();peers.delete(viewerId);viewerIds.delete(viewerId);updateCount()});

async function startViewer(inputRoom){
  if(!inputRoom)return alert("Enter a room ID.");
  role="viewer";room=inputRoom;show("viewer");hide("home");hide("history");
  status("viewerStatus","Joining "+room+"…");
  socket.emit("join-room",{room});
}
socket.on("room-joined",({senderId})=>{status("viewerStatus","Connected to sender");});
socket.on("offer",async({from,offer})=>{
  if(role!=="viewer")return;
  const pc=new RTCPeerConnection(rtcConfig);
  peers.set(from,pc);
  pc.ontrack=e=>{$("remoteVideo").srcObject=e.streams[0]};
  pc.onicecandidate=e=>{if(e.candidate)socket.emit("ice-candidate",{target:from,candidate:e.candidate})};
  pc.onconnectionstatechange=()=>status("viewerStatus","Connection: "+pc.connectionState);
  await pc.setRemoteDescription(offer);
  const answer=await pc.createAnswer();
  await pc.setLocalDescription(answer);
  socket.emit("answer",{target:from,answer});
});
socket.on("sender-left",()=>{status("viewerStatus","Sender disconnected");$("remoteVideo").srcObject=null});
socket.on("room-error",msg=>alert(msg));

function updateCount(){$("viewerCount").textContent=viewerIds.size}

async function flipCamera() {
  if (!localStream) return;

  // 1. Determine the new direction
  cameraFacing = cameraFacing === "user" ? "environment" : "user";

  // 2. IMPORTANT FOR SAMSUNG: Explicitly stop the existing video tracks first
  const oldTracks = localStream.getVideoTracks();
  oldTracks.forEach(track => track.stop());

  try {
    // 3. Request the new stream now that the camera hardware has been released
    const newStream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: cameraFacing },
      audio: false
    });

    const newTrack = newStream.getVideoTracks()[0];

    // 4. Update your localStream structure
    if (oldTracks.length > 0) {
      localStream.removeTrack(oldTracks[0]);
    }
    localStream.addTrack(newTrack);

    // 5. Update the local video element rendering
    const videoElement = $("localVideo");
    videoElement.srcObject = localStream;
    
    // Explicitly call play() as some mobile browsers pause on track changes
    videoElement.play().catch(e => console.error("Video play failed:", e));

    // 6. Update WebRTC peer connections seamlessly using replaceTrack
    for (const pc of peers.values()) {
      const sender = pc.getSenders().find(s => s.track?.kind === "video");
      if (sender) {
        await sender.replaceTrack(newTrack);
      }
    }
  } catch (error) {
    console.error("Failed to switch camera:", error);
    // Optional rollback fallback: if switching fails, reset state variable
    cameraFacing = cameraFacing === "user" ? "environment" : "user";
  }
}

// Not worked in Samsung / Android Device
async function flipCamera(){
  if(!localStream)return;
  cameraFacing=cameraFacing==="user"?"environment":"user";
  const newStream=await navigator.mediaDevices.getUserMedia({video:{facingMode:cameraFacing},audio:false});
  const newTrack=newStream.getVideoTracks()[0];
  const old=localStream.getVideoTracks()[0];
  localStream.getVideoTracks()[0].stop();
  localStream.removeTrack(old);localStream.addTrack(newTrack);
  $("localVideo").srcObject=localStream;
  for(const pc of peers.values()){const sender=pc.getSenders().find(s=>s.track?.kind==="video");if(sender)await sender.replaceTrack(newTrack)}
}
function toggleMic(){
  micMuted=!micMuted;
  localStream?.getAudioTracks().forEach(t=>t.enabled=!micMuted);
  $("muteMic").textContent=micMuted?"🎙️ Unmute":"🎙️ Mute";
}
function toggleRecording(){
  if(!localStream)return;
  if(recorder?.state==="recording"){recorder.stop();return}
  const mime=["video/webm;codecs=vp9,opus","video/webm;codecs=vp8,opus","video/webm"].find(MediaRecorder.isTypeSupported);
  if(!mime)return alert("This browser does not support the selected recording format.");
  chunks=[];recorder=new MediaRecorder(localStream,{mimeType:mime});
  recorder.ondataavailable=e=>{if(e.data.size)chunks.push(e.data)};
  recorder.onstop=()=>{const blob=new Blob(chunks,{type:mime});const a=document.createElement("a");a.href=URL.createObjectURL(blob);a.download=`liveshare-${Date.now()}.webm`;a.click();setTimeout(()=>URL.revokeObjectURL(a.href),1000)};
  recorder.start();$("recordBtn").textContent="⏹ Stop recording";
}
async function showQR(){
  const r=await fetch("/api/qr/"+encodeURIComponent(room)).then(x=>x.json());
  $("qrImage").src=r.dataUrl;$("joinUrl").textContent=r.url;show("qrArea");
}
function stopSender(){
  localStream?.getTracks().forEach(t=>t.stop());
  peers.forEach(p=>p.close());peers.clear();
  socket.emit("session-info",{room,duration:Math.floor((Date.now()-startedAt)/1000),viewers:viewerIds.size});
  location.href="/";
}
function stopViewer(){peers.forEach(p=>p.close());peers.clear();$("remoteVideo").srcObject=null;location.href="/";}

const params=new URLSearchParams(location.search);
if(params.get("mode")==="viewer" && params.get("room")) startViewer(params.get("room"));
loadHistory();

async function loadHistory(){
  try{
    const data=await fetch("/api/history").then(r=>r.json());
    $("historyList").innerHTML=data.length?data.map(x=>`<div class="session"><b>${x.room}</b> — ${x.durationSeconds||0}s — ${x.viewers||0} viewers<br><small>${new Date(x.endedAt).toLocaleString()}</small></div>`).join(""):"No sessions yet.";
  }catch{$("historyList").textContent="History unavailable."}
}
