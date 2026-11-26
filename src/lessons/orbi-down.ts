import { snippets } from '../content/snippets';
import type { Flow, Lesson, NodeId, NodeState, SolveResult } from '../types';

type Cause = 'cable' | 'port-shutdown' | 'err-disabled' | 'wrong-orbi-port';

const hidden: Partial<Record<NodeId, NodeState>> = {
  'tent-hub': 'hidden',
  'tent-sensor': 'hidden',
  'tent-fan': 'hidden',
  'tent-light': 'hidden',
};

interface CauseInfo {
  /** Whether the yellow cable shows physical link with this fault. */
  linkUp: boolean;
  /** Where a laptop packet stops. */
  laptopStop: NodeId[];
  laptopReason: string;
  pcReason: string;
  status: string;
  showStatus: string;
  fixedBy: string;
  checklist: string[];
}

const commonChecks = [
  'Look at the link LEDs on both ends: Gi1/0/2 on the switch and the port on the Orbi. No light on either end means no physical link.',
  'On the switch: `show interfaces status` and find Gi1/0/2 (connected / notconnect / disabled / err-disabled).',
  'Leave speed and duplex on auto on both ends. A hard-coded mismatch can keep the link down or make it flap.',
  'PoE is not the issue here: the Orbi has its own power adapter, so check that it is actually powered on (front/top LED lit).',
];

const causes: Record<Cause, CauseInfo> = {
  cable: {
    linkUp: false,
    laptopStop: ['laptop', 'orbi'],
    laptopReason: 'No link on Gi1/0/2 (yellow cable)',
    pcReason: 'Gi1/0/2 is notconnect: no link to the Orbi',
    status:
      'Gi1/0/2 shows notconnect and both LEDs are dark: the yellow cable (or a port at either end) is not passing a signal, so WiFi clients have nowhere to go.',
    showStatus: 'Gi1/0/2  notconnect  1  auto  auto  10/100/1000BaseTX',
    fixedBy: 'reseating the yellow cable',
    checklist: [
      'Reseat the yellow cable at both ends until it clicks.',
      'Swap the yellow cable for a known-good one (the grey PC cable is a quick test).',
      'Try another switch port, e.g. Gi1/0/3, with the same config. If that works, Gi1/0/2 itself may be bad.',
      '`show interfaces gi1/0/2` and check for input errors or CRC counters climbing, a sign of a damaged cable.',
    ],
  },
  'port-shutdown': {
    linkUp: false,
    laptopStop: ['laptop', 'orbi'],
    laptopReason: 'Gi1/0/2 is administratively down (shutdown)',
    pcReason: 'Gi1/0/2 is disabled (shutdown in config)',
    status:
      'Gi1/0/2 shows disabled: the cable is fine, but the port has `shutdown` in its config, so the switch will not bring the link up.',
    showStatus: 'Gi1/0/2  disabled  1  auto  auto  10/100/1000BaseTX',
    fixedBy: 'running `no shutdown` on Gi1/0/2',
    checklist: [
      '`show running-config interface gi1/0/2` and look for a `shutdown` line.',
      'Fix: `conf t`, `interface gi1/0/2`, `no shutdown`, `end`, then `write memory`.',
      'The port LED should go green within a few seconds; spanning tree may hold it in a blocking/learning state for up to ~30 s unless `spanning-tree portfast` is set.',
    ],
  },
  'err-disabled': {
    linkUp: false,
    laptopStop: ['laptop', 'orbi'],
    laptopReason: 'Gi1/0/2 is err-disabled by the switch',
    pcReason: 'Gi1/0/2 is err-disabled',
    status:
      'Gi1/0/2 shows err-disabled: the switch shut the port itself after a violation (for example BPDU guard or port security), and it stays down until you clear it.',
    showStatus: 'Gi1/0/2  err-disabled  1  auto  auto  10/100/1000BaseTX',
    fixedBy: 'clearing the err-disable and fixing its cause',
    checklist: [
      '`show interfaces status err-disabled` and `show errdisable recovery` to see why (bpduguard, psecure-violation, link-flap...).',
      'Fix the cause first (for example remove a loop, or adjust port security), otherwise it will trip again.',
      'Bounce the port: `interface gi1/0/2`, `shutdown`, then `no shutdown`.',
      'Optionally enable automatic recovery: `errdisable recovery cause <cause>`.',
    ],
  },
  'wrong-orbi-port': {
    linkUp: true,
    laptopStop: ['laptop', 'orbi'],
    laptopReason: 'Orbi Internet port has no link: the yellow cable is in a LAN port',
    pcReason: '',
    status:
      'The link is up, but the yellow cable is in one of the Orbi LAN ports, so the Orbi WAN/Internet port has nothing on it and reports "no internet" while its own DHCP leaks onto your main LAN.',
    showStatus: 'Gi1/0/2  connected  1  a-full  a-1000  10/100/1000BaseTX',
    fixedBy: 'moving the cable to the Orbi WAN/Internet port',
    checklist: [
      'Check which Orbi port the cable is in. The WAN/Internet port is usually a different colour or set apart from the LAN ports.',
      'In router mode, a LAN port connected to the switch puts the Orbi DHCP server (10.0.0.x) on your main LAN. Devices there may get the wrong address: check the PC with `ipconfig`.',
      'Move the cable to the WAN/Internet port and reboot the Orbi so it requests an address from OPNsense.',
      'Confirm in OPNsense (Services > DHCPv4 > Leases) that the Orbi got 192.168.1.2.',
    ],
  },
};

