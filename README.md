# camera-live
We are using Live feed session

# LiveShare — Browser WebRTC Video Sharing

Cross-platform local/browser live video sharing using:
- HTML/CSS/JavaScript
- Node.js + Express
- Socket.IO signaling
- WebRTC media
- QR room pairing
- 1 sender + up to 5 viewers
- Camera + microphone
- Camera switching
- Mute
- Browser recording where supported
- Session history

## Requirements

Node.js 18+ recommended.

## Install and run

```bash
npm install
npm start
```

Open:
http://localhost:3000

For devices on the same Wi-Fi, find the computer LAN IP.

macOS:
```bash
ipconfig getifaddr en0
```

Then on another device:
http://YOUR-LAN-IP:3000

Example:
http://192.168.1.20:3000

## IMPORTANT: iPhone camera access

iPhone Safari normally requires a secure HTTPS context for camera/microphone access when connecting to another computer.

For development you can use an HTTPS reverse proxy/tunnel or a locally trusted certificate. Do not assume plain LAN HTTP will work for getUserMedia on iPhone.

The WebRTC signaling server can still be local; the browser page must satisfy the browser's secure-context requirements.

## Usage

1. Start Node.js on the computer.
2. Open LiveShare on the sender device.
3. Choose "Start as Sender".
4. Allow camera and microphone.
5. Click QR.
6. Scan the QR from up to 5 viewer devices.
7. Viewers receive the WebRTC stream.

## Architecture

Sender camera/microphone -> WebRTC -> viewers

Socket.IO is only used for signaling:
- room creation
- viewer join
- SDP offer/answer
- ICE candidates

Video/audio is not stored on the Node.js server.

## Security

This sample is intended for local-network development/testing. For public deployment:
- use HTTPS
- authenticate users
- use short-lived room tokens
- use TURN for difficult NAT networks
- rate-limit signaling
- validate room ownership
- do not expose unrestricted room IDs
- add access controls

## Browser limitations

iPhone/iPad Safari has stricter background, screen-capture, autoplay, recording, and secure-context rules than many Android/desktop browsers. A browser cannot bypass OS restrictions.

Screen sharing is intentionally not included in this camera-first build because browser/OS screen capture support differs significantly, especially on iOS.

## Troubleshooting

### Camera error / getUserMedia undefined
- Use a supported browser.
- Use HTTPS for a non-localhost deployment.
- Allow Camera and Microphone permissions.
- Do not open the HTML file directly with `file://`.
- Make sure another application is not exclusively using the camera.

### Viewer cannot connect
- Confirm both devices can reach the Node.js server.
- Confirm the same Wi-Fi network.
- Check the computer firewall.
- For networks where peers cannot establish direct connections, add a TURN server.

### No audio
- Check device volume.
- Tap the viewer video if autoplay is blocked.
- Check browser microphone permissions.

## Production next steps

For a public product, add:
- HTTPS/reverse proxy
- TURN (coturn)
- user authentication
- persistent database
- Redis for multi-server signaling
- room expiry
- session authorization
- monitoring
- recording storage
- bandwidth controls
- adaptive video quality
