/**
 * Conceptual model for the decentralization visual.
 *
 * IMPORTANT: this is an *illustrative* network, not live telemetry. The peer
 * positions and the CID below are hand-authored to explain how content-addressed
 * replication works. They are NOT fetched from a running Kubo node and must never
 * be presented as real-time peer counts or locations.
 */

export interface PeerNode {
  /** Stable id used as React key and test hook. */
  id: string;
  /** X coordinate in the 0-100 viewBox space. */
  x: number;
  /** Y coordinate in the 0-100 viewBox space. */
  y: number;
  /** Visual radius in viewBox units. */
  r: number;
  /** Stagger order so propagation reads as a wave from the centre outward. */
  hop: number;
}

/** The centre node represents the user/origin that publishes the file. */
export const ORIGIN = { x: 50, y: 50 } as const;

/**
 * A representative constellation of peers. Coordinates are tuned by hand to look
 * like an organic mesh rather than a regular grid. Twelve peers is enough to
 * read as "many", few enough to animate cleanly on mobile.
 */
export const PEERS: readonly PeerNode[] = [
  { id: 'peer-1', x: 20, y: 24, r: 3.2, hop: 1 },
  { id: 'peer-2', x: 78, y: 20, r: 3.6, hop: 1 },
  { id: 'peer-3', x: 86, y: 52, r: 3.0, hop: 2 },
  { id: 'peer-4', x: 74, y: 82, r: 3.4, hop: 2 },
  { id: 'peer-5', x: 44, y: 88, r: 3.0, hop: 3 },
  { id: 'peer-6', x: 16, y: 74, r: 3.5, hop: 2 },
  { id: 'peer-7', x: 10, y: 48, r: 3.1, hop: 1 },
  { id: 'peer-8', x: 34, y: 12, r: 2.8, hop: 3 },
  { id: 'peer-9', x: 62, y: 36, r: 2.6, hop: 1 },
  { id: 'peer-10', x: 66, y: 64, r: 2.6, hop: 2 },
  { id: 'peer-11', x: 30, y: 60, r: 2.4, hop: 3 },
  { id: 'peer-12', x: 92, y: 80, r: 2.4, hop: 3 },
] as const;

/** A short, syntactically-real-looking CIDv1 used purely for illustration. */
export const SAMPLE_CID = 'bafybeigdyr…k7q3a';
