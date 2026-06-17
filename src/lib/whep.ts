// Minimal WHEP (WebRTC-HTTP Egress Protocol) client.
//
// Protocol (draft-ietf-wish-whep):
//   1. POST {whep-url} with Content-Type: application/sdp, body = SDP offer.
//   2. Server responds 201 with Content-Type: application/sdp, body = SDP answer.
//   3. Set the answer on the RTCPeerConnection → ICE runs → video flows.
//
// We use native browser fetch (not tauriFetch) because:
//   a) WHEP signaling goes to MediaMTX's HTTP port (typically 8889), not the
//      API server's TOFU-pinned port.
//   b) The RTCPeerConnection is a browser primitive that expects the SDP to
//      come from a standard Response — routing through Rust would add latency
//      for no security gain on a plain HTTP connection.

export interface WhepSession {
  pc: RTCPeerConnection;
  close(): void;
}

export async function connectWhep(
  url: string,
  onStream: (stream: MediaStream) => void,
  onError: (err: Error) => void,
  { audio = false }: { audio?: boolean } = {}
): Promise<WhepSession> {
  const pc = new RTCPeerConnection({
    // LAN-only deployment: no STUN/TURN needed.
    iceServers: [],
  });

  // Video-only by default — most camera RTSP streams carry no audio track.
  // MediaMTX returns 400 when the SDP offer includes an audio m= line but the
  // source stream is video-only. Pass audio:true if the stream has audio.
  pc.addTransceiver("video", { direction: "recvonly" });
  if (audio) pc.addTransceiver("audio", { direction: "recvonly" });

  // Collect all remote tracks into a MediaStream and surface it.
  const remoteStream = new MediaStream();
  pc.ontrack = (e) => {
    e.streams[0]?.getTracks().forEach((t) => remoteStream.addTrack(t));
    // Signal playing as soon as we have at least a video track.
    if (remoteStream.getVideoTracks().length > 0) {
      onStream(remoteStream);
    }
  };

  pc.oniceconnectionstatechange = () => {
    if (
      pc.iceConnectionState === "failed" ||
      pc.iceConnectionState === "disconnected"
    ) {
      onError(new Error(`ICE ${pc.iceConnectionState}`));
    }
  };

  // Create offer and gather ICE candidates synchronously via
  // setLocalDescription + waiting for icegatheringstate === "complete".
  const offer = await pc.createOffer();
  await pc.setLocalDescription(offer);
  await waitForIceGathering(pc);

  const sdpOffer = pc.localDescription!.sdp;

  let resp: Response;
  try {
    resp = await fetch(url, {
      method:  "POST",
      headers: {
        "Content-Type": "application/sdp",
        "Accept":       "application/sdp",
      },
      body: sdpOffer,
    });
  } catch (e) {
    throw new Error(`WHEP signaling failed: ${e instanceof Error ? e.message : String(e)}`);
  }

  if (!resp.ok) {
    const body = await resp.text().catch(() => "");
    const err = new Error(
      `WHEP: server returned ${resp.status} ${resp.statusText}${body ? ` — ${body.trim()}` : ""}`
    ) as Error & {
      whepUnsupportedCodec?: boolean;
      whepNotConfigured?: boolean;
    };
    // Flag codec-incompatibility so callers can fall back to HLS without
    // showing an error to the user — it's expected for H.265 cameras.
    if (resp.status === 400 && body.toLowerCase().includes("codec")) {
      err.whepUnsupportedCodec = true;
    }
    // Race window: ensureStream() returns the WHEP URL the moment MediaMTX
    // has the path registered, but the RTSP source bind + first packet take
    // longer. Two distinct sub-races, both retryable:
    //   • 400 "path is not configured" — path not registered yet (very early)
    //   • 404 "no one is publishing to path" — registered, source not yet
    //                                          publishing frames
    // Callers treat both the same: stay in connecting, retry after backoff.
    const bodyLower = body.toLowerCase();
    if (
      (resp.status === 400 && bodyLower.includes("not configured")) ||
      (resp.status === 404 && bodyLower.includes("publishing"))
    ) {
      err.whepNotConfigured = true;
    }
    throw err;
  }

  const sdpAnswer = await resp.text();
  await pc.setRemoteDescription({ type: "answer", sdp: sdpAnswer });

  return {
    pc,
    close() {
      pc.close();
    },
  };
}

// Wait for ICE gathering to complete (or time out after 3 s).
// Trickle ICE would be more standard but requires the server to support it;
// sending the complete offer avoids a second HTTP round-trip.
function waitForIceGathering(pc: RTCPeerConnection): Promise<void> {
  return new Promise((resolve) => {
    if (pc.iceGatheringState === "complete") {
      resolve();
      return;
    }
    const timeout = setTimeout(resolve, 3_000);
    const handler = () => {
      if (pc.iceGatheringState === "complete") {
        clearTimeout(timeout);
        pc.removeEventListener("icegatheringstatechange", handler);
        resolve();
      }
    };
    pc.addEventListener("icegatheringstatechange", handler);
  });
}