export const orbiDown: Lesson = {
  id: 'orbi-down',
  title: 'Orbi down',
  intro:
    'Right now the yellow cable from switch port Gi1/0/2 to the Orbi has no link, so every WiFi device has a signal but no internet.\n\n' +
    'Pick a likely cause to see its symptoms and fix, then flip the link up to watch WiFi traffic flow again.',
  params: [
    {
      id: 'orbiLinkUp',
      type: 'toggle',
      label: 'Orbi link (Gi1/0/2)',
      help: 'Off matches reality today: the yellow cable shows no link.',
      default: false,
      onLabel: 'Up',
      offLabel: 'Down',
    },
    {
      id: 'cause',
      type: 'choice',
      label: 'Suspected cause',
      help: 'What is actually wrong while the link is down.',
      default: 'cable',
      options: [
        { value: 'cable', label: 'Bad or loose cable' },
        { value: 'port-shutdown', label: 'Port shut down in config' },
        { value: 'err-disabled', label: 'Port err-disabled' },
        { value: 'wrong-orbi-port', label: 'Cable in an Orbi LAN port' },
      ],
    },
  ],
  actions: [
    { id: 'laptop-web', label: 'Laptop loads a website', description: 'A WiFi client tries to reach the internet.' },
    { id: 'pc-to-orbi', label: 'PC reaches the Orbi', description: 'The PC looks for the Orbi WAN at 192.168.1.2, out Gi1/0/2.' },
    { id: 'laptop-gw', label: 'Laptop pings its gateway', description: 'Is the WiFi part fine?' },
  ],
  solve({ params, action }): SolveResult {
    const up = params.orbiLinkUp === true;
    const causeId = (typeof params.cause === 'string' && params.cause in causes ? params.cause : 'cable') as Cause;
    const cause = causes[causeId];

    const nodes: Partial<Record<NodeId, NodeState>> = { ...hidden };
    const links: SolveResult['links'] = {};
    const linkLabels: SolveResult['linkLabels'] = { yellow: 'Gi1/0/2' };

    if (!up) {
      nodes.orbi = 'warn';
      if (!cause.linkUp) links.yellow = 'down';
      else linkLabels.yellow = 'Gi1/0/2 → Orbi LAN port';
    }

    const base = { links, nodes, linkLabels };
    const upDetails = [
      `Fixed by ${cause.fixedBy}. \`show interfaces status\` now shows: Gi1/0/2  connected  1  a-full  a-1000`,
      'Laptop → Orbi over WiFi, Orbi WAN (192.168.1.2) → yellow cable → Gi1/0/2 → Gi1/0/1 → OPNsense → modem → internet.',
      'The Orbi is still in router mode here, so the laptop traffic is NATed twice. The "Double NAT" lesson digs into that.',
    ];
    const downDetails = [`Switch says: ${cause.showStatus}`, ...cause.checklist, ...commonChecks];

    switch (action) {
      case 'laptop-web': {
        if (up) {
          return {
            ...base,
            flows: [
              {
                path: ['laptop', 'orbi', 'switch', 'opnsense', 'modem', 'internet'],
                verdict: 'nat',
                natAt: ['orbi', 'opnsense'],
                label: 'HTTPS',
              },
            ],
            status:
              'The link is up: the laptop request crosses the yellow cable to the switch and out through OPNsense to the internet.',
            details: upDetails,
          };
        }
        return {
          ...base,
          flows: [{ path: cause.laptopStop, verdict: 'block', label: 'HTTPS', reason: cause.laptopReason }],
          status: cause.status,
          details: downDetails,
        };
      }

      case 'pc-to-orbi': {
        if (up || cause.linkUp) {
          const flow: Flow = up
            ? { path: ['pc', 'switch', 'orbi'], verdict: 'allow', label: 'ARP 192.168.1.2' }
            : {
                path: ['pc', 'switch', 'orbi'],
                verdict: 'block',
                label: 'ARP 192.168.1.2',
                reason: 'Arrives on an Orbi LAN port, not its WAN: no 192.168.1.2 there',
              };
          return {
            ...base,
            flows: [flow],
            status: up
              ? 'Frames from the wired side now leave Gi1/0/2 and the Orbi WAN at 192.168.1.2 answers.'
              : 'Frames do leave Gi1/0/2 because the link is up, but they land on an Orbi LAN port, where nothing owns 192.168.1.2.',
            details: up ? upDetails : downDetails,
          };
        }
        return {
          ...base,
          flows: [{ path: ['pc', 'switch'], verdict: 'block', label: 'ARP 192.168.1.2', reason: cause.pcReason }],
          status: `The switch has nowhere to send it: ${cause.pcReason}.`,
          details: downDetails,
        };
      }

      case 'laptop-gw': {
        return {
          ...base,
          flows: [
            { path: ['laptop', 'orbi'], verdict: 'allow', label: 'ping 10.0.0.1' },
            { path: ['orbi', 'laptop'], verdict: 'allow', label: 'pong' },
          ],
          status: up
            ? 'The laptop pings its gateway 10.0.0.1 (the Orbi) and gets a reply, as it always could; with the link up, the rest of the path works too.'
            : 'The Orbi still answers ping at 10.0.0.1, so WiFi itself is fine: the fault is between the Orbi and the switch.',
          details: up ? upDetails : downDetails,
        };
      }

      default:
        return {
          ...base,
          flows: [],
          status: up
            ? `The yellow link is up again (fixed by ${cause.fixedBy}). Press "Laptop loads a website" to watch WiFi traffic reach the internet.`
            : `${cause.status} Press "Laptop loads a website" to see where it stops.`,
          details: up ? upDetails : downDetails,
        };
    }
  },
  deviceNotes: {
    switch: {
      body: 'Start every link problem on the switch: it tells you whether the port sees a link, whether it is shut down, err-disabled, or counting errors.',
      snippets: [snippets.iosLinkTroubleshoot],
    },
    orbi: {
      body: 'The cable from the switch must go into the Orbi WAN/Internet port, not one of its LAN ports. The Orbi has its own power supply; PoE from the switch does not power it.',
    },
  },
};
