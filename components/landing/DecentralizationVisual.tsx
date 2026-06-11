import React, { useEffect, useState } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { ORIGIN, PEERS, SAMPLE_CID } from './networkModel';

/**
 * DecentralizationVisual
 *
 * A self-contained landing section that makes the contrast between centralized
 * storage and IPFS *visible*:
 *
 *   - Left: a single server node. One box. One point of failure / censorship.
 *   - Right: the same file (identified by its CID) replicated across a mesh of
 *     peers, with a pulse propagating outward from the origin.
 *
 * Honesty note: the network on the right is a CONCEPTUAL illustration of how
 * content-addressed replication works. It is not live telemetry — no real peer
 * counts or locations are claimed. See `networkModel.ts`.
 *
 * Motion respects `prefers-reduced-motion`: with reduced motion the final state
 * is rendered immediately and no infinite pulses run.
 */
const DecentralizationVisual: React.FC = () => {
  const prefersReducedMotion = useReducedMotion();

  // Gate the entrance/draw animations behind mount so SSR markup is the static
  // "settled" state and hydration does not flash.
  const [animate, setAnimate] = useState(false);
  useEffect(() => {
    if (prefersReducedMotion) return;
    setAnimate(true);
  }, [prefersReducedMotion]);

  const reduced = Boolean(prefersReducedMotion);

  return (
    <section
      id="decentralization"
      aria-labelledby="decentralization-heading"
      style={{ padding: '100px 24px', position: 'relative' }}
    >
      <div style={{ maxWidth: 1100, margin: '0 auto' }}>
        <header style={{ textAlign: 'center', marginBottom: 64 }}>
          <p
            style={{
              textTransform: 'uppercase',
              letterSpacing: '0.18em',
              fontSize: 13,
              color: 'var(--accent)',
              fontFamily: 'var(--mono)',
              margin: '0 0 14px',
            }}
          >
            How it survives
          </p>
          <h2
            id="decentralization-heading"
            style={{
              fontSize: 'clamp(28px, 4vw, 46px)',
              fontWeight: 600,
              letterSpacing: '-0.03em',
              color: 'var(--tx)',
              margin: 0,
              lineHeight: 1.1,
            }}
          >
            Your files live on many nodes, not one server
          </h2>
          <p
            style={{
              maxWidth: 620,
              margin: '20px auto 0',
              color: 'var(--mut)',
              fontSize: 17,
              lineHeight: 1.6,
            }}
          >
            A conceptual look at content-addressed replication. The same file,
            named by its CID, can be served by any peer that holds it — so no
            single party can take it down.
          </p>
        </header>

        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))',
            gap: 28,
            alignItems: 'stretch',
          }}
        >
          <CentralizedPanel reduced={reduced} />
          <DecentralizedPanel reduced={reduced} animate={animate} />
        </div>

        <p
          style={{
            textAlign: 'center',
            marginTop: 28,
            fontSize: 13,
            color: 'var(--faint)',
            fontFamily: 'var(--mono)',
          }}
        >
          Illustrative model — not live network telemetry.
        </p>
      </div>
    </section>
  );
};

const PANEL_STYLE: React.CSSProperties = {
  position: 'relative',
  borderRadius: 14,
  padding: '28px 28px 24px',
  border: '1px solid var(--line)',
  background: 'var(--surface)',
  overflow: 'hidden',
  display: 'flex',
  flexDirection: 'column',
};

const PanelTitle: React.FC<{ kicker: string; title: string; tone: 'warn' | 'good' }> = ({
  kicker,
  title,
  tone,
}) => (
  <div style={{ marginBottom: 18 }}>
    <span
      style={{
        display: 'inline-block',
        fontSize: 11,
        textTransform: 'uppercase',
        letterSpacing: '0.16em',
        padding: '4px 10px',
        borderRadius: 999,
        marginBottom: 10,
        fontFamily: 'var(--mono)',
        color: tone === 'good' ? 'var(--accent)' : 'var(--danger)',
        background: tone === 'good' ? 'var(--accent-soft)' : 'var(--danger-soft)',
        border: `1px solid ${tone === 'good' ? 'var(--accent-bd)' : 'var(--danger-soft)'}`,
      }}
    >
      {kicker}
    </span>
    <h3 style={{ fontSize: 20, fontWeight: 600, letterSpacing: '-0.02em', color: 'var(--tx)', margin: 0 }}>{title}</h3>
  </div>
);

const CentralizedPanel: React.FC<{ reduced: boolean }> = ({ reduced }) => (
  <div style={PANEL_STYLE} data-testid="centralized-panel">
    <PanelTitle kicker="Centralized" title="One server. One switch to flip." tone="warn" />
    <div
      style={{
        flex: 1,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        minHeight: 280,
      }}
    >
      <svg
        viewBox="0 0 100 100"
        width="100%"
        height="100%"
        style={{ maxWidth: 320 }}
        role="img"
        aria-label="A single central server holding the only copy of a file"
        data-testid="centralized-svg"
      >
        {/* the lone client connecting up to the single server */}
        <line
          x1="50"
          y1="84"
          x2="50"
          y2="46"
          stroke="var(--danger)"
          strokeOpacity="0.4"
          strokeWidth="0.8"
          strokeDasharray="2 2"
        />
        <circle cx="50" cy="86" r="3" fill="var(--mut)" />
        {/* the single server box */}
        <motion.g
          initial={reduced ? false : { scale: 0.9, opacity: 0 }}
          whileInView={reduced ? undefined : { scale: 1, opacity: 1 }}
          viewport={{ once: true, amount: 0.4 }}
          transition={{ duration: 0.5 }}
          style={{ transformOrigin: '50px 32px' }}
        >
          <rect
            x="38"
            y="20"
            width="24"
            height="24"
            rx="3"
            fill="var(--danger-soft)"
            stroke="var(--danger)"
            strokeOpacity="0.7"
            strokeWidth="1"
          />
          <line x1="41" y1="27" x2="59" y2="27" stroke="var(--danger)" strokeOpacity="0.6" strokeWidth="0.8" />
          <line x1="41" y1="32" x2="59" y2="32" stroke="var(--danger)" strokeOpacity="0.6" strokeWidth="0.8" />
          <circle cx="44" cy="38" r="1" fill="var(--danger)" />
        </motion.g>
      </svg>
    </div>
    <p style={{ fontSize: 14, color: 'var(--mut)', margin: '14px 0 0', lineHeight: 1.55 }}>
      The provider holds the only copy. They can lose it, lock you out, or be
      compelled to take it down — and it is simply gone.
    </p>
  </div>
);

const DecentralizedPanel: React.FC<{ reduced: boolean; animate: boolean }> = ({
  reduced,
  animate,
}) => (
  <div style={PANEL_STYLE} data-testid="decentralized-panel">
    <PanelTitle
      kicker="Decentralized"
      title="The same file, held by many."
      tone="good"
    />
    <div
      style={{
        flex: 1,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        minHeight: 280,
      }}
    >
      <PeerConstellation reduced={reduced} animate={animate} />
    </div>
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        marginTop: 14,
        flexWrap: 'wrap',
      }}
    >
      <span style={{ fontSize: 13, color: 'var(--mut)' }}>Addressed by CID</span>
      <code
        style={{
          fontSize: 13,
          padding: '4px 10px',
          borderRadius: 8,
          color: 'var(--accent)',
          background: 'var(--accent-soft)',
          border: '1px solid var(--accent-bd)',
          fontFamily: 'var(--mono)',
        }}
      >
        {SAMPLE_CID}
      </code>
    </div>
  </div>
);

const PeerConstellation: React.FC<{ reduced: boolean; animate: boolean }> = ({
  reduced,
  animate,
}) => {
  // With reduced motion we show the settled mesh: edges drawn, peers present,
  // no infinite pulses.
  const drawEdge = reduced ? { pathLength: 1, opacity: 0.35 } : undefined;

  return (
    <svg
      viewBox="0 0 100 100"
      width="100%"
      height="100%"
      style={{ maxWidth: 360 }}
      role="img"
      aria-label={
        'An illustrative peer-to-peer network: many nodes each hold a copy of ' +
        'the file, connected to the origin'
      }
      data-testid="decentralized-svg"
    >
      <defs>
        <radialGradient id="peerGlow" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="var(--accent)" stopOpacity="0.9" />
          <stop offset="100%" stopColor="var(--accent)" stopOpacity="0" />
        </radialGradient>
      </defs>

      {/* edges from origin to each peer — drawn on enter */}
      {PEERS.map((peer) => (
        <motion.line
          key={`edge-${peer.id}`}
          x1={ORIGIN.x}
          y1={ORIGIN.y}
          x2={peer.x}
          y2={peer.y}
          stroke="var(--accent)"
          strokeOpacity="0.35"
          strokeWidth="0.5"
          initial={reduced ? drawEdge : { pathLength: 0, opacity: 0 }}
          animate={
            reduced
              ? drawEdge
              : animate
              ? { pathLength: 1, opacity: 0.35 }
              : undefined
          }
          transition={{ duration: 0.6, delay: peer.hop * 0.18 }}
        />
      ))}

      {/* travelling pulses: only when motion is allowed */}
      {!reduced &&
        animate &&
        PEERS.map((peer) => (
          <motion.circle
            key={`pulse-${peer.id}`}
            r="1.1"
            fill="var(--accent)"
            initial={{ cx: ORIGIN.x, cy: ORIGIN.y, opacity: 0 }}
            animate={{ cx: peer.x, cy: peer.y, opacity: [0, 1, 1, 0] }}
            transition={{
              duration: 2.2,
              delay: 0.6 + peer.hop * 0.2,
              repeat: Infinity,
              repeatDelay: 1.2,
              ease: 'easeInOut',
            }}
          />
        ))}

      {/* peer nodes */}
      {PEERS.map((peer) => (
        <motion.g
          key={peer.id}
          data-testid="peer-node"
          initial={reduced ? false : { scale: 0, opacity: 0 }}
          animate={reduced ? undefined : animate ? { scale: 1, opacity: 1 } : undefined}
          transition={{ duration: 0.45, delay: 0.2 + peer.hop * 0.18, type: 'spring' }}
          style={{ transformOrigin: `${peer.x}px ${peer.y}px` }}
        >
          <circle cx={peer.x} cy={peer.y} r={peer.r + 2.5} fill="url(#peerGlow)" opacity={0.5} />
          <circle
            cx={peer.x}
            cy={peer.y}
            r={peer.r}
            fill="var(--bg)"
            stroke="var(--accent)"
            strokeOpacity="0.85"
            strokeWidth="0.7"
          />
          <circle cx={peer.x} cy={peer.y} r={peer.r * 0.35} fill="var(--accent)" />
        </motion.g>
      ))}

      {/* origin (the user publishing the file) */}
      <g data-testid="origin-node">
        {!reduced && animate && (
          <motion.circle
            cx={ORIGIN.x}
            cy={ORIGIN.y}
            fill="none"
            stroke="var(--accent)"
            strokeOpacity="0.6"
            strokeWidth="0.6"
            initial={{ r: 4, opacity: 0.6 }}
            animate={{ r: [4, 14], opacity: [0.6, 0] }}
            transition={{ duration: 2.4, repeat: Infinity, ease: 'easeOut' }}
          />
        )}
        <circle cx={ORIGIN.x} cy={ORIGIN.y} r="5" fill="url(#peerGlow)" />
        <circle
          cx={ORIGIN.x}
          cy={ORIGIN.y}
          r="3.6"
          fill="var(--tx)"
          stroke="var(--accent)"
          strokeOpacity="0.9"
          strokeWidth="0.8"
        />
      </g>
    </svg>
  );
};

export default DecentralizationVisual;
